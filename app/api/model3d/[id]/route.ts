import { NextRequest, NextResponse } from "next/server";
import { Seed3DError, getModel3dTask } from "@/lib/seed3d";
import { logRouteError } from "@/lib/server-log";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";

/**
 * GET /api/model3d/[id] — poll a Seed3D image→3D task.
 * On success the response carries `content.file_url` (a 24h TOS zip URL
 * containing the .glb mesh). The client then loads it via /api/model3d/mesh.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }
    const keys = await getUserKeys();
    const result = await getModel3dTask(id, keys.seed3d);
    return NextResponse.json(result);
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof Seed3DError) {
      logRouteError("model3d.poll", err, startedAt, {});
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("model3d.poll", err, startedAt, {});
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
