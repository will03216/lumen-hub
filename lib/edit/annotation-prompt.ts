/**
 * Annotation → prompt compiler. The one empirically verified artifact in the
 * editor, and the reason this file reads like a spec rather than like code.
 *
 * THERE IS NO ANNOTATION API PARAMETER. This was established by reading
 * BytePlus's own demo JavaScript, not from documentation — the documentation
 * does not mention any of it. Point and box annotations travel as text tags
 * appended to the `prompt` string, with 0–1000 normalized integer coordinates,
 * and the image is sent clean. There is no `annotations` field, no `mask`
 * field, no `regions` field. Anyone who goes looking for one and "fixes" this
 * file to use it will silently drop every mark the user made, because an
 * unrecognized top-level parameter is ignored rather than rejected.
 *
 * Brush and arrow have no tag equivalent anywhere in the contract. They are
 * burned into a copy of the image (elsewhere — this module only decides that
 * it must happen, via `transport: "composite"`) and described in prose here.
 *
 * WHAT IS VERIFIED AND WHAT IS NOT.
 *
 * · Verified, byte-exact, do not improve: the `<point>` / `<bbox>` tag block,
 *   its header line, and its trailing instruction sentence. The golden-string
 *   test in annotation-prompt.test.ts exists to make a reworded "improvement"
 *   fail loudly instead of degrading render quality in a way that reads as a
 *   model regression. An ignored tag is indistinguishable from a bad edit in
 *   the response, so there is no runtime signal to catch this — only the test.
 *
 * · Not verified, and therefore gated: naming a target. There is no tag for
 *   it. So per-mark notes are emitted as ONE prose line, and only when at
 *   least one annotation on that ref actually carries a note. When no note is
 *   present the output is byte-identical to what the demo produces. That
 *   gating is the entire point: the unverified extrapolation costs nothing on
 *   the common path, and the common path stays inside known-good territory.
 *
 * · Not verified: the raster prose. It is prose, so the model treats it as
 *   prose; the risk is bounded. Its last sentence is load-bearing — without
 *   "Do not reproduce the … markup in the output" the model paints the marker
 *   scribbles into the result, which is the single most reliable way to make
 *   a composite-transport edit look broken.
 *
 * MIXED VECTOR + RASTER ON ONE REF is the subtle case. Transport becomes
 * "composite" AND the coordinate tags are still emitted. The composite is
 * pixel-identical outside the strokes, so a normalized coordinate still
 * addresses the same content it did on the clean image; dropping the tags
 * because "the marks are in the pixels now" would silently discard the
 * point/box precision the user spent clicks on.
 *
 * PURITY. No DOM, no async, no Date.now, no randomness. Given the same input
 * this returns the same string forever, which is what makes the golden test
 * meaningful and what lets the compiled-prompt disclosure in the UI be
 * trusted as "exactly what went upstream".
 */

import { imageToNorm, rectToNorm } from "./coords";
import {
  MARKER_COLOR,
  type Annotation,
  type ArrowAnnotation,
  type BoxAnnotation,
  type EditRefRole,
  type PointAnnotation,
} from "./types";

// ─────────────────────────── Public API ───────────────────────────────────

export type CompileRef = {
  /** 1-based position in the wire image[] array. The model counts references
   *  from 1, so this is not an array index and must not be derived from one
   *  without the +1. */
  index: number;
  refId: string;
  /** Intrinsic px. Normalization is meaningless without these. */
  width: number;
  height: number;
  role: EditRefRole;
  label?: string;
  annotations: Annotation[];
};

export type CompileInput = {
  instruction: string;
  refs: CompileRef[];
  /** BytePlus's demo caps the prompt at 600 words. Exceeding it is reported,
   *  never enforced — see the note on the warning below. */
  maxWords?: number;
  /** Points + boxes combined, per ref. Matches MAX_ANNOTATIONS_PER_REF. */
  maxTargetsPerRef?: number;
};

