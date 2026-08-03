/**
 * POST /api/edit/curl — the upstream request, as a cURL command you can read.
 *
 * "What did it actually send?" is the first question whenever a render
 * surprises someone, and it is a question the browser cannot answer on its
 * own. Three of the things that make the request what it is live only on the
 * server:
 *
 *   · the model alias map (BYTEPLUS_MODEL_ALIASES) — the UI says
 *     `dola-seedream-5-0-pro-260628`, the wire may say `ep-2026…`
 *   · the base URL (BYTEPLUS_BASE_URL), which differs per deployment
 *   · the body defaults nobody sets by hand — response_format, watermark,
 *     the size fallback
 *
 * A client-side reimplementation would get all three wrong and look right,
 * which is the worst possible outcome for a feature whose entire value is
 * fidelity. So the body comes from `buildImageGenBody` — the SAME function
 * `generateImage` posts — and this route only renders it.
 *
 * NO KEY IS INVOLVED. The command carries `$BYTEPLUS_API_KEY` as a shell
 * variable, so nothing here reads, needs, or could leak a credential. That is
 * also why this route does not call getUserKeys: rendering a request you have
 * already composed is not a paid action, and a 402 here would be theatre.
 * Auth still applies at the proxy, like every other route.
 *
 * Image bytes never make the trip. The client sends a DESCRIPTION of each
 * reference — a URL, or "inlined from …" — because an inlined reference is
 * several megabytes of base64 and printing it produces something no one can
 * read or paste. See lib/edit/curl.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  IMAGE_GENERATIONS_PATH,
  buildImageGenBody,
  bytePlusEndpoint,
} from "@/lib/byteplus";
import { describeWireImage, toCurl, type WireImageDescriptor } from "@/lib/edit/curl";
import { logRouteError } from "@/lib/server-log";

export const runtime = "nodejs";

type Body = {
  prompt?: string;
  model?: string;
  size?: string;
  seed?: number;
  images?: WireImageDescriptor[];
};

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return bad("Request body must be JSON.");
    }

    if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
      return bad("prompt is required.");
    }

    const described = (body.images ?? []).map(describeWireImage);
    const wire = buildImageGenBody({
      prompt: body.prompt,
      model: body.model,
      size: body.size,
      seed: body.seed,
      // Mirrors generateImage's own contract: one image goes as a string,
      // several as an array, none omits the field entirely.
      image:
        described.length === 0
          ? undefined
          : described.length === 1
            ? described[0]
            : described,
    });

    return NextResponse.json({
      curl: toCurl({
        url: bytePlusEndpoint(IMAGE_GENERATIONS_PATH),
        headers: { "Content-Type": "application/json" },
        envHeaders: { Authorization: "Bearer $BYTEPLUS_API_KEY" },
        body: wire,
      }),
      /** The resolved model, called out separately because it is the field
       *  most likely to differ from what the dropdown says. */
      model: wire.model,
    });
  } catch (err) {
    logRouteError("edit.curl", err, startedAt);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
