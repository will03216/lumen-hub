/**
 * The two ways a copy-as-cURL feature betrays you: it leaks the key, or it
 * produces a command that does not run. Both are pinned here.
 */

import { describe, expect, it } from "vitest";
import { dataUriBytes, describeWireImage, formatBytes, toCurl } from "./curl";

describe("toCurl", () => {
  it("renders a runnable POST with the key as a shell variable", () => {
    const out = toCurl({
      url: "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
      headers: { "Content-Type": "application/json" },
      envHeaders: { Authorization: "Bearer $BYTEPLUS_API_KEY" },
      body: { model: "ep-123", prompt: "make it walnut" },
    });

    expect(out).toBe(
      `curl -sS -X POST 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations' \\
  -H 'Content-Type: application/json' \\
  -H "Authorization: Bearer $BYTEPLUS_API_KEY" \\
  -d '{
  "model": "ep-123",
  "prompt": "make it walnut"
}'`,
    );
  });

  it("double-quotes ONLY the header that must expand", () => {
    // Single quotes would make the shell post the literal text
    // "$BYTEPLUS_API_KEY", and upstream answers 401 — which reads as a bad
    // key rather than a quoting bug.
    const out = toCurl({
      url: "https://x.test/v1",
      headers: { "X-Plain": "literal" },
      envHeaders: { Authorization: "Bearer $KEY" },
      body: {},
    });
    expect(out).toContain(`-H 'X-Plain: literal'`);
    expect(out).toContain(`-H "Authorization: Bearer $KEY"`);
  });

  it("survives an apostrophe in the prompt", () => {
    // The common case, not an edge case: "the bottle's cap". Unescaped, the
    // shell ends the string early and the JSON is silently truncated.
    const out = toCurl({
      url: "https://x.test/v1",
      body: { prompt: "recolour the bottle's cap" },
    });
    expect(out).toContain(`recolour the bottle'\\''s cap`);
    // Quote runs must balance. The escaped `\'` sits OUTSIDE any quoted run —
    // it is a literal, not a delimiter — so it is excluded before counting.
    // (Counting raw quotes gives an odd number and means nothing.)
    expect(count(out.replace(/\\'/g, ""), "'") % 2).toBe(0);
  });

  it("never contains anything key-shaped", () => {
    const out = toCurl({
      url: "https://x.test/v1",
      envHeaders: { Authorization: "Bearer $BYTEPLUS_API_KEY" },
      body: { prompt: "x" },
    });
    expect(out).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{12,}/);
  });
});

describe("describeWireImage", () => {
  it("prints a remote URL verbatim, because that is what is sent", () => {
    expect(describeWireImage({ kind: "url", url: "https://cdn.test/a.png" })).toBe(
      "https://cdn.test/a.png",
    );
  });

  it("says the image is CLEAN when no markup was drawn in", () => {
    // The line has to answer "is it sending the edited image?" on its own.
    // For a point/box edit the correct payload is the untouched image, with
    // the coordinates in the prompt — which looks like a bug unless it says
    // so in words.
    expect(
      describeWireImage({
        kind: "inlined",
        from: "/library-cache/upload-1.png",
        mime: "image/png",
        annotated: false,
      }),
    ).toBe(
      "data:image/png;base64,<clean image, no markup drawn in — from /library-cache/upload-1.png, bytes omitted>",
    );
  });

  it("flags an annotated copy, because it is not the file on disk", () => {
    // The raster path sends a DIFFERENT image from the one in the library —
    // brush and arrow are burned into a copy. Anyone reading the request
    // needs to know that before they go looking for the markup in the source.
    const out = describeWireImage({
      kind: "inlined",
      from: "/library-cache/x.png",
      mime: "image/jpeg",
      annotated: true,
    });
    expect(out).toContain("brush/arrow markup burned into the pixels");
  });

  it("includes the size when the caller resolved the bytes", () => {
    const out = describeWireImage({
      kind: "inlined",
      from: "/library-cache/x.png",
      mime: "image/png",
      annotated: false,
      bytes: 1_500_000,
    });
    expect(out).toContain("1.4 MB");
  });
});

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n += 1;
  return n;
}

describe("dataUriBytes", () => {
  it("decodes a base64 payload's real size, padding included", () => {
    // "AAAA" is 3 bytes; each '=' removes one.
    expect(dataUriBytes("data:image/png;base64,AAAA")).toBe(3);
    expect(dataUriBytes("data:image/png;base64,AAA=")).toBe(2);
    expect(dataUriBytes("data:image/png;base64,AA==")).toBe(1);
  });

  it("returns undefined for a URL, because we never hold those bytes", () => {
    // Not a failure: BytePlus fetches a remote reference itself, so there is
    // no size for us to report and pretending otherwise would be a guess.
    expect(dataUriBytes("https://cdn.test/a.png")).toBeUndefined();
    expect(dataUriBytes("/library-cache/a.png")).toBeUndefined();
  });

  it("approximates a percent-encoded data URI by its length", () => {
    // "%3Csvg%3E" is 9 characters and decodes to 5 bytes. The estimate is
    // deliberately the character count: this path exists so a non-base64
    // URI reports a sane order of magnitude rather than nothing, and we do
    // not encode anything this way — everything we inline is base64.
    expect(dataUriBytes("data:image/svg+xml,%3Csvg%3E")).toBe(9);
  });
});

describe("formatBytes", () => {
  it("reads at a glance at each scale", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1_500_000)).toBe("1.4 MB");
  });
});
