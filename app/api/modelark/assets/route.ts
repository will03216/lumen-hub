/**
 * POST /api/modelark/assets
 *
 * Register a URL as a BytePlus asset inside a given group.
 * Returns immediately with the BytePlus asset_id; the asset status
 * starts as "Pending" — poll GET /api/modelark/assets/[id] until Active.
 *
 * Body: { groupId: string; url: string; assetType?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAsset, ModelArkError } from "@/lib/modelark";

export const runtime = "nodejs";
// base64-encoded images can be large; raise the body limit beyond the 4 MB default
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: { groupId?: unknown; url?: unknown; assetType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const assetType = typeof body.assetType === "string" ? body.assetType : "Image";

  if (!groupId) return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  try {
    const assetId = await createAsset(groupId, url, assetType);
    return NextResponse.json({ assetId }, { status: 201 });
  } catch (err) {
    if (err instanceof ModelArkError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