export type CompiledRefPlan = {
  refId: string;
  index: number;
  /** "composite" iff the ref carries any brush or arrow. Vector-only refs
   *  stay "clean" — burning nothing into the pixels is strictly better. */
  transport: "clean" | "composite";
  points: Array<[number, number]>;
  boxes: Array<[number, number, number, number]>;
  /** Annotation ids the compositor must draw, in the same order they appear
   *  in the prose. */
  rasterAnnotationIds: string[];
  /** Vector targets discarded by maxTargetsPerRef. */
  droppedCount: number;
};

export type CompileResult = {
  /** The exact string to send as `prompt`. */
  prompt: string;
  /** One entry per input ref, including refs with no annotations at all —
   *  the caller needs a transport decision for every image it uploads, and
   *  "this ref contributed no prompt text" is not the same question. */
  plans: CompiledRefPlan[];
  warnings: string[];
};

/** Below this, on either axis, a normalized box is not a region — it is a
 *  line, and a degenerate bbox is a likely model confuser. Demoted to a point
 *  at its centre, which is what the user almost certainly meant. */
const MIN_BOX_SPAN = 4;

const DEFAULT_MAX_WORDS = 600;
const DEFAULT_MAX_TARGETS = 20;

/** Roles whose sentence describes the image on its own terms, with no
 *  reference to the anchor — so they are safe to emit for the anchor itself. */
const SELF_CONTAINED_ROLES = new Set<CompileRef["role"]>(["style", "sketch"]);

/**
 * How to use each non-base reference.
 *
 * Emitted only when there is something to disambiguate — a lone base image
 * needs no explanation, and saying "reference image 1 is the image being
 * edited" to a single-image request is noise the model has to read past.
 *
 * The base image is named explicitly in each line so the model has an anchor
 * for perspective and lighting rather than averaging across the set.
 */
function roleBlock(refs: readonly CompileRef[]): string | null {
  // With no explicit base, the first reference in wire order IS the base —
  // Seedream treats image[0] as the subject. Saying "the first reference"
  // instead let a line tell the model to match reference image 1 against
  // itself, which is at best noise and at worst a contradiction.
  const anchorRef = refs.find((r) => r.role === "base") ?? refs[0];
  const others = refs.filter(
    (r) =>
      r.role !== "base" &&
      // The anchor keeps its own line unless that line would point back at
      // the anchor. `style` and `sketch` describe the image on its own terms,
      // so they stay; `subject` and anything falling to the generic line name
      // the anchor and would be circular.
      !(r === anchorRef && !SELF_CONTAINED_ROLES.has(r.role)),
  );
  if (others.length === 0) return null;

  const anchor = `reference image ${anchorRef?.index ?? 1}`;
  const lines = others.map((r) => {
    switch (r.role) {
      case "subject":
        return `Reference image ${r.index} is a subject reference: composite the object it shows into the scene, matching the perspective, lighting, shadow and scale of ${anchor}.`;
      case "style":
        return `Reference image ${r.index} is a style reference: borrow its palette, texture and lighting treatment only. Do not copy its content or composition.`;
      case "sketch":
        return `Reference image ${r.index} is a rough sketch: treat it as a layout guide for placement and proportion, and render finished, realistic detail rather than reproducing the drawn lines.`;
      default:
        return `Reference image ${r.index} is supporting context for ${anchor}.`;
    }
  });
  return lines.join("\n");
}

