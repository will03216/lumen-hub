/**
 * Media proxy — streams a remote BytePlus CDN asset back to the client from
 * our own origin so the <video> / <img> element loads same-origin.
 *
 * Why this exists: BytePlus video CDN responses don't send CORS headers that
 * satisfy `<video crossOrigin="anonymous">` preflight, which breaks playback
 * (element freezes at 0:00) and also taints canvas exports. Proxying through
 * our route gives us two wins in one: same-origin means the browser skips
 * the CORS check entirely, and canvas.drawImage stays clean for export.
 *
 * Security: we only proxy hosts we explicitly trust (BytePlus/Volcengine
 * CDN family). Anything else → 403 so this route can't be used as an open
 * bandwidth amplifier.
 *
 * Correctness: `Range` headers are forwarded both ways so HTML5 video
 * scrubbing still works — without that, seeking past the initially buffered
 * window would fail.
 */

import type { NextRequest } from "next/server";
import { isByteplusHost } from "@/lib/media/byteplus-hosts";

/** How long the CDN gets to send response HEADERS. Not a cap on the transfer:
 *  a 30 MB video may stream for minutes after this is cleared. */
const UPSTREAM_HEADER_TIMEOUT_MS = 20_000;

export const runtime = "nodejs";
// Disable Next's default response caching — we pass through upstream cache
// headers verbatim.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("u");
  // ACAO on every response — even errors — so a failed proxy doesn't trip
  // the browser's CORS check when the caller is on a different origin
  // (e.g. preview tooling).
  const corsHeader = { "access-control-allow-origin": "*" };
  if (!target) {
    return new Response("missing u", { status: 400, headers: corsHeader });
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return new Response("invalid url", { status: 400, headers: corsHeader });
  }
  if (url.protocol !== "https:") {
    return new Response("https required", { status: 400, headers: corsHeader });
  }
  if (!isByteplusHost(url.hostname)) {
    return new Response("host not allowed", { status: 403, headers: corsHeader });
  }

  // Forward the Range header so seek/scrub works — that's the whole reason
  // videos can start playing before the full file downloads.
  const upstreamHeaders: HeadersInit = {};
  const range = req.headers.get("range");
  if (range) upstreamHeaders["Range"] = range;

  // A CDN that accepts the connection and then says nothing used to hang this
  // route indefinitely, and an <img> pointed at it fires neither load nor
  // error — which is how a stalled asset turns into an editor stuck on
  // "Thinking…" with no error to show.
  //
  // The timer is cleared as soon as the RESPONSE HEADERS arrive, not when the
  // body finishes. `fetch` resolves on headers, so clearing here bounds the
  // part that can hang while leaving the body free to stream for as long as it
  // needs — aborting on total elapsed time would cut off exactly the long
  // video reads this proxy exists to serve.
  const ctrl = new AbortController();
  const headerTimer = setTimeout(() => ctrl.abort(), UPSTREAM_HEADER_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      headers: upstreamHeaders,
      // Don't let Next cache the streaming body.
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = aborted
      ? `upstream sent no response within ${Math.round(UPSTREAM_HEADER_TIMEOUT_MS / 1000)}s`
      : err instanceof Error
        ? err.message
        : "upstream fetch failed";
    // 504 for "answered too slowly", 502 for "could not be reached at all" —
    // the classifier and anyone reading logs needs to tell a stalled CDN from
    // a dead one.
    return new Response(`upstream unreachable: ${message}`, {
      status: aborted ? 504 : 502,
      headers: { ...corsHeader, "cache-control": "no-store" },
    });
  } finally {
    clearTimeout(headerTimer);
  }

  // An upstream failure is not a media response, and must not be dressed up as
  // one. Two things go wrong if we fall through to the success path below:
  //
  //  · It gets `cache-control: immutable, max-age=300`, so the browser pins the
  //    failure for five minutes. Re-mirroring the asset or re-signing the URL
  //    then changes nothing the user can see — the <img> keeps serving the
  //    cached 403 until the entry ages out.
  //  · The body is TOS's XML <Error> document, which renders as nothing inside
  //    an <img>. The network tab shows a bare 403 with no attribution, so it
  //    reads as *our* allowlist 403 above when it is actually the CDN's.
  //
  // The common case by far is an expired signature: ModelArk serves generated
  // content from TOS behind an `X-Amz-Expires` presigned URL (24h), so any
  // Library asset older than that whose mirror never landed answers 403 here.
  // Say so, in plain text, and let nothing cache it.
  if (upstream.status >= 400) {
    // Release the connection. An undici response body that is neither read
    // nor cancelled keeps its socket pinned until GC, and a Library grid full
    // of expired assets fails many at once.
    void upstream.body?.cancel();
    console.warn(
      `[api/media] upstream ${upstream.status} for ${url.hostname}${url.pathname}` +
        (url.searchParams.has("X-Amz-Signature")
          ? " (presigned URL — likely expired; asset needs a mirror)"
          : ""),
    );
    return new Response(`upstream ${upstream.status} for ${url.hostname}`, {
      status: upstream.status,
      headers: { ...corsHeader, "cache-control": "no-store" },
    });
  }

  // Preserve headers that affect playback / seeking / download. We deliberately
  // drop hop-by-hop and auth-ish headers.
  const passThrough = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ];
  const headers = new Headers();
  for (const name of passThrough) {
    const v = upstream.headers.get(name);
    if (v) headers.set(name, v);
  }
  // Same-origin response so the browser skips CORS entirely, but set ACAO:*
  // too so the asset remains usable from other origins that might embed it
  // (e.g. preview tooling).
  headers.set("access-control-allow-origin", "*");
  // Short CDN-side cache; assets are immutable per task-id so this is safe.
  headers.set("cache-control", "public, max-age=300, immutable");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
