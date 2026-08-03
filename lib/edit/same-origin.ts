/**
 * Making an image URL safe to read back off a canvas.
 *
 * This exists because of a failure mode that is invisible until the moment it
 * matters: drawing a cross-origin image into a <canvas> succeeds and looks
 * completely normal, but the canvas is then *tainted* and any attempt to read
 * pixels back — toDataURL(), getImageData() — throws SecurityError. The image
 * renders, the user annotates it, and the export fails at the very end.
 *
 * BytePlus CDN URLs send no Access-Control-Allow-Origin header, so every
 * generated asset hits this. Resolution therefore has to happen *before* the
 * image is displayed, not lazily at composite time, because by then the user
 * has already done the work.
 *
 * The decision itself is a pure function so it can be tested; the async side
 * effect that acts on it (kicking off a mirror) is the caller's business.
 */

import { mediaProxyUrl } from "@/lib/compare/media-proxy";
import { isByteplusHost } from "@/lib/media/byteplus-hosts";

export type SafeUrlPlan = {
  /** The URL to actually load into the <img> / Konva.Image. */
  url: string;
  /** Whether to set img.crossOrigin = "anonymous" before setting src.
   *  Required for the proxy path; harmless but pointless for same-origin. */
  crossOrigin: boolean;
  /** Why this route was chosen — surfaced in diagnostics, and the reason the
   *  function returns an object rather than a bare string. */
  via: "as-is" | "same-origin" | "mirror" | "proxy" | "direct-cors";
  /** True when a mirror exists or should be kicked off for next time. */
  shouldMirror: boolean;
};

/**
 * Decide how to load `url` such that the resulting canvas stays readable.
 *
 * `mirrorUrl` is the local /library-cache copy when the asset has one; it
 * always wins, because it is same-origin, stable, and doesn't expire the way
 * a signed CDN URL does.
 */
export function resolveSafeUrl(
  url: string,
  mirrorUrl?: string,
): SafeUrlPlan {
  // Already inline: nothing to fetch, nothing to taint.
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return { url, crossOrigin: false, via: "as-is", shouldMirror: false };
  }

  // A local mirror is the best case — same-origin and permanent.
  if (mirrorUrl) {
    return {
      url: mirrorUrl,
      crossOrigin: false,
      via: "mirror",
      shouldMirror: false,
    };
  }

  // Root-relative: already same-origin (this is what /api/library/upload
  // returns, and what a mirrored asset looks like).
  if (url.startsWith("/")) {
    return { url, crossOrigin: false, via: "same-origin", shouldMirror: false };
  }

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // Unparseable. Hand it back untouched rather than routing something that
    // isn't a URL; the image load fails visibly and callers handle that.
    return { url, crossOrigin: false, via: "as-is", shouldMirror: false };
  }

  // The /api/media proxy is host-allow-listed to the BytePlus CDN family and
  // answers 403 for anything else — deliberately, so it can't be used as an
  // open relay. So it is only a real option for those hosts.
  if (isByteplusHost(host)) {
    return {
      url: mediaProxyUrl(url),
      crossOrigin: true,
      via: "proxy",
      // Signed CDN URLs expire; the proxy is a stopgap, a mirror is the fix.
      shouldMirror: true,
    };
  }

  // Any other remote host — a fal-hosted render, or a URL the user pasted.
  // We cannot make it same-origin with the infrastructure that exists, so
  // this is best-effort: ask for CORS and hope the host sends the header.
  //
  // Setting crossOrigin here is a real trade-off, not an oversight. With it,
  // a host that sends Access-Control-Allow-Origin gives us a fully readable
  // canvas; a host that doesn't fails the load, and the canvas retries
  // without CORS so the image at least displays. Omitting it would always
  // display and never composite. Preferring the readable outcome is right,
  // because display has a fallback and compositing does not.
  return { url, crossOrigin: true, via: "direct-cors", shouldMirror: false };
}

/**
 * Is this a URL we are willing to store as a reference and put in an href?
 *
 * Two things go wrong without it, both from the same input — the "add by URL"
 * box, which until now took the string verbatim.
 *
 * · `javascript:` in an href. Every reference URL is rendered as a link in the
 *   payload inspector, so a pasted `javascript:` URL becomes script that runs
 *   on click. It is self-inflicted — sessions are local to one browser and
 *   shared with nobody — but "you have to attack yourself" is not a security
 *   model, it is an accident waiting for a copied-and-pasted URL.
 *
 * · `//evil.example/x.png`. Protocol-relative, so it LOOKS like a same-origin
 *   path and is not one. Anything that decides "starts with / means ours"
 *   without excluding this is wrong.
 *
 * `data:` is refused for a different reason: the store holds URLs only —
 * inlining bytes into localStorage would eat the whole quota (see the
 * invariant at the top of types.ts).
 */
export function isAllowedRefUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  // Protocol-relative — same-origin in appearance only.
  if (value.startsWith("//")) return false;
  // Same-origin path. The only relative form we accept; a bare filename or a
  // "./x" has no defined base once it is stored and re-read later.
  if (value.startsWith("/")) return true;
  try {
    const scheme = new URL(value).protocol;
    return scheme === "https:" || scheme === "http:";
  } catch {
    // Not a URL at all — including every "javascript:alert(1)" variant that
    // survives a parse, which the protocol check below would have caught
    // anyway.
    return false;
  }
}
