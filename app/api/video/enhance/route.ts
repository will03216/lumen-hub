import { NextRequest, NextResponse } from "next/server";
import { submitEnhance, MediaKitError, type EnhancePayload } from "@/lib/mediakit";
import {
  getUserKeys,
  missingKeyResponse,
  keyErrorResponse,
} from "@/lib/server/user-keys";
import { logRouteError } from "@/lib/server-log";

export const runtime = "nodejs";

type Body = {
  url?: string;
  tool_version?: "standard" | "professional";
  scene?: string;
  resolution?: string;
  resolution_limit?: string;
  fps?: number;
  bitrate_level?: "low" | "medium" | "high";
  client_token?: string;
};

function isPublicUrl(s: string): boolean {
  return (
    (s.startsWith("https://") || s.startsWith("http://")) &&
    !/localhost|127\.0\.0\.1/.test(s)
  );
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as Body;

    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json(
        { error: "A source video 'url' is required." },
        { status: 400 },
      );
    }
    if (!isPublicUrl(url)) {
      return NextResponse.json(
        {
          error:
            "The source video URL must be a publicly reachable http(s) URL. " +
            "MediaKit downloads it server-side, so localhost/data URLs won't work.",
        },
        { status: 400 },
      );
    }

    // resolution and resolution_limit are mutually exclusive — reject upfront
    // rather than letting MediaKit fail the task asynchronously.
    if (body.resolution && body.resolution_limit) {
      return NextResponse.json(
        { error: "'resolution' and 'resolution_limit' cannot be sent together." },
        { status: 400 },
      );
    }

    const { byteplusMediakitKey: apiKey } = await getUserKeys();
    if (!apiKey) return missingKeyResponse("byteplus_mediakit_key");

    const tool_version = body.tool_version === "professional"
      ? "professional"
      : "standard";

    const payload: EnhancePayload = {
      video_url: url,
      tool_version,
      client_token: body.client_token,
    };
    // scene only applies to the standard tool version.
    if (tool_version === "standard" && body.scene) payload.scene = body.scene;
    if (body.resolution) payload.resolution = body.resolution;
    if (body.resolution_limit) payload.resolution_limit = body.resolution_limit;
    if (typeof body.fps === "number" && Number.isFinite(body.fps)) {
      payload.fps = body.fps;
    }
    if (body.bitrate_level) payload.bitrate_level = body.bitrate_level;

    const { httpStatus, body: mk } = await submitEnhance(payload, apiKey);

    // MediaKit returns 200 for both success and validation errors — log the
    // exact status + full body so failures are debuggable. `has_auth` confirms
    // the Bearer header was populated (never logs the key itself).
    console.log(
      JSON.stringify({
        event: "mediakit_submit",
        mediakit_status: httpStatus,
        has_auth: Boolean(apiKey),
        sent: { ...payload, client_token: payload.client_token ? "set" : undefined },
        mediakit_body: mk,
      }),
    );

    // Defensive extraction across envelope variants.
    const inner = (mk.data as Record<string, unknown> | undefined) ?? undefined;
    const result = (mk.Result as Record<string, unknown> | undefined) ?? undefined;
    const taskId =
      (mk.task_id as string | undefined) ??
      (inner?.task_id as string | undefined) ??
      (result?.task_id as string | undefined);

    // Treat success===false, non-2xx, or a missing task_id as a hard failure
    // and surface MediaKit's real message/code/request_id — never a bare
    // "no task_id" downstream.
    if (httpStatus < 200 || httpStatus >= 300 || mk.success === false || !taskId) {
      const err = (mk.error as Record<string, unknown> | undefined) ?? undefined;
      const message =
        (typeof err?.message === "string" && err.message) ||
        (typeof mk.message === "string" && mk.message) ||
        "MediaKit enhance-video failed";
      const code =
        (err?.code as string | undefined) ?? (mk.code as string | undefined);
      const request_id =
        (mk.request_id as string | undefined) ??
        (mk.RequestId as string | undefined);
      // If MediaKit gave a 200 for an error, don't echo 200 — 502 so the
      // node's `!res.ok` branch surfaces the message.
      const status = httpStatus >= 400 ? httpStatus : 502;
      return NextResponse.json({ error: message, code, request_id }, { status });
    }

    return NextResponse.json({ task_id: taskId });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof MediaKitError) {
      logRouteError("video.enhance", err, startedAt);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logRouteError("video.enhance", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
