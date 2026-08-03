/**
 * The agent tool surface.
 *
 * Two families of test here, and they guard very different things.
 *
 * The coordinate tests are the reason this file exists. A rescale bug does not
 * crash, does not warn, and does not look like a bug — the marks land in the
 * wrong place and everyone blames the model's eyesight. So the scale factor is
 * exercised at 1 (no downscale), at 0.5 (the arithmetic is obvious by hand),
 * and at an ugly non-round factor round-tripped against the dimensions
 * `describeSession` actually reports, which is the only assertion that proves
 * the two halves of the contract agree.
 *
 * The rest is contract-freezing: the tool array's order is a prompt-cache
 * prefix (PRD §8.3) and reordering it silently re-bills the canvas snapshot on
 * every turn, so the exact sequence is asserted rather than described.
 */

import { describe, expect, it } from "vitest";
import {
  EDIT_AGENT_TOOLS,
  TOOL_NAMES,
  describeSession,
  planToolCall,
  requiresApproval,
  type PlanResult,
  type ToolPlan,
} from "./agent-tools";
import { buildAnnotation } from "./annotations";
import { MARKER_COLOR, VECTOR_MARK_COLOR } from "./types";
import type { Annotation, EditReference, EditSession, EditVersion } from "./types";

// ─────────────────────────── Fixtures ─────────────────────────────────────

function ref(over: Partial<EditReference> = {}): EditReference {
  return {
    id: "ref-a",
    url: "/library-cache/a.png",
    width: 1000,
    height: 800,
    role: "base",
    annotations: [],
    ...over,
  };
}

function version(over: Partial<EditVersion> = {}): EditVersion {
  return {
    id: "v1",
    createdAt: 1,
    instruction: "make it walnut",
    compiledPrompt: "make it walnut",
    model: "seedream-5-pro",
    size: "1000x800",
    refIds: ["ref-a"],
    annotationsSnapshot: {},
    outputs: [{ url: "/library-cache/out.png" }],
    status: "done",
    ...over,
  };
}

function session(over: Partial<EditSession> = {}): EditSession {
  return {
    id: "s1",
    name: "Untitled Edit",
    createdAt: 0,
    updatedAt: 0,
    refs: [ref()],
    activeRefId: "ref-a",
    instruction: "",
    model: "seedream-5-pro",
    aspectRatio: "source",
    qualityId: "2k",
    versions: [],
    layerSets: [],
    view: { scale: 1, x: 0, y: 0 },
    ...over,
  };
}

function plan(
  name: string,
  input: unknown,
  opts: { session?: EditSession; scale?: number; scales?: Record<string, number> } = {},
): PlanResult {
  return planToolCall(name, input, {
    session: opts.session ?? session(),
    // One scale for every reference unless a test needs them to differ —
    // `scale` is the common case, `scales` the per-reference one.
    scales:
      opts.scales ??
      Object.fromEntries(
        (opts.session ?? session()).refs.map((r) => [r.id, opts.scale ?? 1]),
      ),
  });
}

/** Unwraps a plan that is expected to succeed, failing loudly if it didn't. */
function ok(result: PlanResult): ToolPlan {
  if (!result.ok) throw new Error(`expected a plan, got error: ${result.error}`);
  return result.plan;
}

function err(result: PlanResult): string {
  if (result.ok) throw new Error(`expected an error, got a ${result.plan.kind} plan`);
  return result.error;
}

type Described = {
  coordinateSpace: { note: string };
  instruction: string;
  activeRefId: string | null;
  refs: Array<{
    id: string;
    index: number;
    width: number;
    height: number;
    shownAtScale: number;
    annotationCount: number;
    annotations: Array<Record<string, unknown>>;
  }>;
  versions: Array<{ id: string; status: string }>;
};

function described(s: EditSession, scale: number): Described {
  return describeSession(
    s,
    Object.fromEntries(s.refs.map((r) => [r.id, scale])),
  ) as Described;
}

// ─────────────────────────── Tool definitions ─────────────────────────────

