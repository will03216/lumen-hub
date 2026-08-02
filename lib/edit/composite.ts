"use client";

/**
 * Burning brush and arrow markup into a copy of the image.
 *
 * Point and box annotations travel to Seedream as text tags in the prompt.
 * Brush and arrow have no tag equivalent anywhere in the contract, so the
 * only way to communicate them is to draw them into the pixels and describe
 * them in prose — which is exactly what BytePlus's own product does.
 *
 * ── Why a plain 2D canvas and not stage.toDataURL() ──────────────────────
 *
 * Exporting the live Konva stage would be less code and wrong. The live stage
 * is zoomed, panned, letterboxed, rendered at device pixel ratio, and carries
 * UI-only nodes (labels, selection highlight, the draft layer). None of that
 * belongs in an image sent to a model. Rendering fresh at intrinsic size also
 * keeps Konva a pure view layer, so the composite doesn't change when someone
 * adjusts how the canvas *looks*.
 *
 * ── Why this file has no tests ────────────────────────────────────────────
 *
 * Deliberate. Every decision worth asserting — stroke simplification,
 * arrowhead geometry, rect normalization, colour naming — lives in
 * lib/edit/geometry.ts and is tested there. What remains here is calls into a
 * canvas 2D context, which happy-dom does not implement. A test would assert
 * that we called a stub, which is worth nothing.
 */

import {
  DEFAULT_ARROW_HEAD_ANGLE,
  DEFAULT_ARROW_HEAD_LENGTH,
  arrowHeadPoints,
  normalizeRect,
} from "./geometry";
import type {
  Annotation,
  ArrowAnnotation,
  BoxAnnotation,
  BrushAnnotation,
} from "./types";

export type CompositeOpts = {
  /** A canvas-safe URL — see lib/edit/same-origin.ts. Passing a raw
   *  cross-origin URL here taints the canvas and toDataURL throws. */
  url: string;
  crossOrigin: boolean;
  /** Intrinsic dimensions of the source image. */
  width: number;
  height: number;
  /** Only brush and arrow are drawn; anything else is ignored, so callers can
   *  hand over the whole annotation list without filtering. */
  annotations: Annotation[];
  /** Downscale so the encoded result stays under the model's input ceiling.
   *  A 6000×4000 composite base64s to well over 10 MB. */
  maxPixels?: number;
  /**
   * Also draw BOX annotations, as red outlines.
   *
   * Off by default because boxes normally travel as `<bbox>` coordinate tags
   * with the image left clean — burning them in as well would show the model
   * markup it is also being given numerically. Layer separation's region mode
   * is the exception: its documented prompt is literally "separate the
   * element inside the red box", so there the rectangle has to be visible.
   */
  drawBoxes?: boolean;
  mimeType?: "image/jpeg" | "image/png";
  quality?: number;
};

export type CompositeResult = {
  dataUrl: string;
  width: number;
  height: number;
};

export async function renderComposite(
  opts: CompositeOpts,
): Promise<CompositeResult> {
  const img = await loadImage(opts.url, opts.crossOrigin);

  const srcW = opts.width || img.naturalWidth;
  const srcH = opts.height || img.naturalHeight;

  // One scale factor for both the bitmap and the overlay geometry. Scaling
  // them independently is how markup drifts off the thing it was marking.
  const scale = fitScale(srcW, srcH, opts.maxPixels);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D drawing context.");

  ctx.drawImage(img, 0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const a of opts.annotations) {
    if (a.hidden) continue;
    if (a.kind === "brush") drawBrush(ctx, a, scale);
    else if (a.kind === "arrow") drawArrow(ctx, a, scale);
    else if (a.kind === "box" && opts.drawBoxes) drawBox(ctx, a, scale);
  }

  const mime = opts.mimeType ?? "image/jpeg";
  // toDataURL is where a tainted canvas finally throws. Re-raise with the
  // actual cause, because "SecurityError" on its own sends people looking in
  // entirely the wrong place.
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL(mime, opts.quality ?? 0.92);
  } catch (err) {
    throw new Error(
      "Could not read the annotated image back off the canvas — the source " +
        "image was loaded without CORS permission. It needs to be mirrored " +
        "or proxied to the same origin first. " +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  return { dataUrl, width: w, height: h };
}

// ─────────────────────────── Drawing ──────────────────────────────────────

function drawBrush(
  ctx: CanvasRenderingContext2D,
  a: BrushAnnotation,
  scale: number,
): void {
  if (a.points.length < 4) return;
  ctx.save();
  ctx.strokeStyle = a.color;
  // The stroke width is in image pixels, so it scales with the bitmap.
  ctx.lineWidth = Math.max(1, a.width * scale);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(a.points[0] * scale, a.points[1] * scale);
  for (let i = 2; i + 1 < a.points.length; i += 2) {
    ctx.lineTo(a.points[i] * scale, a.points[i + 1] * scale);
  }
  ctx.stroke();
  ctx.restore();
}

/** Red, because the prompt that reads these says "red box" by name. */
const REGION_BOX_COLOR = "#FF0000";

function drawBox(
  ctx: CanvasRenderingContext2D,
  a: BoxAnnotation,
  scale: number,
): void {
  const r = normalizeRect(a.rect);
  ctx.save();
  ctx.strokeStyle = REGION_BOX_COLOR;
  // Scale the outline with the image so it stays visible after downscaling —
  // a hairline on a 4000px source disappears at vision scale.
  ctx.lineWidth = Math.max(2, (Math.max(ctx.canvas.width, ctx.canvas.height) / 300));
  ctx.strokeRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  a: ArrowAnnotation,
  scale: number,
): void {
  const from = { x: a.from.x * scale, y: a.from.y * scale };
  const to = { x: a.to.x * scale, y: a.to.y * scale };
  const width = Math.max(2, a.width * scale);

  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = width;

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  // Barb geometry comes from the tested helper rather than being re-derived
  // here — this is the whole reason arrowHeadPoints lives in geometry.ts.
  const [left, right] = arrowHeadPoints(
    from,
    to,
    DEFAULT_ARROW_HEAD_LENGTH * scale,
    DEFAULT_ARROW_HEAD_ANGLE,
  );
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─────────────────────────── Helpers ──────────────────────────────────────

function fitScale(w: number, h: number, maxPixels?: number): number {
  if (!maxPixels || w * h <= maxPixels) return 1;
  return Math.sqrt(maxPixels / (w * h));
}

function loadImage(
  url: string,
  crossOrigin: boolean,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    // Must be set BEFORE src, or the attribute is ignored for the load
    // already in flight and the canvas taints anyway.
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Could not load the image to composite onto."));
    img.src = url;
  });
}
