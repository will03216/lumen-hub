/**
 * POST /api/model3d/turntable-video
 *
 * The *deterministic* turntable path: the client renders the mesh from many
 * evenly-spaced angles (frames covering [0°, 360°)), posts them here, and
 * ffmpeg assembles them into an mp4 at a fixed frame rate. The result is a
 * pixel-perfect, perfectly-consistent orbit — the same mesh from rotating
 * camera angles, no generative model in the loop.
 *
 * Contrast with the R2V path (Seedance references), which is prompt-driven
 * and can drift. Use this when consistency matters more than realism.
 *
 * Multipart form:
 *   fps     — target frame rate (default 24)
 *   frames  — ordered image files (frame 0 = 0°, last = just before 360°)
 * Returns: { url } — public TOS mp4 URL.
 * Requires the user's BytePlus AK / SK / TOS bucket (same as the stitch nodes).
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
export const maxDuration = 120;

// Guard rails: enough for a smooth few-second loop, small enough to bound
// memory / encode time and the request payload.
const MAX_FRAMES = 240;
const MAX_FRAME_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const workDir = path.join(tmpdir(), `turntable_${randomUUID()}`);
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
    }

    const fps = Math.min(60, Math.max(1, Number(form.get("fps")) || 24));
    const files = form.getAll("frames").filter((f): f is File => f instanceof File);
    if (files.length < 2) {
      return NextResponse.json(
        { error: "at least 2 frames are required" },
        { status: 400 },
      );
    }
    if (files.length > MAX_FRAMES) {
      return NextResponse.json(
        { error: `too many frames (${files.length} > ${MAX_FRAMES})` },
        { status: 413 },
      );
    }

    const { byteplusAk: ak, bytelusSk: sk, byteplusTosBucket: bucket } =
      await getUserKeys();
    if (!ak) return missingKeyResponse("byteplus_ak");
    if (!sk) return missingKeyResponse("byteplus_sk");
    if (!bucket) return missingKeyResponse("byteplus_tos_bucket");

    await fs.mkdir(workDir, { recursive: true });

    // Write frames as a zero-padded sequence ffmpeg can glob with %04d.
    // getAll() preserves append order, so index === camera angle order.
    for (let i = 0; i < files.length; i++) {
      const bytes = Buffer.from(await files[i].arrayBuffer());
      if (bytes.byteLength > MAX_FRAME_BYTES) {
        return NextResponse.json({ error: `frame ${i} too large` }, { status: 413 });
      }
      const name = `frame_${String(i).padStart(4, "0")}.jpg`;
      await fs.writeFile(path.join(workDir, name), bytes);
    }

    const outputPath = path.join(workDir, "turntable.mp4");
    if (ffmpegStatic) Ffmpeg.setFfmpegPath(ffmpegStatic);

    await new Promise<void>((resolve, reject) => {
      Ffmpeg()
        .input(path.join(workDir, "frame_%04d.jpg"))
        .inputOptions(["-framerate", String(fps)])
        .outputOptions([
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p", // broad player compatibility
          "-movflags", "+faststart",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    const outputBuf = await fs.readFile(outputPath);
    const url = await uploadToTos(outputBuf, "video/mp4", "turntable.mp4", {
      ak,
      sk,
      bucket,
    });
    return NextResponse.json({ url });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    logRouteError("model3d.turntable-video", err, startedAt, {});
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
