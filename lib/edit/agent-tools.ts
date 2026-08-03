/**
 * The agent's tool surface — definitions, and the pure reading of one call.
 *
 * PRD §8.2. The agent — seed-2-0-pro, via /api/edit/agent — drives the editor
 * by calling tools; this module owns
 * the two halves of that contract that have no side effects: the JSON-Schema
 * definitions sent to the API, and the mapping from a tool call's arguments to
 * a `ToolPlan` describing what should change. Nothing here does I/O, touches
 * React, or writes to the store. The harness (`use-edit-agent`) takes the plan
 * and applies it.
 *
 * That split is the point. §8.1 puts the tool loop in the browser because the
 * session lives in localStorage and the server cannot read it — which means the
 * executor is tangled up with the store, the canvas, an approval gate, and a
 * fetch. If validation and coordinate math lived in there too, none of it would
 * be testable without mounting a Stage. Here it is testable with a plain object.
 *
 * THREE RULES THIS FILE EXISTS TO ENFORCE.
 *
 * 1. THE COORDINATE RESCALE, PER REFERENCE. The model returns coordinates that
 *    map 1:1 to the pixels of the image it was *shown*, and the harness
 *    downscales each snapshot to fit a 2576px long-edge vision budget. So every
 *    incoming coordinate is in that image's snapshot space and must be divided
 *    by ITS OWN factor before it reaches the store, which holds image-intrinsic
 *    pixels (see the geometry invariant at the top of types.ts).
 *
 *    Per reference, not one factor for the session: a 4000px base and a 600px
 *    subject reference downscale by wildly different amounts, and a single
 *    factor would land every mark on the second image in the wrong place while
 *    the first looked perfect — which is the kind of bug that gets blamed on
 *    the model. `describeSession` reports each reference's dimensions in that
 *    reference's own space, so the numbers the model reads and the numbers it
 *    writes are always in one space.
 *
 * 2. AGENT MARKS GO THROUGH THE HUMAN PATH. `place_*` produces a
 *    `DraftAnnotation` — the exact shape a finished canvas gesture produces —
 *    and the caller feeds it to `buildAnnotation`. Labels, the per-kind
 *    numbering, the marker colour and the MAX_ANNOTATIONS_PER_REF cap are
 *    therefore identical whether a human or the model drew it. A parallel
 *    creation path would drift, and the first symptom would be a prompt that
 *    quotes a label no chip on screen shows.
 *
 * 3. THE TOOL ARRAY ORDER IS FROZEN. Tools render at position 0 of the request,
 *    ahead of the system prompt and the ~4,800-token canvas snapshot, and
 *    everything after a changed prefix is a cache miss (§8.3). Reordering this
 *    array re-bills the image at 1× on every turn of every conversation. Append
 *    only; the test asserts the exact sequence.
 *
 * No provider SDK import, deliberately: this module is pulled into the client
 * bundle by the loop, so everything here is structural and provider-neutral.
 * `toOpenAIToolDefs` does the one conversion the wire needs.
 *
 * Tool *descriptions* are load-bearing product surface, not documentation. They
 * are the only thing that makes the model choose `place_box` over `place_arrow`,
 * and the precise/approximate distinction they draw is real: points and boxes
 * leave the image clean and travel as `<point>`/`<bbox>` tags, while brush and
 * arrow get burned into the pixels in magenta (types.ts, VECTOR_TOOLS vs
 * RASTER_TOOLS). Changing the wording changes model behaviour — treat edits
 * here the way you'd treat a code change.
 */

import { clampToImage } from "./coords";
import type { DraftAnnotation } from "./annotations";
import {
  MAX_ANNOTATIONS_PER_REF,
  type Annotation,
  type ArrowAnnotation,
  type EditReference,
  type EditRefRole,
  type EditSession,
  type Vec,
} from "./types";

// ─────────────────────────── Tool definitions ─────────────────────────────

/** A flat tool definition — name, description, schema. Deliberately not any
 *  vendor's type: this module must stay importable on the client, and the one
 *  wire shape that matters is produced by `toOpenAIToolDefs` below. */
export type AgentToolDef = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

