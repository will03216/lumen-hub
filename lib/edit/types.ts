/**
 * Image Editor — every persisted type. No runtime code lives here.
 *
 * See docs/prd-image-editor.md for the feature spec. Two invariants are
 * encoded in these shapes and are worth stating up front, because violating
 * either produces a bug that looks like something else entirely:
 *
 * 1. NO BYTES IN localStorage. The ~5 MB quota is already shared with
 *    lumen.library.assets.v1, story projects, and studio projects. Every
 *    image is a URL — same-origin (/library-cache/…) or a remote CDN URL.
 *    Data URIs exist only in flight, for the duration of one fetch.
 *
 * 2. ALL GEOMETRY IS IN IMAGE-INTRINSIC PIXELS. Never stage pixels, never
 *    normalized. The Konva stage carries the contain-fit and the user's
 *    zoom/pan on its own transform, so a shape's stored coordinates are
 *    independent of how the canvas happens to be displayed. Normalization
 *    to the 0–1000 range Seedream expects happens once, at compile time,
 *    in lib/edit/coords.ts. Normalizing from stage pixels instead would
 *    mean a zoom change silently altered what got sent upstream.
 */

import type { ImageQualityId } from "@/lib/studio/models";

/**
 * Output size for an edit.
 *
 * "source" is the default and is not one of the generator's quality presets,
 * deliberately. A preset puts its long side on the longer axis regardless of
 * what came in, so a 1364px upload rendered at "2k" comes back 2144px — a
 * 1.6x upscale nobody asked for, on every iteration. Beyond cost and latency
 * that resamples the WHOLE image, so regions the user never marked take
 * generation loss each round trip.
 *
 * For an edit the intuitive contract is "same size out as in". The presets
 * stay available for the case where someone genuinely wants a bigger render.
 */
export type EditQualityId = ImageQualityId | "source";

// ─────────────────────────── Geometry ─────────────────────────────────────

export type Vec = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

// ─────────────────────────── Annotations ──────────────────────────────────

export type EditToolKind = "point" | "box" | "brush" | "arrow";

/**
 * The transport split, and the whole reason there are two kinds of tool.
 *
 * BytePlus's own demo sends point/box as text tags appended to the prompt
 * (`<point>`, `<bbox>`) with the image left clean. Brush and arrow have no
 * tag equivalent anywhere in the contract, so they have to be burned into
 * a copy of the image and described in prose. Compile-time code branches
 * on these two lists rather than on individual kinds.
 */
export const VECTOR_TOOLS = ["point", "box"] as const;
export const RASTER_TOOLS = ["brush", "arrow"] as const;

type AnnotationBase = {
  id: string;
  kind: EditToolKind;
  /** Auto-assigned display label: "Mark 01" | "Region 01" | "Paint 01" |
   *  "Arrow 01". Referenced by name in the prompt's target-notes line. */
  label: string;
  /** Optional per-mark instruction typed into the chip. Drives the prose
   *  line; when every note is empty the compiled prompt is byte-identical
   *  to what BytePlus's demo produces. */
  note?: string;
  /** Marker colour, hex. Named in the raster prose so the model knows what
   *  to look for — and what not to reproduce. */
  color: string;
  createdAt: number;
  hidden?: boolean;
};

export type PointAnnotation = AnnotationBase & { kind: "point"; at: Vec };

export type BoxAnnotation = AnnotationBase & { kind: "box"; rect: Rect };

export type BrushAnnotation = AnnotationBase & {
  kind: "brush";
  /** Flat [x0,y0,x1,y1,…] — exactly Konva's <Line points> format. Integers
   *  only, RDP-simplified on gesture end. A raw 60Hz capture of a long
   *  stroke is ~8 KB of JSON; simplified it is well under 1 KB. */
  points: number[];
  width: number;
};

export type ArrowAnnotation = AnnotationBase & {
  kind: "arrow";
  from: Vec;
  to: Vec;
  width: number;
  /** A closed enum rather than free text, so the prose generated for an
   *  arrow is consistent run to run. Arrow semantics are the least
   *  verifiable part of the contract; consistency is what makes them
   *  debuggable at all. */
  intent?: "move-to" | "look-toward" | "extend-along" | "point-at";
};

export type Annotation =
  | PointAnnotation
  | BoxAnnotation
  | BrushAnnotation
  | ArrowAnnotation;

// ─────────────────────────── References ───────────────────────────────────

/** How the model should treat a reference. Drives the prose that tells it
 *  which image is the thing being edited vs. a style or layout guide. */
export type EditRefRole = "base" | "subject" | "style" | "sketch";

export type EditReference = {
  id: string;
  /** Same-origin /library-cache/… or an https CDN URL. NEVER a data: URI —
   *  see the quota invariant at the top of this file. */
  url: string;
  /** Canvas-safe URL, once resolved via mirror or proxy. Cached so we don't
   *  re-resolve on every mount; always safe to re-derive. Required before
   *  compositing, because toDataURL() throws SecurityError on a canvas that
   *  has had a cross-origin image drawn into it. */
  safeUrl?: string;
  /** Intrinsic pixels, measured on first load. Required for both coordinate
   *  normalization and output sizing, so a ref is not fully usable until
   *  these are known. */
  width: number;
  height: number;
  bytes?: number;
  assetId?: string;
  label?: string;
  role: EditRefRole;
  annotations: Annotation[];
};

