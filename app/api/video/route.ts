import { NextRequest, NextResponse } from "next/server";
import {
  BytePlusError,
  createVideoTask,
  type VideoParams,
} from "@/lib/byteplus";
import { MinimaxError, createVideoTaskMinimax } from "@/lib/minimax";
import { findVideoModel } from "@/lib/studio/models";
import {
  logBytePlusError,
  logMinimaxError,
  logRouteError,
} from "@/lib/server-log";
import { getUserKeys } from "@/lib/server/user-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let promptLen = 0;
  let model: string | undefined;
  try {
    const keys = await getUserKeys();
    const body = (await req.json()) as Partial<VideoParams>;
    promptLen = typeof body.prompt === "string" ? body.prompt.length : 0;
    model = body.model;
    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 },
      );
    }

    // Branch on provider. Unknown / absent model ids fall through to
    // BytePlus — preserves pre-§62 behaviour where the default Seedance
    // catches typos. Only an explicit `provider: "minimax"` opts in.
    const provider =
      (model && findVideoModel(model)?.provider) ?? "byteplus";

    const result =
      provider === "minimax"
        ? await createVideoTaskMinimax({
            prompt: body.prompt,
            model: body.model,
            resolution: body.resolution,
            duration: body.duration,
            ratio: body.ratio,
            seed: body.seed,
            camerafixed: body.camerafixed,
            watermark: body.watermark,
            audio: body.audio,
            images: body.images,
            references: body.references,
          }, { apiKey: keys.minimax })
        : await createVideoTask({
            prompt: body.prompt,
            model: body.model,
            resolution: body.resolution,
            duration: body.duration,
            ratio: body.ratio,
            seed: body.seed,
            camerafixed: body.camerafixed,
            watermark: body.watermark,
            audio: body.audio,
            images: body.images,
            videos: body.videos,
            references: body.references,
          }, keys.byteplus);
    return NextResponse.json(result);
  } catch (err) {
    // Preserve upstream HTTP status so the client classifier can route
    // it (see app/api/image/route.ts for the rationale). Each upstream
    // gets its own log channel — the Vercel filter can answer "are we
    // getting rate-limited?" per provider.
    if (err instanceof BytePlusError) {
      logBytePlusError("video.create", err, startedAt, {
        prompt_len: promptLen,
        model,
      });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    if (err instanceof MinimaxError) {
      logMinimaxError("video.create", err, startedAt, {
        prompt_len: promptLen,
        model,
      });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("video.create", err, startedAt, {
      prompt_len: promptLen,
      model,
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
