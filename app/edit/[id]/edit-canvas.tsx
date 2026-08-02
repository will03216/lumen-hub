"use client";

/**
 * The annotation canvas. THE ONLY FILE IN THE REPO THAT IMPORTS react-konva.
 *
 * Reached exclusively through canvas-loader.tsx, which see for why that
 * matters (konva's Node entry pulls a native module we don't install).
 *
 * ── The one decision everything else follows from ────────────────────────
 *
 * Image-intrinsic pixels are this canvas's native coordinate system. The
 * <Image> node sits at (0,0) with width/height equal to the image's real
 * dimensions, and BOTH the contain-fit and the user's zoom/pan are applied to
 * the *Stage's* own scale/x/y. Consequences, all of them wanted:
 *
 *   · stage.getRelativePointerPosition() returns image pixels directly, so
 *     there is no per-shape coordinate math anywhere in this file.
 *   · Shapes are authored, stored, hit-tested, and normalized in one space.
 *   · Zooming cannot change what gets sent upstream. If shapes were stored in
 *     stage pixels, a zoom between drawing and rendering would silently move
 *     every annotation — a bug that looks like model imprecision.
 *
 * ── Pointer-move discipline ──────────────────────────────────────────────
 *
 * An in-progress brush stroke never enters React state. Points accumulate in
 * a ref and the draft Konva node is mutated imperatively with batchDraw();
 * React learns about the stroke exactly once, on pointerup. Calling setState
 * per pointermove re-reconciles the whole tree at pointer rate, which is the
 * classic react-konva performance cliff — and it would also write to
 * localStorage at 60 Hz through the store.
 */

import * as React from "react";
import Konva from "konva";
import {
  Arrow,
  Circle,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  DEFAULT_SIMPLIFY_EPSILON,
  normalizeRect,
  roundPoints,
  simplifyStroke,
} from "@/lib/edit/geometry";
import { clampToImage, fitContain, isInsideImage } from "@/lib/edit/coords";
import { resolveSafeUrl } from "@/lib/edit/same-origin";
// DraftAnnotation is defined next to buildAnnotation rather than here, so the
// canvas and the agent tooling that lands later both produce marks through
// one shape and one labelling path.
import type { DraftAnnotation } from "@/lib/edit/annotations";
import {
  MARKER_COLOR,
  type Annotation,
  type EditReference,
  type Vec,
} from "@/lib/edit/types";

export type EditTool = "point" | "box" | "brush" | "arrow" | "pan";

