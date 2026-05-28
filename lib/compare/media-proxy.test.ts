/**
 * Unit tests for mediaProxyUrl — the wrapper that routes BytePlus CDN
 * assets through our `/api/media` proxy.
 *
 * The proxy exists because BytePlus video CDN doesn't serve CORS headers
 * that `<video crossOrigin="anonymous">` will accept, which freezes the
 * element at 0:00. The rules we pin here are the ones a caller would
 * accidentally regress:
 *   - BytePlus family hosts → wrapped
 *   - Everything else → untouched (don't accidentally proxy localhost or
 *     third-party previews)
 *   - Non-URL inputs → returned as-is so accidental empty strings don't
 *     explode at the call site
 */

import { describe, expect, it } from "vitest";
import { mediaProxyUrl } from "./media-proxy";

describe("mediaProxyUrl — host allowlist", () => {
  it("wraps BytePlus CDN hosts under /api/media", () => {
    const cases = [
      "https://ark-content-generation.bytepluses.com/video/abc.mp4",
      "https://cdn.byteplusapi.com/video/x.mp4",
      "https://foo.volccdn.com/y.mp4",
      "https://media.volcengineusercontent.com/z.mp4",
      "https://tos-ap-southeast-1.volces.com/bucket/clip.mp4",
    ];
    for (const url of cases) {
      const wrapped = mediaProxyUrl(url);
      expect(wrapped.startsWith("/api/media?u=")).toBe(true);
      expect(decodeURIComponent(wrapped.slice("/api/media?u=".length))).toBe(
        url,
      );
    }
  });

  it("leaves non-BytePlus hosts alone", () => {
    const cases = [
      "https://example.com/video.mp4",
      "https://cdn.cloudflare.com/r2/video.mp4",
      "https://storage.googleapis.com/bucket/file.mp4",
    ];
    for (const url of cases) {
      expect(mediaProxyUrl(url)).toBe(url);
    }
  });

  it("leaves data:, blob:, and relative URLs alone", () => {
    const cases = [
      "data:video/mp4;base64,AAAA",
      "blob:https://lumen.app/uuid",
      "/public/clip.mp4",
      "./relative.mp4",
    ];
    for (const url of cases) {
      expect(mediaProxyUrl(url)).toBe(url);
    }
  });

  it("returns empty input as-is (callers guard upstream)", () => {
    expect(mediaProxyUrl("")).toBe("");
  });

  it("matches on hostname suffix only — not substring", () => {
    // A malicious host that merely contains "bytepluses.com" as a substring
    // should NOT be proxied. Suffix-match prevents open-proxy abuse.
    const attackers = [
      "https://bytepluses.com.evil.example/video.mp4",
      "https://fakebytepluses.com/video.mp4",
    ];
    for (const url of attackers) {
      expect(mediaProxyUrl(url)).toBe(url);
    }
  });
});
