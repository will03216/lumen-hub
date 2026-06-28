/**
 * GET /api/modelark/assets/[id]
 *
 * Poll the status of a BytePlus asset. Returns { assetId, status, url?, errorMessage? }.
 * Status values: "Pending" | "Active" | "Failed"
 */

import { NextRequest, NextResponse } from "next/server";
import { getAsset, ModelArkError } from "@/lib/modelark";
import { getUserKeys, missingKeyResponse, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { byteplusAk: ak, bytelusSk: sk } = await getUserKeys();
  if (!ak) return missingKeyResponse("byteplus_ak");
  if (!sk) return missingKeyResponse("byteplus_sk");

  try {
    const asset = await getAsset(id, { ak, sk });
    return NextResponse.json(asset);
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof ModelArkError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
