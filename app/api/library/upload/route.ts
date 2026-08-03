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
import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  MAX_UPLOAD_BYTES,
  UPLOAD_EXT,
} from "@/lib/media/upload-formats";

export const runtime = "nodejs";
export const maxDuration = 60;

// Shared with the client so a picker can't accept a file this route rejects.
// See lib/media/upload-formats.ts.
const ALLOWED_IMAGE = ALLOWED_IMAGE_MIME;
const ALLOWED_VIDEO = ALLOWED_VIDEO_MIME;
const MAX_BYTES = MAX_UPLOAD_BYTES;
const EXT = UPLOAD_EXT;

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
