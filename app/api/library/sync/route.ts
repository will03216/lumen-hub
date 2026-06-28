/**
 * /api/library/sync — cloud mirror for Library asset mutations.
 *
 * POST   → upsert one asset record (by id + user_id)
 * DELETE → remove one asset record
 *
 * Auth is enforced by Clerk. DATABASE_URL must be set for writes to land;
 * if it isn't configured the route returns 503 so the client can swallow
 * the error gracefully (local store is the authoritative source).
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import type { Asset } from "@/lib/library/assets";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Cloud sync not configured" }, { status: 503 });
  }

  const { asset } = (await req.json()) as { asset: Asset };
  if (!asset?.id) {
    return Response.json({ error: "asset.id is required" }, { status: 400 });
  }

  const { db } = await import("@/lib/db");
  await db.query(
    `INSERT INTO assets (id, user_id, payload, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
       SET payload    = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at`,
    [asset.id, userId, asset, new Date(asset.updatedAt).toISOString()],
  );

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Cloud sync not configured" }, { status: 503 });
  }

  const { id } = (await req.json()) as { id: string };
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { db } = await import("@/lib/db");
  await db.query(
    "DELETE FROM assets WHERE id = $1 AND user_id = $2",
    [id, userId],
  );

  return Response.json({ ok: true });
}
