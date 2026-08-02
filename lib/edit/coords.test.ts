/**
 * coords — the transform tests exist to catch sign and factor errors, which
 * are the only bugs this module realistically has.
 *
 * A dropped zoom factor or a flipped pan sign is invisible at the default
 * view: at scale 1 with no pan, half the wrong implementations agree with the
 * right one. So the round-trip property is asserted across a spread of
 * viewports — zoomed in, zoomed out, panned both directions, letterboxed on
 * each axis — rather than on one comfortable case. A single-viewport
 * round-trip test would pass on code that ignores `vp.scale` entirely.
 *
 * The normalization tests pin the *order* of operations, not just the output
 * range. Rounding after the clamp, or normalizing from stage px, both still
 * produce integers in 0..1000; what they lose is that the far edge is exactly
 * 1000 and that the number is independent of zoom. The zoom-invariance test
 * at the bottom is the one that fails if someone ever routes normalization
 * through stage pixels.
 *
 * Degenerate viewports get their own block because a 0×0 stage is not an
 * edge case here — it is what the first render actually looks like, before
 * the ResizeObserver fires.
 */

import { describe, expect, it } from "vitest";
import {
  clampToImage,
  fitContain,
  imageToNorm,
  imageToStage,
  isInsideImage,
  rectToNorm,
  stageToImage,
  type Viewport,
} from "./coords";

function vp(over: Partial<Viewport> = {}): Viewport {
  return {
    stageW: 800,
    stageH: 600,
    imgW: 1600,
    imgH: 1200,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    ...over,
  };
}

describe("fitContain", () => {
  it("letterboxes on the vertical axis for an image wider than the stage", () => {
    // 4:1 image in a 4:3 stage — bands top and bottom, none left or right.
    const { scale, dx, dy } = fitContain(800, 600, 1600, 400);
    expect(scale).toBe(0.5); // width-limited
    expect(dx).toBe(0);
    expect(dy).toBe(200); // (600 - 400*0.5) / 2
  });

  it("letterboxes on the horizontal axis for an image taller than the stage", () => {
    const { scale, dx, dy } = fitContain(800, 600, 400, 1600);
    expect(scale).toBe(0.375); // height-limited
    expect(dy).toBe(0);
    expect(dx).toBe(325); // (800 - 400*0.375) / 2
  });

  it("has no bands at all when the aspects match", () => {
    expect(fitContain(800, 600, 800, 600)).toEqual({ scale: 1, dx: 0, dy: 0 });

    // Same aspect, different size: scaled, still no letterbox.
    const half = fitContain(800, 600, 1600, 1200);
    expect(half.scale).toBe(0.5);
    expect(half.dx).toBe(0);
    expect(half.dy).toBe(0);
  });

  it("never upscales or downscales asymmetrically — one axis always fills", () => {
    const { scale } = fitContain(1000, 500, 300, 900);
    // Height-limited: the rendered height must be exactly the stage height.
    expect(900 * scale).toBeCloseTo(500, 10);
  });
});

describe("stage <-> image round trip", () => {
  // Deliberately varied: letterboxing on each axis, zoom above and below 1,
  // pan in both directions, and non-integer values throughout.
  const VIEWPORTS: Array<[string, Viewport]> = [
    ["identity fit, no zoom", vp({ imgW: 800, imgH: 600 })],
    ["contain-fit, no zoom", vp()],
    ["vertical letterbox", vp({ imgW: 1600, imgH: 400 })],
    ["horizontal letterbox", vp({ imgW: 400, imgH: 1600 })],
    ["zoomed in", vp({ scale: 4 })],
    ["zoomed out", vp({ scale: 0.25 })],
    ["panned positive", vp({ scale: 2, offsetX: 137, offsetY: 42 })],
    ["panned negative", vp({ scale: 2, offsetX: -613.5, offsetY: -220.25 })],
    [
      "zoomed, panned, letterboxed, fractional stage",
      vp({
        stageW: 1023.5,
        stageH: 512.25,
        imgW: 3000,
        imgH: 2000,
        scale: 2.75,
        offsetX: -401.125,
        offsetY: 88.5,
      }),
    ],
  ];

  type Vec2 = { x: number; y: number };

  const POINTS: Vec2[] = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 123.5, y: 77.25 },
    { x: 799, y: 599 },
    { x: -50, y: -50 }, // in a letterbox band; still must invert cleanly
    { x: 2999.5, y: 1999.5 },
  ];

  for (const [name, viewport] of VIEWPORTS) {
    it(`image -> stage -> image is identity (${name})`, () => {
      for (const p of POINTS) {
        const back = stageToImage(imageToStage(p, viewport), viewport);
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
    });

    it(`stage -> image -> stage is identity (${name})`, () => {
      for (const p of POINTS) {
        const back = imageToStage(stageToImage(p, viewport), viewport);
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
    });
  }

  it("actually applies the zoom — a wrong-but-invertible transform would not", () => {
    // Round-tripping alone cannot catch an ignored vp.scale, so pin one
    // absolute mapping. Stage 800x600, image 1600x1200 -> fit 0.5, zoom 2,
    // so effective scale 1 and no letterbox: image px == stage px.
    expect(imageToStage({ x: 100, y: 100 }, vp({ scale: 2 }))).toEqual({
      x: 100,
      y: 100,
    });
    // At zoom 1 the same point sits at half that.
    expect(imageToStage({ x: 100, y: 100 }, vp())).toEqual({ x: 50, y: 50 });
  });

  it("applies the pan in the direction the user dragged", () => {
    const panned = vp({ offsetX: 30, offsetY: -10 });
    expect(imageToStage({ x: 0, y: 0 }, panned)).toEqual({ x: 30, y: -10 });
  });

  it("adds the letterbox offset on top of the pan", () => {
    // 1600x400 in an 800x600 stage: fit 0.5, dy 200. Pan adds to that.
    const v = vp({ imgW: 1600, imgH: 400, offsetY: 25 });
    expect(imageToStage({ x: 0, y: 0 }, v)).toEqual({ x: 0, y: 225 });
  });
});

