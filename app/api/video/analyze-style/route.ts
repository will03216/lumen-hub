import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";
import { BytePlusError, analyzeVideoFrames } from "@/lib/byteplus";
import { logRouteError } from "@/lib/server-log";
import { getUserKeys, keyErrorResponse, MissingKeyError } from "@/lib/server/user-keys";
import {
  buildProductAgnosticStyleBrief,
  buildVisionAnalysisInstruction,
  parseVideoStyleVisionAnalysis,
  selectSeedanceAnalysisFrames,
  selectSeedanceReferenceFrame,
  type VideoStyleMetadata,
} from "@/lib/studio/video-style";

export const runtime = "nodejs";
export const maxDuration = 60;

type AnalyzeStyleBody = {
  videoUrl?: string;
};

function localYtDlpPython(): string {
  return [process.cwd(), ".venv", "bin", "python"].join(path.sep);
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 45_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    // Hard timeout — without this a hung yt-dlp/ffmpeg (e.g. TikTok rate-limiting
    // the dev server's IP) blocks the request forever and the node shows an
    // endless "Analyzing video style…" spinner. Kill the child and surface a
    // clear error so the user sees a failure instead of an infinite hang.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        ok: false,
        stdout: "",
        stderr: `${command} timed out after ${timeoutMs / 1000}s`,
      });
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: "", stderr: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
  });
}

async function loadVideoMetadata(url: string): Promise<VideoStyleMetadata> {
  const args = ["--no-playlist", "--socket-timeout", "20", "--dump-single-json", "--skip-download", url];
  const candidates: Array<{ command: string; args: string[] }> = [
    { command: "yt-dlp", args },
    { command: localYtDlpPython(), args: ["-m", "yt_dlp", ...args] },
    { command: "python3", args: ["-m", "yt_dlp", ...args] },
  ];

  const failures: string[] = [];
  for (const candidate of candidates) {
    const result = await runCommand(candidate.command, candidate.args, process.cwd());
    if (!result.ok) {
      failures.push(`${candidate.command}: ${result.stderr.slice(-800)}`);
      continue;
    }
    try {
      const json = JSON.parse(result.stdout) as {
        title?: string;
        description?: string;
        uploader?: string;
        channel?: string;
        duration?: number;
      };
      return {
        title: json.title,
        description: json.description,
        uploader: json.uploader ?? json.channel,
        duration: json.duration,
      };
    } catch {
      failures.push(`${candidate.command}: metadata was not valid JSON${result.stderr ? ` (${result.stderr.slice(-240)})` : ""}`);
    }
  }

  throw new Error(
    "Could not analyze video URL. Install yt-dlp or paste a direct video URL with useful metadata. " +
      failures.join("\n").slice(0, 1200),
  );
}

async function downloadVideo(url: string, cwd: string): Promise<string> {
  const outputTemplate = path.join(cwd, "source.%(ext)s");
  const args = [
    "--no-playlist",
    "--socket-timeout",
    "30",
    "--max-filesize",
    "120M",
    "-f",
    "bv*+ba/b[ext=mp4]/b",
    "--merge-output-format",
    "mp4",
    "-o",
    outputTemplate,
    url,
  ];
  const candidates: Array<{ command: string; args: string[] }> = [
    { command: "yt-dlp", args },
    { command: localYtDlpPython(), args: ["-m", "yt_dlp", ...args] },
    { command: "python3", args: ["-m", "yt_dlp", ...args] },
  ];
  const failures: string[] = [];
  for (const candidate of candidates) {
    console.log("[vse-debug] download attempt:", candidate.command, candidate.args.join(" ").slice(0, 80));
    const result = await runCommand(candidate.command, candidate.args, cwd, 45_000);
    console.log("[vse-debug] download result ok=", result.ok, "stderr tail=", result.stderr.slice(-200));
    if (result.ok) return path.join(cwd, "source.mp4");
    failures.push(`${candidate.command}: ${result.stderr.slice(-800)}`);
  }
  throw new Error(`Could not download video for frame analysis. ${failures.join("\n").slice(0, 1200)}`);
}

async function extractFrame(videoPath: string, outPath: string, atSec: number): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg binary is unavailable");
  const result = await runCommand(
    ffmpegPath,
    [
      "-y",
      "-ss",
      String(Math.max(0, atSec)),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      outPath,
    ],
    process.cwd(),
  );
  if (!result.ok) {
    throw new Error(`ffmpeg frame extraction failed: ${result.stderr.slice(-800)}`);
  }
}

type FrameAnalysisOutcome = {
  styleBrief?: string;
  frameObservations: string[];
  caveats: string[];
  analysis?: NonNullable<ReturnType<typeof parseVideoStyleVisionAnalysis>>["analysis"];
};