/**
 * The same tools in the OpenAI-compatible shape BytePlus expects.
 *
 * The definitions above are stored flat because that reads better in source.
 * The agent actually runs on
 * seed-2-0-pro via /chat/completions, which nests everything under
 * `function` and calls the schema `parameters` instead of `input_schema`.
 *
 * Kept as a conversion rather than a second hand-maintained list: two lists
 * drift, and a tool that exists in one but not the other either can't be
 * called or is called and doesn't exist. Order is preserved because it is a
 * cache prefix, not just a list.
 */
export type OpenAIToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

/**
 * Tools defined but not yet backed by an implementation.
 *
 * They stay in EDIT_AGENT_TOOLS — schema, planner branch and tests are all
 * real — but are withheld from what the model is shown. Advertising a tool
 * that answers "not available in this build" spends tokens describing it on
 * every turn, and hands the user a dead end when the model reasonably picks
 * it. Empty now that layer separation has landed; kept as the seam for the
 * next capability that lands backend-first.
 */
const UNAVAILABLE: ReadonlySet<string> = new Set();

export function toOpenAIToolDefs(
  tools: readonly AgentToolDef[] = EDIT_AGENT_TOOLS.filter(
    (t) => !UNAVAILABLE.has(t.name),
  ),
): OpenAIToolDef[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

/**
 * The wire order. See rule 3 in the header — this is a cache prefix, not a
 * list. The `ToolName` union is derived from it so a new tool cannot be added
 * to one and forgotten in the other.
 */
export const TOOL_NAMES = [
  "inspect_session",
  "place_point",
  "place_box",
  "place_arrow",
  "clear_annotations",
  "set_instruction",
  "add_reference",
  "preview_prompt",
  "render",
  "separate_layers",
  "restore_version",
  "ask_user",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Narrowing guard, so callers can switch on a validated name. */
export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/** Tools that spend the user's money or are hard to undo. The harness holds
 *  these behind an explicit approval chip; the model is told so in the
 *  descriptions, because a model that expects to be interrupted narrates the
 *  wait instead of re-calling the tool. */
const APPROVAL_REQUIRED: ReadonlySet<string> = new Set<ToolName>([
  "render",
  "separate_layers",
]);

export function requiresApproval(name: string): boolean {
  return APPROVAL_REQUIRED.has(name);
}

/** Constrains every entry to a declared name at compile time. */
type EditToolDef = AgentToolDef & { name: ToolName };

/** Repeated in three schemas; kept identical so the model reads one rule. */
const COORD_SPACE =
  "Pixels in the image you were shown, origin at the top-left, x right and y down. " +
  "Use the dimensions inspect_session reports — they are in that same space.";

const NOTE_FIELD = {
  type: "string",
  description:
    "What should change about this specific target, in a few words ('remove the paper ball', " +
    "'dark walnut, keep the lighting'). It is quoted verbatim next to this mark's label in the " +
    "compiled prompt, so write it as an instruction rather than a description of what is there.",
} as const;

export const EDIT_AGENT_TOOLS: readonly EditToolDef[] = [
  {
    name: "inspect_session",
    description:
      "Read the current state of the edit session: every reference image with its id, role, " +
      "dimensions and existing marks; the instruction text; the model and output settings; and " +
      "the version history. Costs nothing and changes nothing.\n\n" +
      "Call this first on any turn where you are not certain of a refId or of what is already " +
      "marked. All dimensions and mark coordinates it returns are in the pixel space of the " +
      "image you were shown, so you can compare them directly against what you see.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "place_point",
    description:
      "Mark one exact location. PRECISE: the point travels to the image model as a coordinate " +
      "tag and the image itself stays clean — nothing is painted over the pixels, so there is " +
      "no markup for the model to accidentally reproduce.\n\n" +
      "Use for a single object to remove, replace or restyle, or a spot where something should " +
      "be added. Prefer this and place_box over place_arrow whenever the target can be " +
      "expressed as a location or an area. Regions you do not mark are preserved.",
    input_schema: {
      type: "object",
      properties: {
        refId: {
          type: "string",
          description: "Which reference image to mark. Get it from inspect_session.",
        },
        x: { type: "number", description: `Horizontal position. ${COORD_SPACE}` },
        y: { type: "number", description: `Vertical position. ${COORD_SPACE}` },
        note: NOTE_FIELD,
      },
      required: ["refId", "x", "y"],
    },
  },
  {
    name: "place_box",
    description:
      "Mark a rectangular region. PRECISE, in the same way as place_point: it travels as a " +
      "coordinate tag and leaves the pixels untouched.\n\n" +
      "Use when the change covers an area rather than a single object — a tabletop, a sky, a " +
      "garment, a sign. Draw the box tight around the thing you mean; a box that swallows half " +
      "the frame invites the model to change everything inside it. The box says WHERE, the note " +
      "says WHAT. Regions you do not mark are preserved.",
    input_schema: {
      type: "object",
      properties: {
        refId: {
          type: "string",
          description: "Which reference image to mark. Get it from inspect_session.",
        },
        x: { type: "number", description: `Left edge. ${COORD_SPACE}` },
        y: { type: "number", description: `Top edge. ${COORD_SPACE}` },
        w: { type: "number", description: "Width in the same pixel space. Must be greater than 0." },
        h: { type: "number", description: "Height in the same pixel space. Must be greater than 0." },
        note: NOTE_FIELD,
      },
      required: ["refId", "x", "y", "w", "h"],
    },
  },
  {
    name: "place_arrow",
    description:
      "Draw an arrow from one place to another. APPROXIMATE, and a last resort: an arrow has no " +
      "coordinate-tag equivalent, so it is drawn into a copy of the image in bright magenta and " +
      "described in prose. The image model sees that markup as pixels and may reproduce it.\n\n" +
      "Use it only for direction or motion that a location cannot express — move this thing " +
      "there, have the subject look that way, extend this line onward. If all you need is to " +
      "identify a target, use place_point or place_box instead.",
    input_schema: {
      type: "object",
      properties: {
        refId: {
          type: "string",
          description: "Which reference image to mark. Get it from inspect_session.",
        },
        fromX: { type: "number", description: `Tail x — where the motion starts. ${COORD_SPACE}` },
        fromY: { type: "number", description: "Tail y, same space." },
        toX: { type: "number", description: "Head x — where it ends or points." },
        toY: { type: "number", description: "Head y, same space." },
        intent: {
          type: "string",
          enum: ["move-to", "look-toward", "extend-along", "point-at"],
          description:
            "What the arrow means, which decides the sentence generated for it. " +
            "'move-to' relocates the thing at the tail; 'look-toward' turns a gaze or a face; " +
            "'extend-along' continues a shape or path; 'point-at' just indicates the head.",
        },
        note: NOTE_FIELD,
      },
      required: ["refId", "fromX", "fromY", "toX", "toY", "intent"],
    },
  },
  {
    name: "clear_annotations",
    description:
      "Remove marks from a reference. Pass `ids` to remove specific ones, or omit it to clear " +
      "the reference entirely. Use this when you have changed your mind about a region, or " +
      "before re-marking after a render — stale marks from a previous intent stay in the " +
      "compiled prompt and will be acted on again.",
    input_schema: {
      type: "object",
      properties: {
        refId: { type: "string", description: "Which reference to clear." },
        ids: {
          type: "array",
          items: { type: "string" },
          description:
            "Annotation ids, as reported by inspect_session. Omit to remove every mark on the " +
            "reference.",
        },
      },
      required: ["refId"],
    },
  },
  {
    name: "set_instruction",
    description:
      "Set the prompt text that goes to the image model, replacing whatever is there. The marks " +
      "are appended to it automatically as coordinate tags, so do not restate coordinates — " +
      "refer to marks by their labels ('Region 01', 'Mark 02') as inspect_session reports them.\n\n" +
      "Write it as an instruction to an image model, not as a message to the user: concrete " +
      "nouns, explicit materials and colours, and an explicit statement of what must stay the " +
      "same ('keep the lighting, the shadows and the background unchanged'). Unmarked regions " +
      "are preserved by default, but saying so measurably improves adherence.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The full instruction. Replaces the existing text." },
      },
      required: ["text"],
    },
  },
  {
    name: "add_reference",
    description:
      "Add another image to the session — a subject to insert, a style to imitate, or a sketch " +
      "to follow. The base image is already there; use this only when the edit genuinely needs " +
      "a second image, since every extra reference dilutes the model's attention.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "An https URL or a same-origin path beginning with '/'. Data URIs are rejected.",
        },
        role: {
          type: "string",
          enum: ["base", "subject", "style", "sketch"],
          description:
            "'subject' contributes a person or object, 'style' contributes look and palette " +
            "only, 'sketch' is a layout guide to follow. 'base' is the image being edited and " +
            "normally already exists.",
        },
      },
      required: ["url", "role"],
    },
  },
  {
    name: "preview_prompt",
    description:
      "Return the exact string that would be sent to the image model right now — instruction, " +
      "coordinate tags and all — without sending it and without spending anything. Use it to " +
      "check your marks compiled the way you expected before asking for a render.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "render",
    description:
      "Generate the edited image from the current marks and instruction. THIS COSTS THE USER " +
      "MONEY and will pause for their explicit approval — it does not run until they accept, so " +
      "expect to wait rather than calling it again.\n\n" +
      "Do everything else first: place every mark, set the instruction, and preview_prompt if " +
      "you are unsure. One render per intent — do not iterate by rendering repeatedly. It uses " +
      "the session's current model, aspect and quality; there is nothing to configure here.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "separate_layers",
    description:
      "Split a reference into independently movable layers — a background plate plus the " +
      "elements on it. THIS COSTS THE USER MONEY and will pause for their explicit approval.\n\n" +
      "Use it when the request is about rearranging or isolating existing elements rather than " +
      "changing what they look like. For a change of appearance, mark and render instead.",
    input_schema: {
      type: "object",
      properties: {
        refId: { type: "string", description: "Which reference to split." },
        mode: {
          type: "string",
          enum: ["auto", "region"],
          description:
            "'auto' lets the model decide what the elements are. 'region' restricts it to the " +
            "boxes already marked on the reference, which is what you want when only one thing " +
            "needs to come out.",
        },
        maxLayers: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description:
            "Ceiling on the elements returned, 1-10, excluding the background plate. Ask for " +
            "the fewest that do the job — more layers means more seams to fix.",
        },
      },
      required: ["refId", "mode"],
    },
  },
  {
    name: "restore_version",
    description:
      "Roll the canvas back to an earlier version. Restores both the pixels and the marks that " +
      "produced them, so the session returns to the state it was in before that render — " +
      "anything marked since is lost. Version ids come from inspect_session.",
    input_schema: {
      type: "object",
      properties: {
        versionId: { type: "string", description: "Which version to restore." },
      },
      required: ["versionId"],
    },
  },
  {
    name: "ask_user",
    description:
      "Ask the user a question and wait for the answer. Use it when a choice genuinely changes " +
      "the output and nothing in the image or the request tells you which way to go — which of " +
      "two objects they meant, or a material you would otherwise be inventing.\n\n" +
      "Do not use it to ask permission to render; render has its own approval gate. Do not use " +
      "it for questions you could answer by looking at the image.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "One specific question." },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Two to four concrete choices, offered as buttons. Omit for open answers.",
        },
      },
      required: ["question"],
    },
  },
];

