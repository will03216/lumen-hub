/**
 * POST /api/modelark/groups — create a new BytePlus asset group, return its data.
 *
 * The client is responsible for persisting the returned group to localStorage
 * via addAssetGroup() — localStorage is client-side only and cannot be written
 * from a server route.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAssetGroup, listAssetGroups, ModelArkError } from "@/lib/modelark";
import { getUserKeys, missingKeyResponse, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;

function positiveInt(raw: string | null, fallback: number, max?: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return max ? Math.min(n, max) : n;
}

/**
 * Returns ONE page, not the whole account.
 *
 * This used to call listAllAssetGroups(), which walks every page before
 * responding — ~14.5s on a 5k-group account, with the panel blank the whole
 * time. The client now renders page 1 and backfills the rest in the
 * background, so `total` is returned to let it know how far to walk.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const { byteplusAk: ak, bytelusSk: sk } = await getUserKeys();
  if (!ak) return missingKeyResponse("byteplus_ak");
  if (!sk) return missingKeyResponse("byteplus_sk");

  try {
    const { groups, total } = await listAssetGroups(pageSize, page, { ak, sk });
    return NextResponse.json({
      groups,
      total,
      page,
      pageSize,
      // A short page means the end, even if `total` disagrees.
      hasMore: groups.length === pageSize && page * pageSize < total,
    });
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

export async function POST(req: NextRequest) {
  let body: { name?: unknown; description?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";

  const { byteplusAk: ak, bytelusSk: sk } = await getUserKeys();
  if (!ak) return missingKeyResponse("byteplus_ak");
  if (!sk) return missingKeyResponse("byteplus_sk");

  try {
    const group = await createAssetGroup(name, description, { ak, sk });
    return NextResponse.json(
      { byteplusGroupId: group.groupId, name: group.name, description: group.description },
      { status: 201 },
    );
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