export function compileAnnotationPrompt(input: CompileInput): CompileResult {
  const maxWords = input.maxWords ?? DEFAULT_MAX_WORDS;
  const maxTargets = input.maxTargetsPerRef ?? DEFAULT_MAX_TARGETS;

  const warnings: string[] = [];
  const plans: CompiledRefPlan[] = [];
  const blocks: string[] = [];

  const instruction = input.instruction.trim();
  if (instruction) blocks.push(instruction);

  // Counted on the user's instruction only. The suffix we generate is not the
  // user's problem, and including it would make the warning fire on prompts
  // the user cannot shorten.
  const words = countWords(instruction);
  if (words > maxWords) {
    warnings.push(
      `Instruction is ${words} words, over the ${maxWords}-word cap; the model may ignore later sentences.`,
    );
  }

  // Role prose, once, before the per-reference target blocks.
  //
  // Seedream receives several images in one array with no inherent labelling,
  // so without this the model has to guess which is the subject being edited
  // and which is a style hint — and it guesses wrong often enough to turn a
  // fusion into a collage. This is what makes §5C more than a file picker.
  const roles = roleBlock(input.refs);
  if (roles) blocks.push(roles);

  for (const ref of input.refs) {
    const visible = [...ref.annotations]
      .filter((a) => a.hidden !== true)
      // Stable sort on createdAt: already-ordered input is untouched, and a
      // store that ever reorders its array still drops the newest marks at
      // the cap rather than an arbitrary subset.
      .sort((a, b) => a.createdAt - b.createdAt);

    const vectors = visible.filter(isVector);
    const rasters = visible.filter(isRaster);

    const kept = vectors.slice(0, maxTargets);
    const droppedCount = vectors.length - kept.length;
    if (droppedCount > 0) {
      warnings.push(
        `Reference image ${ref.index}: ${droppedCount} annotation${droppedCount === 1 ? "" : "s"} over the ${maxTargets}-target cap ${droppedCount === 1 ? "was" : "were"} dropped.`,
      );
    }

    const points: Array<[number, number]> = [];
    const boxes: Array<[number, number, number, number]> = [];
    // Parallel to `kept`: where each annotation's coordinate actually landed,
    // so the notes line can name the tag array and the ordinal within it.
    const slots: Array<{ tag: "point" | "box"; ordinal: number }> = [];

    for (const a of kept) {
      if (a.kind === "point") {
        points.push(imageToNorm(a.at, ref.width, ref.height));
        slots.push({ tag: "point", ordinal: points.length });
        continue;
      }

      const box = rectToNorm(a.rect, ref.width, ref.height);
      if (box[2] - box[0] < MIN_BOX_SPAN || box[3] - box[1] < MIN_BOX_SPAN) {
        points.push([
          Math.round((box[0] + box[2]) / 2),
          Math.round((box[1] + box[3]) / 2),
        ]);
        slots.push({ tag: "point", ordinal: points.length });
        warnings.push(
          `Reference image ${ref.index}: box "${a.label}" is narrower than ${MIN_BOX_SPAN}/1000 after normalization; sent as a point at its centre.`,
        );
        continue;
      }

      boxes.push(box);
      slots.push({ tag: "box", ordinal: boxes.length });
    }

    plans.push({
      refId: ref.refId,
      index: ref.index,
      transport: rasters.length > 0 ? "composite" : "clean",
      points,
      boxes,
      rasterAnnotationIds: rasters.map((a) => a.id),
      droppedCount,
    });

    const notes = notesLine(ref.index, kept, slots, rasters);
    if (notes) blocks.push(notes);

    const targets = targetBlock(ref.index, points, boxes);
    if (targets) blocks.push(targets);

    const raster = rasterBlock(ref.index, rasters);
    if (raster) blocks.push(raster);
  }

  return { prompt: blocks.join("\n\n"), plans, warnings };
}

// ─────────────────────── Block builders ───────────────────────────────────

/**
 * The verified block. Header, then only the tag lines that have content, then
 * the trailing instruction.
 *
 * An empty tag array is NEVER emitted. `<point>[]</point>` is untested input —
 * the demo never produces it, so nothing is known about how the model reacts
 * to it, and "probably ignored" is not a basis for shipping it on every
 * box-only edit.
 *
 * JSON.stringify rather than manual joining, because the demo's output has no
 * spaces (`[[420,318],[512,640]]`) and hand-rolled string building is exactly
 * where a stray ", " creeps in.
 */
function targetBlock(
  index: number,
  points: Array<[number, number]>,
  boxes: Array<[number, number, number, number]>,
): string | null {
  if (points.length === 0 && boxes.length === 0) return null;

  const lines = [
    `Reference image ${index} interactive targets (normalized 0-1000 coordinates):`,
  ];
  if (points.length > 0) lines.push(`<point>${JSON.stringify(points)}</point>`);
  if (boxes.length > 0) lines.push(`<bbox>${JSON.stringify(boxes)}</bbox>`);
  lines.push(
    "Apply the requested edit specifically to these marked targets. Preserve unmarked regions unless the instruction explicitly says otherwise.",
  );
  return lines.join("\n");
}

