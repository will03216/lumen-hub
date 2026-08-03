/**
 * geometry — the math nobody can see failing.
 *
 * A wrong number in here does not throw. It produces a mask whose edge is a
 * few pixels off, an arrowhead that renders as a hairline, or the word "blue"
 * attached to a magenta stroke — all of which look like the *model* getting
 * the edit wrong, which is the most expensive class of bug this feature can
 * have. That is the whole argument for hoisting the math out of the canvas
 * rasteriser and asserting it directly.
 *
 * Three tests here carry more weight than the rest:
 *
 * · The compression-ratio test on a realistic noisy stroke. simplifyStroke
 *   exists to keep sessions inside the localStorage quota, so "it returns
 *   fewer points" is not the property that matters — a *ratio* is. The stroke
 *   is generated from a fixed-seed LCG so the number it asserts is stable
 *   across runs and machines; Math.random would make this test either
 *   meaningless or flaky.
 *
 * · The degenerate-chord test. The naive cross-product perpendicular divides
 *   by the chord length, so a closed loop yields NaN, NaN > epsilon is false,
 *   and RDP silently throws the entire stroke away except its endpoints. It
 *   fails quietly and only for closed shapes, which is exactly how someone
 *   circling a face loses their mask.
 *
 * · The zero-length arrow. A tap that registers as a drag of zero distance is
 *   ordinary user behaviour; a NaN barb both draws nothing on canvas and
 *   serialises to null in the session JSON.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARROW_HEAD_ANGLE,
  DEFAULT_ARROW_HEAD_LENGTH,
  arrowHeadPoints,
  colorName,
  distance,
  normalizeRect,
  roundPoints,
  simplifyStroke,
  strokeBounds,
} from "./geometry";

/** Every coordinate finite — the property NaN bugs violate. */
function allFinite(nums: number[]): boolean {
  return nums.every((n) => Number.isFinite(n));
}

function pointCount(flat: number[]): number {
  return flat.length / 2;
}

// ─────────────────────────── normalizeRect ────────────────────────────────

describe("normalizeRect", () => {
  // All four drags describe the SAME rect; only the drag direction differs.
  const expected = { x: 10, y: 20, w: 100, h: 50 };

  it("passes through a down-right drag", () => {
    expect(normalizeRect({ x: 10, y: 20, w: 100, h: 50 })).toEqual(expected);
  });

  it("normalizes a down-left drag", () => {
    expect(normalizeRect({ x: 110, y: 20, w: -100, h: 50 })).toEqual(expected);
  });

  it("normalizes an up-right drag", () => {
    expect(normalizeRect({ x: 10, y: 70, w: 100, h: -50 })).toEqual(expected);
  });

  it("normalizes an up-left drag", () => {
    expect(normalizeRect({ x: 110, y: 70, w: -100, h: -50 })).toEqual(expected);
  });

  it("leaves a zero-extent rect alone", () => {
    expect(normalizeRect({ x: 5, y: 5, w: 0, h: 0 })).toEqual({
      x: 5,
      y: 5,
      w: 0,
      h: 0,
    });
  });
});

// ─────────────────────────── strokeBounds ─────────────────────────────────

