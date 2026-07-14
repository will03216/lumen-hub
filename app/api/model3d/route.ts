import { NextRequest, NextResponse } from "next/server";
import {
  Seed3DError,
  createModel3dTask,
  type Seed3DParams,
} from "@/lib/seed3d";
import { logRouteError } from "@/lib/server-log";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/model3d — submit an image→3D (Seed3D 2.0) task.
 * Body: { imageUrl, fileformat?, subdivisionlevel?, model? }
 * Returns: { id } — poll GET /api/model3d/[id] until status is terminal.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const keys = await getUserKeys();
    const body = (await req.json()) as Partial<Seed3DParams>;
    if (!body.imageUrl || typeof body.imageUrl !== "string") {
      return NextResponse.json(
        { error: "imageUrl is required" },
        { status: 400 },
      );
    }
    const result = await createModel3dTask(
      {
        imageUrl: body.imageUrl,
        fileformat: body.fileformat,
        subdivisionlevel: body.subdivisionlevel,
        model: body.model,
      },
      keys.seed3d,
    );
    return NextResponse.json(result);
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof Seed3DError) {
      logRouteError("model3d.create", err, startedAt, {});
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("model3d.create", err, startedAt, {});
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
