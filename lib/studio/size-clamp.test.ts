/**
 * Size ↔ model compatibility.
 *
 * BytePlus rejects an oversized request with a 400 the client cannot recover
 * from ("image area must be at most 4624220 pixels"), killing the whole run.
 * Fixing the templates wasn't enough: a project keeps whatever size it was
 * created with — templates are snapshots, not live references — so canvases
 * created from the broken templates still carry illegal sizes, and switching
 * to a smaller-ceiling model can create one at any time.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_MODEL_MAX_PIXELS,
  IMAGE_SIZES,
  allowedSizes,
  clampSizeToModel,
  isSizeAllowed,
  modelMaxPixels,
  sizePixels,
} from "./models";

const PRO = "dola-seedream-5-0-pro-260628"; // 2K, the default
const LITE = "seedream-5-0-lite-260128"; // 3K
const V45 = "seedream-4-5-251128"; // 4K
const FAL = "openai/gpt-image-2"; // ceiling unknown

describe("sizePixels", () => {
  it("parses WxH", () => {
    expect(sizePixels("2048x2048")).toBe(4_194_304);
    expect(sizePixels("2160x3840")).toBe(8_294_400);
  });
  it("returns null for junk", () => {
    for (const s of ["", "big", "2048", "2048x", "axb"]) {
      expect(sizePixels(s)).toBeNull();
    }
  });
});

describe("isSizeAllowed", () => {
  it("rejects exactly the sizes that produced the 400", () => {
    expect(isSizeAllowed("2160x3840", PRO)).toBe(false);
    expect(isSizeAllowed("3840x2160", PRO)).toBe(false);
    expect(isSizeAllowed("3072x3072", PRO)).toBe(false);
    expect(isSizeAllowed("4096x4096", PRO)).toBe(false);
  });

  it("accepts the two presets that fit the default model", () => {
    expect(isSizeAllowed("2048x2048", PRO)).toBe(true);
    expect(isSizeAllowed("2560x1440", PRO)).toBe(true);
  });

  it("accepts on a bigger model what it rejects on the default", () => {
    expect(isSizeAllowed("2160x3840", LITE)).toBe(true);
    expect(isSizeAllowed("4096x4096", V45)).toBe(true);
    // 4K is beyond Lite's 3K ceiling.
    expect(isSizeAllowed("4096x4096", LITE)).toBe(false);
  });

  it("applies no clamp when the ceiling is unknown", () => {
    expect(modelMaxPixels(FAL)).toBeNull();
    expect(isSizeAllowed("4096x4096", FAL)).toBe(true);
    expect(isSizeAllowed("9999x9999", "totally-unknown-model")).toBe(true);
  });

  it("treats the boundary as inclusive", () => {
    expect(modelMaxPixels(PRO)).toBe(DEFAULT_MODEL_MAX_PIXELS);
    expect(isSizeAllowed("2048x2048", PRO)).toBe(true); // 4,194,304 ≤ cap
  });
});

describe("allowedSizes", () => {
  it("offers only what the model can render", () => {
    expect(allowedSizes(PRO)).toEqual(["2048x2048", "2560x1440"]);
    expect(allowedSizes(V45)).toEqual([...IMAGE_SIZES]);
  });
  it("never offers a size it would then have to clamp", () => {
    for (const model of [PRO, LITE, V45]) {
      for (const s of allowedSizes(model)) {
        expect(clampSizeToModel(s, model)).toBe(s);
      }
    }
  });
});

describe("clampSizeToModel", () => {
  it("leaves a legal size untouched", () => {
    expect(clampSizeToModel("2048x2048", PRO)).toBe("2048x2048");
    expect(clampSizeToModel("2160x3840", V45)).toBe("2160x3840");
  });

  it("keeps a vertical shot vertical", () => {
    // 2160x3840 is 9:16. The only legal 9:16-ish option on PRO is... none of
    // the presets, so it must pick the closest ratio rather than a square.
    const out = clampSizeToModel("2160x3840", PRO);
    expect(allowedSizes(PRO)).toContain(out);
    const [w, h] = out.split("x").map(Number);
    // 2560x1440 (1.78) is further from 0.5625 than 2048x2048 (1.0).
    expect(w / h).toBe(1);
  });

  it("keeps a landscape shot landscape", () => {
    expect(clampSizeToModel("3840x2160", PRO)).toBe("2560x1440"); // both 16:9
  });

  it("picks the largest option when ratios tie", () => {
    // 4096x4096 and 3072x3072 are both 1:1; on LITE the legal 1:1 is 3072.
    expect(clampSizeToModel("4096x4096", LITE)).toBe("3072x3072");
  });

  it("always returns something the model accepts", () => {
    for (const model of [PRO, LITE, V45]) {
      for (const s of [...IMAGE_SIZES, "9999x9999", "1x100000"]) {
        expect(isSizeAllowed(clampSizeToModel(s, model), model)).toBe(true);
      }
    }
  });

  it("is idempotent", () => {
    for (const model of [PRO, LITE, V45]) {
      for (const s of IMAGE_SIZES) {
        const once = clampSizeToModel(s, model);
        expect(clampSizeToModel(once, model)).toBe(once);
      }
    }
  });

  it("leaves an unparseable size alone rather than inventing one", () => {
    // Unknown ceiling ⇒ allowed ⇒ returned as-is.
    expect(clampSizeToModel("nonsense", FAL)).toBe("nonsense");
  });

  it("repairs the exact canvas that was failing", () => {
    // Project msaw9398-ctg1kn: six imageGen nodes at 2160x3840 on the default.
    const stored = "2160x3840";
    expect(isSizeAllowed(stored, DEFAULT_IMAGE_MODEL_ID)).toBe(false);
    const repaired = clampSizeToModel(stored, DEFAULT_IMAGE_MODEL_ID);
    expect(isSizeAllowed(repaired, DEFAULT_IMAGE_MODEL_ID)).toBe(true);
  });
});