describe("imageToNorm", () => {
  it("returns integers, never fractions", () => {
    const [x, y] = imageToNorm({ x: 333.33, y: 777.77 }, 1000, 1000);
    expect(Number.isInteger(x)).toBe(true);
    expect(Number.isInteger(y)).toBe(true);
  });

  it("maps the centre to the middle of the range", () => {
    expect(imageToNorm({ x: 800, y: 600 }, 1600, 1200)).toEqual([500, 500]);
    // Odd dimensions land within a unit of centre, still integral.
    const [x] = imageToNorm({ x: 500.5, y: 0 }, 1001, 1001);
    expect(x).toBe(500);
  });

  it("maps the far corner to exactly 1000", () => {
    expect(imageToNorm({ x: 1600, y: 1200 }, 1600, 1200)).toEqual([1000, 1000]);
    expect(imageToNorm({ x: 0, y: 0 }, 1600, 1200)).toEqual([0, 0]);
  });

  it("clamps at both ends", () => {
    // A point in a letterbox band, normalized rather than rejected.
    expect(imageToNorm({ x: -900, y: -1 }, 1600, 1200)).toEqual([0, 0]);
    expect(imageToNorm({ x: 9999, y: 9999 }, 1600, 1200)).toEqual([1000, 1000]);
  });

  it("is monotonic across the range", () => {
    let prev = -1;
    for (let px = 0; px <= 1600; px += 37) {
      const [x] = imageToNorm({ x: px, y: 0 }, 1600, 1200);
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
  });
});

describe("rectToNorm", () => {
  it("orders a rect dragged up-and-left", () => {
    // Started at (800,600), dragged back to (400,300).
    const dragged = rectToNorm({ x: 800, y: 600, w: -400, h: -300 }, 1600, 1200);
    expect(dragged).toEqual([250, 250, 500, 500]);

    // Identical to the same box expressed with positive w/h.
    expect(rectToNorm({ x: 400, y: 300, w: 400, h: 300 }, 1600, 1200)).toEqual(
      dragged,
    );
  });

  it("always yields x1<=x2 and y1<=y2", () => {
    for (const r of [
      { x: 10, y: 10, w: 100, h: 100 },
      { x: 110, y: 110, w: -100, h: -100 },
      { x: 110, y: 10, w: -100, h: 100 },
      { x: 10, y: 110, w: 100, h: -100 },
      { x: 50, y: 50, w: 0, h: 0 },
    ]) {
      const [x1, y1, x2, y2] = rectToNorm(r, 1600, 1200);
      expect(x1).toBeLessThanOrEqual(x2);
      expect(y1).toBeLessThanOrEqual(y2);
    }
  });

  it("clamps a box dragged past the edge to the full extent", () => {
    expect(rectToNorm({ x: -500, y: -500, w: 4000, h: 4000 }, 1600, 1200)).toEqual(
      [0, 0, 1000, 1000],
    );
  });
});

describe("isInsideImage / clampToImage", () => {
  it("rejects a point in a letterbox band", () => {
    // 1600x400 in an 800x600 stage: 200px dead bands top and bottom. A click
    // 10px from the top of the stage is above the image entirely.
    const v = vp({ imgW: 1600, imgH: 400 });
    const p = stageToImage({ x: 400, y: 10 }, v);
    expect(p.y).toBeLessThan(0);
    expect(isInsideImage(p, v.imgW, v.imgH)).toBe(false);

    // Same x, but inside the band-free middle of the stage.
    const inside = stageToImage({ x: 400, y: 300 }, v);
    expect(isInsideImage(inside, v.imgW, v.imgH)).toBe(true);
  });

  it("counts the boundary as inside", () => {
    expect(isInsideImage({ x: 0, y: 0 }, 1600, 1200)).toBe(true);
    expect(isInsideImage({ x: 1600, y: 1200 }, 1600, 1200)).toBe(true);
    expect(isInsideImage({ x: 1600.01, y: 1200 }, 1600, 1200)).toBe(false);
    expect(isInsideImage({ x: -0.01, y: 0 }, 1600, 1200)).toBe(false);
  });

  it("has no inside for an unmeasured image", () => {
    expect(isInsideImage({ x: 0, y: 0 }, 0, 0)).toBe(false);
    expect(isInsideImage({ x: 0, y: 0 }, Number.NaN, 1200)).toBe(false);
  });

  it("clamps a drag that left the image onto the edge", () => {
    expect(clampToImage({ x: -40, y: 5000 }, 1600, 1200)).toEqual({
      x: 0,
      y: 1200,
    });
    // A point already inside is untouched.
    expect(clampToImage({ x: 12.5, y: 900 }, 1600, 1200)).toEqual({
      x: 12.5,
      y: 900,
    });
  });
});

describe("degenerate input", () => {
  const BAD: Array<[string, Viewport]> = [
    ["0x0 stage on first mount", vp({ stageW: 0, stageH: 0 })],
    ["unmeasured image", vp({ imgW: 0, imgH: 0 })],
    ["negative stage", vp({ stageW: -100, stageH: -100 })],
    ["NaN stage", vp({ stageW: Number.NaN, stageH: Number.NaN })],
    ["NaN image dims", vp({ imgW: Number.NaN, imgH: Number.NaN })],
    ["zero zoom", vp({ scale: 0 })],
    ["NaN zoom", vp({ scale: Number.NaN })],
    ["NaN pan", vp({ offsetX: Number.NaN, offsetY: Number.NaN })],
    ["infinite dims", vp({ imgW: Number.POSITIVE_INFINITY, imgH: 1200 })],
  ];

  for (const [name, viewport] of BAD) {
    it(`produces finite coordinates (${name})`, () => {
      const a = stageToImage({ x: 100, y: 100 }, viewport);
      const b = imageToStage({ x: 100, y: 100 }, viewport);
      for (const v of [a.x, a.y, b.x, b.y]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    });
  }

  it("fitContain falls back to identity rather than dividing by zero", () => {
    for (const args of [
      [0, 0, 100, 100],
      [800, 600, 0, 0],
      [800, 600, Number.NaN, 100],
      [Number.POSITIVE_INFINITY, 600, 100, 100],
      [-800, 600, 100, 100],
    ] as Array<[number, number, number, number]>) {
      const fit = fitContain(...args);
      expect(Number.isFinite(fit.scale)).toBe(true);
      expect(fit.scale).toBeGreaterThan(0);
      expect(Number.isFinite(fit.dx)).toBe(true);
      expect(Number.isFinite(fit.dy)).toBe(true);
    }
  });

  it("normalizes NaN and zero-extent input to in-range integers", () => {
    for (const out of [
      imageToNorm({ x: Number.NaN, y: Number.NaN }, 1600, 1200),
      imageToNorm({ x: 100, y: 100 }, 0, 0),
      imageToNorm({ x: 100, y: 100 }, Number.NaN, Number.NaN),
      imageToNorm({ x: Number.POSITIVE_INFINITY, y: 0 }, 1600, 1200),
    ]) {
      for (const v of out) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1000);
      }
    }
  });

  it("rectToNorm survives a NaN rect", () => {
    const box = rectToNorm(
      { x: Number.NaN, y: 10, w: Number.NaN, h: 20 },
      1600,
      1200,
    );
    for (const v of box) expect(Number.isInteger(v)).toBe(true);
    expect(box[0]).toBeLessThanOrEqual(box[2]);
    expect(box[1]).toBeLessThanOrEqual(box[3]);
  });

  it("clampToImage returns the origin for an unmeasured image", () => {
    expect(clampToImage({ x: 50, y: 50 }, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(clampToImage({ x: Number.NaN, y: 50 }, 1600, 1200)).toEqual({
      x: 0,
      y: 50,
    });
  });
});

describe("normalization is independent of the view", () => {
  it("gives the same tag for the same pixel at any zoom or pan", () => {
    // Deliberately not a pixel that normalizes to exactly x.5 — the assertion
    // is about the view, and a value sitting on the rounding boundary would
    // make it about float noise instead.
    const target = { x: 1234, y: 570 };
    const views = [
      vp({ imgW: 3000, imgH: 2000 }),
      vp({ imgW: 3000, imgH: 2000, scale: 6.5, offsetX: -900, offsetY: 310 }),
      vp({
        stageW: 331,
        stageH: 1200,
        imgW: 3000,
        imgH: 2000,
        scale: 0.2,
        offsetX: 77.5,
        offsetY: -4,
      }),
    ];

    // Go the whole way round: image px -> where it renders on the stage ->
    // back through the pointer path -> normalized. This is the chain a real
    // click takes, and it must land on the same integers every time.
    const expected = imageToNorm(target, 3000, 2000);
    for (const v of views) {
      const roundTripped = stageToImage(imageToStage(target, v), v);
      expect(imageToNorm(roundTripped, v.imgW, v.imgH)).toEqual(expected);
    }
    expect(expected).toEqual([411, 285]);
  });
});