async function analyzeFrames(
  videoUrl: string,
  metadata: VideoStyleMetadata,
): Promise<FrameAnalysisOutcome> {
  const caveats: string[] = [];
  let dir: string | undefined;
  try {
    console.log("[vse-debug] analyzeFrames: getUserKeys…");
    // getUserKeys() calls Clerk auth() + a DB query; in local dev both can
    // hang (Clerk dev keys, slow/absent DB). Without a timeout the whole
    // analyze request blocks forever and the node spins "Analyzing…". Race
    // it against a 10s deadline — if it doesn't resolve, treat as no key.
    const keysResult = await Promise.race([
      getUserKeys(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);
    const byteplus = keysResult?.byteplus;
    console.log("[vse-debug] got byteplus key?", !!byteplus, "timedOut?", keysResult === null);

    // Strict BYOK — no env fallback. If the user has no BytePlus key saved,
    // fail fast BEFORE the expensive download/extract/analyze work. Surfacing
    // this as MissingKeyError lets the POST handler return the 402
    // missing_api_key contract (same as image-gen) so the node can prompt the
    // user to add a key in Settings, instead of silently degrading into a
    // generic template brief that pretends the video was analysed.
    if (!byteplus) {
      throw new MissingKeyError("byteplus");
    }

    dir = await mkdtemp(path.join(tmpdir(), "lumen-style-"));
    console.log("[vse-debug] tmpdir:", dir);
    const videoPath = await downloadVideo(videoUrl, dir);
    console.log("[vse-debug] video downloaded:", videoPath);
    const duration = Math.max(1, metadata.duration ?? 6);
    const times = [0.08, 0.2, 0.33, 0.46, 0.59, 0.72, 0.85, 0.96].map((ratio) =>
      Math.max(0.25, Math.min(duration - 0.1, duration * ratio)),
    );
    const frameImages: string[] = [];
    for (let i = 0; i < times.length; i++) {
      const framePath = path.join(dir, `frame-${i}.jpg`);
      await extractFrame(videoPath, framePath, times[i]);
      const buffer = await readFile(framePath);
      frameImages.push(`data:image/jpeg;base64,${buffer.toString("base64")}`);
    }

    const referenceFrame = selectSeedanceReferenceFrame(frameImages);
    const analysisFrames = selectSeedanceAnalysisFrames(frameImages, referenceFrame, 8);
    console.log("[vse-debug] extracted", frameImages.length, "frames; calling SeedPro vision…");

    // Never return a fake brief. The SeedPro frame-sequence analysis is the
    // ONLY source of a style brief — if it throws or returns unparsable output
    // we let the error propagate (with its real cause) rather than catch it and
    // assemble a brief from hardcoded templates, which would silently present a
    // generic default as if it were extracted from this video.
    const out = await analyzeVideoFrames({
      frames: analysisFrames,
      jsonObject: true,
      // Use the Pro model: the Lite model emits a long `reasoning` block that
      // consumes the whole token budget before it reaches the final JSON
      // output (returns `incomplete_details: reason: length` with no text),
      // which surfaces as a 502 "no video-frame analysis output". Pro is the
      // same model the S project uses for this analysis.
      model: process.env.BYTEPLUS_VISION_MODEL ?? "seed-2-0-pro-260328",
      maxTokens: 4000,
      temperature: 0.2,
      instruction: buildVisionAnalysisInstruction({
        metadata,
        referenceFrameIndex: referenceFrame?.frameIndex,
      }),
    }, byteplus);
    console.log("[vse-debug] SeedPro returned text len =", out.text.length, "preview =", out.text.slice(0, 200));
    const parsed = parseVideoStyleVisionAnalysis(out.text);
    console.log("[vse-debug] parsed?", !!parsed, "styleBrief?", !!parsed?.styleBrief, "analysis?", !!parsed?.analysis);
    if (!parsed || (!parsed.styleBrief && !parsed.analysis)) {
      throw new Error("SeedPro frame-sequence analysis returned unparsable output; no style brief could be extracted from this video.");
    }
    return {
      styleBrief: parsed.styleBrief,
      frameObservations: parsed.frameObservations,
      analysis: parsed.analysis,
      caveats,
    };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  console.log("[vse-debug] POST /api/video/analyze-style hit");
  try {
    const body = (await req.json()) as AnalyzeStyleBody;
    const videoUrl = body.videoUrl?.trim();
    console.log("[vse-debug] videoUrl =", videoUrl);
    if (!videoUrl) {
      return NextResponse.json({ error: "videoUrl is required" }, { status: 400 });
    }

    const metadata = await loadVideoMetadata(videoUrl);
    console.log("[vse-debug] metadata loaded:", metadata.title, "dur=", metadata.duration);
    const { styleBrief: visionStyleBrief, frameObservations, caveats, analysis } = await analyzeFrames(videoUrl, metadata);
    console.log("[vse-debug] analyzeFrames done. styleBrief?", !!visionStyleBrief, "analysis?", !!analysis, "caveats=", caveats.length);

    // Build the product-agnostic style brief from the vision model's
    // structured analysis. analyzeFrames only returns on a successful SeedPro
    // analysis — it never returns a template/fallback brief — so `analysis`
    // is always real here. (buildProductAgnosticStyleBrief still holds its
    // template fallbacks for direct/unit-tested callers, but this route does
    // not reach them: no analysis ⇒ analyzeFrames throws ⇒ we never get here.)
    const brief = buildProductAgnosticStyleBrief({
      metadata,
      analysis,
      frameObservations,
    });
    const styleBrief = visionStyleBrief || brief.styleBrief;

    return NextResponse.json({
      styleBrief,
      summary: brief.summary,
      scenes: brief.scenes,
      promptDna: brief.promptDna,
      metadata,
      frameObservations,
      caveats,
    });
  } catch (err) {
    logRouteError("video.analyze-style", err, startedAt);
    // Strict BYOK — a missing user key surfaces as the 402 missing_api_key
    // contract (same as image-gen) so the client can prompt the user to add a
    // key in Settings, not as an opaque 500.
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    // Forward a real BytePlus HTTP status 1:1 so any client classifier can
    // dispatch on it (429 → rate-limit, 4xx → invalid-input, 5xx → transient).
    if (err instanceof BytePlusError) {
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
