/**
 * sizeForEdit — the guarantee is total, so the test is exhaustive.
 *
 * The headline case is the exhaustive sweep at the bottom: every model in the
 * registry × every quality × a spread of aspects including the extremes, all
 * asserting isSizeAllowed(). That matters because the bug this file exists to
 * prevent is already shipping in the generator — pickImageSize(16:9, "2k") is
 * 5,308,416 px against Seedream 5.0 Pro's 4,624,220 ceiling — and it went
 * unnoticed precisely because nothing asserted the invariant across the whole
 * matrix.
 *
 * The rounding-direction test is the subtle one. Flooring to a multiple of 8
 * can only lose pixels, so it can never re-cross a ceiling we just scaled
 * under. Rounding to nearest would reintroduce the failure on inputs sitting
 * exactly at the cap, and would do it for a *single* model at a *single*
 * quality — the kind of gap a spot-check walks straight past.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_MAX_PIXELS,
  IMAGE_MODELS,
  IMAGE_QUALITIES,
  isSizeAllowed,
  modelMaxPixels,
  sizePixels,
} from "@/lib/studio/models";
import { sizeForEdit } from "./size";

const PRO = "dola-seedream-5-0-pro-260628";
const LITE = "seedream-5-0-lite-260128";
const V45 = "seedream-4-5-251128";
const FAL = "openai/gpt-image-2"; // declares no ceiling

function dims(size: string): { w: number; h: number } {
  const m = /^(\d+)x(\d+)$/.exec(size)!;
  return { w: Number(m[1]), h: Number(m[2]) };
}

describe("shape of the output", () => {
  it("always returns a parseable WxH, never 'adaptive'", () => {
    const size = sizeForEdit({ width: 1024, height: 768, modelId: PRO });
    expect(size).toMatch(/^\d+x\d+$/);
    expect(size).not.toBe("adaptive");
  });

  it("rounds both sides down to a multiple of 8", () => {
    const { w, h } = dims(
      sizeForEdit({ width: 1000, height: 667, modelId: PRO, qualityId: "2k" }),
    );
    expect(w % 8).toBe(0);
    expect(h % 8).toBe(0);
  });

  it("preserves the source orientation", () => {
    const land = dims(sizeForEdit({ width: 1920, height: 1080, modelId: PRO }));
    expect(land.w).toBeGreaterThan(land.h);

    const port = dims(sizeForEdit({ width: 1080, height: 1920, modelId: PRO }));
    expect(port.h).toBeGreaterThan(port.w);

    const square = dims(sizeForEdit({ width: 800, height: 800, modelId: PRO }));
    expect(square.w).toBe(square.h);
  });

  it("tracks the source aspect within a percent", () => {
    const { w, h } = dims(
      sizeForEdit({ width: 1600, height: 900, modelId: V45, qualityId: "1k" }),
    );
    expect(Math.abs(w / h - 16 / 9)).toBeLessThan(0.02);
  });
});

describe("source sizing — the editor default", () => {
  it("returns the source's own size, not a preset", () => {
    // The regression this exists to prevent, from a real session: a
    // 1364x1364 upload came back 2144x2144 because the default was the "2k"
    // preset. Nobody asked for a 1.6x upscale, and it resamples the whole
    // image on every iteration — including regions never marked.
    expect(
      sizeForEdit({ width: 1364, height: 1364, modelId: PRO }),
    ).toBe("1360x1360"); // 1364 floored to a multiple of 8
  });

  it("is the default when qualityId is omitted", () => {
    const implicit = sizeForEdit({ width: 900, height: 600, modelId: PRO });
    const explicit = sizeForEdit({
      width: 900,
      height: 600,
      modelId: PRO,
      qualityId: "source",
    });
    expect(implicit).toBe(explicit);
  });

  it("does not upscale a small source", () => {
    const { w, h } = dims(
      sizeForEdit({ width: 800, height: 600, modelId: PRO }),
    );
    expect(w).toBeLessThanOrEqual(800);
    expect(h).toBeLessThanOrEqual(600);
  });

  it("still clamps a source above the model ceiling", () => {
    // 6000x4000 = 24 MP, far above 5.0 Pro's 4,624,220.
    const size = sizeForEdit({ width: 6000, height: 4000, modelId: PRO });
    expect(isSizeAllowed(size, PRO)).toBe(true);
    expect(sizePixels(size)!).toBeLessThanOrEqual(DEFAULT_MODEL_MAX_PIXELS);
  });

  it("still honours an explicit preset when one is asked for", () => {
    // Opting in to a bigger render is a legitimate choice; it just isn't the
    // default any more.
    const { w } = dims(
      sizeForEdit({ width: 800, height: 800, modelId: PRO, qualityId: "2k" }),
    );
    expect(w).toBeGreaterThan(800);
  });

  it("falls back to a preset for an unmeasured ref", () => {
    const size = sizeForEdit({ width: 0, height: 0, modelId: PRO });
    expect(size).toMatch(/^\d+x\d+$/);
    expect(isSizeAllowed(size, PRO)).toBe(true);
  });
});

describe("the ceiling", () => {
  it("keeps 16:9 at 2K under the 5.0 Pro cap — the case pickImageSize fails", () => {
    // pickImageSize(16:9, "2k") === "3072x1728" === 5,308,416 px, which the
    // engine rejects on this model. Same request, same model, through here:
    const size = sizeForEdit({
      width: 1920,
      height: 1080,
      modelId: PRO,
      qualityId: "2k",
    });
    expect(sizePixels(size)!).toBeLessThanOrEqual(DEFAULT_MODEL_MAX_PIXELS);
    expect(isSizeAllowed(size, PRO)).toBe(true);
  });

  it("keeps 4K requests under each model's own cap", () => {
    for (const modelId of [PRO, LITE, V45]) {
      const size = sizeForEdit({
        width: 3840,
        height: 2160,
        modelId,
        qualityId: "4k",
      });
      expect(sizePixels(size)!).toBeLessThanOrEqual(modelMaxPixels(modelId)!);
    }
  });

  it("bounds a model that declares no ceiling", () => {
    // gpt-image-2 has no maxPixels, so isSizeAllowed() is vacuously true and
    // proves nothing. What matters is that a huge source doesn't produce an
    // absurd request.
    const size = sizeForEdit({
      width: 6000,
      height: 4000,
      modelId: FAL,
      qualityId: "4k",
    });
    expect(sizePixels(size)!).toBeLessThanOrEqual(4096 * 4096);
  });

  it("does not scale a small source up past the cap", () => {
    const size = sizeForEdit({ width: 64, height: 64, modelId: PRO });
    expect(isSizeAllowed(size, PRO)).toBe(true);
    // …and does lift it to something renderable.
    expect(sizePixels(size)!).toBeGreaterThanOrEqual(200_000);
  });
});

describe("aspect override", () => {
  it("honours an explicit W:H over the source", () => {
    const { w, h } = dims(
      sizeForEdit({
        width: 1000,
        height: 1000, // square source
        modelId: V45,
        aspectRatio: "16:9",
        qualityId: "1k",
      }),
    );
    expect(w).toBeGreaterThan(h);
    expect(Math.abs(w / h - 16 / 9)).toBeLessThan(0.02);
  });

  it("treats 'source' and 'auto' as the source aspect", () => {
    const base = sizeForEdit({ width: 1600, height: 900, modelId: PRO });
    expect(
      sizeForEdit({
        width: 1600,
        height: 900,
        modelId: PRO,
        aspectRatio: "source",
      }),
    ).toBe(base);
    expect(
      sizeForEdit({ width: 1600, height: 900, modelId: PRO, aspectRatio: "auto" }),
    ).toBe(base);
  });

  it("falls back to the source aspect on an unparseable ratio", () => {
    // A corrupted stored value must not block a render.
    const base = sizeForEdit({ width: 1600, height: 900, modelId: PRO });
    expect(
      sizeForEdit({
        width: 1600,
        height: 900,
        modelId: PRO,
        aspectRatio: "garbage",
      }),
    ).toBe(base);
  });

  it("clamps a ratio beyond the engine's 16:1 range", () => {
    const { w, h } = dims(
      sizeForEdit({ width: 8000, height: 100, modelId: PRO }), // 80:1
    );
    expect(w / h).toBeLessThanOrEqual(16.001);
  });

  it("keeps the ratio inside 16:1 AFTER flooring, not just before", () => {
    // Flooring each side independently distorts the aspect, worst when the
    // short side is small: 8000x500 floors to 8000x496 = 16.13:1, which the
    // engine rejects. The bound has to hold on the emitted numbers.
    for (const [w0, h0] of [
      [8000, 100],
      [8000, 500],
      [100, 8000],
      [4000, 250],
      [317, 5081],
    ] as Array<[number, number]>) {
      const { w, h } = dims(sizeForEdit({ width: w0, height: h0, modelId: PRO }));
      const ratio = Math.max(w / h, h / w);
      expect(ratio).toBeLessThanOrEqual(16.0000001);
      expect(w % 8).toBe(0);
      expect(h % 8).toBe(0);
    }
  });
});

describe("degenerate input", () => {
  it("falls back to square for unmeasured or invalid dimensions", () => {
    for (const bad of [
      { width: 0, height: 0 },
      { width: -10, height: 20 },
      { width: Number.NaN, height: 100 },
      { width: Number.POSITIVE_INFINITY, height: 100 },
    ]) {
      const { w, h } = dims(sizeForEdit({ ...bad, modelId: PRO }));
      expect(w).toBe(h);
      expect(isSizeAllowed(`${w}x${h}`, PRO)).toBe(true);
    }
  });
});

describe("exhaustive: every model × quality × aspect stays legal", () => {
  const ASPECTS: Array<[number, number]> = [
    [1, 1],
    [16, 9],
    [9, 16],
    [21, 9],
    [4, 3],
    [4, 5],
    [8, 1],
    [1, 8],
    [3000, 2000],
    [1, 1000], // beyond the legal range on purpose — must be clamped, not passed
  ];

  for (const model of IMAGE_MODELS) {
    for (const quality of IMAGE_QUALITIES) {
      for (const [aw, ah] of ASPECTS) {
        it(`${model.id} · ${quality.id} · ${aw}:${ah}`, () => {
          const size = sizeForEdit({
            width: aw,
            height: ah,
            modelId: model.id,
            qualityId: quality.id,
          });

          expect(size).toMatch(/^\d+x\d+$/);
          expect(isSizeAllowed(size, model.id)).toBe(true);

          const { w, h } = dims(size);
          expect(w % 8).toBe(0);
          expect(h % 8).toBe(0);
          expect(w).toBeGreaterThan(0);
          expect(h).toBeGreaterThan(0);

          const cap = modelMaxPixels(model.id);
          if (cap !== null) expect(w * h).toBeLessThanOrEqual(cap);
        });
      }
    }
  }
});
