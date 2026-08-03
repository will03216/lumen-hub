/**
 * /api/image — image generation, submit + poll.
 *
 * POST submits the generation as a background job and returns a `{ jobId }`
 * in well under a second; the client polls GET /api/image/[id] for the
 * result. Generation itself (BytePlus or fal) can take minutes for slow
 * model+size combos, which is exactly why it must NOT be awaited inline: the
 * BytePlus ALB's ~60s response timeout would 504 a still-running request.
 * See lib/server/image-jobs.ts for the full rationale.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateImage, type ImageGenParams } from "@/lib/byteplus";
import { generateImageFal } from "@/lib/fal";
import { findImageModel } from "@/lib/studio/models";
import { auth } from "@clerk/nextjs/server";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";
import { submitImageJob } from "@/lib/server/image-jobs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Captured up front so a background failure can log full round-trip latency.
  const startedAt = Date.now();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const keys = await getUserKeys();
    const body = (await req.json()) as Partial<ImageGenParams>;
    const promptLen = typeof body.prompt === "string" ? body.prompt.length : 0;
    const model = body.model;
    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    const prompt = body.prompt;

    // Branch on provider. Unknown model ids fall through to BytePlus —
    // matches pre-§61 behaviour where the BytePlus default model id catches
    // typos. Only an explicit `provider: "fal"` opts in to fal.
    const provider =
      (body.model && findImageModel(body.model)?.provider) ?? "byteplus";

    // Fire the generation into the background and hand back a job id. The
    // upstream call (and its errors — BytePlus status, fal poll, missing key)
    // is surfaced through the poll endpoint, not this response.
    const jobId = submitImageJob(
      userId,
      () =>
        provider === "fal"
          ? generateImageFal(
              {
                prompt,
                model: body.model!,
                size: body.size,
                // Generator's batch flow fires N parallel requests rather
                // than asking fal for N variants in one go — so num_images
                // stays 1 here.
                num_images: 1,
                image: body.image,
              },
              keys.fal,
            )
          : generateImage(
              {
                prompt,
                model: body.model,
                size: body.size,
                seed: body.seed,
                watermark: body.watermark,
                image: body.image,
                sequential: body.sequential,
                max_images: body.max_images,
              },
              keys.byteplus,
            ),
      { label: "image", model, promptLen, startedAt },
    );

    return NextResponse.json({ jobId });
  } catch (err) {
    // Only synchronous failures (bad JSON, an unexpected throw) land here;
    // generation errors are captured on the job. Preserve the 402 path.
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
