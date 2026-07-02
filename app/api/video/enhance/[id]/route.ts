import { NextRequest, NextResponse } from "next/server";
import { getTask, MediaKitError } from "@/lib/mediakit";
import { getUserKeys, missingKeyResponse, keyErrorResponse } from "@/lib/server/user-keys";
import { logRouteError } from "@/lib/server-log";

export const runtime = "nodejs";

/** Pull the output URL out of whichever field MediaKit populated — the docs
 *  are inconsistent between `result.video_url` and `output.video_url`, and
 *  some responses wrap everything in `data`. */
function extractUrl(data: Record<string, unknown>): string | undefined {
  const inner = data.data as Record<string, unknown> | undefined;
  // The enhance-video task response is flat (top-level task_id/status), so the
  // output URL is most likely top-level `video_url`; the result/output nestings
  // are kept as fallbacks because the docs are inconsistent across tools.
  const containers: Array<Record<string, unknown> | undefined> = [
    data,
    inner,
    data.result as Record<string, unknown> | undefined,
    data.output as Record<string, unknown> | undefined,
    inner?.result as Record<string, unknown> | undefined,
    inner?.output as Record<string, unknown> | undefined,
  ];
  for (const c of containers) {
    const u = c?.video_url ?? c?.output_url;
    if (typeof u === "string" && u) return u;
  }
  return undefined;
}

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

    const { byteplusMediakitKey: apiKey } = await getUserKeys();
    if (!apiKey) return missingKeyResponse("byteplus_mediakit_key");

    const data = await getTask(id, apiKey);
    const inner = (data.data as Record<string, unknown> | undefined) ?? data;
    const status = (inner.status as string | undefined) ?? (data.status as string | undefined);

    const errObj = data.error ?? inner.error;
    const error =
      typeof errObj === "string"
        ? errObj
        : errObj && typeof errObj === "object" && "message" in errObj
          ? String((errObj as Record<string, unknown>).message)
          : undefined;

    return NextResponse.json({
      status,
      url: extractUrl(data),
      error,
    });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof MediaKitError) {
      logRouteError("video.enhance.poll", err, startedAt);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logRouteError("video.enhance.poll", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
