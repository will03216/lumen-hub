import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import Ffmpeg from "fluent-ffmpeg";
import { uploadToTos } from "@/lib/modelark";
import { logRouteError } from "@/lib/server-log";

export const runtime = "nodejs";
// Stitching + audio overlay on 6×10s clips; allow 5 min.
export const maxDuration = 300;

type Body = {
  videoUrls?: string[];
  audioUrl?: string;
};

async function downloadToTemp(url: string, dir: string, name: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(dir, name);
  await fs.writeFile(dest, buf);
  return dest;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const workDir = path.join(tmpdir(), `stitch_audio_${randomUUID()}`);
  try {
    const body = (await req.json()) as Body;
    const urls = body.videoUrls;
    if (!Array.isArray(urls) || urls.length < 1) {
      return NextResponse.json(
        { error: "videoUrls must be a non-empty array" },
        { status: 400 },
      );
    }
    if (!body.audioUrl?.trim()) {
      return NextResponse.json({ error: "audioUrl is required" }, { status: 400 });
    }

    await fs.mkdir(workDir, { recursive: true });
    if (ffmpegStatic) Ffmpeg.setFfmpegPath(ffmpegStatic);

    // Download audio + all clips in parallel
    const [audioPath, ...clipPaths] = await Promise.all([
      downloadToTemp(body.audioUrl.trim(), workDir, "narration.mp3"),
      ...urls.map((url, i) => downloadToTemp(url, workDir, `clip_${i}.mp4`)),
    ]);

    let videoPath: string;

    if (clipPaths.length === 1) {
      // Single clip — no concat needed
      videoPath = clipPaths[0];
    } else {
      // Concat clips first (copy codec, no re-encode)
      const listFile = path.join(workDir, "concat.txt");
      await fs.writeFile(listFile, clipPaths.map((p) => `file '${p}'`).join("\n"), "utf8");
      videoPath = path.join(workDir, "stitched.mp4");

      await new Promise<void>((resolve, reject) => {
        Ffmpeg()
          .input(listFile)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .outputOptions(["-c", "copy"])
          .output(videoPath)
          .on("end", () => resolve())
          .on("error", (err: Error) => reject(err))
          .run();
      });
    }

    // Overlay the narration audio track onto the video.
    // -shortest: cut output at whichever stream ends first.
    // -c:v copy: no video re-encode.
    // -c:a aac: encode MP3 → AAC for broad MP4 compatibility.
    const outputPath = path.join(workDir, "output.mp4");
    await new Promise<void>((resolve, reject) => {
      Ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          "-c:v", "copy",
          "-c:a", "aac",
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-shortest",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    const outputBuf = await fs.readFile(outputPath);
    const publicUrl = await uploadToTos(outputBuf, "video/mp4", "narration-video.mp4");

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    logRouteError("video.stitch", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