describe("EDIT_AGENT_TOOLS", () => {
  it("exposes exactly the PRD §8.2 surface, in a frozen order", () => {
    // This order is a prompt-cache prefix. Changing it is a cost regression,
    // not a cosmetic one — see the header.
    expect(EDIT_AGENT_TOOLS.map((t) => t.name)).toEqual([
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
    ]);
    expect(EDIT_AGENT_TOOLS.map((t) => t.name)).toEqual([...TOOL_NAMES]);
  });

  it("gives every tool an object schema and a substantial description", () => {
    for (const tool of EDIT_AGENT_TOOLS) {
      expect(tool.input_schema.type).toBe("object");
      expect(typeof tool.input_schema.properties).toBe("object");
      // Descriptions are what make the model pick the right tool; a one-liner
      // here is a behavioural regression that no other test would catch.
      expect(tool.description.length).toBeGreaterThan(80);
    }
  });

  it("only marks properties required that the schema actually declares", () => {
    for (const tool of EDIT_AGENT_TOOLS) {
      for (const key of tool.input_schema.required ?? []) {
        expect(Object.keys(tool.input_schema.properties)).toContain(key);
      }
    }
  });

  it("tells the model which tools cost money", () => {
    // Both paid tools must say so in their own description — the approval gate
    // is in the harness, but a model that doesn't expect the pause re-calls.
    for (const tool of EDIT_AGENT_TOOLS) {
      if (requiresApproval(tool.name)) {
        expect(tool.description).toContain("COSTS THE USER MONEY");
      }
    }
  });

  it("steers away from the raster tools by naming the tradeoff", () => {
    const byName = new Map(EDIT_AGENT_TOOLS.map((t) => [t.name, t.description]));
    expect(byName.get("place_point")).toContain("PRECISE");
    expect(byName.get("place_box")).toContain("PRECISE");
    expect(byName.get("place_arrow")).toContain("APPROXIMATE");
    expect(byName.get("place_point")).toContain("preserved");
  });
});

describe("requiresApproval", () => {
  it("gates exactly render and separate_layers", () => {
    const gated = TOOL_NAMES.filter(requiresApproval);
    expect(gated).toEqual(["render", "separate_layers"]);
  });

  it("is false for anything it has never heard of", () => {
    expect(requiresApproval("delete_everything")).toBe(false);
  });
});

// ─────────────────────── The coordinate rescale ───────────────────────────

