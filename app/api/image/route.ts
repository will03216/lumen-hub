import { NextRequest, NextResponse } from "next/server";
import {
  BytePlusError,
  generateImage,
  type ImageGenParams,
} from "@/lib/byteplus";
import { FalError, generateImageFal } from "@/lib/fal";
import { findImageModel } from "@/lib/studio/models";
import {
  logBytePlusError,
  logFalError,
  logRouteError,
} from "@/lib/server-log";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";
// 5 minutes — covers gpt-image-2 at quality:"high" with margin. BytePlus
// generations come back in 5-15s so they don't care; only the fal poll
// loop needs the headroom. Vercel Pro caps at 300, which we sit right at.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // Captured at the top so we can log upstream round-trip latency even
  // when the failure happens inside the upstream call.
  const startedAt = Date.now();
  // Declared out here so the catch can log `prompt_len` and `model`
  // without re-parsing. Metadata only — never the prompt itself.
  let promptLen = 0;
  let model: string | undefined;
  try {
    const keys = await getUserKeys();
    const body = (await req.json()) as Partial<ImageGenParams>;
    promptLen = typeof body.prompt === "string" ? body.prompt.length : 0;
    model = body.model;
    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 },
      );
    }

    // Branch on provider. Unknown model ids fall through to BytePlus —
    // matches pre-§61 behaviour where the BytePlus default model id
    // catches typos. Only an explicit `provider: "fal"` opts in to fal.
    const provider =
      (body.model && findImageModel(body.model)?.provider) ?? "byteplus";

    const result =
      provider === "fal"
        ? await generateImageFal({
            prompt: body.prompt,
            model: body.model!,
            size: body.size,
            // Generator's batch flow fires N parallel requests rather
            // than asking fal for N variants in one go — keeps the
            // per-variant seed plumbing useful and the failure mode
            // independent. So num_images stays 1 here.
            num_images: 1,
            image: body.image,
          }, keys.fal)
        : await generateImage({
            prompt: body.prompt,
            model: body.model,
            size: body.size,
            seed: body.seed,
            watermark: body.watermark,
            image: body.image,
            sequential: body.sequential,
            max_images: body.max_images,
          }, keys.byteplus);
    return NextResponse.json(result);
  } catch (err) {
    // Strict BYOK — a missing user key surfaces as 402 so the client can
    // prompt the user to add it in Settings, not as an opaque 500.
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    // Forward upstream HTTP status 1:1 so the client classifier can
    // dispatch on it — 429 → rate-limit, 400 → invalid-input, 5xx →
    // transient. Collapsing everything to 500 (previous behaviour)
    // defeated the classifier's status branch entirely.
    if (err instanceof BytePlusError) {
      logBytePlusError("image", err, startedAt, {
        prompt_len: promptLen,
        model,
      });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    if (err instanceof FalError) {
      logFalError("image", err, startedAt, {
        prompt_len: promptLen,
        model,
      });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("image", err, startedAt, { prompt_len: promptLen, model });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
