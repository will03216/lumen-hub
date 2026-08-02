/**
 * POST /api/edit/layers — split one image into a background plate plus
 * transparent layers.
 *
 * WHY THIS ROUTE EXISTS AT ALL, given /api/image is right there.
 *
 * It isn't a different upstream call — same endpoint, same model family, same
 * auth. What differs is everything around it. The prompt is a fixed template
 * rather than user text; the response carries per-entry `z_index` and
 * `bounding_box` that need a tolerant read before anything can use them; and
 * the preconditions are stricter (exactly one image, 30 MB, no arrays). Layer
 * separation is also a *preview* feature upstream, so the failure surface is
 * unusually wide: a BYOK key that renders fine may simply not have access.
 * Bolting all of that onto /api/image would put four new conditionals into
 * the one route the PRD explicitly wants left alone (§7.1).
 *
 * VALIDATE BEFORE SPENDING THE CALL. Every precondition below is checked
 * ahead of the upstream request, and each one maps to a specific opaque
 * BytePlus 400 we'd otherwise hand back verbatim. "InvalidParameter" tells a
 * user nothing; "layer separation takes a single image, but 3 were sent"
 * tells them what to do next. The pixel/aspect bounds from PRD §12.6 are NOT
 * enforced here — the client already knows the decoded dimensions and can say
 * so before uploading, whereas the server would have to decode the image just
 * to reject it.
 *
 * WHAT COMES BACK. `{created, layers, unknown, warnings}`. `layers` is
 * normalized and sorted into paint order. `unknown` is the raw upstream
 * entries the normalizer didn't recognise, echoed verbatim and deliberately:
 * the response shape is documented as non-final, so when it drifts, whoever
 * is debugging needs to see the real payload in the network tab rather than
 * wait on a redeploy that adds logging (PRD §10 R1).
 *
 * Error contract is copied from /api/image on purpose: 402 for a missing BYOK
 * key so the client can send the user to Settings, upstream HTTP status
 * forwarded 1:1 so the shared classifier can dispatch on it, 500 only for our
 * own bugs.
 */

import { NextRequest, NextResponse } from "next/server";
import { BytePlusError, separateLayers, type LayerGenParams } from "@/lib/byteplus";
import { normalizeLayerResponse } from "@/lib/edit/layers-normalize";
import { dataUriBytes } from "@/lib/edit/curl";
import { logBytePlusError, logRouteError } from "@/lib/server-log";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";
// Matches /api/image. A split returns up to 17 images from one call, so it
// runs longer than a single generation; 300 is Vercel Pro's ceiling anyway.
export const maxDuration = 300;

/** Wire shape. `sourceWidth`/`sourceHeight` are the decoded dimensions of the
 *  image being split — the client has them (it drew the thing on a canvas)
 *  and the normalizer needs them to derive whichever bbox coordinate space
 *  upstream omitted. Optional: without them we return one space instead of
 *  two plus a warning, which is degraded, not broken. */
type LayersRequestBody = Partial<LayerGenParams> & {
  sourceWidth?: number;
  sourceHeight?: number;
};

/** PRD §12.6: layer separation accepts up to 30 MB of input. We check the
 *  decoded size of a data: URI, not the string length — base64 inflates by
 *  4/3 and rejecting at 30 MB of *string* would refuse legal 22 MB images. */
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

/** Upper bound on what we'll ask for in auto mode. The documented ceiling is
 *  16, but each extra layer is another generated image on the same bill and
 *  the PRD's own worked example tops out at 10 — so 10 it is, and a caller
 *  who needs more can say why first. */