describe("coordinate rescale", () => {
  it("passes coordinates straight through at scale 1", () => {
    const p = ok(plan("place_point", { refId: "ref-a", x: 312, y: 187 }));
    expect(p).toMatchObject({
      kind: "annotation.add",
      refId: "ref-a",
      draft: { kind: "point", at: { x: 312, y: 187 } },
    });
  });

  it("divides by the snapshot scale, not multiplies", () => {
    // The snapshot was half size, so a mark at 250 in the snapshot is at 500 in
    // the image. Multiplying instead would put it at 125 — plausible-looking,
    // consistently wrong, and invisible without this assertion.
    const p = ok(plan("place_point", { refId: "ref-a", x: 250, y: 200 }, { scale: 0.5 }));
    expect(p).toMatchObject({ draft: { kind: "point", at: { x: 500, y: 400 } } });
  });

  it("rounds to whole pixels", () => {
    const p = ok(plan("place_point", { refId: "ref-a", x: 100, y: 100 }, { scale: 0.3 }));
    const at = (p as Extract<ToolPlan, { kind: "annotation.add" }>).draft;
    expect(at).toEqual({ kind: "point", at: { x: 333, y: 333 } });
  });

  it("treats a missing or nonsensical scale as 1 rather than dividing by zero", () => {
    for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = ok(plan("place_point", { refId: "ref-a", x: 10, y: 20 }, { scale }));
      expect(p).toMatchObject({ draft: { kind: "point", at: { x: 10, y: 20 } } });
    }
  });

  it("round-trips against the dimensions describeSession reported", () => {
    // The load-bearing agreement: the model is told the image is NxM, aims at
    // its far corner, and the mark must land on the far corner of the real
    // image — not somewhere in the middle of it.
    const s = session();
    for (const scale of [1, 0.5, 0.3712, 0.8]) {
      const view = described(s, scale);
      const r = view.refs[0];

      const corner = ok(
        plan("place_point", { refId: "ref-a", x: r.width, y: r.height }, { session: s, scale }),
      );
      const cornerDraft = (corner as Extract<ToolPlan, { kind: "annotation.add" }>).draft;
      if (cornerDraft.kind !== "point") throw new Error("expected a point draft");
      // Within a pixel, never past the edge. It cannot be exact: the reported
      // width is itself rounded, so at 0.3712 the model is told "371" and 371
      // snapshot px is 999.46 image px. One pixel of rounding loss is the
      // honest ceiling; anything larger is a scaling bug.
      expect(cornerDraft.at.x).toBeGreaterThanOrEqual(999);
      expect(cornerDraft.at.x).toBeLessThanOrEqual(1000);
      expect(cornerDraft.at.y).toBeGreaterThanOrEqual(799);
      expect(cornerDraft.at.y).toBeLessThanOrEqual(800);

      // And the midpoint comes back within a pixel of the true midpoint.
      const mid = ok(
        plan(
          "place_point",
          { refId: "ref-a", x: Math.round(r.width / 2), y: Math.round(r.height / 2) },
          { session: s, scale },
        ),
      );
      const at = (mid as Extract<ToolPlan, { kind: "annotation.add" }>).draft;
      if (at.kind !== "point") throw new Error("expected a point draft");
      expect(Math.abs(at.at.x - 500)).toBeLessThanOrEqual(1);
      expect(Math.abs(at.at.y - 400)).toBeLessThanOrEqual(1);
    }
  });

  it("clamps a point the model placed outside the frame", () => {
    const p = ok(plan("place_point", { refId: "ref-a", x: 1600, y: -40 }));
    expect(p).toMatchObject({ draft: { kind: "point", at: { x: 1000, y: 0 } } });
  });

  it("clamps at the downscaled frame edge too", () => {
    // 620 in a 0.5 snapshot is 1240 in the image — off the right edge.
    const p = ok(plan("place_point", { refId: "ref-a", x: 620, y: 10 }, { scale: 0.5 }));
    expect(p).toMatchObject({ draft: { kind: "point", at: { x: 1000, y: 20 } } });
  });

  it("scales a box by both corners and clamps it into the frame", () => {
    const p = ok(plan("place_box", { refId: "ref-a", x: 50, y: 20, w: 100, h: 60 }, { scale: 0.5 }));
    expect(p).toMatchObject({
      draft: { kind: "box", rect: { x: 100, y: 40, w: 200, h: 120 } },
    });
  });

  it("never collapses an out-of-frame box to zero area", () => {
    // Entirely past the right edge. A zero-width rect normalizes to a
    // degenerate bbox tag the image model reads as some other region.
    const p = ok(plan("place_box", { refId: "ref-a", x: 1200, y: 10, w: 100, h: 100 }));
    const draft = (p as Extract<ToolPlan, { kind: "annotation.add" }>).draft;
    if (draft.kind !== "box") throw new Error("expected a box draft");
    expect(draft.rect.w).toBeGreaterThanOrEqual(1);
    expect(draft.rect.h).toBeGreaterThanOrEqual(1);
    expect(draft.rect.x + draft.rect.w).toBeLessThanOrEqual(1000);
  });

  it("clamps an arrow's tail and head independently", () => {
    const p = ok(
      plan("place_arrow", {
        refId: "ref-a",
        fromX: -50,
        fromY: 400,
        toX: 900,
        toY: 9000,
        intent: "move-to",
      }),
    );
    expect(p).toMatchObject({
      draft: { kind: "arrow", from: { x: 0, y: 400 }, to: { x: 900, y: 800 } },
      intent: "move-to",
    });
  });
});

// ─────────────────────── Annotation plans ─────────────────────────────────