// ─────────────────────────── Plans ────────────────────────────────────────

/** Result of interpreting one tool call, before anything is applied. */
export type ToolPlan =
  | {
      kind: "annotation.add";
      refId: string;
      draft: DraftAnnotation;
      /** Per-mark instruction. Carried alongside the draft rather than inside
       *  it because `DraftAnnotation` models a *gesture*, and a gesture has no
       *  note — the human types it into the chip afterwards. The caller sets
       *  both fields on the annotation `buildAnnotation` returns. */
      note?: string;
      /** Arrow semantics, same reasoning: not part of the gesture. */
      intent?: ArrowAnnotation["intent"];
    }
  | { kind: "annotation.remove"; refId: string; ids: string[] }
  | { kind: "session.patch"; patch: { instruction?: string } }
  | { kind: "reference.add"; url: string; role: EditRefRole }
  | { kind: "render" }
  | {
      kind: "separate_layers";
      refId: string;
      mode: "auto" | "region";
      maxLayers?: number;
    }
  | { kind: "restore_version"; versionId: string }
  | { kind: "inspect" }
  | { kind: "preview_prompt" }
  | { kind: "ask_user"; question: string; options?: string[] };

export type PlanResult = { ok: true; plan: ToolPlan } | { ok: false; error: string };

/**
 * Stroke width for an agent-drawn arrow, in image pixels — the same default
 * the tool rail starts a human on. There is no width argument on place_arrow:
 * it is a rendering detail the model has no basis for choosing, and exposing
 * it would just be one more thing to get wrong.
 */
