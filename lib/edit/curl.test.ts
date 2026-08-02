/**
 * The two ways a copy-as-cURL feature betrays you: it leaks the key, or it
 * produces a command that does not run. Both are pinned here.
 */

import { describe, expect, it } from "vitest";
import { describeWireImage, toCurl } from "./curl";

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

  it("says what was inlined and where it came from", () => {
    expect(
      describeWireImage({
        kind: "inlined",
        from: "/library-cache/upload-1.png",
        mime: "image/png",
        annotated: false,
      }),
    ).toBe(
      "data:image/png;base64,<inlined verbatim — from /library-cache/upload-1.png, bytes omitted>",
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
    expect(out).toContain("annotated copy, markup burned in");
  });
});

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n += 1;
  return n;
}
