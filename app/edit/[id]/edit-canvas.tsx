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
import { Maximize2, Minus, Plus } from "lucide-react";
import {
  Arrow,
  Circle,
  Image as KonvaImage,
  Label,
  Layer,
  Line,
  Rect,
  Stage,
  Tag,
  Text,
  Transformer,
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
import { isStageDrag } from "@/lib/edit/stage-drag";
// DraftAnnotation is defined next to buildAnnotation rather than here, so the
// canvas and the agent tooling that lands later both produce marks through
// one shape and one labelling path.
import type { DraftAnnotation } from "@/lib/edit/annotations";
import {
  VECTOR_MARK_COLOR,
  VECTOR_MARK_FILL,
  markColor,
  type Annotation,
  type EditReference,
  type Rect as ImageRect,
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
  /**
   * Fired when an EXISTING mark is moved or resized.
   *
   * Discriminated by kind rather than typed as a partial of the union: the
   * parent spreads it onto the stored annotation, and `Partial<Annotation>`
   * would let a box's rect land on a point.
   */
  onGeometry: (id: string, geometry: GeometryPatch) => void;
};

export type GeometryPatch =
  | { kind: "point"; at: Vec }
  | { kind: "box"; rect: ImageRect }
  | { kind: "brush"; points: number[] }
  | { kind: "arrow"; from: Vec; to: Vec };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
/** A drag shorter than this is a click, not a box/arrow. In image px. */
const MIN_DRAG_PX = 3;
/** One click of the zoom buttons. Matches roughly two wheel notches — enough
 *  to feel like progress, small enough to land on a useful level. */
const ZOOM_STEP = 1.25;
/** Smallest box a resize may produce, in SCREEN px — the transformer works in
 *  screen space, and a box below this is impossible to grab again. */
const MIN_BOX_SCREEN_PX = 12;

export default function EditCanvas({
  reference,
  annotations,
  tool,
  brushWidth,
  color,
  selectedId,
  onSelect,
  onCommit,
  onGeometry,
}: EditCanvasProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<Konva.Stage>(null);
  const draftLayerRef = React.useRef<Konva.Layer>(null);
  const draftLineRef = React.useRef<Konva.Line>(null);
  const draftRectRef = React.useRef<Konva.Rect>(null);
  const draftArrowRef = React.useRef<Konva.Arrow>(null);
  const transformerRef = React.useRef<Konva.Transformer>(null);

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

  // ── Resize handles ──────────────────────────────────────────────────────
  //
  // Attached imperatively because Konva's Transformer takes NODES, not
  // props — it has to find the live shape for the current selection. Boxes
  // only: a point has nothing to resize, and scaling a brush stroke or an
  // arrow would change what was drawn rather than where it is.
  //
  // Re-runs on `annotations` as well as on the selection, because the node
  // for a given id is replaced when the store hands back a new list.
  React.useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const sel = annotations.find((a) => a.id === selectedId && !a.hidden);
    const node =
      sel?.kind === "box"
        ? stage.findOne<Konva.Rect>(`#${selectedId}`)
        : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, annotations]);

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
    // annotation — or a resize handle — reports a shape.
    const onEmptyCanvas = e.target === e.target.getStage();
    if (!onEmptyCanvas) {
      // The gesture belongs to that shape: select it, drag it, or pull one of
      // its handles. Starting a fresh draw here as well would lay a second
      // mark over the one being adjusted, which is exactly what made boxes
      // feel un-editable — every attempt to grab one drew another.
      return;
    }
    onSelect(null);

    if (tool === "point") {
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

  /**
   * Zoom to `next`, keeping one screen point pinned.
   *
   * The wheel pins the cursor; the buttons pin the middle of the viewport.
   * Both go through here so they cannot drift apart — the anchoring is the
   * only interesting part, and having it twice is how the buttons end up
   * zooming somewhere other than where the wheel does.
   */
  function zoomTo(next: number, anchor?: Vec) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (clamped === zoom) return;
    const a = anchor ?? { x: size.w / 2, y: size.h / 2 };
    // Convert the anchor to image space at the old scale, then solve for the
    // pan that puts it back under the same screen point at the new one.
    // Zooming to the stage origin instead makes precise work near an edge
    // impossible.
    const imgPt = { x: (a.x - tx) / eff, y: (a.y - ty) / eff };
    const nextEff = fit.scale * clamped;
    setPan({
      x: a.x - imgPt.x * nextEff - fit.dx,
      y: a.y - imgPt.y * nextEff - fit.dy,
    });
    setZoom(clamped);
  }

  /** Back to the fitted view. No anchoring: the contain-fit re-centres. */
  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function onWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const ptr = stage.getPointerPosition();
    if (!ptr) return;
    zoomTo(zoom * (e.evt.deltaY > 0 ? 0.9 : 1.1), ptr);
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
      className="relative size-full"
      style={{ cursor: tool === "pan" ? "grab" : "crosshair" }}
    >
      <ZoomBar
        zoom={zoom}
        // "Actual size" is 1 image pixel per screen pixel, which is a
        // different thing from the fitted view: zoom rides on top of the
        // contain-fit, so 1:1 is 1/fit.scale. Worth its own button — a mark
        // placed at a fitted 40% is placed on a guess.
        actualZoom={fit.scale > 0 ? 1 / fit.scale : 1}
        onZoom={(z) => zoomTo(z)}
        onReset={resetView}
      />
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
          // ONLY the Stage's own drag moves the camera.
          //
          // Konva bubbles dragend from the shape that moved up through the
          // Layer to the Stage, so this handler fires for every mark drag too,
          // with e.target being the MARK. Folding a mark's coordinates into
          // the pan set the camera to, say, (425, 913) — the picture vanished
          // off screen and the canvas went blank, which reads as a crash.
          if (!isStageDrag(e.target)) return;
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
                imgW={imgW}
                imgH={imgH}
                onSelect={onSelect}
                onGeometry={onGeometry}
              />
            ))}

          {/* Sized in image space like everything else, so every on-screen
              dimension is divided by the effective scale — otherwise the
              handles balloon as you zoom in and vanish as you zoom out. */}
          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            keepRatio={false}
            ignoreStroke
            flipEnabled={false}
            anchorSize={9 / eff}
            anchorCornerRadius={2 / eff}
            anchorStrokeWidth={1.5 / eff}
            borderStrokeWidth={1 / eff}
            anchorFill="#ffffff"
            anchorStroke={VECTOR_MARK_COLOR}
            borderStroke={VECTOR_MARK_COLOR}
            borderDash={[4 / eff, 3 / eff]}
            // Refuse a resize that would collapse the box rather than letting
            // it invert. The boxes here are in SCREEN pixels, unlike
            // everything else in this file.
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < MIN_BOX_SCREEN_PX ||
              newBox.height < MIN_BOX_SCREEN_PX
                ? oldBox
                : newBox
            }
          />
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
          {/* The box preview is green like the committed marks, not magenta:
              a box compiles to a coordinate tag and is never painted into the
              image, so its colour is a UI choice. Brush and arrow below keep
              `color` because theirs is burned into the pixels. */}
          <Rect
            ref={draftRectRef}
            visible={false}
            stroke={VECTOR_MARK_COLOR}
            fill={VECTOR_MARK_FILL}
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
 * Every mark is draggable, and a box additionally carries resize handles (the
 * Transformer is mounted by the parent and attached to whichever box is
 * selected). Geometry edits go back through `onGeometry` in IMAGE pixels —
 * Konva hands back stage-space values that are already image-space here,
 * because the Stage owns the whole transform, but a drag/resize still has to
 * be clamped to the picture and folded back into the node's own scale.
 *
 * `strokeScaleEnabled={false}` on the vector outlines keeps their weight in
 * screen pixels, so a box outline stays readable at any zoom. The brush is
 * the deliberate exception: its width is the paint width in image pixels and
 * must scale with the image, or what you drew stops matching what gets sent.
 *
 * One consequence of a box having a fill: its interior is a hit target, so a
 * drag that starts inside an existing box moves that box instead of drawing a
 * new one. That is the trade the fill buys — grab-anywhere dragging, which is
 * how every editor behaves — and it is why the fill is worth having beyond
 * looking better. Start outside the box to draw a new one.
 */
