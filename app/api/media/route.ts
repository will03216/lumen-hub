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

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      headers: upstreamHeaders,
      // Don't let Next cache the streaming body.
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream fetch failed";
    return new Response(`upstream unreachable: ${message}`, {
      status: 502,
      headers: { "access-control-allow-origin": "*" },
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