const AGENT_STROKE_WIDTH = 24;

const ARROW_INTENTS: readonly NonNullable<ArrowAnnotation["intent"]>[] = [
  "move-to",
  "look-toward",
  "extend-along",
  "point-at",
];

const REF_ROLES: readonly EditRefRole[] = ["base", "subject", "style", "sketch"];

const MAX_LAYERS_CEILING = 10;

/**
 * Snapshot scale per reference id: snapshot_px = image_px * scale.
 *
 * A missing entry means "not downscaled" — the honest default for a reference
 * the harness never showed the model, whose coordinates can only have come
 * from `inspect_session`, which reports it at scale 1.
 */
export type ScaleMap = Readonly<Record<string, number>>;

export type PlanContext = { session: EditSession; scales: ScaleMap };

/**
 * Validate + interpret one tool call. Pure: it reads `ctx.session` and returns
 * a description of a change, and never throws — a thrown error inside a tool
 * loop kills the turn, whereas an `error` string goes back as a tool_result and
 * the model corrects itself on the next turn. That is why every message below
 * is written as an instruction the model can act on.
 *
 * Every coordinate that arrives here is in the snapshot space of the reference
 * it targets and leaves in intrinsic space. See rule 1 in the header.
 */
export function planToolCall(
  name: string,
  input: unknown,
  ctx: PlanContext,
): PlanResult {
  try {
    return { ok: true, plan: interpret(name, input, ctx) };
  } catch (err) {
    // PlanError is the expected path. Anything else is a bug in this file, and
    // still must not escape into the loop — report it the same way so the turn
    // survives and the message reaches a human in the transcript.
    if (err instanceof PlanError) return { ok: false, error: err.message };
    return {
      ok: false,
      error: `Could not run \`${name}\`: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function interpret(name: string, input: unknown, ctx: PlanContext): ToolPlan {
  if (!isToolName(name)) {
    fail(`Unknown tool \`${name}\`. Available tools: ${TOOL_NAMES.join(", ")}.`);
  }

  const args = asObject(name, input);
  const { session } = ctx;
  /** The factor for whichever reference this call targets. Resolved after the
   *  ref is known, because there is no session-wide answer. */
  const scaleOf = (refId: string) => effectiveScale(ctx.scales[refId]);

  switch (name) {
    case "inspect_session":
      return { kind: "inspect" };

    case "preview_prompt":
      return { kind: "preview_prompt" };

    case "render":
      return { kind: "render" };

    case "place_point": {
      const ref = requireRef(session, args, name);
      const at = toIntrinsicPoint(
        reqNumber(args, "x", name),
        reqNumber(args, "y", name),
        ref,
        scaleOf(ref.id),
      );
      return {
        kind: "annotation.add",
        refId: ref.id,
        draft: { kind: "point", at },
        note: optString(args, "note", name),
      };
    }

    case "place_box": {
      const ref = requireRef(session, args, name);
      const x = reqNumber(args, "x", name);
      const y = reqNumber(args, "y", name);
      const w = reqNumber(args, "w", name);
      const h = reqNumber(args, "h", name);

      // Checked in snapshot space, i.e. against the numbers the model actually
      // produced, so the correction it reads matches what it wrote. A negative
      // width here is a model that put the corners in the wrong order, not a
      // rounding artefact of ours.
      if (w <= 0 || h <= 0) {
        fail(
          `\`place_box\` needs a positive width and height; got w=${w}, h=${h}. ` +
            "Pass the top-left corner as x/y and the size as w/h, not the bottom-right corner.",
        );
      }

      // Both corners are converted independently rather than converting the
      // origin and scaling the size: rounding the far edge where the model put
      // it keeps the region's outer boundary correct, which is what a bbox tag
      // is read against. Deriving w from a rounded origin drifts a pixel at a
      // time as the box moves right.
      const s = scaleOf(ref.id);
      const [x1, x2] = clampSpan(
        toIntrinsic(x, s),
        toIntrinsic(x + w, s),
        ref.width,
      );
      const [y1, y2] = clampSpan(
        toIntrinsic(y, s),
        toIntrinsic(y + h, s),
        ref.height,
      );

      return {
        kind: "annotation.add",
        refId: ref.id,
        draft: { kind: "box", rect: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } },
        note: optString(args, "note", name),
      };
    }

    case "place_arrow": {
      const ref = requireRef(session, args, name);
      const s = scaleOf(ref.id);
      const from = toIntrinsicPoint(
        reqNumber(args, "fromX", name),
        reqNumber(args, "fromY", name),
        ref,
        s,
      );
      const to = toIntrinsicPoint(
        reqNumber(args, "toX", name),
        reqNumber(args, "toY", name),
        ref,
        s,
      );
      const intent = reqEnum(args, "intent", ARROW_INTENTS, name);
      return {
        kind: "annotation.add",
        refId: ref.id,
        draft: { kind: "arrow", from, to, width: AGENT_STROKE_WIDTH },
        note: optString(args, "note", name),
        intent,
      };
    }

    case "clear_annotations": {
      const ref = requireRef(session, args, name);
      const requested = optStringArray(args, "ids", name);
      if (!requested) {
        return {
          kind: "annotation.remove",
          refId: ref.id,
          ids: ref.annotations.map((a) => a.id),
        };
      }
      // Resolving ids against the reference here, rather than letting the store
      // no-op on a miss, is what turns "nothing happened" into a message the
      // model can recover from. A hallucinated id is the likeliest failure of
      // this tool by a wide margin.
      const missing = requested.filter((id) => !ref.annotations.some((a) => a.id === id));
      if (missing.length > 0) {
        fail(
          `No annotation ${quoteList(missing)} on refId ${q(ref.id)}. ` +
            `That reference has: ${describeMarks(ref.annotations)}.`,
        );
      }
      return { kind: "annotation.remove", refId: ref.id, ids: requested };
    }

    case "set_instruction":
      return {
        kind: "session.patch",
        patch: { instruction: reqString(args, "text", name) },
      };

    case "add_reference": {
      const url = reqString(args, "url", name);
      if (/^data:/i.test(url)) {
        // types.ts invariant 1: nothing but URLs is persisted. A data URI would
        // be written straight into localStorage and take the whole session's
        // quota with it.
        fail(
          "`add_reference` cannot take a data: URI — references are stored as URLs. " +
            "Pass an https URL or a same-origin path beginning with '/'.",
        );
      }
      if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) {
        fail(
          `\`add_reference\` needs an https URL or a same-origin path beginning with '/'; got ${q(url)}.`,
        );
      }
      return { kind: "reference.add", url, role: reqEnum(args, "role", REF_ROLES, name) };
    }

    case "separate_layers": {
      const ref = requireRef(session, args, name);
      const mode = reqEnum(args, "mode", ["auto", "region"] as const, name);
      const maxLayers = optNumber(args, "maxLayers", name);
      if (maxLayers !== undefined) {
        if (!Number.isInteger(maxLayers) || maxLayers < 1 || maxLayers > MAX_LAYERS_CEILING) {
          fail(
            `\`separate_layers\` needs \`maxLayers\` to be a whole number from 1 to ${MAX_LAYERS_CEILING}; got ${maxLayers}. ` +
              "Omit it to let the model decide.",
          );
        }
      }
      return { kind: "separate_layers", refId: ref.id, mode, maxLayers };
    }

    case "restore_version": {
      const versionId = reqString(args, "versionId", name);
      if (!session.versions.some((v) => v.id === versionId)) {
        fail(
          `versionId ${q(versionId)} not found; the session has: ${
            session.versions.length === 0
              ? "no versions yet — nothing has been rendered"
              : session.versions.map((v) => q(v.id)).join(", ")
          }.`,
        );
      }
      return { kind: "restore_version", versionId };
    }

    case "ask_user":
      return {
        kind: "ask_user",
        question: reqString(args, "question", name),
        options: optStringArray(args, "options", name),
      };
  }
}

