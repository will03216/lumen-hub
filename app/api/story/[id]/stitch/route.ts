/**
 * POST /api/story/[id]/stitch
 *
 * Body: {
 *   clips: string[],                 // ordered video URLs (approved scenes)
 *   backgroundAudioUrl?: string,     // optional background music to mix under the full video
 * }
 *
 * Flow:
 *  1. Download every clip to a temp dir.
 *  2. Concatenate with FFmpeg concat filter (decoded path — reliable timeline).
 *     Stream-copy concat demuxers break with CDN-served MP4s that carry edit
 *     lists or non-zero start PTS; the filter decodes every clip so timestamps
 *     are always computed from actual frame data, not container metadata.
 *  3. If backgroundAudioUrl: mix it under the stitched video.
 *  4. Write to /public/library-cache/<storyId>-final.mp4 and return the URL.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import os from "os";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";
export const maxDuration = 300;

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: storyId } = await params;

  let body: { clips?: unknown; backgroundAudioUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clips = body.clips;
  if (!Array.isArray(clips) || clips.length === 0) {
    return NextResponse.json(
      { error: "clips must be a non-empty array of URLs" },
      { status: 400 },
    );
  }

  const clipUrls = clips as string[];
  const bgAudioUrl =
    typeof body.backgroundAudioUrl === "string" && body.backgroundAudioUrl.trim()
      ? body.backgroundAudioUrl.trim()
      : null;

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "stitch-"));

  try {
    // ── 1. Download clips ──────────────────────────────────────────────
    const localPaths: string[] = [];
    await Promise.all(
      clipUrls.map(async (url, i) => {
        const p = path.join(tmpDir, `clip-${i}.mp4`);
        await downloadFile(url, p);
        localPaths[i] = p;
      }),
    );

    // ── 2. Concat ──────────────────────────────────────────────────────
    const cacheDir = path.join(process.cwd(), "public", "library-cache");
    await fs.promises.mkdir(cacheDir, { recursive: true });

    const outName = `${storyId}-final.mp4`;
    const outPath = path.join(cacheDir, outName);

    if (!bgAudioUrl) {
      await concatClips(localPaths, outPath);
    } else {
      // ── 3. Concat then mix background audio ───────────────────────
      const stitchedPath = path.join(tmpDir, "stitched.mp4");
      const hasAudio = await concatClips(localPaths, stitchedPath);

      const bgPath = path.join(tmpDir, "bg-audio");
      await downloadFile(bgAudioUrl, bgPath);

      await mixAudio(stitchedPath, bgPath, outPath, hasAudio);
    }

    return NextResponse.json({ url: `/library-cache/${outName}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }, () => {});
  }
}

// ─────────────────────────── Helpers ──────────────────────────────────────

async function downloadFile(url: string, dest: string): Promise<void> {
  if (url.startsWith("/")) {
    await fs.promises.copyFile(path.join(process.cwd(), "public", url), dest);
    return;
  }
  if (url.startsWith("data:")) {
    const [, b64] = url.split(",");
    await fs.promises.writeFile(dest, Buffer.from(b64, "base64"));
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} → ${res.status}`);
  await fs.promises.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/**
 * Concatenate clips via the FFmpeg concat filter (decoded path).
 * Tries with audio first; if clips have no audio tracks, retries video-only.
 * Returns true when the output contains an audio stream.
 */
async function concatClips(localPaths: string[], outPath: string): Promise<boolean> {
  try {
    await runConcatFilter(localPaths, outPath, true);
    return true;
  } catch {
    // Clips may have no audio tracks — retry without audio mapping.
    try { await fs.promises.unlink(outPath); } catch { /* ignore */ }
    await runConcatFilter(localPaths, outPath, false);
    return false;
  }
}

function runConcatFilter(
  localPaths: string[],
  outPath: string,
  withAudio: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const n = localPaths.length;
    const cmd = ffmpeg();
    localPaths.forEach((p) => cmd.input(p));

    const filterStr = withAudio
      ? `${localPaths.map((_, i) => `[${i}:v][${i}:a]`).join("")}concat=n=${n}:v=1:a=1[outv][outa]`
      : `${localPaths.map((_, i) => `[${i}:v]`).join("")}concat=n=${n}:v=1:a=0[outv]`;

    const outputOpts = withAudio
      ? ["-map", "[outv]", "-map", "[outa]", "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]
      : ["-map", "[outv]", "-an", "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-movflags", "+faststart"];

    cmd
      .complexFilter([filterStr])
      .outputOptions(outputOpts)
      .output(outPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

/**
 * Mix background audio under the stitched video.
 * - If the video has its own audio: blend both (bg at 35% weight via amix).
 * - If video-only: add background audio directly as the sole audio track.
 * - Background audio loops to match the video duration.
 */
function mixAudio(
  videoPath: string,
  audioPath: string,
  outPath: string,
  videoHasAudio: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .inputOptions(["-stream_loop", "-1"]);

    if (videoHasAudio) {
      cmd
        .complexFilter(["[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.35[aout]"])
        .outputOptions([
          "-map", "0:v",
          "-map", "[aout]",
          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "192k",
          "-movflags", "+faststart",
        ]);
    } else {
      // No source audio — add background track and trim to video length.
      cmd.outputOptions([
        "-map", "0:v",
        "-map", "1:a",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
      ]);
    }

    cmd
      .output(outPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}