describe("place_* plans", () => {
  it("produces drafts buildAnnotation accepts, with the human labelling", () => {
    // The whole point of returning a DraftAnnotation: the agent's marks are
    // built by the same function a canvas gesture goes through, so labels,
    // colour and numbering cannot drift between the two paths.
    const existing: Annotation[] = [];
    for (const call of [
      ["place_point", { refId: "ref-a", x: 10, y: 10 }],
      ["place_box", { refId: "ref-a", x: 10, y: 10, w: 40, h: 40 }],
      ["place_point", { refId: "ref-a", x: 90, y: 90 }],
      ["place_arrow", { refId: "ref-a", fromX: 0, fromY: 0, toX: 9, toY: 9, intent: "point-at" }],
    ] as const) {
      const p = ok(plan(call[0], call[1]));
      const draft = (p as Extract<ToolPlan, { kind: "annotation.add" }>).draft;
      existing.push(buildAnnotation(draft, existing, { id: `a${existing.length}` }));
    }

    expect(existing.map((a) => a.label)).toEqual([
      "Mark 01",
      "Region 01",
      "Mark 02",
      "Arrow 01",
    ]);
    // Colour by kind, identical on both paths: vector marks are drawn in the
    // display green, raster marks in the magenta that gets burned into the
    // pixels and named in the prose.
    expect(existing.map((a) => a.color)).toEqual([
      VECTOR_MARK_COLOR,
      VECTOR_MARK_COLOR,
      VECTOR_MARK_COLOR,
      MARKER_COLOR,
    ]);
  });

  it("carries the note and the arrow intent beside the draft", () => {
    const boxed = ok(
      plan("place_box", { refId: "ref-a", x: 1, y: 1, w: 5, h: 5, note: "dark walnut" }),
    );
    expect(boxed).toMatchObject({ note: "dark walnut" });

    const arrow = ok(
      plan("place_arrow", {
        refId: "ref-a",
        fromX: 1,
        fromY: 1,
        toX: 5,
        toY: 5,
        intent: "look-toward",
      }),
    );
    expect(arrow).toMatchObject({ intent: "look-toward" });
  });

  it("drops a blank note rather than storing an empty chip", () => {
    const p = ok(plan("place_point", { refId: "ref-a", x: 1, y: 1, note: "   " }));
    expect((p as { note?: string }).note).toBeUndefined();
  });
});

describe("clear_annotations", () => {
  const marked = session({
    refs: [
      ref({
        annotations: [
          { id: "m1", kind: "point", label: "Mark 01", color: "#FF00E5", createdAt: 0, at: { x: 1, y: 1 } },
          { id: "m2", kind: "point", label: "Mark 02", color: "#FF00E5", createdAt: 0, at: { x: 2, y: 2 } },
        ],
      }),
    ],
  });

  it("expands an omitted id list to every mark on the reference", () => {
    expect(ok(plan("clear_annotations", { refId: "ref-a" }, { session: marked }))).toEqual({
      kind: "annotation.remove",
      refId: "ref-a",
      ids: ["m1", "m2"],
    });
  });

  it("passes an explicit subset through", () => {
    expect(ok(plan("clear_annotations", { refId: "ref-a", ids: ["m2"] }, { session: marked }))).toEqual({
      kind: "annotation.remove",
      refId: "ref-a",
      ids: ["m2"],
    });
  });

  it("names the marks that do exist when an id is hallucinated", () => {
    const message = err(plan("clear_annotations", { refId: "ref-a", ids: ["m9"] }, { session: marked }));
    expect(message).toContain("'m9'");
    expect(message).toContain("Mark 01");
  });
});

