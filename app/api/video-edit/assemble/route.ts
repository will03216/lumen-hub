/**
 * POST /api/video-edit/assemble — put the edited window back into the clip.
 *
 * Seedance returns a NEW clip, not a modified one. Two consequences are
 * user-visible the first time anyone edits real footage, and this route is
 * what answers both:
 *
 * 1. THE ORIGINAL AUDIO IS GONE. The render is silent (or carries a generated
 *    track). For an edit of someone's own footage that is almost never what
 *    they wanted — the dialogue and room tone were fine.
 *
 * 2. A CLIP LONGER THAN THE WINDOW CANNOT BE ONE RENDER. Output caps at 15s,
 *    so a 90s source is edited through a window and the untouched footage has
 *    to be spliced back around it.
 *
 * Both are ffmpeg jobs on the same two inputs, so they are one route rather
 * than two that would each download the same clip.
 *
 * Modelled on /api/video/stitch: same ffmpeg-static + fluent-ffmpeg setup,
 * same TOS upload for the result, same temp-dir discipline in `finally`.
 *
 * ⚠ The concat demuxer's `-c copy` (which stitch uses) is not available here.
 * The source and the render come from different encoders with different
 * codecs, GOP structures and often different resolutions; stream-copying them
 * into one container produces a file that plays the first segment and then
 * garbage. Segments are re-encoded to a common format instead, which is slower
 * and correct.
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import Ffmpeg from "fluent-ffmpeg";
import { uploadToTos } from "@/lib/modelark";
import {
  getUserKeys,
  missingKeyResponse,
  keyErrorResponse,
} from "@/lib/server/user-keys";
import { logRouteError } from "@/lib/server-log";

export const runtime = "nodejs";
/** Downloads two clips and re-encodes up to three segments. */
export const maxDuration = 300;

type Body = {
  /** Timeline mode: several rendered segments to join, in order. When present
   *  these ARE the output and `renderedUrl` is ignored. */
  segmentUrls?: string[];
  sourceUrl?: string;
  renderedUrl?: string;
  window?: { start?: number; end?: number };
  /** "preserve" muxes the source's audio for the window back over the render.
   *  "keep" leaves whatever audio the render already has. */
  audio?: "preserve" | "keep";
  /** When false, only the window is returned — the render with its audio
   *  fixed, and no surrounding footage. */
  splice?: boolean;
};

async function download(url: string, dest: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function run(build: (cmd: Ffmpeg.FfmpegCommand) => Ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    build(Ffmpeg())
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });
}

