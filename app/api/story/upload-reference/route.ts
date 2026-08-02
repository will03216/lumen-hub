/**
 * POST /api/story/upload-reference
 *
 * Puts a reference image on public storage (TOS) and returns its URL.
 *
 * Why this exists: the two models have DIFFERENT input rules.
 *
 *   Seed 2.0 (prompt / breakdown)  accepts data URIs — it reads the bytes we send.
 *   Seedance (video)               does NOT. It renders server-side and must
 *                                  fetch the image itself, so a data URI fails
 *                                  with InvalidParameter.UnsupportedImageFormat
 *                                  and a same-origin /library-cache URL is
 *                                  equally useless — BytePlus cannot reach
 *                                  localhost.
 *
 * Storing a public URL at upload time satisfies both, so nothing downstream has
 * to care. /api/modelark/assets/upload also lands in TOS but requires a
 * groupId, coupling a plain upload to the ModelArk asset library.
 *
 * Body: multipart form with a single "file" field.
 * Returns: { url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { uploadToTos, ModelArkError } from "@/lib/modelark";
import { logRouteError } from "@/lib/server-log";
import { getUserKeys, missingKeyResponse, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Mirrors what the upstream image endpoints accept. */
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 10 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.` },
      { status: 413 },
    );
  }
  // Lowercase: the upstream mime check is case-sensitive.
  const type = file.type.toLowerCase();
  if (!ALLOWED.has(type)) {
    return NextResponse.json(
      { error: `${file.type || "That file"} isn't supported. Use PNG, JPEG, WebP or GIF.` },
      { status: 415 },
    );
  }

  const { byteplusAk: ak, bytelusSk: sk, byteplusTosBucket: bucket } = await getUserKeys();
  if (!ak) return missingKeyResponse("byteplus_ak");
  if (!sk) return missingKeyResponse("byteplus_sk");
  if (!bucket) return missingKeyResponse("byteplus_tos_bucket");

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToTos(
      buffer,
      type,
      `story-reference${EXT[type] ?? ".jpg"}`,
      { ak, sk, bucket },
    );
    return NextResponse.json({ url });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    logRouteError("story.upload-reference", err, startedAt, { size: file.size, type });
    if (err instanceof ModelArkError) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 502 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