/**
 * The gated extrapolation. Returns null — not an empty string, not a blank
 * line — when nothing on this ref carries a note, so the compiled prompt on
 * the common path is byte-identical to the demo's.
 *
 * The parenthetical is the annotation's 1-based position within its own tag
 * array, which is the only handle the model has for aligning a sentence to a
 * coordinate. Two consequences worth stating:
 *
 * · A box demoted to a centre point is described as `(point N)`, because that
 *   is where its coordinate actually went. Describing it as a box would point
 *   the model at the wrong array.
 * · Brush and arrow have no tag array, so they are ordinaled within their own
 *   kind. It is the same idea applied to the prose the compositor's strokes
 *   are described by.
 */
function notesLine(
  index: number,
  kept: Array<PointAnnotation | BoxAnnotation>,
  slots: Array<{ tag: "point" | "box"; ordinal: number }>,
  rasters: Array<Annotation>,
): string | null {
  const entries: string[] = [];

  kept.forEach((a, i) => {
    const note = a.note?.trim();
    if (!note) return;
    const slot = slots[i];
    entries.push(`${a.label} (${slot.tag} ${slot.ordinal}) — ${note}`);
  });

  let brushOrdinal = 0;
  let arrowOrdinal = 0;
  for (const a of rasters) {
    const ordinal = a.kind === "brush" ? ++brushOrdinal : ++arrowOrdinal;
    const note = a.note?.trim();
    if (!note) continue;
    entries.push(`${a.label} (${a.kind} ${ordinal}) — ${note}`);
  }

  if (entries.length === 0) return null;

  // Terminate the sentence. Every other block in the compiled prompt ends in
  // a full stop, and this line butts directly against the "Reference image N
  // interactive targets…" heading on the next line — without it the model
  // sees one run-on sentence spanning the prose and the tag block.
  //
  // Notes come from a free-text field, so a user who already typed their own
  // terminator must not get a doubled one.
  const body = entries.join("; ");
  const terminated = /[.!?]$/.test(body) ? body : `${body}.`;
  return `Reference image ${index} target notes: ${terminated}`;
}

/**
 * Prose for markup that had to be burned into the pixels.
 *
 * Only the clauses that apply are included — a ref with arrows but no brush
 * strokes must not be told to "apply the edit to the painted areas", because
 * there aren't any and the model will go looking.
 *
 * The last sentence is unconditional whenever there is any markup at all. It
 * is the difference between an edit and an edit with magenta scribbles drawn
 * over it.
 */
function rasterBlock(index: number, rasters: Annotation[]): string | null {
  if (rasters.length === 0) return null;

  const brushes = rasters.filter((a) => a.kind === "brush");
  const arrows = rasters.filter(
    (a): a is ArrowAnnotation => a.kind === "arrow",
  );

  const clauses: string[] = [];
  if (brushes.length > 0) {
    const noun = brushes.length === 1 ? "painted mask area" : "painted mask areas";
    clauses.push(
      `${brushes.length} ${noun} in ${joinNatural(colorNames(brushes))}`,
    );
  }
  if (arrows.length > 0) {
    const names = colorNames(arrows);
    const noun = arrows.length === 1 ? "arrow" : "arrows";
    // Single colour reads better adjectivally ("1 magenta arrow"); mixed
    // colours only read naturally postfixed ("2 arrows in magenta and cyan").
    clauses.push(
      names.length === 1
        ? `${arrows.length} ${names[0]} ${noun}`
        : `${arrows.length} ${noun} in ${joinNatural(names)}`,
    );
  }

  const sentences = [
    `Reference image ${index} contains hand-drawn markup: ${joinNatural(clauses)}.`,
  ];
  if (brushes.length > 0) {
    sentences.push("Apply the requested edit to the painted areas.");
  }
  if (arrows.length > 0) sentences.push(arrowSentence(arrows));
  sentences.push(
    `Do not reproduce the ${joinNatural(colorNames(rasters))} markup in the output.`,
  );

  return sentences.join(" ");
}

