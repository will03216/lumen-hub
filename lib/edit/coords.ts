/**
 * Coordinate transforms for the editor canvas.
 *
 * THE ONE THING TO UNDERSTAND: the canvas's native coordinate system is
 * image-intrinsic pixels. The Konva `Image` node sits at (0,0) with
 * width=imgW, height=imgH, and BOTH the contain-fit and the user's zoom/pan
 * are applied as the Stage's own scale/x/y. Nothing downstream of the stage
 * transform ever thinks in CSS pixels. That is why `getRelativePointerPosition()`
 * hands back image pixels for free, why every persisted shape in types.ts is
 * in image pixels, and why a shape drawn at 400% zoom lands in exactly the
 * same place when the window is resized.
 *
 * So `stageToImage` is not doing work Konva isn't already doing — it is the
 * pure, testable mirror of the stage transform, used where there is no live
 * stage to ask (compile-time checks, tests, agent-authored marks) and as the
 * thing that proves the transform is invertible. `imageToStage` is the one
 * that genuinely earns its keep: the annotation chips are DOM elements
 * absolutely positioned over the canvas, and DOM has no idea what a Konva
 * transform is. An inverted sign there puts every chip on the wrong side of
 * its mark, and only at non-zero pan — the kind of bug that survives a
 * hand-check at the default view.
 *
 * NORMALIZATION ORDER IS FIXED AND MUST NEVER VARY: image px -> divide by
 * imgW/imgH -> ×1000 -> round -> clamp. Never from stage px. Normalizing
 * downstream of the zoom would mean the coordinates sent to the model changed
 * when the user scrolled the wheel — the render would drift from the marks
 * for reasons nothing in the UI could explain, and the compiled-prompt
 * disclosure would show a number nobody could account for.
 *
 * LETTERBOXING IS WHY THERE ARE TWO OUT-OF-BOUNDS PRIMITIVES. A contain-fit
 * leaves dead bands on two sides, and a click there is a real click that
 * yields a negative (or past-the-edge) image coordinate. `isInsideImage` and
 * `clampToImage` exist so callers can pick per gesture: a *point* dropped in
 * a dead band is rejected, because silently clamping it snaps a mark onto the
 * image edge where the user did not put it and reads as a bug; a *box* drag
 * that leaves the image is clamped, because the user's intent — "everything
 * out to the edge" — is unambiguous and refusing it would be the annoying
 * behaviour. Policy lives in the gesture handlers, not here.
 *
 * DEGENERATE INPUT NEVER THROWS AND NEVER PRODUCES NaN. A 0×0 stage is normal
 * on first mount, for the frame between render and the ResizeObserver firing,
 * and an unmeasured ref has width/height 0 until its image loads. Both would
 * divide by zero. Every entry point falls back to an identity-ish transform
 * (scale 1, no offset) instead: the frame renders in the wrong place for one
 * tick and then corrects itself, which is invisible. NaN coordinates are not
 * invisible — they propagate into stored annotations, survive a JSON
 * round-trip as `null`, and corrupt the session.
 */

import type { Rect, Vec } from "./types";

/** The coordinate space the model expects: integers 0..1000 on both axes. */
const NORM_MAX = 1000;

export type Viewport = {
  stageW: number; // Konva Stage size in CSS px
  stageH: number;
  imgW: number; // image intrinsic px
  imgH: number;
  scale: number; // user zoom multiplier, on top of the contain-fit
  offsetX: number; // user pan, in stage px
  offsetY: number;
};

/**
 * The contain-fit scale and letterbox offsets at zoom 1 — i.e. what
 * `object-fit: contain` would do, expressed as numbers we can invert.
 *
 * Falls back to `{ scale: 1, dx: 0, dy: 0 }` for any non-positive or
 * non-finite dimension rather than throwing. See the degenerate-input note
 * at the top of the file.
 */
export function fitContain(
  stageW: number,
  stageH: number,
  imgW: number,
  imgH: number,
): { scale: number; dx: number; dy: number } {
  if (
    !positive(stageW) ||
    !positive(stageH) ||
    !positive(imgW) ||
    !positive(imgH)
  ) {
    return IDENTITY_FIT;
  }

  const scale = Math.min(stageW / imgW, stageH / imgH);
  if (!positive(scale)) return IDENTITY_FIT;

  // Centre the shorter axis; the other one comes out at exactly 0.
  return {
    scale,
    dx: (stageW - imgW * scale) / 2,
    dy: (stageH - imgH * scale) / 2,
  };
}