// ─────────────────────── Session description ──────────────────────────────

/**
 * A compact JSON view of the session, for the `inspect_session` tool result.
 *
 * EVERY DIMENSION AND COORDINATE IS MULTIPLIED BY THAT REFERENCE'S OWN SCALE,
 * so what the model reads for image N is in the same space as the snapshot of
 * image N it is looking at, and the same space `planToolCall` expects back for
 * that image. Reporting intrinsic pixels instead would hand the model a
 * coordinate system nobody showed it, and it would aim confidently into empty
 * space — with a scale typically well under 1, off the bottom-right of the
 * frame. Reporting ONE scale for a set of differently-sized references has the
 * same effect on every image but the first.
 *
 * Deliberately not a full dump. It is re-sent on every subsequent turn as part
 * of the transcript, so brush point arrays (hundreds of numbers each) are
 * reduced to a count and a bounding box: the model can see where a stroke is
 * without paying for its vertices on every turn thereafter.
 */
export function describeSession(session: EditSession, scales: ScaleMap): unknown {
  return {
    coordinateSpace: {
      note:
        "Each reference below is described in the pixel space of the image you were shown for " +
        "THAT reference — its own width and height, not the session's. Give coordinates back " +
        "in the space of whichever reference you are marking.",
    },
    instruction: session.instruction,
    model: session.model,
    aspectRatio: session.aspectRatio,
    quality: session.qualityId,
    seed: session.seed,
    activeRefId: session.activeRefId,
    maxAnnotationsPerRef: MAX_ANNOTATIONS_PER_REF,
    refs: session.refs.map((ref, i) => {
      const s = effectiveScale(scales[ref.id]);
      return {
        id: ref.id,
        // 1-based, matching the position the compiled prompt refers to images
        // by ("image 1"). Not an array index — see CompileRef in
        // annotation-prompt.ts.
        index: i + 1,
        role: ref.role,
        label: ref.label,
        width: Math.round(ref.width * s),
        height: Math.round(ref.height * s),
        // Stated per reference so a model that wants to reason about the
        // mapping can, and so a wrong one is visible in the transcript rather
        // than only in the marks it produces.
        shownAtScale: s,
        annotationCount: ref.annotations.length,
        annotations: ref.annotations.map((a) => describeAnnotation(a, s)),
      };
    }),
    versions: session.versions.map((v) => ({
      id: v.id,
      createdAt: v.createdAt,
      instruction: v.instruction,
      status: v.status,
      outputCount: v.outputs.length,
      error: v.error,
    })),
    layerSets: session.layerSets.map((l) => ({
      id: l.id,
      sourceRefId: l.sourceRefId,
      status: l.status,
      layerCount: l.layers.length,
    })),
  };
}