function AnnotationShape({
  annotation: a,
  selected,
  scale,
  imgW,
  imgH,
  onSelect,
  onGeometry,
}: {
  annotation: Annotation;
  selected: boolean;
  scale: number;
  imgW: number;
  imgH: number;
  onSelect: (id: string) => void;
  onGeometry: (id: string, geometry: GeometryPatch) => void;
}) {
  const stroke = markColor(a);
  // Typed as the union so the same handler satisfies both onClick (mouse) and
  // onTap (touch); a function accepting a wider parameter is assignable where
  // a narrower one is expected.
  const click = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true; // don't let the Stage clear the selection
    onSelect(a.id);
  };
  // A drag must also select, or the handles appear on the wrong mark.
  const dragStart = () => onSelect(a.id);

  if (a.kind === "point") {
    return (
      <>
        <Circle
          x={a.at.x}
          y={a.at.y}
          radius={7 / scale}
          fill={stroke}
          stroke="#0b0b0b"
          strokeWidth={1.5 / scale}
          hitStrokeWidth={12}
          draggable
          onDragStart={dragStart}
          onDragEnd={(e) => {
            const p = clampToImage(
              { x: e.target.x(), y: e.target.y() },
              imgW,
              imgH,
            );
            onGeometry(a.id, {
              kind: "point",
              at: { x: Math.round(p.x), y: Math.round(p.y) },
            });
          }}
          onClick={click}
          onTap={click}
        />
        <MarkLabel
          x={a.at.x + 11 / scale}
          y={a.at.y - 9 / scale}
          text={a.label}
          color={stroke}
          scale={scale}
        />
      </>
    );
  }

  if (a.kind === "box") {
    return (
      <>
        <Rect
          // The Transformer finds its target by this id.
          id={a.id}
          x={a.rect.x}
          y={a.rect.y}
          width={a.rect.w}
          height={a.rect.h}
          fill={VECTOR_MARK_FILL}
          stroke={stroke}
          strokeWidth={selected ? 2.5 : 1.5}
          strokeScaleEnabled={false}
          draggable
          onDragStart={dragStart}
          onDragEnd={(e) => {
            const n = e.target;
            onGeometry(a.id, {
              kind: "box",
              rect: clampRect(
                { x: n.x(), y: n.y(), w: a.rect.w, h: a.rect.h },
                imgW,
                imgH,
              ),
            });
          }}
          onTransformEnd={(e) => {
            const n = e.target as Konva.Rect;
            // Konva expresses a resize as a SCALE on the node, not as new
            // dimensions. Bake it into width/height and reset the scale, or
            // the next transform compounds on top of it and the stroke width
            // starts drifting with the box.
            const rect = clampRect(
              {
                x: n.x(),
                y: n.y(),
                w: Math.max(1, n.width() * n.scaleX()),
                h: Math.max(1, n.height() * n.scaleY()),
              },
              imgW,
              imgH,
            );
            n.scaleX(1);
            n.scaleY(1);
            onGeometry(a.id, { kind: "box", rect });
          }}
          onClick={click}
          onTap={click}
        />
        <MarkLabel
          x={a.rect.x}
          y={a.rect.y - 6 / scale}
          text={a.label}
          color={stroke}
          scale={scale}
          above
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
        draggable
        onDragStart={dragStart}
        onDragEnd={(e) => {
          // A dragged Line keeps its points and moves the NODE, so the offset
          // has to be folded back into the points and the node reset — the
          // store only knows about points.
          const n = e.target;
          const dx = n.x();
          const dy = n.y();
          n.position({ x: 0, y: 0 });
          const moved = a.points.map((v, i) =>
            i % 2 === 0
              ? Math.round(Math.min(imgW, Math.max(0, v + dx)))
              : Math.round(Math.min(imgH, Math.max(0, v + dy))),
          );
          onGeometry(a.id, { kind: "brush", points: moved });
        }}
        onClick={click}
        onTap={click}
      />
    );
  }

  return (
    <>
      <Arrow
        points={[a.from.x, a.from.y, a.to.x, a.to.y]}
        stroke={stroke}
        fill={stroke}
        strokeWidth={3}
        strokeScaleEnabled={false}
        pointerLength={12}
        pointerWidth={12}
        hitStrokeWidth={12}
        draggable
        onDragStart={dragStart}
        onDragEnd={(e) => {
          const n = e.target;
          const dx = n.x();
          const dy = n.y();
          n.position({ x: 0, y: 0 });
          onGeometry(a.id, {
            kind: "arrow",
            from: roundVec(clampToImage(shift(a.from, dx, dy), imgW, imgH)),
            to: roundVec(clampToImage(shift(a.to, dx, dy), imgW, imgH)),
          });
        }}
        onClick={click}
        onTap={click}
      />
      {/* Endpoint handles. An arrow means "from here to there", so both ends
          have to be adjustable — a Transformer would scale it instead, which
          is not the same operation. */}
      {selected &&
        (["from", "to"] as const).map((end) => (
          <Circle
            key={end}
            x={a[end].x}
            y={a[end].y}
            radius={5.5 / scale}
            fill="#ffffff"
            stroke={stroke}
            strokeWidth={1.5 / scale}
            hitStrokeWidth={14}
            draggable
            onDragEnd={(e) => {
              const p = roundVec(
                clampToImage({ x: e.target.x(), y: e.target.y() }, imgW, imgH),
              );
              onGeometry(a.id, {
                kind: "arrow",
                from: end === "from" ? p : a.from,
                to: end === "to" ? p : a.to,
              });
            }}
          />
        ))}
    </>
  );
}