describe("the non-annotation plans", () => {
  it("maps the read-only and paid tools to bare plans", () => {
    expect(ok(plan("inspect_session", {}))).toEqual({ kind: "inspect" });
    expect(ok(plan("preview_prompt", {}))).toEqual({ kind: "preview_prompt" });
    expect(ok(plan("render", {}))).toEqual({ kind: "render" });
  });

  it("accepts a missing input object for the no-argument tools", () => {
    expect(ok(plan("render", undefined))).toEqual({ kind: "render" });
  });

  it("patches only the instruction", () => {
    expect(ok(plan("set_instruction", { text: "replace the sky" }))).toEqual({
      kind: "session.patch",
      patch: { instruction: "replace the sky" },
    });
  });

  it("plans a reference and a layer split", () => {
    expect(ok(plan("add_reference", { url: "https://cdn/x.png", role: "style" }))).toEqual({
      kind: "reference.add",
      url: "https://cdn/x.png",
      role: "style",
    });
    expect(ok(plan("separate_layers", { refId: "ref-a", mode: "auto", maxLayers: 4 }))).toEqual({
      kind: "separate_layers",
      refId: "ref-a",
      mode: "auto",
      maxLayers: 4,
    });
  });

  it("restores a version that exists", () => {
    const s = session({ versions: [version()] });
    expect(ok(plan("restore_version", { versionId: "v1" }, { session: s }))).toEqual({
      kind: "restore_version",
      versionId: "v1",
    });
  });

  it("passes a question and its options through", () => {
    expect(ok(plan("ask_user", { question: "Which lamp?", options: ["left", "right"] }))).toEqual({
      kind: "ask_user",
      question: "Which lamp?",
      options: ["left", "right"],
    });
  });
});

// ─────────────────────────── Rejections ───────────────────────────────────

describe("validation", () => {
  it("never throws, whatever it is handed", () => {
    const junk: unknown[] = [null, undefined, 42, "text", [], { refId: {} }];
    for (const input of junk) {
      expect(() => plan("place_box", input)).not.toThrow();
    }
  });

  it("lists the real tools when the name is unknown", () => {
    const message = err(plan("place_circle", {}));
    expect(message).toContain("place_circle");
    expect(message).toContain("place_box");
  });

  it("rejects a non-object argument payload", () => {
    expect(err(plan("place_point", "x=10"))).toContain("JSON object");
  });

  it("rejects missing and wrongly typed coordinates", () => {
    expect(err(plan("place_point", { refId: "ref-a", y: 10 }))).toContain("`x`");
    expect(err(plan("place_point", { refId: "ref-a", x: "10", y: 10 }))).toContain("'10'");
    expect(err(plan("place_point", { refId: "ref-a", x: Number.NaN, y: 0 }))).toContain("finite");
  });

  it("names the references that exist when the refId is wrong", () => {
    const s = session({ refs: [ref({ id: "base-1" }), ref({ id: "style-1", role: "style" })] });
    const message = err(plan("place_point", { refId: "nope", x: 1, y: 1 }, { session: s }));
    expect(message).toContain("'nope' not found");
    expect(message).toContain("'base-1'");
    expect(message).toContain("'style-1'");
  });

  it("says so when there are no references at all", () => {
    const s = session({ refs: [], activeRefId: null });
    expect(err(plan("place_point", { refId: "ref-a", x: 1, y: 1 }, { session: s }))).toContain(
      "add_reference",
    );
  });

  it("refuses to place marks on an unmeasured reference", () => {
    // Every coordinate would clamp to 0 and the marks would pile up in the
    // top-left corner with nothing to explain why.
    const s = session({ refs: [ref({ width: 0, height: 0 })] });
    expect(err(plan("place_point", { refId: "ref-a", x: 10, y: 10 }, { session: s }))).toContain(
      "no measured dimensions",
    );
  });

  it("rejects a degenerate box", () => {
    expect(err(plan("place_box", { refId: "ref-a", x: 10, y: 10, w: 0, h: 40 }))).toContain(
      "positive width and height",
    );
    expect(err(plan("place_box", { refId: "ref-a", x: 10, y: 10, w: 40, h: -5 }))).toContain(
      "positive width and height",
    );
  });

  it("rejects an unknown arrow intent and an unknown reference role", () => {
    expect(
      err(plan("place_arrow", { refId: "ref-a", fromX: 0, fromY: 0, toX: 1, toY: 1, intent: "wave" })),
    ).toContain("'move-to'");
    expect(err(plan("add_reference", { url: "https://cdn/x.png", role: "backdrop" }))).toContain(
      "'sketch'",
    );
  });

  it("rejects a data: URI reference", () => {
    // types.ts invariant 1 — a data URI would be persisted into localStorage.
    expect(err(plan("add_reference", { url: "data:image/png;base64,AAA", role: "subject" }))).toContain(
      "data:",
    );
    expect(err(plan("add_reference", { url: "ftp://host/x.png", role: "subject" }))).toContain(
      "https URL",
    );
  });

  it("rejects maxLayers outside 1..10, including fractional", () => {
    for (const maxLayers of [0, 11, 3.5, -2]) {
      const message = err(plan("separate_layers", { refId: "ref-a", mode: "auto", maxLayers }));
      expect(message).toContain("1 to 10");
    }
    // Omitted is fine — the model is told to leave it out when unsure.
    expect(ok(plan("separate_layers", { refId: "ref-a", mode: "region" }))).toEqual({
      kind: "separate_layers",
      refId: "ref-a",
      mode: "region",
      maxLayers: undefined,
    });
  });

  it("names the versions that exist when the versionId is wrong", () => {
    const s = session({ versions: [version({ id: "v1" }), version({ id: "v2" })] });
    const message = err(plan("restore_version", { versionId: "v7" }, { session: s }));
    expect(message).toContain("'v7' not found");
    expect(message).toContain("'v2'");
    expect(err(plan("restore_version", { versionId: "v7" }))).toContain("no versions yet");
  });

  it("rejects an empty instruction and an empty question", () => {
    expect(err(plan("set_instruction", { text: "   " }))).toContain("non-empty string");
    expect(err(plan("ask_user", {}))).toContain("`question`");
    expect(err(plan("ask_user", { question: "q?", options: [1, 2] }))).toContain("array of strings");
  });
});

