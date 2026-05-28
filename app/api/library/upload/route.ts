/**
 * POST /api/library/upload
 *
 * Accepts a multipart form with a single "file" field (image or video).
 * Saves the file to /public/library-cache/upload-<id>.<ext> and returns
 * the same-origin URL. Max 50 MB.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field is required" }, { status: 400 });
  }

  const mime = file.type;
  if (!ALLOWED_IMAGE.has(mime) && !ALLOWED_VIDEO.has(mime)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mime}` },
      { status: 415 },
    );
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 50 MB limit" }, { status: 413 });
  }

  const ext = EXT[mime] ?? "bin";
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const filename = `upload-${id}.${ext}`;
  const cacheDir = path.join(process.cwd(), "public", "library-cache");
  await fs.promises.mkdir(cacheDir, { recursive: true });
  await fs.promises.writeFile(path.join(cacheDir, filename), Buffer.from(bytes));

  const kind = ALLOWED_IMAGE.has(mime) ? "image" : "video";
  return NextResponse.json({
    url: `/library-cache/${filename}`,
    kind,
    filename,
  });
}
