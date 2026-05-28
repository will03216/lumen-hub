/**
 * POST /api/modelark/groups — create a new BytePlus asset group, return its data.
 *
 * The client is responsible for persisting the returned group to localStorage
 * via addAssetGroup() — localStorage is client-side only and cannot be written
 * from a server route.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAssetGroup, listAllAssetGroups, ModelArkError } from "@/lib/modelark";

export const runtime = "nodejs";

export async function GET() {
  try {
    const groups = await listAllAssetGroups();
    return NextResponse.json({ groups });
  } catch (err) {
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

  try {
    const group = await createAssetGroup(name, description);
    return NextResponse.json(
      { byteplusGroupId: group.groupId, name: group.name, description: group.description },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ModelArkError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