function describeAnnotation(a: Annotation, s: number): unknown {
  const base = { id: a.id, label: a.label, kind: a.kind, note: a.note, hidden: a.hidden };
  switch (a.kind) {
    case "point":
      return { ...base, at: scalePoint(a.at, s) };
    case "box":
      return {
        ...base,
        rect: {
          x: Math.round(a.rect.x * s),
          y: Math.round(a.rect.y * s),
          w: Math.round(a.rect.w * s),
          h: Math.round(a.rect.h * s),
        },
      };
    case "arrow":
      return { ...base, from: scalePoint(a.from, s), to: scalePoint(a.to, s), intent: a.intent };
    case "brush":
      return { ...base, pointCount: Math.floor(a.points.length / 2), bounds: brushBounds(a.points, s) };
  }
}

function brushBounds(points: number[], s: number): unknown {
  if (points.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return {
    x: Math.round(minX * s),
    y: Math.round(minY * s),
    w: Math.round((maxX - minX) * s),
    h: Math.round((maxY - minY) * s),
  };
}

function scalePoint(p: Vec, s: number): Vec {
  return { x: Math.round(p.x * s), y: Math.round(p.y * s) };
}

// ─────────────────────── Coordinate conversion ────────────────────────────

/**
 * A scale of 0, NaN or a negative comes from a harness that failed to measure
 * the snapshot, not from the model. Falling back to 1 keeps the marks in the
 * right *place* for the common case where no downscale happened at all, and
 * fails visibly rather than dividing by zero and storing Infinity.
 */
function effectiveScale(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Snapshot px -> image-intrinsic px. The one place the division happens. */
function toIntrinsic(v: number, scale: number): number {
  return Math.round(v / scale);
}

/**
 * Rescale, then clamp into the reference. Clamping rather than rejecting is
 * deliberate: a model that names the right object and misses the frame edge by
 * three pixels should get its mark, not a lecture. Boundary-inclusive, matching
 * clampToImage and isInsideImage — the last row of pixels is on the image.
 */
function toIntrinsicPoint(x: number, y: number, ref: EditReference, scale: number): Vec {
  return clampToImage(
    { x: toIntrinsic(x, scale), y: toIntrinsic(y, scale) },
    ref.width,
    ref.height,
  );
}

/**
 * Clamp one axis of a box into [0, extent], keeping at least one pixel of span.
 *
 * The floor matters. A box that lands entirely off the right edge clamps to
 * lo === hi === extent, i.e. a zero-area rect, which normalizes to a degenerate
 * bbox tag the image model either ignores or reads as some other region. One
 * pixel of span at the edge is wrong but honest — the compiler demotes tiny
 * boxes to a point at their centre, which is the best available reading of
 * "the thing just past this edge".
 */
function clampSpan(a: number, b: number, extent: number): [number, number] {
  if (!Number.isFinite(extent) || extent <= 0) return [0, 0];
  let lo = clamp(Math.min(a, b), 0, extent);
  let hi = clamp(Math.max(a, b), 0, extent);
  if (hi - lo < 1) {
    if (extent < 1) return [0, extent];
    if (lo >= extent) lo = extent - 1;
    hi = Math.min(extent, lo + 1);
  }
  return [lo, hi];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// ─────────────────────── Argument validation ──────────────────────────────

/**
 * Internal-only. `planToolCall` catches this and returns it as `{ ok: false }`,
 * which lets the validators above read as straight-line code instead of
 * threading a result type through every field read. Nothing outside this file
 * ever sees it.
 */
class PlanError extends Error {}

function fail(message: string): never {
  throw new PlanError(message);
}

function asObject(tool: string, input: unknown): Record<string, unknown> {
  if (input === null || input === undefined) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    fail(`\`${tool}\` needs a JSON object of arguments; got ${describeValue(input)}.`);
  }
  return input as Record<string, unknown>;
}

function reqNumber(args: Record<string, unknown>, key: string, tool: string): number {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    fail(`\`${tool}\` needs a finite number for \`${key}\`; got ${describeValue(v)}.`);
  }
  return v;
}

function optNumber(
  args: Record<string, unknown>,
  key: string,
  tool: string,
): number | undefined {
  if (args[key] === undefined || args[key] === null) return undefined;
  return reqNumber(args, key, tool);
}

function reqString(args: Record<string, unknown>, key: string, tool: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.trim() === "") {
    fail(`\`${tool}\` needs a non-empty string for \`${key}\`; got ${describeValue(v)}.`);
  }
  return v;
}