/**
 * Arrow semantics are the least verifiable part of the contract, so `intent`
 * is a closed enum and each value maps to fixed wording. Consistency run to
 * run is what makes an arrow debuggable at all: if the phrasing drifted, a
 * bad result would be unattributable.
 *
 * Mixed or absent intents fall back to the generic sentence rather than
 * emitting several competing instructions — the model would have to pick one,
 * and which one it picked would not be observable.
 */
function arrowSentence(arrows: ArrowAnnotation[]): string {
  const GENERIC =
    "Treat each arrow as a direction or destination indicator — the tail is the source and the head is the target.";

  const intents = new Set(arrows.map((a) => a.intent));
  if (intents.size !== 1) return GENERIC;

  switch (arrows[0].intent) {
    case "move-to":
      return "Treat each arrow as a movement instruction — move the subject at the tail to the position at the head.";
    case "look-toward":
      return "Treat each arrow as a gaze direction — the subject at the tail should face toward the head.";
    case "extend-along":
      return "Treat each arrow as an extension path — extend the subject at the tail along the arrow toward the head.";
    case "point-at":
      return "Treat each arrow as a pointer — the head marks the target the instruction applies to.";
    default:
      return GENERIC;
  }
}

// ─────────────────────── Colour naming ────────────────────────────────────

/**
 * Nearest-name lookup over the handful of colours the marker palette can
 * produce. Deliberately tiny: the model needs a word it can look for in the
 * pixels, not a colour-science answer. Nearest-neighbour in plain RGB is more
 * than accurate enough to separate ten well-spaced hues, and it degrades
 * sensibly — an unrecognised hex lands on whichever of these it is closest to
 * rather than leaking "#7B2FF7" into the prompt, which would be a token the
 * model cannot act on.
 */
const MARKER_NAMES: Array<readonly [string, number, number, number]> = [
  ["magenta", 0xff, 0x00, 0xe5], // MARKER_COLOR, the default
  ["red", 0xff, 0x00, 0x00],
  ["orange", 0xff, 0x7a, 0x00],
  ["yellow", 0xff, 0xe5, 0x00],
  ["green", 0x00, 0xc8, 0x53],
  ["cyan", 0x00, 0xe5, 0xff],
  ["blue", 0x29, 0x62, 0xff],
  ["purple", 0x7c, 0x4d, 0xff],
  ["white", 0xff, 0xff, 0xff],
  ["black", 0x00, 0x00, 0x00],
];

const DEFAULT_COLOR_NAME = "magenta";

export function markerColorName(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return DEFAULT_COLOR_NAME;

  let best = DEFAULT_COLOR_NAME;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [name, r, g, b] of MARKER_NAMES) {
    const d = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

function parseHex(hex: string): [number, number, number] | null {
  const s = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return [
      Number.parseInt(s[0] + s[0], 16),
      Number.parseInt(s[1] + s[1], 16),
      Number.parseInt(s[2] + s[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) {
    return [
      Number.parseInt(s.slice(0, 2), 16),
      Number.parseInt(s.slice(2, 4), 16),
      Number.parseInt(s.slice(4, 6), 16),
    ];
  }
  return null;
}

/** Distinct names in first-use order, so the prose is stable and never
 *  repeats a colour. */
function colorNames(annotations: Annotation[]): string[] {
  const seen: string[] = [];
  for (const a of annotations) {
    const name = markerColorName(a.color || MARKER_COLOR);
    if (!seen.includes(name)) seen.push(name);
  }
  return seen.length > 0 ? seen : [DEFAULT_COLOR_NAME];
}

function joinNatural(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ─────────────────────── Small helpers ────────────────────────────────────

function isVector(a: Annotation): a is PointAnnotation | BoxAnnotation {
  return a.kind === "point" || a.kind === "box";
}

function isRaster(a: Annotation): boolean {
  return a.kind === "brush" || a.kind === "arrow";
}

function countWords(s: string): number {
  const t = s.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}