/** One consistent encode target, so segments concatenate without artefacts. */
const ENCODE = [
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "20",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "192k",
  "-ar", "48000",
  // Every segment must carry an audio track or concat drops the stream on the
  // ones that do. A silent source segment still needs silence, not nothing.
  "-shortest",
];

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const workDir = path.join(tmpdir(), `videoedit_assemble_${randomUUID()}`);

  try {
    const body = (await req.json()) as Body;
    const sourceUrl = body.sourceUrl?.trim();
    const renderedUrl = body.renderedUrl?.trim();
    const start = Number(body.window?.start ?? 0);
    const end = Number(body.window?.end ?? 0);

    if (!sourceUrl) {
      return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
    }
    const segmentUrls = Array.isArray(body.segmentUrls)
      ? body.segmentUrls.filter((u): u is string => typeof u === "string" && Boolean(u.trim()))
      : [];
    if (!renderedUrl && segmentUrls.length === 0) {
      return NextResponse.json(
        { error: "renderedUrl or segmentUrls is required" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return NextResponse.json(
        { error: "window must be { start, end } with end greater than start" },
        { status: 400 },
      );
    }

    const {
      byteplusAk: ak,
      bytelusSk: sk,
      byteplusTosBucket: bucket,
    } = await getUserKeys();
    if (!ak) return missingKeyResponse("byteplus_ak");
    if (!sk) return missingKeyResponse("byteplus_sk");
    if (!bucket) return missingKeyResponse("byteplus_tos_bucket");

    await fs.mkdir(workDir, { recursive: true });
    if (ffmpegStatic) Ffmpeg.setFfmpegPath(ffmpegStatic);

    const sourcePath = path.join(workDir, "source.mp4");
    await download(sourceUrl, sourcePath);

    // ── Timeline mode: join the segments first, then treat the join as "the
    //    render" so the audio and splice paths below are shared verbatim. One
    //    code path for both modes is what keeps the audio behaviour identical.
    let renderedPath = path.join(workDir, "rendered.mp4");
    if (segmentUrls.length > 0) {
      const parts: string[] = [];
      for (const [i, url] of segmentUrls.entries()) {
        const raw = path.join(workDir, `seg_raw_${i}.mp4`);
        await download(url, raw);
        // Normalise every segment to the same encode BEFORE concatenating.
        // Segments come back from separate generations and are not reliably
        // stream-compatible with each other, so `-c copy` on the raw files
        // produces a file that plays the first one and then garbage.
        const norm = path.join(workDir, `seg_${i}.mp4`);
        await run((cmd) => cmd.input(raw).outputOptions(ENCODE).output(norm));
        parts.push(norm);
      }
      if (parts.length === 1) {
        renderedPath = parts[0];
      } else {
        const list = path.join(workDir, "segments.txt");
        await fs.writeFile(list, parts.map((p) => `file '${p}'`).join("\n"), "utf8");
        renderedPath = path.join(workDir, "joined.mp4");
        await run((cmd) =>
          cmd
            .input(list)
            .inputOptions(["-f", "concat", "-safe", "0"])
            // Safe: every part was just written by this process with the same
            // ENCODE options.
            .outputOptions(["-c", "copy"])
            .output(renderedPath),
        );
      }
    } else {
      await download(renderedUrl!, renderedPath);
    }

    // ── The window segment: the render, with its audio decided ─────────────
    const windowPath = path.join(workDir, "window.mp4");

    if (body.audio === "preserve") {
      // Take video from the render and audio from the source's own window.
      // `-shortest` is what keeps them aligned when the render is a few frames
      // longer or shorter than the segment it replaces — without it the output
      // runs to the longer of the two and the tail is a freeze or silence.
      await run((cmd) =>
        cmd
          .input(renderedPath)
          .input(sourcePath)
          .inputOptions([`-ss ${start}`, `-to ${end}`])
          .outputOptions([
            "-map", "0:v:0",
            // `?` so a source with no audio track at all produces a silent
            // result rather than failing the whole assemble.
            "-map", "1:a:0?",
            ...ENCODE,
          ])
          .output(windowPath),
      );
    } else {
      await run((cmd) =>
        cmd.input(renderedPath).outputOptions(ENCODE).output(windowPath),
      );
    }

    // ── Splice the untouched footage back around it ───────────────────────
    const segments: string[] = [];

    if (body.splice !== false && start > 0.05) {
      const head = path.join(workDir, "head.mp4");
      await run((cmd) =>
        cmd
          .input(sourcePath)
          .inputOptions(["-ss 0", `-to ${start}`])
          .outputOptions(ENCODE)
          .output(head),
      );
      segments.push(head);
    }

    segments.push(windowPath);

    if (body.splice !== false) {
      const tail = path.join(workDir, "tail.mp4");
      let hasTail = false;
      try {
        await run((cmd) =>
          cmd
            .input(sourcePath)
            .inputOptions([`-ss ${end}`])
            .outputOptions(ENCODE)
            .output(tail),
        );
        // A window ending at the clip's end produces a zero-length tail;
        // concatenating it is harmless but pointless, and on some builds
        // produces a file ffmpeg then refuses to read.
        hasTail = (await fs.stat(tail)).size > 1024;
      } catch {
        hasTail = false;
      }
      if (hasTail) segments.push(tail);
    }

    let outputPath = windowPath;
    if (segments.length > 1) {
      const listFile = path.join(workDir, "concat.txt");
      await fs.writeFile(
        listFile,
        segments.map((p) => `file '${p}'`).join("\n"),
        "utf8",
      );
      outputPath = path.join(workDir, "assembled.mp4");
      await run((cmd) =>
        cmd
          .input(listFile)
          .inputOptions(["-f", "concat", "-safe", "0"])
          // Safe here and ONLY here: every segment was just written by the
          // same encoder with the same ENCODE options, so they are genuinely
          // stream-compatible.
          .outputOptions(["-c", "copy"])
          .output(outputPath),
      );
    }

    const buf = await fs.readFile(outputPath);
    const publicUrl = await uploadToTos(buf, "video/mp4", "assembled.mp4", {
      ak,
      sk,
      bucket,
    });

    return NextResponse.json({
      url: publicUrl,
      spliced: segments.length > 1,
      audio: body.audio === "preserve" ? "preserve" : "keep",
    });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    logRouteError("video-edit.assemble", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
