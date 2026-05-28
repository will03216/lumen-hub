/**
 * GET /api/modelark/assets/[id]
 *
 * Poll the status of a BytePlus asset. Returns { assetId, status, url?, errorMessage? }.
 * Status values: "Pending" | "Active" | "Failed"
 */

import { NextRequest, NextResponse } from "next/server";
import { getAsset, ModelArkError } from "@/lib/modelark";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const asset = await getAsset(id);
    return NextResponse.json(asset);
  } catch (err) {
    if (err instanceof ModelArkError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
