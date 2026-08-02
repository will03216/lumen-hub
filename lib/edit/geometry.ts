/**
 * Pure geometry for the image editor. No canvas, no Konva, no DOM.
 *
 * WHY THIS IS ITS OWN FILE.
 *
 * The thing that actually burns markup into pixels — composite.ts, a 2D-canvas
 * rasteriser — cannot be meaningfully tested. happy-dom's <canvas> has no
 * rendering backend, so a test could assert that drawing calls were made but
 * never that the right pixels landed. That is a test of the shim, not of the
 * feature. The fix is to leave composite.ts with nothing worth testing: every
 * decision it makes about *where* something goes lives here instead, and this
 * file is exercised properly. composite.ts should read as a sequence of
 * moveTo/lineTo against numbers it did not compute.
 *
 * Everything in here is in IMAGE-INTRINSIC PIXELS, the same space as the
 * stored annotations (see the invariant at the top of types.ts). Nothing in
 * this module knows about stage transform, zoom, or the contain-fit. If a
 * function here ever needs a scale factor, something upstream has leaked
 * display coordinates into the store and that is the bug to fix.
 *
 * Two of these carry real consequences beyond "the drawing looks right":
 *
 * · simplifyStroke is a storage-quota measure. Sessions live in localStorage
 *   under a ~5 MB budget shared with the library, story projects, and studio
 *   projects. A raw 60 Hz capture of a two-second stroke is ~120 points ≈
 *   several KB of JSON once serialised as floats; RDP-simplified and rounded
 *   to integers it is a small fraction of that. Twenty strokes per reference
 *   is the difference between a session that saves and a QuotaExceededError
 *   over a mask someone spent five minutes painting.
 *
 * · colorName feeds prose, not rendering. Raster markup is described to the
 *   model in words ("2 painted mask areas in magenta … do not reproduce the
 *   magenta markup"). If the word doesn't match what the model sees, that
 *   instruction is worse than useless — it points at something that isn't
 *   there and leaves the real markup unclaimed.
 */

import type { Rect, Vec } from "./types";

// ─────────────────────────── Rects ────────────────────────────────────────

/**
 * Rect with non-negative w/h. Dragging up-and-left produces negative extents;
 * everything downstream — bounds tests, the <bbox> tag, hit-testing, the
 * Transformer handles — assumes normalized.
 */
