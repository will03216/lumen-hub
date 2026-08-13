import { describe, expect, it } from "vitest";
import { checkAssetImageBounds } from "./asset-upload";

/**
 * The bounds check is the only pure part of the ingest chain, and it is the
 * part worth pinning: the Assets API's own rejection for an out-of-bounds
 * image arrives asynchronously, on a Failed asset, long after the grab that
 * caused it. Catching it at grab time is what turns an opaque failure into
 * "this crop is too wide to upload".
 */
describe("checkAssetImageBounds", () => {
  it("accepts an ordinary frame", () => {
    expect(checkAssetImageBounds(1920, 1080)).toEqual({ ok: true });
    expect(checkAssetImageBounds(1080, 1920)).toEqual({ ok: true });
  });

  it("rejects a side under 300px and names the measurement", () => {
    const out = checkAssetImageBounds(1920, 200);
    expect(out.ok).toBe(false);
    expect(out.reason).toContain("300");
    expect(out.reason).toContain("200");
  });

  it("rejects a side over 6000px", () => {
    const out = checkAssetImageBounds(8000, 4000);
    expect(out.ok).toBe(false);
    expect(out.reason).toContain("6000");
  });

  it("accepts 21:9 but rejects a wider crop", () => {
    // 2.33 is inside the 0.4–2.5 band; a 3:1 strip is not. This is the exact
    // boundary PRD R11 calls out.
    expect(checkAssetImageBounds(2100, 900).ok).toBe(true);
    const tooWide = checkAssetImageBounds(3000, 1000);
    expect(tooWide.ok).toBe(false);
    expect(tooWide.reason).toContain("3.00");
  });

  it("rejects an extremely tall crop symmetrically", () => {
    expect(checkAssetImageBounds(1000, 3000).ok).toBe(false);
  });

  it("rejects zero dimensions rather than dividing by them", () => {
    expect(checkAssetImageBounds(0, 0).ok).toBe(false);
    expect(checkAssetImageBounds(1920, 0).ok).toBe(false);
  });
});
