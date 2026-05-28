/**
 * Wrap a remote BytePlus CDN URL in our `/api/media` proxy so the browser
 * sees it as same-origin. Solves two issues in one:
 *   1. Playback — the video CDN's CORS headers don't satisfy
 *      `<video crossOrigin="anonymous">` preflight, which freezes the
 *      element at 0:00.
 *   2. Canvas export — same-origin means `drawImage(video, …)` doesn't
 *      taint the canvas, so frame-capture still works.
 *
 * URLs that aren't from the BytePlus CDN family (e.g. local dev previews)
 * pass through untouched — no need to self-proxy same-origin URLs.
 */

import { isByteplusHost } from "@/lib/media/byteplus-hosts";

export function mediaProxyUrl(url: string): string {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Non-absolute URLs (data:, blob:, relative paths) — leave alone.
    return url;
  }
  if (!isByteplusHost(parsed.hostname)) return url;
  return `/api/media?u=${encodeURIComponent(url)}`;
}