function optString(
  args: Record<string, unknown>,
  key: string,
  tool: string,
): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") {
    fail(`\`${tool}\` needs a string for \`${key}\`; got ${describeValue(v)}.`);
  }
  return v.trim() === "" ? undefined : v;
}

function optStringArray(
  args: Record<string, unknown>,
  key: string,
  tool: string,
): string[] | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((e) => typeof e !== "string")) {
    fail(`\`${tool}\` needs an array of strings for \`${key}\`; got ${describeValue(v)}.`);
  }
  return v as string[];
}

function reqEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  tool: string,
): T {
  const v = args[key];
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    fail(
      `\`${tool}\` needs \`${key}\` to be one of ${allowed.map(q).join(", ")}; got ${describeValue(v)}.`,
    );
  }
  return v as T;
}

/**
 * The refId lookup, and the error the model sees most often. It lists the ids
 * that DO exist, because the recovery from a wrong refId is picking a right
 * one — and a model that has to call inspect_session again has burned a turn
 * and re-sent the canvas snapshot to learn one string.
 */
function requireRef(
  session: EditSession,
  args: Record<string, unknown>,
  tool: string,
): EditReference {
  const refId = reqString(args, "refId", tool);
  const ref = session.refs.find((r) => r.id === refId);
  if (!ref) {
    fail(
      `refId ${q(refId)} not found; the session has: ${
        session.refs.length === 0
          ? "no references at all — add one with add_reference"
          : session.refs.map((r) => q(r.id)).join(", ")
      }.`,
    );
  }
  if (!(ref.width > 0) || !(ref.height > 0)) {
    // An unmeasured ref clamps every coordinate to 0, so the marks would all
    // land in the top-left corner with no visible cause.
    fail(
      `Reference ${q(refId)} has no measured dimensions yet (${ref.width}x${ref.height}), ` +
        "so coordinates cannot be placed on it. Use a different reference.",
    );
  }
  return ref;
}

function describeMarks(annotations: Annotation[]): string {
  if (annotations.length === 0) return "no annotations";
  return annotations.map((a) => `${q(a.id)} (${a.label})`).join(", ");
}

function quoteList(ids: string[]): string {
  return ids.map(q).join(", ");
}

function q(v: string): string {
  return `'${v}'`;
}

function describeValue(v: unknown): string {
  if (v === undefined) return "nothing";
  if (v === null) return "null";
  if (typeof v === "string") return q(v);
  if (Array.isArray(v)) return `an array of ${v.length}`;
  if (typeof v === "object") return "an object";
  return String(v);
}