export function normalizeRect(r: Rect): Rect {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

/**
 * Axis-aligned bounds of a flat point array, padded by half the stroke width
 * so the bounds actually contain the drawn pixels.
 *
 * The padding is not cosmetic: these bounds are what decides whether a stroke
 * needs to be composited at all and how much of the plate to redraw. Bounds
 * taken from the centreline alone are short by width/2 on every side, which
 * on a 40 px marker clips the outer 20 px of the mask — precisely the edge
 * the model is being asked to respect. Round joins and caps mean the drawn
 * shape never exceeds centreline + width/2, so half-width is exact rather
 * than generous.
 *
 * An empty (or single-coordinate) array yields a zero rect at the origin,
 * which every consumer treats as "nothing to draw".
 */
export function strokeBounds(points: number[], width: number): Rect {
  const pad = Math.max(0, width) / 2;
  if (points.length < 2) return { x: 0, y: 0, w: 0, h: 0 };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  // Step by 2 and ignore any trailing orphan coordinate — same tolerance as
  // simplifyStroke, for the same reason.
  const n = points.length - (points.length % 2);
  for (let i = 0; i < n; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
}

// ─────────────────────────── Strokes ──────────────────────────────────────

/**
 * Default RDP tolerance, in image pixels.
 *
 * 1.5 px is chosen against the *stroke width*, not against the display. The
 * thinnest usable marker is on the order of 8 px and the default is several
 * times that, so a 1.5 px lateral deviation is buried well inside the drawn
 * band — invisible at 1:1 and still invisible at the 2–3x zoom the canvas
 * allows before the source image's own pixels are the limiting factor.
 * Meanwhile it removes the overwhelming majority of a 60 Hz capture, where
 * consecutive samples of an ordinary hand movement are a pixel or two apart.
 * Larger values (4–5 px) start visibly cutting corners on tight scribbles;
 * smaller ones (0.5 px) barely beat integer rounding.
 */
export const DEFAULT_SIMPLIFY_EPSILON = 1.5;

/**
 * Ramer–Douglas–Peucker simplification of a flat [x0,y0,x1,y1,…] array.
 * Returns a flat array in the same format.
 *
 * A genuine RDP: perpendicular distance to the chord, recursive split at the
 * farthest point. Not a decimation ("keep every third sample") — decimation
 * discards corners, which on a mask outline is exactly the information worth
 * keeping, and keeps redundant points along straight runs, which is exactly
 * the information worth discarding.
 *
 * Implementation note: the split works over *indices* into the original array
 * and marks survivors in a Uint8Array, rather than slicing and concatenating
 * sub-arrays at every level. Slicing makes the common case —
 * a long stroke that simplifies well — do O(n) copying per level, and the
 * whole point of this function is that it is cheap enough to run on every
 * pointerup without anyone noticing.
 *
 * Edge cases:
 * · Fewer than 3 points: returned as a copy, unchanged. There is nothing
 *   between the endpoints to drop, and the copy keeps the contract "the
 *   result is never the caller's own array" so a caller can't accidentally
 *   alias a stored annotation's points.
 * · ODD-LENGTH INPUT is malformed — a lone x with no y is not a point. We
 *   drop the trailing coordinate rather than throwing or inventing a y. This
 *   only ever arises from a truncated write or hand-edited localStorage, and
 *   in that situation losing the last half-sample of a stroke is strictly
 *   better than refusing to load the session.
 * · A degenerate chord (start point equal to end point, i.e. a closed loop or
 *   a stroke that never moved) has no well-defined perpendicular; the
 *   cross-product form divides by zero and yields NaN, which compares false
 *   against epsilon and silently collapses the whole run to two points. We
 *   fall back to plain point-to-point distance from the shared endpoint,
 *   which is the correct measure for a loop.
 */
export function simplifyStroke(
  points: number[],
  epsilon: number = DEFAULT_SIMPLIFY_EPSILON,
): number[] {
  // Malformed odd-length input: drop the orphan coordinate. See docblock.
  const n = points.length - (points.length % 2);
  const count = n / 2;

  if (count < 3) return points.slice(0, n);
  // A non-positive (or NaN) epsilon means "don't simplify". At exactly 0 RDP
  // would still drop perfectly collinear points, but a caller passing 0 is
  // asking to keep their samples, not to make a floating-point collinearity
  // judgement — so honour the intent and return them.
  if (!(epsilon > 0)) return points.slice(0, n);

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;

  // Explicit stack instead of recursion: a pathological stroke (every point a
  // corner) recurses to depth n, and n is unbounded — the user decides how
  // long a stroke is, not us.
  const stack: number[] = [0, count - 1];
  while (stack.length > 0) {
    const last = stack.pop()!;
    const first = stack.pop()!;
    if (last - first < 2) continue;

    const ax = points[first * 2];
    const ay = points[first * 2 + 1];
    const bx = points[last * 2];
    const by = points[last * 2 + 1];

    const dx = bx - ax;
    const dy = by - ay;
    const chordLen = Math.hypot(dx, dy);
    const degenerate = chordLen === 0;

    let maxDist = -1;
    let maxIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const px = points[i * 2];
      const py = points[i * 2 + 1];
      // Twice the triangle area over the base length is the perpendicular
      // distance; for a degenerate chord the "base" is a point, so radial
      // distance is the right measure and division by zero is avoided.
      const dist = degenerate
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dx * (ay - py) - (ax - px) * dy) / chordLen;
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > epsilon && maxIndex > first) {
      keep[maxIndex] = 1;
      stack.push(first, maxIndex, maxIndex, last);
    }
  }

  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
  }
  return out;
}

/**
 * Round every coordinate in a flat array to an integer.
 *
 * Applied after simplification, on gesture end. Sub-pixel precision on a
 * hand-drawn marker stroke is noise, and it is expensive noise: "1023.7291"
 * is 9 bytes of JSON where "1024" is 4. Across a few hundred surviving points
 * per session that is the difference between comfortably inside the quota and
 * not. An odd-length input is truncated to whole pairs, as elsewhere.
 */
export function roundPoints(points: number[]): number[] {
  const n = points.length - (points.length % 2);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(points[i]);
  return out;
}

// ─────────────────────────── Arrows ───────────────────────────────────────

/**
 * Arrowhead barb length, image pixels.
 *
 * Fixed rather than proportional to the shaft: a short "nudge this 30 px left"
 * arrow with a proportionally tiny head is unreadable both to the user and in
 * the composited image the model receives, and the head is the part that
 * carries the direction. 24 px reads clearly against a 2K plate without
 * swallowing a short shaft whole.
 */
export const DEFAULT_ARROW_HEAD_LENGTH = 24;

/**
 * Half-angle between the shaft and each barb: π/7 ≈ 25.7°.
 *
 * Wide enough to read as an arrowhead at a glance and after JPEG compression;
 * narrow enough that the head stays a head rather than becoming a chevron
 * competing with the user's own image content. The classic 30° looks blunt at
 * this length; below ~20° the barbs disappear into the shaft.
 */
export const DEFAULT_ARROW_HEAD_ANGLE = Math.PI / 7;

