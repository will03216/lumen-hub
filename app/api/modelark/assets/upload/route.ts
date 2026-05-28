/**
 * POST /api/modelark/assets/upload
 *
 * Accepts a multipart file upload, stores it in Volcengine TOS (public bucket),
 * then registers the resulting public URL with the BytePlus ModelArk Asset Library.
 *
 * Form fields:
 *   file     — image/video file
 *   groupId  — BytePlus asset group ID
 *
 * Returns: { assetId: string; url: string }
 *
 * Required env vars: MODELARK_AK, MODELARK_SK, MODELARK_TOS_BUCKET
 */

import { NextRequest, NextResponse } from "next/server";
import { uploadToTos, createAsset, ModelArkError } from "@/lib/modelark";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  const groupId = form.get("groupId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (typeof groupId !== "string" || !groupId.trim()) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const publicUrl = await uploadToTos(buffer, file.type || "application/octet-stream", file.name);
    const assetType = file.type.startsWith("video/") ? "Video" : "Image";
    const assetId = await createAsset(groupId.trim(), publicUrl, assetType);
    return NextResponse.json({ assetId, url: publicUrl }, { status: 201 });
  } catch (err) {
    if (err instanceof ModelArkError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