const IDENTITY_FIT = { scale: 1, dx: 0, dy: 0 } as const;

/** Stage px -> image px. */
export function stageToImage(pt: Vec, vp: Viewport): Vec {
  const { eff, tx, ty } = resolve(vp);
  return {
    x: (num(pt.x) - tx) / eff,
    y: (num(pt.y) - ty) / eff,
  };
}

/** Image px -> stage px. Exact inverse of stageToImage. */
export function imageToStage(pt: Vec, vp: Viewport): Vec {
  const { eff, tx, ty } = resolve(vp);
  return {
    x: num(pt.x) * eff + tx,
    y: num(pt.y) * eff + ty,
  };
}

/**
 * Image px -> integer 0..1000, clamped.
 *
 * The fixed order — divide, scale, round, clamp — is the contract, not an
 * implementation detail. Rounding before the clamp means the far edge lands
 * on exactly 1000 rather than 999-point-something.
 */
export function imageToNorm(
  pt: Vec,
  imgW: number,
  imgH: number,
): [number, number] {
  return [normAxis(pt.x, imgW), normAxis(pt.y, imgH)];
}

/**
 * Image-px rect -> [x1,y1,x2,y2] as integers 0..1000, ordered.
 *
 * Ordering happens in image px, before normalization: a drag up-and-left
 * produces negative w/h, and an un-ordered box reaches the model as a
 * reversed bbox tag, which it either ignores or interprets as a different
 * region entirely. Rounding is monotonic, so ordering survives it.
 */
export function rectToNorm(
  r: Rect,
  imgW: number,
  imgH: number,
): [number, number, number, number] {
  const x = num(r.x);
  const y = num(r.y);
  const w = num(r.w);
  const h = num(r.h);

  const topLeft = { x: Math.min(x, x + w), y: Math.min(y, y + h) };
  const bottomRight = { x: Math.max(x, x + w), y: Math.max(y, y + h) };

  const [x1, y1] = imageToNorm(topLeft, imgW, imgH);
  const [x2, y2] = imageToNorm(bottomRight, imgW, imgH);
  return [x1, y1, x2, y2];
}

/**
 * Is this image-px point actually on the image (not in a letterbox band)?
 * Boundary-inclusive: a click on the last row of pixels is on the image.
 * An unmeasured image (0 or non-finite dims) has no inside.
 */
export function isInsideImage(pt: Vec, imgW: number, imgH: number): boolean {
  if (!positive(imgW) || !positive(imgH)) return false;
  if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return false;
  return pt.x >= 0 && pt.x <= imgW && pt.y >= 0 && pt.y <= imgH;
}

/** Clamp an image-px point into the image bounds. */
export function clampToImage(pt: Vec, imgW: number, imgH: number): Vec {
  return {
    x: clampAxis(num(pt.x), imgW),
    y: clampAxis(num(pt.y), imgH),
  };
}

// ─────────────────────────── Internals ────────────────────────────────────

/**
 * The single place the stage transform is assembled, so the forward and
 * inverse mappings cannot drift apart: `stage = image * eff + t`.
 */
function resolve(vp: Viewport): { eff: number; tx: number; ty: number } {
  const fit = fitContain(vp.stageW, vp.stageH, vp.imgW, vp.imgH);
  const zoom = positive(vp.scale) ? vp.scale : 1;
  const eff = fit.scale * zoom;
  return {
    // fit.scale is guaranteed positive-finite and zoom is guarded, so this
    // can only fail on an overflow to Infinity — still worth not dividing by.
    eff: positive(eff) ? eff : 1,
    tx: fit.dx + num(vp.offsetX),
    ty: fit.dy + num(vp.offsetY),
  };
}

function normAxis(v: number, extent: number): number {
  // A zero-extent axis has no meaningful normalization; the origin is the
  // least misleading answer, and it keeps the result an integer in range.
  if (!positive(extent) || !Number.isFinite(v)) return 0;
  return clamp(Math.round((v / extent) * NORM_MAX), 0, NORM_MAX);
}

function clampAxis(v: number, extent: number): number {
  if (!positive(extent)) return 0;
  return clamp(v, 0, extent);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function positive(v: number): boolean {
  return Number.isFinite(v) && v > 0;
}

/** Non-finite coordinates become 0 rather than poisoning the arithmetic. */
function num(v: number): number {
  return Number.isFinite(v) ? v : 0;
}