// ─────────────────────── Layer separation (5B) ────────────────────────────

export type EditLayer = {
  id: string;
  /** 0 = the background plate: full canvas, no bbox, no name. 1..16 are the
   *  independent elements. */
  zIndex: number;
  url: string;
  mirrorUrl?: string;
  name?: string;
  description?: string;
  /** In the SOURCE image's pixel space: [left, top, right, bottom]. */
  bboxAbsolute?: [number, number, number, number];
  /** Same box, mapped to 0–1000. */
  bboxNormalized?: [number, number, number, number];
  /** Viewer transform the user applied, relative to the bbox origin. Konva's
   *  Transformer writes scaleX/scaleY into the node rather than width/height,
   *  and we persist it that way — baking scale into dimensions would force a
   *  re-raster of the layer image on every drag. */
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
  visible: boolean;
  locked?: boolean;
};

export type LayerSetStatus = "pending" | "ready" | "failed";

export type LayerSet = {
  id: string;
  sourceRefId: string;
  createdAt: number;
  status: LayerSetStatus;
  layers: EditLayer[];
  error?: string;
  /** Per-entry upstream metadata with any base64 stripped. Kept because the
   *  layer-separation response shape is preview-flagged and explicitly
   *  non-final — when it drifts, this is what makes the drift diagnosable
   *  without a redeploy. */
  rawMeta?: unknown[];
};

// ─────────────────────────── Versions ─────────────────────────────────────

export type EditVersionStatus = "pending" | "done" | "failed";

export type EditVersion = {
  id: string;
  createdAt: number;
  parentId?: string;
  /** What the user (or agent) typed. */
  instruction: string;
  /** EXACTLY what went upstream as `prompt`, coordinate tags included. This
   *  is what the "show compiled prompt" disclosure reads, and the first
   *  thing to look at when a render surprises someone in a demo. */
  compiledPrompt: string;
  model: string;
  size: string;
  seed?: number;
  /** Ref ids in wire order — parallel to the image[] array that was sent. */
  refIds: string[];
  /** The marks that produced this version, so restoring it brings back the
   *  annotations and not just the pixels. */
  annotationsSnapshot: Record<string, Annotation[]>;
  /** Uploaded composite URLs, when raster transport was used. */
  compositeUrls?: Record<string, string>;
  outputs: Array<{
    url: string;
    mirrorUrl?: string;
    size?: string;
    assetId?: string;
  }>;
  status: EditVersionStatus;
  error?: string;
  elapsedMs?: number;
};

// ─────────────────────────── Session ──────────────────────────────────────

export type EditSessionMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  coverUrl?: string;
};

export type EditSession = EditSessionMeta & {
  refs: EditReference[];
  activeRefId: string | null;
  instruction: string;
  model: string;
  /** "source" keeps the base image's aspect — the sensible default for an
   *  edit, and deliberately not Seedream's own "adaptive" auto-sizer, which
   *  means something different. */
  aspectRatio: string;
  qualityId: EditQualityId;
  seed?: number;
  versions: EditVersion[];
  layerSets: LayerSet[];
  /** Board camera, so reopening a session resumes where it was left. */
  view: { scale: number; x: number; y: number };
  presetIds?: string[];
};

// ─────────────────────────── Caps ─────────────────────────────────────────

/** Matches BytePlus's own demo cap. Enforced in the store rather than the
 *  UI so the agent can't route around it either. */
export const MAX_ANNOTATIONS_PER_REF = 20;

/** Versions are URL-only (~1 KB each), but unbounded growth is still the
 *  most likely way a session walks into the quota wall. */
export const MAX_VERSIONS = 50;

/** High-saturation magenta — essentially absent from natural photography,
 *  which is what makes "do not reproduce the magenta markup" a instruction
 *  the model can actually act on. */
export const MARKER_COLOR = "#FF00E5";

/**
 * On-canvas colour for VECTOR marks — point and box.
 *
 * Display only, and safe to change on taste alone. Point and box travel to
 * the model as `<point>` / `<bbox>` coordinate tags with the image sent
 * CLEAN, so nothing about how they are painted here ever reaches Seedream.
 *
 * Raster marks are the opposite and must stay MARKER_COLOR: brush and arrow
 * are burned into the pixels, and the prose that goes with them names the
 * colour ("do not reproduce the magenta markup"). Recolour those and the
 * sentence stops describing the picture — see colorNames() in
 * annotation-prompt.ts, which reads the stored colour of raster marks only.
 *
 * Green because it reads as "selected region" rather than "damage", and it
 * separates cleanly from the magenta that does mean something.
 */
export const VECTOR_MARK_COLOR = "#7BE05B";
/** Interior wash for a box. Low enough to read the image through it. */
export const VECTOR_MARK_FILL = "rgba(123, 224, 91, 0.22)";

/** The colour a mark is drawn in, by kind. See the note above: vector marks
 *  are a UI choice, raster marks are part of the request. */
export function markColor(a: Pick<Annotation, "kind" | "color">): string {
  return a.kind === "point" || a.kind === "box"
    ? VECTOR_MARK_COLOR
    : a.color || MARKER_COLOR;
}
