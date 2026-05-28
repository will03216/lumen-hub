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
// Stitching 6×15s clips downloads ~150-300 MB and re-encodes; allow 5 min.
export const maxDuration = 300;

type Body = {
  videoUrls?: string[];
};

async function downloadToTemp(url: string, dir: string, index: number): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download clip ${index}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(dir, `clip_${index}.mp4`);
  await fs.writeFile(dest, buf);
  return dest;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const workDir = path.join(tmpdir(), `stitch_${randomUUID()}`);
  try {
    const body = (await req.json()) as Body;
    const urls = body.videoUrls;
    if (!Array.isArray(urls) || urls.length < 2) {
      return NextResponse.json(
        { error: "videoUrls must be an array of at least 2 URLs" },
        { status: 400 },
      );
    }

    await fs.mkdir(workDir, { recursive: true });

    // Download all clips in parallel
    const clipPaths = await Promise.all(
      urls.map((url, i) => downloadToTemp(url, workDir, i)),
    );

    // Write ffmpeg concat list
    const listFile = path.join(workDir, "concat.txt");
    const listContent = clipPaths.map((p) => `file '${p}'`).join("\n");
    await fs.writeFile(listFile, listContent, "utf8");

    const outputPath = path.join(workDir, "stitched.mp4");

    // Set the ffmpeg binary path
    if (ffmpegStatic) Ffmpeg.setFfmpegPath(ffmpegStatic);

    await new Promise<void>((resolve, reject) => {
      Ffmpeg()
        .input(listFile)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c", "copy"])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    const outputBuf = await fs.readFile(outputPath);
    const publicUrl = await uploadToTos(outputBuf, "video/mp4", "stitched.mp4");

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    logRouteError("video.stitch", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Clean up temp files regardless of success/failure
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
