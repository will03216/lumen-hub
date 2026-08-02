/**
 * The canvas-taint decision table.
 *
 * Worth testing exhaustively despite being small, because the failure it
 * prevents is silent and late: a cross-origin image draws into a canvas
 * perfectly, and only throws when you try to read the pixels back — after the
 * user has already annotated it. There is no earlier signal.
 *
 * The mirror-beats-proxy ordering is the substantive assertion. Both routes
 * produce a readable canvas, so a bug that picked the proxy would pass any
 * "does compositing work" test while quietly depending on a signed URL that
 * expires.
 */

import { describe, expect, it } from "vitest";
import { resolveSafeUrl } from "./same-origin";

describe("resolveSafeUrl", () => {
  it("passes inline data through untouched", () => {
    const plan = resolveSafeUrl("data:image/png;base64,AAAA");
    expect(plan).toMatchObject({ via: "as-is", crossOrigin: false });
    expect(plan.url).toBe("data:image/png;base64,AAAA");
  });

  it("passes blob: through untouched", () => {
    expect(resolveSafeUrl("blob:http://x/y").via).toBe("as-is");
  });

  it("treats a root-relative URL as same-origin", () => {
    const plan = resolveSafeUrl("/library-cache/upload-abc.png");
    expect(plan).toMatchObject({
      url: "/library-cache/upload-abc.png",
      via: "same-origin",
      crossOrigin: false,
      shouldMirror: false,
    });
  });

  it("prefers a local mirror over proxying the remote URL", () => {
    // Both would render. The mirror is same-origin AND permanent, whereas a
    // signed CDN URL expires — so picking the proxy here would work today
    // and break the session tomorrow.
    const plan = resolveSafeUrl(
      "https://ark-content.byteplusapi.com/x.png?sig=abc",
      "/library-cache/x.png",
    );
    expect(plan).toMatchObject({
      url: "/library-cache/x.png",
      via: "mirror",
      crossOrigin: false,
    });
  });

  it("proxies a BytePlus URL and asks for CORS", () => {
    const raw = "https://ark-content.byteplusapi.com/x.png";
    const plan = resolveSafeUrl(raw);
    expect(plan.via).toBe("proxy");
    expect(plan.crossOrigin).toBe(true);
    expect(plan.url).not.toBe(raw);
    expect(plan.url).toContain(encodeURIComponent(raw));
    // Signed CDN URLs expire, so the proxy is a stopgap and a mirror is the
    // actual fix.
    expect(plan.shouldMirror).toBe(true);
  });

  it("does NOT claim to proxy a host the proxy would refuse", () => {
    // /api/media is host-allow-listed to the BytePlus CDN family and answers
    // 403 for everything else, so routing e.g. a fal-hosted render through it
    // would turn a working image into a broken one. Best-effort direct load
    // with a CORS request is the honest option.
    const plan = resolveSafeUrl("https://example.com/x.png");
    expect(plan.via).toBe("direct-cors");
    expect(plan.url).toBe("https://example.com/x.png");
    expect(plan.crossOrigin).toBe(true);
    expect(plan.shouldMirror).toBe(false);
  });

  it("hands back an unparseable URL rather than proxying nonsense", () => {
    const plan = resolveSafeUrl("not a url at all");
    expect(plan).toMatchObject({ url: "not a url at all", via: "as-is" });
  });
});
