/**
 * GET /api/modelark/groups/[groupId]/assets?pageSize=50&pageNumber=1
 */

import { NextRequest, NextResponse } from "next/server";
import { listAssets, ModelArkError } from "@/lib/modelark";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params;
  const { searchParams } = new URL(req.url);
  const pageSize = Math.min(Number(searchParams.get("pageSize") ?? "50"), 100);
  const pageNumber = Math.max(Number(searchParams.get("pageNumber") ?? "1"), 1);

  try {
    const page = await listAssets(groupId, pageSize, pageNumber);
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof ModelArkError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
