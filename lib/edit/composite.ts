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
  PointAnnotation,
  TextAnnotation,
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
  /**
   * Draw EVERY mark, with its label — the VERIFICATION view, not the wire
   * image.
   *
   * The wire image is deliberately clean for vector marks: they travel as
   * coordinate tags, and painting them as well would show the model markup it
   * is already being told about numerically. This is the opposite job. The
   * agent places a box from a coordinate estimate, is told only "Added Region
   * 01", and has no way to discover it landed 200px off the thing it meant.
   * Rendering its own marks back to it is the only way it can self-correct.
   */
  drawAll?: boolean;
  /**
   * Overlay a labelled coordinate grid, in the same pixel space the caller is
   * working in.
   *
   * Estimating "the cap starts about 700px across" from a bare photograph is
   * the hard part of grounding, and a ruler makes it substantially easier —
   * read the line, not the intention. Verification view only.
   */
  grid?: boolean;
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

  if (opts.grid) drawGrid(ctx, w, h);

  for (const a of opts.annotations) {
    if (a.hidden) continue;
    if (a.kind === "brush") drawBrush(ctx, a, scale);
    else if (a.kind === "arrow") drawArrow(ctx, a, scale);
    else if (a.kind === "box" && (opts.drawBoxes || opts.drawAll)) {
      drawBox(ctx, a, scale, opts.drawAll ? a.color : undefined);
    } else if (a.kind === "point" && opts.drawAll) {
      drawPoint(ctx, a, scale);
    } else if (a.kind === "text") {
      // Only render-mode text is burned into the pixels the model sees. A
      // label is an instruction to us, not content for the picture, and
      // drawing it would put the user's own note permanently into their
      // output. It still appears on the verification image (drawAll), where
      // the point is to show every mark that exists.
      if (a.mode === "render" || opts.drawAll) drawText(ctx, a, scale);
    }
    if (opts.drawAll) drawLabel(ctx, a, scale);
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
  color?: string,
): void {
  const r = normalizeRect(a.rect);
  ctx.save();
  ctx.strokeStyle = color ?? REGION_BOX_COLOR;
  // Scale the outline with the image so it stays visible after downscaling —
  // a hairline on a 4000px source disappears at vision scale.
  ctx.lineWidth = Math.max(2, (Math.max(ctx.canvas.width, ctx.canvas.height) / 300));
  ctx.strokeRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
  ctx.restore();
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  a: PointAnnotation,
  scale: number,
): void {
  const r = Math.max(4, Math.min(ctx.canvas.width, ctx.canvas.height) / 110);
  ctx.save();
  ctx.fillStyle = a.color;
  ctx.strokeStyle = "#0b0b0b";
  ctx.lineWidth = Math.max(1, r / 5);
  ctx.beginPath();
  ctx.arc(a.at.x * scale, a.at.y * scale, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * A text mark, drawn at its anchor in the image's own pixel space.
 *
 * Size is stored in image pixels for exactly this reason: multiplying by
 * `scale` keeps the text the same size relative to the picture no matter what
 * downscale the model's input ceiling forced on us. A size in screen pixels
 * would shrink or grow with the resample, and the text the model was asked to
 * reproduce would arrive at a different size than the user placed.
 *
 * The dark outline is what makes it legible over an arbitrary frame — white
 * text on a white wall is text the model cannot read either.
 */
function drawText(
  ctx: CanvasRenderingContext2D,
  a: TextAnnotation,
  scale: number,
): void {
  const body = a.text.trim();
  if (!body) return;

  const size = Math.max(8, a.size * scale);
  ctx.save();
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = Math.max(1, size * 0.14);
  ctx.strokeText(body, a.at.x * scale, a.at.y * scale);
  ctx.fillStyle = a.color;
  ctx.fillText(body, a.at.x * scale, a.at.y * scale);
  ctx.restore();
}

/** The mark's name, so the model can say "Region 01 is too high" rather than
 *  describing a rectangle. */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  a: Annotation,
  scale: number,
): void {
  const anchor =
    a.kind === "box"
      ? { x: normalizeRect(a.rect).x * scale, y: normalizeRect(a.rect).y * scale }
      : a.kind === "point"
        ? { x: a.at.x * scale + 10, y: a.at.y * scale }
        : a.kind === "arrow"
          ? { x: a.from.x * scale, y: a.from.y * scale }
          : a.kind === "text"
            ? { x: a.at.x * scale, y: a.at.y * scale }
            : { x: a.points[0] * scale, y: a.points[1] * scale };

  const size = Math.max(11, Math.min(ctx.canvas.width, ctx.canvas.height) / 55);
  ctx.save();
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  const pad = size * 0.3;
  const textWidth = ctx.measureText(a.label).width;
  const y = Math.max(size + pad * 2, anchor.y);
  ctx.fillStyle = a.color;
  ctx.fillRect(anchor.x, y - size - pad * 2, textWidth + pad * 2, size + pad * 2);
  ctx.fillStyle = "#0b0b0b";
  ctx.fillText(a.label, anchor.x + pad, y - pad * 1.2);
  ctx.restore();
}

/**
 * A ruler in the coordinate space the caller reads and writes.
 *
 * Labels are canvas pixels, which for the agent's verification image is
 * snapshot space — the same numbers describeSession reports and place_box
 * expects back. Labelling anything else would be a third coordinate system.
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const divisions = 10;
  const size = Math.max(10, Math.min(w, h) / 70);
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.font = `500 ${size}px ui-monospace, monospace`;

  for (let i = 1; i < divisions; i += 1) {
    const x = Math.round((w * i) / divisions);
    const y = Math.round((h * i) / divisions);

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    // Drawn twice — dark under light — so the numbers stay readable over both
    // a white backdrop and a black one.
    for (const [text, tx, ty] of [
      [String(x), x + 3, size + 2],
      [String(y), 3, y - 3],
    ] as const) {
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = 3;
      ctx.strokeText(text, tx, ty);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(text, tx, ty);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
    }
  }
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

/**
 * An `<img>` that neither loads nor errors is the agent's worst failure mode.
 *
 * `onload`/`onerror` are the only two ways out of this promise, and a request
 * that hangs at the network layer fires neither — the browser will sit on it
 * for minutes. Every caller here is awaited: the agent's own snapshot step
 * awaits it before its first turn, so a hung image means `send()` never
 * reaches its `finally`, `busy` is never cleared, and the panel shows
 * "Thinking…" forever with no error and nothing to retry. That is the stuck
 * agent, and it is indistinguishable from a slow model.
 *
 * Well under TURN_TIMEOUT_MS (120s): decoding a 2K frame off the proxy is a
 * few seconds at worst, so anything past this is hung rather than slow.
 */
const IMAGE_LOAD_TIMEOUT_MS = 30_000;

function loadImage(
  url: string,
  crossOrigin: boolean,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (fn: () => void) => {
      if (timer !== undefined) clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      fn();
    };
    // Must be set BEFORE src, or the attribute is ignored for the load
    // already in flight and the canvas taints anyway.
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => settle(() => resolve(img));
    img.onerror = () =>
      settle(() =>
        reject(new Error("Could not load the image to composite onto.")),
      );
    timer = setTimeout(
      () =>
        settle(() => {
          // Drop the in-flight request. Without this the browser keeps
          // decoding into an element nothing is waiting for.
          img.src = "";
          reject(
            new Error(
              `The image did not load within ${Math.round(IMAGE_LOAD_TIMEOUT_MS / 1000)}s. ` +
                "It may be an expired link, or the proxy may not be answering.",
            ),
          );
        }),
      IMAGE_LOAD_TIMEOUT_MS,
    );
    img.src = url;
  });
}