const MAX_AUTO_LAYERS = 10;

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  // Captured first so a failure still reports upstream round-trip latency.
  const startedAt = Date.now();
  // Hoisted for the catch: these are the fields worth having on a log line,
  // and re-parsing the body there isn't possible (the stream is consumed).
  let model: string | undefined;
  let mode: string | undefined;
  let maxLayers: number | undefined;
  try {
    const keys = await getUserKeys();

    let body: LayersRequestBody;
    try {
      body = (await req.json()) as LayersRequestBody;
    } catch {
      // A malformed body is the caller's bug, not a server fault — 400, not
      // the 500 an uncaught parse throw would produce.
      return bad("Request body must be JSON.");
    }
    model = body.model;
    mode = body.mode;
    maxLayers = body.maxLayers;

    // --- image: exactly one -------------------------------------------
    // ImageGenParams.image is `string | string[]` and callers copy-paste from
    // the multi-reference fusion path, so an array here is the likely mistake.
    // Upstream would answer with a bare InvalidParameter; say what's wrong.
    if (Array.isArray(body.image)) {
      return bad(
        `Layer separation works on a single image, but ${body.image.length} were sent. Split one image at a time.`,
      );
    }
    if (typeof body.image !== "string" || body.image.trim() === "") {
      return bad("image is required — a URL, a data URI, or base64.");
    }
    const image = body.image.trim();

    const oversize = dataUriBytes(image);
    if (oversize !== undefined && oversize > MAX_INPUT_BYTES) {
      return bad(
        `That image is ${formatMb(oversize)} MB. Layer separation accepts up to ${formatMb(MAX_INPUT_BYTES)} MB — downscale it first.`,
      );
    }

    // --- mode ----------------------------------------------------------
    if (mode !== undefined && mode !== "auto" && mode !== "region") {
      return bad(`mode must be "auto" or "region" (got ${JSON.stringify(mode)}).`);
    }
    const resolvedMode: "auto" | "region" = mode === "region" ? "region" : "auto";

    // --- maxLayers ------------------------------------------------------
    // Only meaningful in auto mode: region mode isolates one element and the
    // count never reaches the prompt. Silently ignoring it in region mode is
    // fine; silently ignoring a bad value in auto mode is not, because it
    // changes what the user gets billed for.
    if (resolvedMode === "auto" && maxLayers !== undefined) {
      if (
        typeof maxLayers !== "number" ||
        !Number.isInteger(maxLayers) ||
        maxLayers < 1 ||
        maxLayers > MAX_AUTO_LAYERS
      ) {
        return bad(
          `maxLayers must be a whole number between 1 and ${MAX_AUTO_LAYERS} (got ${JSON.stringify(maxLayers)}).`,
        );
      }
    }

    const res = await separateLayers(
      {
        image,
        model: body.model,
        size: body.size,
        seed: body.seed,
        mode: resolvedMode,
        maxLayers: resolvedMode === "auto" ? maxLayers : undefined,
        instruction: body.instruction,
      },
      keys.byteplus,
    );

    // The one place layer-shape tolerance lives. It never throws, so a drifted
    // response degrades into warnings + `unknown` rather than losing a call
    // the user has already paid for.
    const { layers, unknown: unrecognised, warnings } = normalizeLayerResponse(
      res,
      dims(body.sourceWidth, body.sourceHeight),
    );

    return NextResponse.json({
      // Echo upstream's timestamp when it sent one; otherwise stamp our own so
      // the client always has something to order versions by.
      created: typeof res?.created === "number" ? res.created : Math.floor(Date.now() / 1000),
      layers,
      unknown: unrecognised,
      warnings,
    });
  } catch (err) {
    // Strict BYOK — a missing user key is a 402 so the client can point the
    // user at Settings instead of showing an opaque failure.
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof BytePlusError) {
      logBytePlusError("edit.layers", err, startedAt, { model, mode, max_layers: maxLayers });
      // 1:1 status forwarding. It carries real signal here beyond the usual
      // retry classification: layer separation is preview-gated, so a 403/404
      // on a key that renders fine is the feature being unavailable for that
      // account rather than a bad request (PRD §10 R1).
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("edit.layers", err, startedAt, { model, mode, max_layers: maxLayers });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Source dimensions only count when both arrive and both are sane — a half
 *  pair would make every derived coordinate wrong in a way that looks like
 *  model imprecision. */
function dims(width: unknown, height: unknown) {
  if (typeof width !== "number" || typeof height !== "number") return undefined;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return { width, height };
}