// ─────────────────────────── Purity ───────────────────────────────────────

describe("purity", () => {
  it("mutates neither the session nor the tool input", () => {
    const s = session({ refs: [ref({ annotations: [] })], versions: [version()] });
    const before = JSON.stringify(s);
    const input = { refId: "ref-a", x: 120, y: 60, w: 30, h: 30, note: "x" };
    const inputBefore = JSON.stringify(input);

    ok(plan("place_box", input, { session: s, scale: 0.5 }));
    ok(plan("clear_annotations", { refId: "ref-a" }, { session: s }));
    describeSession(s, { "ref-a": 0.5 });

    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.stringify(input)).toBe(inputBefore);
  });

  it("works on a deeply frozen session", () => {
    const s = deepFreeze(session());
    expect(ok(plan("place_point", { refId: "ref-a", x: 1, y: 1 }, { session: s })).kind).toBe(
      "annotation.add",
    );
  });
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// ─────────────────────────── describeSession ──────────────────────────────

describe("per-reference scales", () => {
  // The bug this prevents: one scale for the whole session. A 4000px base and
  // a 600px style reference downscale by wildly different amounts, so a single
  // factor puts every mark on the second image in the wrong place while the
  // first looks perfect — and the blame lands on the model's eyesight.
  const two = () =>
    session({
      refs: [
        ref({ id: "big", width: 4000, height: 4000 }),
        ref({ id: "small", width: 600, height: 600, role: "style" }),
      ],
      activeRefId: "big",
    });
  const scales = { big: 0.5, small: 1 };

  it("uses the factor of the reference being marked, not the first one", () => {
    const onSmall = ok(
      plan("place_point", { refId: "small", x: 300, y: 300 }, { session: two(), scales }),
    );
    // scale 1 → straight through. Under the old shared factor (0.5) this
    // landed at 600,600 — the far corner of a 600px image.
    expect(onSmall).toMatchObject({
      refId: "small",
      draft: { kind: "point", at: { x: 300, y: 300 } },
    });

    const onBig = ok(
      plan("place_point", { refId: "big", x: 300, y: 300 }, { session: two(), scales }),
    );
    expect(onBig).toMatchObject({ draft: { at: { x: 600, y: 600 } } });
  });

  it("scales a box on the second reference by its own factor", () => {
    const p = ok(
      plan(
        "place_box",
        { refId: "small", x: 100, y: 100, w: 200, h: 200 },
        { session: two(), scales: { big: 0.25, small: 0.5 } },
      ),
    );
    expect(p).toMatchObject({
      refId: "small",
      draft: { kind: "box", rect: { x: 200, y: 200, w: 400, h: 400 } },
    });
  });

  it("describes each reference in its own space", () => {
    const view = describeSession(two(), scales) as Described;
    expect(view.refs[0]).toMatchObject({ width: 2000, shownAtScale: 0.5 });
    expect(view.refs[1]).toMatchObject({ width: 600, shownAtScale: 1 });
  });

  it("treats a reference the harness never showed as un-downscaled", () => {
    // A ref beyond the vision cap is described at scale 1 and marked at scale
    // 1, which is at least self-consistent — the model can only have got its
    // coordinates from inspect_session, which reported that same space.
    const p = ok(
      plan("place_point", { refId: "small", x: 42, y: 42 }, { session: two(), scales: { big: 0.5 } }),
    );
    expect(p).toMatchObject({ draft: { at: { x: 42, y: 42 } } });
  });
});

describe("describeSession", () => {
  it("reports dimensions in the space the model answers in", () => {
    const view = described(session(), 0.5);
    expect(view.refs[0]).toMatchObject({
      id: "ref-a",
      index: 1,
      width: 500,
      height: 400,
      shownAtScale: 0.5,
    });
  });

  it("normalizes a broken scale the same way planToolCall does", () => {
    expect(described(session(), 0).refs[0].shownAtScale).toBe(1);
    expect(described(session(), 0).refs[0].width).toBe(1000);
  });

  it("scales existing marks into snapshot space too", () => {
    // Otherwise the model reads a mark at 800, looks at the snapshot, sees
    // nothing there, and re-marks something already marked.
    const s = session({
      refs: [
        ref({
          annotations: [
            { id: "m1", kind: "point", label: "Mark 01", color: "#FF00E5", createdAt: 0, at: { x: 800, y: 400 } },
            {
              id: "m2",
              kind: "box",
              label: "Region 01",
              color: "#FF00E5",
              createdAt: 0,
              rect: { x: 100, y: 200, w: 300, h: 400 },
            },
          ],
        }),
      ],
    });
    const view = described(s, 0.5);
    expect(view.refs[0].annotationCount).toBe(2);
    expect(view.refs[0].annotations[0]).toMatchObject({ at: { x: 400, y: 200 } });
    expect(view.refs[0].annotations[1]).toMatchObject({
      rect: { x: 50, y: 100, w: 150, h: 200 },
    });
  });

  it("summarizes a brush stroke instead of re-sending its vertices", () => {
    // This object is re-sent on every later turn; a 400-vertex stroke would be
    // paid for again and again for no added grounding.
    const s = session({
      refs: [
        ref({
          annotations: [
            {
              id: "b1",
              kind: "brush",
              label: "Paint 01",
              color: "#FF00E5",
              createdAt: 0,
              points: [10, 20, 110, 220, 60, 120],
              width: 24,
            },
          ],
        }),
      ],
    });
    const mark = described(s, 1).refs[0].annotations[0];
    expect(mark).toMatchObject({
      kind: "brush",
      pointCount: 3,
      bounds: { x: 10, y: 20, w: 100, h: 200 },
    });
    expect(mark.points).toBeUndefined();
  });

  it("surfaces the instruction, the active ref and the version list", () => {
    const s = session({ instruction: "walnut top", versions: [version()] });
    const view = described(s, 1);
    expect(view.instruction).toBe("walnut top");
    expect(view.activeRefId).toBe("ref-a");
    expect(view.versions).toEqual([
      expect.objectContaining({ id: "v1", status: "done" }),
    ]);
  });
});