describe("strokeBounds", () => {
  it("pads by half the stroke width on every side", () => {
    // Centreline box is (10,10)–(20,30); a 8 px stroke reaches 4 px beyond it.
    expect(strokeBounds([10, 10, 20, 30], 8)).toEqual({
      x: 6,
      y: 6,
      w: 18,
      h: 28,
    });
  });

  it("gives a single point a box the size of the stroke", () => {
    expect(strokeBounds([50, 50], 40)).toEqual({ x: 30, y: 30, w: 40, h: 40 });
  });

  it("bounds an unordered stroke, not just a monotonic one", () => {
    const b = strokeBounds([100, 0, 0, 100, 50, -50], 0);
    expect(b).toEqual({ x: 0, y: -50, w: 100, h: 150 });
  });

  it("returns a zero rect for an empty stroke", () => {
    expect(strokeBounds([], 20)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it("ignores a trailing orphan coordinate", () => {
    expect(strokeBounds([10, 10, 20, 30, 999], 8)).toEqual(
      strokeBounds([10, 10, 20, 30], 8),
    );
  });
});

// ─────────────────────────── simplifyStroke ───────────────────────────────

describe("simplifyStroke", () => {
  it("collapses a straight line to its two endpoints", () => {
    const line: number[] = [];
    for (let x = 0; x <= 200; x += 5) line.push(x, 100);
    expect(pointCount(line)).toBe(41);
    expect(simplifyStroke(line)).toEqual([0, 100, 200, 100]);
  });

  it("preserves a sharp corner", () => {
    // An L: 0,0 → 100,0 → 100,100, densely sampled along both legs.
    const l: number[] = [];
    for (let x = 0; x <= 100; x += 4) l.push(x, 0);
    for (let y = 4; y <= 100; y += 4) l.push(100, y);

    const out = simplifyStroke(l);
    expect(out).toEqual([0, 0, 100, 0, 100, 100]);
  });

  it("keeps the first and last points exactly, whatever the epsilon", () => {
    const stroke = noisyStroke(400);
    for (const eps of [0.1, 1.5, 8, 200]) {
      const out = simplifyStroke(stroke, eps);
      expect(out.slice(0, 2)).toEqual(stroke.slice(0, 2));
      expect(out.slice(-2)).toEqual(stroke.slice(-2));
    }
  });

  it("returns fewer-than-3-point inputs unchanged", () => {
    expect(simplifyStroke([])).toEqual([]);
    expect(simplifyStroke([5, 7])).toEqual([5, 7]);
    expect(simplifyStroke([5, 7, 9, 11])).toEqual([5, 7, 9, 11]);
  });

  it("never returns the caller's own array", () => {
    // Callers hold points arrays that live in a stored annotation; handing
    // the same reference back invites an alias bug on the next mutation.
    const input = [5, 7, 9, 11];
    expect(simplifyStroke(input)).not.toBe(input);
  });

  it("collapses hard under a large epsilon and preserves more under a small one", () => {
    const stroke = noisyStroke(600);
    const coarse = simplifyStroke(stroke, 40); // way past the arc's amplitude
    const mid = simplifyStroke(stroke, 1.5); // the default
    const fine = simplifyStroke(stroke, 0.25); // below the hand tremor

    expect(pointCount(coarse)).toBeGreaterThanOrEqual(2);
    expect(pointCount(coarse)).toBeLessThan(pointCount(mid));
    expect(pointCount(mid)).toBeLessThan(pointCount(fine));
    expect(pointCount(fine)).toBeLessThanOrEqual(pointCount(stroke));
  });

  it("cuts a realistic 60 Hz capture by an order of magnitude", () => {
    // ~10 seconds of hand-drawn stroke at 60 Hz.
    const raw = noisyStroke(600);

    const simplified = roundPoints(simplifyStroke(raw));

    // The property that matters is the ratio, not the count: this is what
    // keeps twenty strokes per reference inside the ~5 MB shared quota.
    expect(pointCount(simplified) / pointCount(raw)).toBeLessThan(0.25);

    // And the same thing measured where it is actually spent — JSON bytes,
    // which also captures the integer-rounding win.
    const before = JSON.stringify(raw).length;
    const after = JSON.stringify(simplified).length;
    expect(after).toBeLessThan(before / 10);
  });

  it("stays within the stated tolerance of the original path", () => {
    // Compression is worthless if the shape drifts. Every dropped point must
    // still lie within epsilon of the simplified polyline.
    const raw = noisyStroke(600);
    const eps = 1.5;
    const out = simplifyStroke(raw, eps);

    let worst = 0;
    for (let i = 0; i < raw.length; i += 2) {
      const d = distanceToPolyline(raw[i], raw[i + 1], out);
      if (d > worst) worst = d;
    }
    // A little slack: RDP guarantees the bound against the recursion's own
    // chords, and floating-point accumulation is not free.
    expect(worst).toBeLessThanOrEqual(eps + 1e-6);
  });

  it("treats a non-positive epsilon as 'do not simplify'", () => {
    const stroke = noisyStroke(50);
    expect(simplifyStroke(stroke, 0)).toEqual(stroke);
    expect(simplifyStroke(stroke, -1)).toEqual(stroke);
  });
});

describe("simplifyStroke — malformed and degenerate input", () => {
  it("drops a trailing orphan coordinate rather than throwing", () => {
    // Documented choice: a lone x with no y is not a point. Only arises from
    // a truncated write; losing half a sample beats refusing the session.
    expect(simplifyStroke([0, 0, 10, 0, 20, 0, 30])).toEqual([0, 0, 20, 0]);
    expect(simplifyStroke([1, 2, 3])).toEqual([1, 2]);
    expect(simplifyStroke([9])).toEqual([]);
  });

  it("does not hang or NaN when every point is identical", () => {
    const stuck = Array.from({ length: 200 }, () => [42, 17]).flat();
    const out = simplifyStroke(stuck);
    expect(allFinite(out)).toBe(true);
    expect(out).toEqual([42, 17, 42, 17]);
  });

  it("keeps the shape of a closed loop, where start equals end", () => {
    // The case the naive perpendicular gets wrong: chord length 0 → NaN →
    // NaN > epsilon is false → the whole loop collapses to its endpoints.
    const loop = [
      0, 0, 50, 0, 100, 0, 100, 50, 100, 100, 50, 100, 0, 100, 0, 50, 0, 0,
    ];
    const out = simplifyStroke(loop, 1.5);

    expect(allFinite(out)).toBe(true);
    // All four corners survive; the mid-edge samples do not.
    expect(pointCount(out)).toBe(5);
    expect(out).toEqual([0, 0, 100, 0, 100, 100, 0, 100, 0, 0]);
  });

  it("survives a stroke where every point is a corner", () => {
    // Worst case for the recursion depth: a zigzag that never simplifies.
    const zig: number[] = [];
    for (let i = 0; i < 2000; i++) zig.push(i * 10, i % 2 === 0 ? 0 : 100);
    const out = simplifyStroke(zig, 1.5);
    expect(allFinite(out)).toBe(true);
    expect(pointCount(out)).toBe(2000);
  });
});

// ─────────────────────────── roundPoints ──────────────────────────────────

describe("roundPoints", () => {
  it("rounds every coordinate to an integer", () => {
    // 1023.7291 is 9 bytes of JSON; 1024 is 4. That is the entire point.
    expect(roundPoints([1023.7291, 4.2, -0.6, 99.5])).toEqual([
      1024, 4, -1, 100,
    ]);
  });

  it("drops a trailing orphan coordinate", () => {
    expect(roundPoints([1.4, 2.6, 3.3])).toEqual([1, 3]);
  });

  it("returns a new array", () => {
    const input = [1, 2];
    expect(roundPoints(input)).not.toBe(input);
  });
});

// ─────────────────────────── arrowHeadPoints ──────────────────────────────

describe("arrowHeadPoints", () => {
  const from = { x: 100, y: 100 };
  const to = { x: 400, y: 300 };

  it("puts both barbs at exactly the head length from the tip", () => {
    const [left, right] = arrowHeadPoints(from, to);
    expect(distance(to, left)).toBeCloseTo(DEFAULT_ARROW_HEAD_LENGTH, 9);
    expect(distance(to, right)).toBeCloseTo(DEFAULT_ARROW_HEAD_LENGTH, 9);
  });

  it("honours an explicit head length", () => {
    const [left, right] = arrowHeadPoints(from, to, 60);
    expect(distance(to, left)).toBeCloseTo(60, 9);
    expect(distance(to, right)).toBeCloseTo(60, 9);
  });

  it("places the barbs symmetrically about the shaft axis", () => {
    const [left, right] = arrowHeadPoints(from, to);

    const len = distance(from, to);
    const ux = (to.x - from.x) / len;
    const uy = (to.y - from.y) / len;

    // Signed perpendicular offset from the shaft axis: equal magnitude,
    // opposite sign. This is the symmetry that makes it read as an arrow.
    const crossL = ux * (left.y - to.y) - uy * (left.x - to.x);
    const crossR = ux * (right.y - to.y) - uy * (right.x - to.x);
    expect(crossL).toBeCloseTo(-crossR, 9);
    expect(Math.abs(crossL)).toBeCloseTo(
      DEFAULT_ARROW_HEAD_LENGTH * Math.sin(DEFAULT_ARROW_HEAD_ANGLE),
      9,
    );

    // …and both sit BEHIND the tip, i.e. back along the shaft.
    const alongL = ux * (left.x - to.x) + uy * (left.y - to.y);
    const alongR = ux * (right.x - to.x) + uy * (right.y - to.y);
    expect(alongL).toBeLessThan(0);
    expect(alongL).toBeCloseTo(alongR, 9);
    expect(alongL).toBeCloseTo(
      -DEFAULT_ARROW_HEAD_LENGTH * Math.cos(DEFAULT_ARROW_HEAD_ANGLE),
      9,
    );
  });

  it("rotates with the shaft", () => {
    // Pointing straight right: barbs go back-left, one above and one below.
    const [l, r] = arrowHeadPoints({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(l.x).toBeLessThan(100);
    expect(r.x).toBeLessThan(100);
    expect(Math.sign(l.y)).toBe(-Math.sign(r.y));
  });

  it("respects a custom half-angle", () => {
    const wide = arrowHeadPoints(from, to, 30, Math.PI / 3);
    const narrow = arrowHeadPoints(from, to, 30, Math.PI / 12);
    expect(distance(wide[0], wide[1])).toBeGreaterThan(
      distance(narrow[0], narrow[1]),
    );
  });

  it("yields finite numbers for a zero-length shaft", () => {
    const p = { x: 250, y: 250 };
    const [left, right] = arrowHeadPoints(p, p);

    expect(allFinite([left.x, left.y, right.x, right.y])).toBe(true);
    expect(distance(p, left)).toBeCloseTo(DEFAULT_ARROW_HEAD_LENGTH, 9);
    expect(distance(p, right)).toBeCloseTo(DEFAULT_ARROW_HEAD_LENGTH, 9);
    // Still a real head, not two coincident points.
    expect(distance(left, right)).toBeGreaterThan(0);
  });
});

// ─────────────────────────── distance ─────────────────────────────────────

describe("distance", () => {
  it("measures the 3-4-5 triangle", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 12);
  });

  it("is zero for coincident points and symmetric otherwise", () => {
    const a = { x: -7.5, y: 12 };
    const b = { x: 4, y: -3 };
    expect(distance(a, a)).toBe(0);
    expect(distance(a, b)).toBe(distance(b, a));
  });
});

// ─────────────────────────── colorName ────────────────────────────────────

describe("colorName", () => {
  it("names the default marker colour exactly", () => {
    // MARKER_COLOR. This is the string that ends up in "do not reproduce the
    // magenta markup", so a near-miss here misdirects the model.
    expect(colorName("#FF00E5")).toBe("magenta");
  });

  it("is case-insensitive and tolerates a missing hash", () => {
    expect(colorName("#ff00e5")).toBe("magenta");
    expect(colorName("FF00E5")).toBe("magenta");
    expect(colorName("ff00e5")).toBe("magenta");
    expect(colorName("  #FF00E5  ")).toBe("magenta");
  });

  it("expands 3-digit hex by digit duplication", () => {
    // #f0f is #ff00ff, not #f000f0 — the latter would name grey-ish nonsense.
    expect(colorName("#f0f")).toBe("magenta");
    expect(colorName("#fff")).toBe("white");
    expect(colorName("000")).toBe("black");
    expect(colorName("#f00")).toBe("red");
  });

  it("covers the documented palette", () => {
    expect(colorName("#FF0000")).toBe("red");
    expect(colorName("#FF8C00")).toBe("orange");
    expect(colorName("#FFE01E")).toBe("yellow");
    expect(colorName("#00C853")).toBe("green");
    expect(colorName("#00E5FF")).toBe("cyan");
    expect(colorName("#2563EB")).toBe("blue");
    expect(colorName("#8B2BE2")).toBe("purple");
    expect(colorName("#FFFFFF")).toBe("white");
    expect(colorName("#000000")).toBe("black");
    expect(colorName("#808080")).toBe("grey");
  });

  it("falls back to grey on unparseable input rather than throwing", () => {
    // A corrupted stored swatch must not be able to block a render, and the
    // prose template always needs a colour word.
    for (const bad of ["", "#", "nope", "#12", "#12345", "#1234567", "rgb(1)"]) {
      expect(colorName(bad)).toBe("grey");
    }
  });
});

// ─────────────────────────── helpers ──────────────────────────────────────

/**
 * A deterministic stand-in for a hand-drawn stroke: a smooth sine arc — the
 * shape of a wrist movement — sampled at 60 Hz spacing, with sub-pixel jitter
 * from a fixed-seed LCG. Deterministic on purpose: the compression assertions
 * are numeric thresholds, and Math.random would make them flaky rather than
 * meaningful.
 */
function noisyStroke(samples: number): number[] {
  let seed = 0x2f6e2b1;
  const rand = () => {
    // Numerical Recipes LCG; the exact constants don't matter, reproducibility
    // across engines does.
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const pts: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const x = 100 + t * 800;
    const y = 400 + Math.sin(t * Math.PI * 2) * 150;
    // ±0.6 px of hand tremor — below the marker's own stroke width, which is
    // exactly the noise RDP is supposed to eat.
    pts.push(x + (rand() - 0.5) * 1.2, y + (rand() - 0.5) * 1.2);
  }
  return pts;
}

/** Shortest distance from a point to a flat-array polyline. */
function distanceToPolyline(px: number, py: number, poly: number[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 3 < poly.length; i += 2) {
    const d = distanceToSegment(
      px,
      py,
      poly[i],
      poly[i + 1],
      poly[i + 2],
      poly[i + 3],
    );
    if (d < best) best = d;
  }
  return best;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