/**
 * The name tag on a mark — a filled pill, not bare text.
 *
 * Counter-scaled so it stays one size on screen: the label is drawn in image
 * space like everything else, and at 8x zoom bare image-space text is
 * unreadable. Dark text on the mark colour rather than coloured text on the
 * photo, which is unreadable over a light subject.
 */
function MarkLabel({
  x,
  y,
  text,
  color,
  scale,
  above = false,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  scale: number;
  above?: boolean;
}) {
  return (
    <Label x={x} y={y} listening={false} offsetY={above ? 17 / scale : 0}>
      <Tag fill={color} cornerRadius={2 / scale} />
      <Text
        text={text}
        fontSize={12 / scale}
        fontStyle="500"
        padding={3 / scale}
        fill="#0b0b0b"
      />
    </Label>
  );
}

/**
 * Zoom control. HTML, not Konva — it is chrome, not content: it must not
 * scale with the stage, must not appear in a composite, and must not be part
 * of the hit graph the drawing gestures use.
 *
 * The percentage is relative to the FITTED view, not to image pixels, because
 * that is the number the user can act on: 100% means "what I saw when I
 * opened this", which is what makes it a sensible thing to click to get back
 * to. Actual pixel scale is one button along.
 */
function ZoomBar({
  zoom,
  actualZoom,
  onZoom,
  onReset,
}: {
  zoom: number;
  actualZoom: number;
  onZoom: (zoom: number) => void;
  onReset: () => void;
}) {
  const atActual = Math.abs(zoom - actualZoom) < 0.005;
  return (
    <div className="absolute bottom-3 left-3 z-10 flex items-center gap-0.5 rounded-full border border-border bg-panel/90 p-1 backdrop-blur-sm">
      <ZoomButton
        onClick={() => onZoom(zoom / ZOOM_STEP)}
        disabled={zoom <= MIN_ZOOM + 1e-6}
        title="Zoom out"
      >
        <Minus className="size-3.5" />
      </ZoomButton>

      {/* The readout IS the reset. A separate "fit" button next to a
          percentage that already reads 100% is two controls for one idea. */}
      <button
        onClick={onReset}
        title="Back to 100% — the fitted view"
        className="min-w-[52px] cursor-pointer rounded-full px-2 py-1 text-center font-mono text-[11px] tabular-nums text-ink-dim transition-colors hover:bg-[var(--bg)] hover:text-ink"
      >
        {Math.round(zoom * 100)}%
      </button>

      <ZoomButton
        onClick={() => onZoom(zoom * ZOOM_STEP)}
        disabled={zoom >= MAX_ZOOM - 1e-6}
        title="Zoom in"
      >
        <Plus className="size-3.5" />
      </ZoomButton>

      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

      <ZoomButton
        onClick={() => onZoom(actualZoom)}
        disabled={atActual}
        title="Actual size — one image pixel per screen pixel"
      >
        <Maximize2 className="size-3.5" />
      </ZoomButton>
    </div>
  );
}

function ZoomButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="grid size-7 cursor-pointer place-items-center rounded-full text-ink-dim transition-colors hover:bg-[var(--bg)] hover:text-ink disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-dim"
    >
      {children}
    </button>
  );
}

function shift(v: Vec, dx: number, dy: number): Vec {
  return { x: v.x + dx, y: v.y + dy };
}

function roundVec(v: Vec): Vec {
  return { x: Math.round(v.x), y: Math.round(v.y) };
}

/** Keep a moved or resized box inside the picture, in whole pixels. A mark
 *  that hangs off the edge normalizes to a coordinate the model cannot use. */
function clampRect(r: ImageRect, imgW: number, imgH: number): ImageRect {
  const w = Math.round(Math.min(r.w, imgW));
  const h = Math.round(Math.min(r.h, imgH));
  return {
    x: Math.round(Math.min(Math.max(0, r.x), imgW - w)),
    y: Math.round(Math.min(Math.max(0, r.y), imgH - h)),
    w,
    h,
  };
}
