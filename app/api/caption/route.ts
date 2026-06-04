/**
 * /api/caption — image → prompt via BytePlus Seed 2.0 Lite (§65).
 *
 * Drop an image into the §01 Prompt textarea on /generate?tab=image →
 * client sends the image as a data URL → this route hands it to Seed
 * 2.0 Lite via /chat/completions and returns a single-line cinematic
 * description. The Generator pastes the result into the textarea,
 * replacing whatever was there.
 *
 * Body limits
 * -----------
 * Data URLs balloon by ~33% over raw bytes (base64). We cap the body
 * at ~8 MB after encoding (~6 MB raw image) so a power user can't pin
 * the route on a phone-camera dump. Anything bigger gets a clean 413.
 */

import { NextRequest, NextResponse } from "next/server";
import { BytePlusError, captionImage } from "@/lib/byteplus";
import { logBytePlusError, logRouteError } from "@/lib/server-log";
import { getUserKeys } from "@/lib/server/user-keys";

export const runtime = "nodejs";
export const maxDuration = 30;

// Roughly 8 MB after base64; raw image around 6 MB. Generous enough
// for a 4K JPEG but well under Vercel's 4.5 MB request body soft limit
// when sent multipart — here we're inline-JSON so the practical ceiling
// is the runtime's default (~4–10 MB depending on tier).
const MAX_DATA_URL_LEN = 8 * 1024 * 1024;

type CaptionBody = {
  imageDataUrl?: string;
  instruction?: string;
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let imageHint: string | undefined;
  try {
    const body = (await req.json()) as CaptionBody;
    if (!body.imageDataUrl || typeof body.imageDataUrl !== "string") {
      return NextResponse.json(
        { error: "imageDataUrl is required" },
        { status: 400 },
      );
    }
    // Accept either a data: URL or a publicly fetchable https URL.
    const isDataUrl = body.imageDataUrl.startsWith("data:image/");
    const isHttpsUrl = /^https:\/\//i.test(body.imageDataUrl);
    if (!isDataUrl && !isHttpsUrl) {
      return NextResponse.json(
        { error: "imageDataUrl must be data:image/* or https://..." },
        { status: 400 },
      );
    }
    if (body.imageDataUrl.length > MAX_DATA_URL_LEN) {
      return NextResponse.json(
        {
          error: `image too large — ${(body.imageDataUrl.length / 1024 / 1024).toFixed(1)}MB exceeds 8MB`,
        },
        { status: 413 },
      );
    }
    // Telemetry-friendly hint: data URLs leak MIME, https URLs leak the
    // host. Either way the prompt itself never goes to logs.
    imageHint = isDataUrl
      ? body.imageDataUrl.slice(5, body.imageDataUrl.indexOf(";"))
      : new URL(body.imageDataUrl).hostname;

    const { byteplus } = await getUserKeys();
    const out = await captionImage({
      imageDataUrl: body.imageDataUrl,
      instruction: body.instruction,
    }, byteplus);
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof BytePlusError) {
      logBytePlusError("caption", err, startedAt, { source: imageHint });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("caption", err, startedAt, { source: imageHint });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