/**
 * The two barb endpoints of an arrowhead at `to`, for a shaft coming from
 * `from`. Returns [leftBarb, rightBarb].
 *
 * Both barbs sit exactly `headLength` from `to`, mirrored about the shaft
 * axis at ±`headAngleRad` from the *reverse* shaft direction — they point
 * back along the shaft, as an arrowhead does.
 *
 * "Left" and "right" are relative to the direction of travel in screen space
 * (y grows downward), so left is the barb on the -angle side. Callers only
 * ever draw both, so the labelling matters for tests, not rendering.
 *
 * A zero-length shaft (`from` equals `to`) has no direction — atan2(0,0) is 0
 * in JS rather than NaN, but relying on that is a trap, so the case is handled
 * explicitly and the head is drawn pointing along +x. This happens for real:
 * a click that registers as a drag of zero distance creates such an arrow, and
 * a NaN barb poisons the composite (canvas silently draws nothing) and the
 * stored session (JSON.stringify turns it into null).
 */
export function arrowHeadPoints(
  from: Vec,
  to: Vec,
  headLength: number = DEFAULT_ARROW_HEAD_LENGTH,
  headAngleRad: number = DEFAULT_ARROW_HEAD_ANGLE,
): [Vec, Vec] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Direction the head points *back* along. Degenerate shaft → +x, an
  // arbitrary but finite and stable choice.
  const back = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx) + Math.PI;

  return [
    {
      x: to.x + headLength * Math.cos(back - headAngleRad),
      y: to.y + headLength * Math.sin(back - headAngleRad),
    },
    {
      x: to.x + headLength * Math.cos(back + headAngleRad),
      y: to.y + headLength * Math.sin(back + headAngleRad),
    },
  ];
}

/** Euclidean distance. */
export function distance(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// ─────────────────────────── Colour naming ────────────────────────────────

/**
 * The palette colourNames can produce.
 *
 * Deliberately small. These are names for marker colours the UI itself
 * offers — saturated, well-separated, chosen to be absent from ordinary
 * photography — not a general colour vocabulary. Eleven buckets is enough
 * that the swatch picker's every entry lands on a distinct word, and small
 * enough that the word is one the model unambiguously understands. Adding
 * "teal" and "lime" would make the prose more precise and the model's job
 * harder.
 *
 * MARKER_COLOR (#FF00E5) is here verbatim so the default marker names itself
 * exactly, with zero distance, rather than through a near-miss.
 */
const PALETTE: Array<{ name: string; r: number; g: number; b: number }> = [
  { name: "magenta", r: 0xff, g: 0x00, b: 0xe5 },
  { name: "red", r: 0xe0, g: 0x1b, b: 0x24 },
  { name: "orange", r: 0xff, g: 0x8c, b: 0x00 },
  { name: "yellow", r: 0xff, g: 0xe0, b: 0x1e },
  { name: "green", r: 0x1d, g: 0xb9, b: 0x54 },
  { name: "cyan", r: 0x00, g: 0xe5, b: 0xff },
  { name: "blue", r: 0x18, g: 0x5a, b: 0xdb },
  { name: "purple", r: 0x8b, g: 0x2b, b: 0xe2 },
  { name: "white", r: 0xff, g: 0xff, b: 0xff },
  { name: "black", r: 0x10, g: 0x10, b: 0x10 },
  { name: "grey", r: 0x80, g: 0x80, b: 0x80 },
];

/** What an unparseable hex names itself. The prose template always needs a
 *  colour word, so there is no "unknown" to return; grey is the option that
 *  makes the weakest claim about pixels nobody has measured. */
const FALLBACK_COLOR_NAME = "grey";

/**
 * Nearest human colour name for a hex string — used to describe hand-drawn
 * markup in prose to the image model ("2 painted mask areas in magenta").
 * Handles #RGB and #RRGGBB, with or without the leading #.
 *
 * Nearest-neighbour by plain Euclidean distance in RGB. That is perceptually
 * crude — RGB distance badly under-weights green and treats a light/dark pair
 * as further apart than two hues a human would call different colours — and
 * it is entirely adequate here. The inputs are not arbitrary photographic
 * colours; they are a handful of deliberately saturated marker colours sitting
 * near the corners of the cube, where every reasonable metric agrees. Reaching
 * for CIELAB and a ΔE2000 implementation to name eleven buckets would be
 * solving a colour-science problem this feature does not have.
 */
export function colorName(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return FALLBACK_COLOR_NAME;

  let best = FALLBACK_COLOR_NAME;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const entry of PALETTE) {
    // Squared distance — monotonic in distance, so the sqrt buys nothing.
    const d =
      (rgb.r - entry.r) ** 2 + (rgb.g - entry.g) ** 2 + (rgb.b - entry.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = entry.name;
    }
  }
  return best;
}

/** #RGB / #RRGGBB, hash optional, case-insensitive. Anything else → null;
 *  callers of colorName never see a throw, because a bad stored swatch must
 *  not be able to block a render. */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, "");

  if (/^[0-9a-f]{3}$/i.test(raw)) {
    // Shorthand expands by digit duplication, not by <<4 — "f" is 0xff, not
    // 0xf0, which is what makes #fff pure white.
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    };
  }

  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }

  return null;
}