export type EditCanvasProps = {
  reference: EditReference;
  annotations: Annotation[];
  tool: EditTool;
  brushWidth: number;
  color: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Fired once per completed gesture. The parent assigns id/label/createdAt,
   *  because labelling depends on what is already on the reference. */
  onCommit: (draft: DraftAnnotation) => void;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
/** A drag shorter than this is a click, not a box/arrow. In image px. */
const MIN_DRAG_PX = 3;

export default function EditCanvas({
  reference,
  annotations,
  tool,
  brushWidth,
  color,
  selectedId,
  onSelect,
  onCommit,
}: EditCanvasProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<Konva.Stage>(null);
  const draftLayerRef = React.useRef<Konva.Layer>(null);
  const draftLineRef = React.useRef<Konva.Line>(null);
  const draftRectRef = React.useRef<Konva.Rect>(null);
  const draftArrowRef = React.useRef<Konva.Arrow>(null);

  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });

  // Gesture state lives in refs, never state — see the pointer-move note.
  const drawingRef = React.useRef(false);
  const startRef = React.useRef<Vec | null>(null);
  const pointsRef = React.useRef<number[]>([]);

  const { width: imgW, height: imgH } = reference;

  // ── Stage sizing ────────────────────────────────────────────────────────
  // Konva needs explicit pixel dimensions; CSS percentages do nothing. Render
  // nothing until measured — mounting a 0x0 stage and resizing it causes a
  // visible thrash and wastes a hit-graph build on first paint.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Image loading ───────────────────────────────────────────────────────
  //
  // Routed through resolveSafeUrl rather than loading reference.url raw. That
  // matters at *display* time, not just when compositing: a BytePlus CDN URL
  // sends no CORS header, so unconditionally setting crossOrigin made the
  // first load fail every single time and only the fallback below ever
  // rendered — a guaranteed double fetch on the main entry point.
  //
  // The fallback is still here for the hosts we cannot proxy (the media proxy
  // is allow-listed to the BytePlus CDN family and 403s everything else). In
  // that case the image displays but the canvas is tainted, so brush/arrow
  // compositing will fail later with a message that says so.
  React.useEffect(() => {
    let cancelled = false;
    const plan = resolveSafeUrl(reference.safeUrl ?? reference.url);
    setLoadError(null);

    const accept = (el: HTMLImageElement) => {
      if (cancelled) return;
      setImg(el);
      setLoadError(null);
    };

    const el = new window.Image();
    if (plan.crossOrigin) el.crossOrigin = "anonymous";
    el.onload = () => accept(el);
    el.onerror = () => {
      if (cancelled) return;
      if (!plan.crossOrigin) {
        // No CORS was requested, so there is nothing to retry — the URL is
        // simply dead. Say so instead of leaving a blank canvas.
        setLoadError("Could not load this image. It may have been moved or expired.");
        return;
      }
      const plain = new window.Image();
      plain.onload = () => accept(plain);
      plain.onerror = () => {
        if (!cancelled) {
          setLoadError(
            "Could not load this image. It may have been moved or expired.",
          );
        }
      };
      plain.src = plan.url;
    };
    el.src = plan.url;

    return () => {
      cancelled = true;
    };
  }, [reference.url, reference.safeUrl]);

  // Reset the camera when the underlying image changes — keeping a zoom from
  // a differently-sized image leaves the user looking at empty space.
  React.useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [reference.id]);

  // Abandon any half-finished gesture when the tool changes. Without this,
  // switching tools mid-drag leaves pointsRef populated from the old gesture,
  // and the next brush stroke reads points[-2]/[-1] against a stale array —
  // NaN into the decimation check. Currently unreachable (the rail is
  // click-driven), and live the day a keyboard shortcut is added.
  React.useEffect(() => {
    drawingRef.current = false;
    startRef.current = null;
    pointsRef.current = [];
    draftLineRef.current?.visible(false);
    draftRectRef.current?.visible(false);
    draftArrowRef.current?.visible(false);
    draftLayerRef.current?.batchDraw();
  }, [tool]);

  const fit = fitContain(size.w, size.h, imgW, imgH);
  const eff = fit.scale * zoom;
  const tx = fit.dx + pan.x;
  const ty = fit.dy + pan.y;

  // ── Gestures ────────────────────────────────────────────────────────────

  function pointer(): Vec | null {
    const stage = stageRef.current;
    if (!stage) return null;
    // Because the Stage carries the whole transform, this is already in
    // image pixels. That is the entire point of the arrangement.
    const p = stage.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }

  function onPointerDown(e: KonvaEventObject<PointerEvent>) {
    if (tool === "pan") return;
    const p = pointer();
    if (!p) return;

    // The base image sits in a listening={false} layer, so a click on the
    // picture itself reports the Stage as its target; only a committed
    // annotation reports a shape.
    const onEmptyCanvas = e.target === e.target.getStage();
    if (onEmptyCanvas) onSelect(null);

    if (tool === "point") {
      // Clicking an existing mark should select it, not stack a new point on
      // top of it. Its own onClick does the selecting; we just stay out of
      // the way. Without this, the point tool cannot select anything — it
      // creates a mark first and the shape's handler then reassigns the
      // selection to the older one, so the new mark appears unselected.
      if (!onEmptyCanvas) return;
      // Reject rather than clamp. A click in a letterbox band that silently
      // snapped to the image edge would look like a misplaced mark, not a
      // missed one — and the user gets no signal they aimed outside.
      if (!isInsideImage(p, imgW, imgH)) return;
      onCommit({ kind: "point", at: { x: Math.round(p.x), y: Math.round(p.y) } });
      return;
    }

    drawingRef.current = true;
    startRef.current = clampToImage(p, imgW, imgH);

    if (tool === "brush") {
      const s = startRef.current;
      pointsRef.current = [s.x, s.y];
      draftLineRef.current?.points(pointsRef.current);
      draftLineRef.current?.visible(true);
      draftLayerRef.current?.batchDraw();
    }
  }

  function onPointerMove() {
    if (!drawingRef.current || !startRef.current) return;
    const raw = pointer();
    if (!raw) return;
    // Clamp during a drag, unlike a point click: dragging past the edge
    // should still produce a valid edge-aligned box rather than nothing.
    const p = clampToImage(raw, imgW, imgH);
    const s = startRef.current;

    if (tool === "brush") {
      // Cheap decimation during capture; the accurate RDP pass runs on
      // pointerup. Two stages because a per-sample RDP would be quadratic.
      const n = pointsRef.current.length;
      const dx = p.x - pointsRef.current[n - 2];
      const dy = p.y - pointsRef.current[n - 1];
      if (dx * dx + dy * dy < 4) return;
      pointsRef.current.push(p.x, p.y);
      draftLineRef.current?.points(pointsRef.current);
    } else if (tool === "box") {
      const r = normalizeRect({ x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y });
      draftRectRef.current?.setAttrs({ ...r, visible: true });
    } else if (tool === "arrow") {
      draftArrowRef.current?.points([s.x, s.y, p.x, p.y]);
      draftArrowRef.current?.visible(true);
    }
    draftLayerRef.current?.batchDraw();
  }

  function onPointerUp() {
    if (!drawingRef.current || !startRef.current) return;
    const raw = pointer();
    const s = startRef.current;
    const p = raw ? clampToImage(raw, imgW, imgH) : s;

    drawingRef.current = false;
    startRef.current = null;

    if (tool === "brush") {
      const pts = roundPoints(
        simplifyStroke(pointsRef.current, DEFAULT_SIMPLIFY_EPSILON),
      );
      pointsRef.current = [];
      draftLineRef.current?.visible(false);
      draftLayerRef.current?.batchDraw();
      // A tap with the brush leaves a single point, which draws nothing and
      // compiles to nothing. Drop it rather than storing an invisible mark.
      if (pts.length >= 4) {
        onCommit({ kind: "brush", points: pts, width: brushWidth });
      }
      return;
    }

    const far =
      Math.abs(p.x - s.x) >= MIN_DRAG_PX || Math.abs(p.y - s.y) >= MIN_DRAG_PX;

    if (tool === "box") {
      draftRectRef.current?.visible(false);
      draftLayerRef.current?.batchDraw();
      if (!far) return; // a click, not a drag
      const r = normalizeRect({ x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y });
      onCommit({
        kind: "box",
        rect: {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.w),
          h: Math.round(r.h),
        },
      });
    } else if (tool === "arrow") {
      draftArrowRef.current?.visible(false);
      draftLayerRef.current?.batchDraw();
      if (!far) return;
      onCommit({
        kind: "arrow",
        from: { x: Math.round(s.x), y: Math.round(s.y) },
        to: { x: Math.round(p.x), y: Math.round(p.y) },
        width: brushWidth,
      });
    }
  }

  function onWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const ptr = stage.getPointerPosition();
    if (!ptr) return;

    const next = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, zoom * (e.evt.deltaY > 0 ? 0.9 : 1.1)),
    );
    if (next === zoom) return;

    // Keep the point under the cursor fixed: convert it to image space at the
    // old scale, then solve for the pan that puts it back under the cursor at
    // the new one. Zooming to the stage centre instead makes precise work
    // near an edge impossible.
    const imgPt = {
      x: (ptr.x - tx) / eff,
      y: (ptr.y - ty) / eff,
    };
    const nextEff = fit.scale * next;
    setPan({
      x: ptr.x - imgPt.x * nextEff - fit.dx,
      y: ptr.y - imgPt.y * nextEff - fit.dy,
    });
    setZoom(next);
  }

  if (size.w === 0 || size.h === 0 || !img) {
    return (
      <div ref={wrapRef} className="size-full">
        <div className="flex size-full items-center justify-center px-6 text-center">
          {loadError ? (
            <span className="max-w-[320px] text-[13px] leading-relaxed text-[oklch(0.72_0.22_15)]">
              {loadError}
            </span>
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute">
              {img ? "Measuring…" : "Loading image…"}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="size-full"
      style={{ cursor: tool === "pan" ? "grab" : "crosshair" }}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={eff}
        scaleY={eff}
        x={tx}
        y={ty}
        draggable={tool === "pan"}
        onDragEnd={(e) => {
          // Konva writes the drag straight onto the Stage; fold it back into
          // our own pan so the transform stays derived from one source.
          setPan({ x: e.target.x() - fit.dx, y: e.target.y() - fit.dy });
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Base plate. listening={false} skips this subtree during hit-graph
            generation, which is most of the pixels on screen. */}
        <Layer listening={false}>
          <KonvaImage image={img} width={imgW} height={imgH} />
        </Layer>

        {/* Committed annotations. */}
        <Layer>
          {annotations
            .filter((a) => !a.hidden)
            .map((a) => (
              <AnnotationShape
                key={a.id}
                annotation={a}
                selected={a.id === selectedId}
                scale={eff}
                onSelect={onSelect}
              />
            ))}
        </Layer>

        {/* Draft layer — mutated imperatively during a gesture, never via
            React state. listening={false} because a half-drawn shape must
            not intercept the pointer events that are still drawing it. */}
        <Layer ref={draftLayerRef} listening={false}>
          <Line
            ref={draftLineRef}
            visible={false}
            stroke={color}
            strokeWidth={brushWidth}
            lineCap="round"
            lineJoin="round"
            opacity={0.85}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
          />
          <Rect
            ref={draftRectRef}
            visible={false}
            stroke={color}
            strokeWidth={2}
            strokeScaleEnabled={false}
            dash={[6, 4]}
          />
          <Arrow
            ref={draftArrowRef}
            visible={false}
            points={[0, 0, 0, 0]}
            stroke={color}
            fill={color}
            strokeWidth={3}
            strokeScaleEnabled={false}
            pointerLength={12}
            pointerWidth={12}
          />
        </Layer>
      </Stage>
    </div>
  );
}

/**
 * One committed mark.
 *
 * `strokeScaleEnabled={false}` on the vector outlines keeps their weight in
 * screen pixels, so a box outline stays readable at any zoom. The brush is
 * the deliberate exception: its width is the paint width in image pixels and
 * must scale with the image, or what you drew stops matching what gets sent.
 */
function AnnotationShape({
  annotation: a,
  selected,
  scale,
  onSelect,
}: {
  annotation: Annotation;
  selected: boolean;
  scale: number;
  onSelect: (id: string) => void;
}) {
  const stroke = selected ? "#ffffff" : a.color || MARKER_COLOR;
  // Typed as the union so the same handler satisfies both onClick (mouse) and
  // onTap (touch); a function accepting a wider parameter is assignable where
  // a narrower one is expected.
  const click = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true; // don't let the Stage clear the selection
    onSelect(a.id);
  };
  // Label text is drawn in image space, so counter-scale it to keep a
  // constant on-screen size.
  const labelSize = 13 / scale;

  if (a.kind === "point") {
    return (
      <>
        <Circle
          x={a.at.x}
          y={a.at.y}
          radius={7 / scale}
          fill={stroke}
          stroke="#000"
          strokeWidth={1 / scale}
          hitStrokeWidth={12}
          onClick={click}
          onTap={click}
        />
        <Text
          x={a.at.x + 10 / scale}
          y={a.at.y - 8 / scale}
          text={a.label}
          fontSize={labelSize}
          fill={stroke}
          listening={false}
        />
      </>
    );
  }

  if (a.kind === "box") {
    return (
      <>
        <Rect
          {...a.rect}
          width={a.rect.w}
          height={a.rect.h}
          stroke={stroke}
          strokeWidth={2}
          strokeScaleEnabled={false}
          hitStrokeWidth={12}
          onClick={click}
          onTap={click}
        />
        <Text
          x={a.rect.x}
          y={a.rect.y - 16 / scale}
          text={a.label}
          fontSize={labelSize}
          fill={stroke}
          listening={false}
        />
      </>
    );
  }

  if (a.kind === "brush") {
    return (
      <Line
        points={a.points}
        stroke={stroke}
        strokeWidth={a.width}
        lineCap="round"
        lineJoin="round"
        opacity={0.85}
        // The two largest per-frame stroke costs, and neither buys anything
        // for an opaque marker line.
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        // A fixed hit width: a 40px brush is not a 40px click target you
        // want, and wide-stroke hit testing is expensive.
        hitStrokeWidth={12}
        onClick={click}
        onTap={click}
      />
    );
  }

  return (
    <Arrow
      points={[a.from.x, a.from.y, a.to.x, a.to.y]}
      stroke={stroke}
      fill={stroke}
      strokeWidth={3}
      strokeScaleEnabled={false}
      pointerLength={12}
      pointerWidth={12}
      hitStrokeWidth={12}
      onClick={click}
      onTap={click}
    />
  );
}
