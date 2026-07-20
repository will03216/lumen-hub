/**
 * POST /api/model3d/upload-frame
 *
 * Publishes one client-rendered turntable frame to the user's TOS bucket so
 * it becomes a public https URL that Seedance can ingest as a keyframe. The
 * Video Gen node rejects data: URLs for first/last frame (they aren't
 * publicly fetchable), so the turntable frames must be uploaded here first.
 *
 * Body: { dataUrl: string } — a `data:image/jpeg;base64,...` frame.
 * Returns: { url } — public TOS URL.
 * Requires the user's BytePlus AK / SK / TOS bucket (same as the render nodes).
 */

import { NextRequest, NextResponse } from "next/server";
import { uploadToTos, ModelArkError } from "@/lib/modelark";
import {
  getUserKeys,
  missingKeyResponse,
  keyErrorResponse,
} from "@/lib/server/user-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB — a JPEG turntable frame is well under this.

export async function POST(req: NextRequest) {
  let body: { dataUrl?: string };
  try {
    body = (await req.json()) as { dataUrl?: string };
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const dataUrl = body.dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return NextResponse.json(
      { error: "dataUrl (data:image/...;base64,) is required" },
      { status: 400 },
    );
  }

  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!match) {
    return NextResponse.json({ error: "malformed data URL" }, { status: 400 });
  }
  const contentType = match[1] || "image/jpeg";
  const isBase64 = Boolean(match[2]);
  const buffer = isBase64
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");

  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "frame exceeds 10MB" },
      { status: 413 },
    );
  }

  const { byteplusAk: ak, bytelusSk: sk, byteplusTosBucket: bucket } =
    await getUserKeys();
  if (!ak) return missingKeyResponse("byteplus_ak");
  if (!sk) return missingKeyResponse("byteplus_sk");
  if (!bucket) return missingKeyResponse("byteplus_tos_bucket");

  const ext = contentType.split("/")[1]?.split("+")[0] || "jpg";
  const uploadStart = Date.now();
  console.log(`[model3d/upload-frame] PUT ${buffer.byteLength} bytes → ${bucket} (region ${process.env.MODELARK_TOS_REGION ?? "cn-beijing"})`);
  try {
    const url = await uploadToTos(
      buffer,
      contentType,
      `turntable-frame.${ext}`,
      { ak, sk, bucket },
    );
    console.log(`[model3d/upload-frame] ✓ uploaded in ${((Date.now() - uploadStart) / 1000).toFixed(1)}s`);
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof ModelArkError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status ?? 500 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
