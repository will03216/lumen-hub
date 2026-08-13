/**
 * compileAnnotationPrompt — the golden-string test is the point of this file.
 *
 * The `<point>` / `<bbox>` suffix is the one empirically verified artifact in
 * the whole editor: it came out of BytePlus's own demo JavaScript, not their
 * documentation. There is no runtime signal when it is wrong. An ignored tag
 * produces a plausible-looking edit that just didn't respect the marks, which
 * is indistinguishable from the model having a bad day. So a reworded header,
 * a space slipped into the coordinate array, or an `<point>[]</point>` emitted
 * on a box-only edit would all ship silently and degrade quality for weeks.
 *
 * Hence: one test that asserts the entire output string, byte for byte,
 * against a representative input. It is deliberately brittle. If you are here
 * because it failed, the question to answer is "did I mean to change the wire
 * format?" — not "how do I make this pass?".
 *
 * The second most important test is the gating one. The target-notes line is
 * the only extrapolation in the format; there is no verified tag for naming a
 * target. It has to be provably absent when no annotation carries a note, so
 * that the common path stays byte-identical to known-good demo output. That
 * is asserted directly rather than via a substring check, because a stray
 * blank line would pass a substring check and change the prompt.
 */

import { describe, expect, it } from "vitest";
import { compileAnnotationPrompt, type CompileRef } from "./annotation-prompt";
import {
  MARKER_COLOR,
  type Annotation,
  type ArrowAnnotation,
  type BoxAnnotation,
  type BrushAnnotation,
  type PointAnnotation,
  type Rect,
  type Vec,
} from "./types";

// ─────────────────────── Builders ─────────────────────────────────────────

let seq = 0;

function point(
  at: Vec,
  extra: Partial<PointAnnotation> = {},
): PointAnnotation {
  const n = ++seq;
  return {
    id: `p${n}`,
    kind: "point",
    label: `Mark ${String(n).padStart(2, "0")}`,
    color: MARKER_COLOR,
    createdAt: n,
    at,
    ...extra,
  };
}

function box(rect: Rect, extra: Partial<BoxAnnotation> = {}): BoxAnnotation {
  const n = ++seq;
  return {
    id: `b${n}`,
    kind: "box",
    label: `Region ${String(n).padStart(2, "0")}`,
    color: MARKER_COLOR,
    createdAt: n,
    rect,
    ...extra,
  };
}

function brush(extra: Partial<BrushAnnotation> = {}): BrushAnnotation {
  const n = ++seq;
  return {
    id: `k${n}`,
    kind: "brush",
    label: `Paint ${String(n).padStart(2, "0")}`,
    color: MARKER_COLOR,
    createdAt: n,
    points: [10, 10, 20, 20, 30, 15],
    width: 24,
    ...extra,
  };
}

function arrow(extra: Partial<ArrowAnnotation> = {}): ArrowAnnotation {
  const n = ++seq;
  return {
    id: `a${n}`,
    kind: "arrow",
    label: `Arrow ${String(n).padStart(2, "0")}`,
    color: MARKER_COLOR,
    createdAt: n,
    from: { x: 100, y: 100 },
    to: { x: 400, y: 300 },
    width: 12,
    ...extra,
  };
}

function ref(annotations: Annotation[], over: Partial<CompileRef> = {}): CompileRef {
  return {
    index: 1,
    refId: "ref-1",
    width: 2000,
    height: 1000,
    role: "base",
    annotations,
    ...over,
  };
}

// ───────────────────────── The golden string ──────────────────────────────

describe("golden string", () => {
  it("compiles a representative multi-annotation ref byte for byte", () => {
    seq = 0;
    // Dimensions chosen so every normalization is exact: 2000×1000 maps
    // (840,318) → [420,318], (1024,640) → [512,640], and the rect below →
    // [120,200,480,760]. The expected values are the ones lifted from the
    // BytePlus demo, so this asserts our arithmetic AND their format at once.
    const result = compileAnnotationPrompt({
      instruction: "Remove the paper ball. Replace the tabletop with dark walnut.",
      refs: [
        ref([
          point({ x: 840, y: 318 }, { note: "remove the logo on the sleeve" }),
          point({ x: 1024, y: 640 }),
          box(
            { x: 240, y: 200, w: 720, h: 560 },
            {
              label: "Region 02",
              note: "replace the surface with brushed steel",
            },
          ),
          brush(),
          brush(),
          arrow(),
        ]),
        // A second ref with no annotations contributes no target block —
        // not a header, not a blank line — but does get a role line.
        ref([], { index: 2, refId: "ref-2", role: "subject", width: 1000, height: 1000 }),
      ],
    });

    expect(result.prompt).toBe(
      [
        "Remove the paper ball. Replace the tabletop with dark walnut.",
        "",
        // Ref 2 carries no annotations, so it contributes no target block —
        // but it IS in the wire array, and the model has no other way to know
        // what it is for. The role line is the only thing that says so.
        "Reference image 2 is a subject reference: composite the object it shows into the scene, matching the perspective, lighting, shadow and scale of reference image 1.",
        "",
        "Reference image 1 target notes: Mark 01 (point 1) — remove the logo on the sleeve; Region 02 (box 1) — replace the surface with brushed steel.",
        "",
        "Reference image 1 interactive targets (normalized 0-1000 coordinates):",
        "<point>[[420,318],[512,640]]</point>",
        "<bbox>[[120,200,480,760]]</bbox>",
        "Apply the requested edit specifically to these marked targets. Preserve unmarked regions unless the instruction explicitly says otherwise.",
        "",
        "Reference image 1 contains hand-drawn markup: 2 painted mask areas in magenta and 1 magenta arrow. Apply the requested edit to the painted areas. Treat each arrow as a direction or destination indicator — the tail is the source and the head is the target. Do not reproduce the magenta markup in the output.",
      ].join("\n"),
    );

    expect(result.warnings).toEqual([]);
    expect(result.plans).toEqual([
      {
        refId: "ref-1",
        index: 1,
        transport: "composite",
        points: [
          [420, 318],
          [512, 640],
        ],
        boxes: [[120, 200, 480, 760]],
        rasterAnnotationIds: ["k4", "k5", "a6"],
        droppedCount: 0,
      },
      {
        refId: "ref-2",
        index: 2,
        transport: "clean",
        points: [],
        boxes: [],
        rasterAnnotationIds: [],
        droppedCount: 0,
      },
    ]);
  });

  it("has no coordinate spacing — JSON.stringify output, not hand-joined", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([point({ x: 840, y: 318 }), point({ x: 1024, y: 640 })])],
    });
    expect(prompt).toContain("<point>[[420,318],[512,640]]</point>");
    expect(prompt).not.toMatch(/\[\s|\s\]|,\s\d/);
  });
});

// ───────────────────── The gate on the extrapolation ──────────────────────

describe("target-notes gating", () => {
  it("emits nothing at all when no annotation carries a note", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "Make the jacket red.",
      refs: [
        ref([
          point({ x: 840, y: 318 }),
          box({ x: 240, y: 200, w: 720, h: 560 }),
        ]),
      ],
    });

    // Asserted as a whole string, not via .not.toContain("target notes") —
    // an empty prose line would slip past a substring check and still change
    // what goes on the wire.
    expect(prompt).toBe(
      [
        "Make the jacket red.",
        "",
        "Reference image 1 interactive targets (normalized 0-1000 coordinates):",
        "<point>[[420,318]]</point>",
        "<bbox>[[120,200,480,760]]</bbox>",
        "Apply the requested edit specifically to these marked targets. Preserve unmarked regions unless the instruction explicitly says otherwise.",
      ].join("\n"),
    );
  });

  it("treats a whitespace-only note as no note", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "Make the jacket red.",
      refs: [ref([point({ x: 840, y: 318 }, { note: "   " })])],
    });
    expect(prompt).not.toContain("target notes");
  });

  it("ordinals each note within its own tag array", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([
          point({ x: 840, y: 318 }, { label: "Mark 01", note: "first point" }),
          box({ x: 240, y: 200, w: 720, h: 560 }, { label: "Region 01", note: "first box" }),
          point({ x: 1024, y: 640 }, { label: "Mark 02", note: "second point" }),
          box({ x: 100, y: 100, w: 400, h: 400 }, { label: "Region 02", note: "second box" }),
        ]),
      ],
    });

    expect(prompt).toContain(
      "Reference image 1 target notes: Mark 01 (point 1) — first point; Region 01 (box 1) — first box; Mark 02 (point 2) — second point; Region 02 (box 2) — second box",
    );
  });

  it("names raster marks too, ordinaled within their own kind", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([
          brush({ label: "Paint 01", note: "the wall" }),
          brush({ label: "Paint 02" }),
          arrow({ label: "Arrow 01", note: "move it here" }),
        ]),
      ],
    });
    expect(prompt).toContain(
      "Reference image 1 target notes: Paint 01 (brush 1) — the wall; Arrow 01 (arrow 1) — move it here",
    );
  });
});

// ─────────────────────── Empty tag arrays ─────────────────────────────────

describe("empty tag arrays are omitted, never emitted", () => {
  it("emits only <bbox> for a box-only ref", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([box({ x: 240, y: 200, w: 720, h: 560 })])],
    });
    expect(prompt).toContain("<bbox>[[120,200,480,760]]</bbox>");
    expect(prompt).not.toContain("<point>");
    expect(prompt).not.toContain("[]");
  });

  it("emits only <point> for a point-only ref", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([point({ x: 840, y: 318 })])],
    });
    expect(prompt).toContain("<point>[[420,318]]</point>");
    expect(prompt).not.toContain("<bbox>");
    expect(prompt).not.toContain("[]");
  });

  it("emits no coordinate block for a raster-only ref", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([brush()])],
    });
    expect(prompt).not.toContain("interactive targets");
    expect(prompt).not.toContain("<point>");
    expect(prompt).not.toContain("<bbox>");
  });
});

// ─────────────────────── Degenerate boxes ─────────────────────────────────

describe("degenerate box demotion", () => {
  it("demotes a box narrower than 4/1000 to a centre point, with a warning", () => {
    seq = 0;
    const result = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([box({ x: 500, y: 500, w: 2, h: 100 }, { label: "Region 01" })], {
          width: 1000,
          height: 1000,
        }),
      ],
    });

    // [500,500,502,600] → 2 wide → centre [501,550].
    expect(result.prompt).toContain("<point>[[501,550]]</point>");
    expect(result.prompt).not.toContain("<bbox>");
    expect(result.plans[0].points).toEqual([[501, 550]]);
    expect(result.plans[0].boxes).toEqual([]);
    expect(result.warnings).toEqual([
      'Reference image 1: box "Region 01" is narrower than 4/1000 after normalization; sent as a point at its centre.',
    ]);
  });

  it("demotes on the short axis too", () => {
    seq = 0;
    const result = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([box({ x: 100, y: 200, w: 300, h: 3 })], {
          width: 1000,
          height: 1000,
        }),
      ],
    });
    expect(result.plans[0].boxes).toEqual([]);
    expect(result.plans[0].points).toEqual([[250, 202]]);
    expect(result.warnings).toHaveLength(1);
  });

  it("keeps a box exactly at the 4/1000 threshold", () => {
    seq = 0;
    const result = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([box({ x: 100, y: 100, w: 4, h: 4 })], {
          width: 1000,
          height: 1000,
        }),
      ],
    });
    expect(result.plans[0].boxes).toEqual([[100, 100, 104, 104]]);
    expect(result.warnings).toEqual([]);
  });

  it("describes a demoted box as (point N) so prose and coordinates align", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref(
          [
            box(
              { x: 500, y: 500, w: 2, h: 100 },
              { label: "Region 01", note: "erase this seam" },
            ),
          ],
          { width: 1000, height: 1000 },
        ),
      ],
    });
    expect(prompt).toContain("Region 01 (point 1) — erase this seam");
  });
});

// ─────────────────────────── The cap ──────────────────────────────────────

describe("maxTargetsPerRef", () => {
  it("caps points + boxes combined, preserving creation order", () => {
    seq = 0;
    const annotations: Annotation[] = [];
    for (let i = 0; i < 25; i += 1) {
      annotations.push(point({ x: i * 2, y: i }));
    }

    const result = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref(annotations, { width: 1000, height: 1000 })],
    });

    expect(result.plans[0].points).toHaveLength(20);
    expect(result.plans[0].droppedCount).toBe(5);
    // Creation order preserved: the first 20 survive, the last 5 are dropped.
    expect(result.plans[0].points[0]).toEqual([0, 0]);
    expect(result.plans[0].points[19]).toEqual([38, 19]);
    expect(result.warnings).toEqual([
      "Reference image 1: 5 annotations over the 20-target cap were dropped.",
    ]);
  });

  it("counts points and boxes against the same budget", () => {
    seq = 0;
    const result = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref(
          [
            point({ x: 100, y: 100 }),
            point({ x: 200, y: 200 }),
            box({ x: 300, y: 300, w: 100, h: 100 }),
            box({ x: 400, y: 400, w: 100, h: 100 }),
          ],
          { width: 1000, height: 1000 },
        ),
      ],
      maxTargetsPerRef: 3,
    });

    expect(result.plans[0].points).toHaveLength(2);
    expect(result.plans[0].boxes).toHaveLength(1);
    expect(result.plans[0].droppedCount).toBe(1);
  });

  it("does not count raster annotations against the vector budget", () => {
    seq = 0;
    const result = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([brush(), brush(), arrow(), point({ x: 840, y: 318 })])],
      maxTargetsPerRef: 1,
    });
    expect(result.plans[0].droppedCount).toBe(0);
    expect(result.plans[0].points).toEqual([[420, 318]]);
    expect(result.plans[0].rasterAnnotationIds).toHaveLength(3);
  });
});

// ─────────────────── Mixed vector + raster (the subtle one) ───────────────

describe("mixed vector + raster on one ref", () => {
  it("keeps the coordinate tags AND switches transport to composite", () => {
    seq = 0;
    const result = compileAnnotationPrompt({
      instruction: "Replace the sign.",
      refs: [ref([point({ x: 840, y: 318 }), brush()])],
    });

    // The composite is pixel-identical outside the strokes, so [420,318]
    // still addresses the same content. Dropping the tag here would silently
    // throw away the user's point precision.
    expect(result.prompt).toContain("<point>[[420,318]]</point>");
    expect(result.prompt).toContain("contains hand-drawn markup");
    expect(result.plans[0].transport).toBe("composite");
  });

  it("stays clean when the ref has only vectors", () => {
    seq = 0;
    const result = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([point({ x: 840, y: 318 })])],
    });
    expect(result.plans[0].transport).toBe("clean");
    expect(result.plans[0].rasterAnnotationIds).toEqual([]);
  });

  it("orders the blocks: notes, then coordinates, then raster prose", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([point({ x: 840, y: 318 }, { note: "here" }), brush()])],
    });
    const notes = prompt.indexOf("target notes");
    const coords = prompt.indexOf("interactive targets");
    const raster = prompt.indexOf("hand-drawn markup");
    expect(notes).toBeGreaterThan(-1);
    expect(notes).toBeLessThan(coords);
    expect(coords).toBeLessThan(raster);
  });
});

// ─────────────────────── Multi-ref numbering ──────────────────────────────

describe("reference numbering", () => {
  it("is 1-based and independent per ref", () => {
    seq = 0;
    const { prompt, plans } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([point({ x: 840, y: 318 })], { index: 1, refId: "a" }),
        ref([box({ x: 240, y: 200, w: 720, h: 560 })], { index: 2, refId: "b" }),
        ref([point({ x: 1024, y: 640 })], { index: 3, refId: "c" }),
      ],
    });

    expect(prompt).toContain("Reference image 1 interactive targets");
    expect(prompt).toContain("Reference image 2 interactive targets");
    expect(prompt).toContain("Reference image 3 interactive targets");
    expect(prompt).not.toContain("Reference image 0");

    // Each ref's tag arrays are its own — ref 2 has a box and no point.
    expect(plans[1].points).toEqual([]);
    expect(plans[1].boxes).toEqual([[120, 200, 480, 760]]);
    expect(plans[2].points).toEqual([[512, 640]]);
  });

  it("honours a non-contiguous index (a ref removed from the wire array)", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([point({ x: 840, y: 318 })], { index: 4 })],
    });
    expect(prompt).toContain("Reference image 4 interactive targets");
  });
});

// ──────────────────── Refs that contribute nothing ────────────────────────

describe("refs with no annotations", () => {
  it("produce no block, no header, and no trailing whitespace", () => {
    seq = 0;
    const { prompt, plans } = compileAnnotationPrompt({
      instruction: "Just make it warmer.",
      refs: [
        ref([], { index: 1, refId: "a" }),
        ref([], { index: 2, refId: "b" }),
      ],
    });
    expect(prompt).toBe("Just make it warmer.");
    // …but every ref still gets a plan, because the caller needs a transport
    // decision for every image it uploads.
    expect(plans).toHaveLength(2);
    expect(plans.every((p) => p.transport === "clean")).toBe(true);
  });

  it("treats a ref whose annotations are all hidden the same way", () => {
    seq = 0;
    const { prompt, plans } = compileAnnotationPrompt({
      instruction: "Just make it warmer.",
      refs: [
        ref([
          point({ x: 840, y: 318 }, { hidden: true }),
          brush({ hidden: true }),
        ]),
      ],
    });
    expect(prompt).toBe("Just make it warmer.");
    expect(plans[0].transport).toBe("clean");
    expect(plans[0].rasterAnnotationIds).toEqual([]);
  });

  it("skips only the hidden marks, not the visible ones beside them", () => {
    seq = 0;
    const { plans } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([
          point({ x: 840, y: 318 }),
          point({ x: 1024, y: 640 }, { hidden: true }),
        ]),
      ],
    });
    expect(plans[0].points).toEqual([[420, 318]]);
  });
});

// ─────────────────────────── Raster prose ─────────────────────────────────

describe("raster prose", () => {
  it("pluralizes a single painted area", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([brush()])],
    });
    expect(prompt).toBe(
      "x\n\nReference image 1 contains hand-drawn markup: 1 painted mask area in magenta. Apply the requested edit to the painted areas. Do not reproduce the magenta markup in the output.",
    );
  });

  it("pluralizes multiple painted areas and multiple arrows", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([brush(), brush(), brush(), arrow(), arrow()])],
    });
    expect(prompt).toContain(
      "hand-drawn markup: 3 painted mask areas in magenta and 2 magenta arrows.",
    );
  });

  it("omits the painted-areas sentence when there are no brush strokes", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([arrow()])],
    });
    expect(prompt).toContain("hand-drawn markup: 1 magenta arrow.");
    expect(prompt).not.toContain("painted mask");
    expect(prompt).not.toContain("Apply the requested edit to the painted areas");
  });

  it("omits the arrow sentence when there are no arrows", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([brush()])],
    });
    expect(prompt).not.toContain("arrow");
  });

  it("always ends with the do-not-reproduce sentence — it is load-bearing", () => {
    seq = 0;
    for (const marks of [[brush()], [arrow()], [brush(), arrow()]]) {
      const { prompt } = compileAnnotationPrompt({
        instruction: "x",
        refs: [ref(marks)],
      });
      expect(prompt.endsWith("Do not reproduce the magenta markup in the output.")).toBe(
        true,
      );
    }
  });

  it("names mixed marker colours naturally", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([
          brush({ color: MARKER_COLOR }),
          brush({ color: "#00E5FF" }),
          arrow({ color: "#FFE500" }),
        ]),
      ],
    });
    expect(prompt).toContain(
      "hand-drawn markup: 2 painted mask areas in magenta and cyan and 1 yellow arrow.",
    );
    expect(prompt).toContain(
      "Do not reproduce the magenta, cyan and yellow markup in the output.",
    );
  });

  it("snaps an off-palette hex to its nearest name rather than leaking the hex", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([brush({ color: "#FA05DD" })])],
    });
    expect(prompt).toContain("in magenta");
    expect(prompt).not.toContain("#");
  });

  it("falls back to magenta on an unparseable colour", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([brush({ color: "not-a-colour" })])],
    });
    expect(prompt).toContain("in magenta");
  });
});

describe("arrow intent", () => {
  const CASES: Array<[ArrowAnnotation["intent"], string]> = [
    ["move-to", "movement instruction"],
    ["look-toward", "gaze direction"],
    ["extend-along", "extension path"],
    ["point-at", "pointer"],
  ];

  for (const [intent, phrase] of CASES) {
    it(`selects the ${intent} wording`, () => {
      seq = 0;
      const { prompt } = compileAnnotationPrompt({
        instruction: "x",
        refs: [ref([arrow({ intent })])],
      });
      expect(prompt).toContain(phrase);
    });
  }

  it("uses the generic wording when intent is absent", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([arrow()])],
    });
    expect(prompt).toContain(
      "Treat each arrow as a direction or destination indicator — the tail is the source and the head is the target.",
    );
  });

  it("falls back to the generic wording when intents disagree", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [ref([arrow({ intent: "move-to" }), arrow({ intent: "point-at" })])],
    });
    expect(prompt).toContain("direction or destination indicator");
    expect(prompt).not.toContain("movement instruction");
  });
});

/**
 * A move-to arrow whose tail sits inside a box is the composition the agent is
 * told to prefer: the box names the subject exactly as a `<bbox>` tag, the
 * arrow carries only the direction. Nothing in the emitted prompt tied the two
 * marks together, so the model had no way to know they were about one object.
 *
 * The all-or-nothing rule is the point of most of these cases. A sentence that
 * is true of one arrow and false of another is worse than the vaguer one,
 * because which arrow it applied to is invisible in the result — the same
 * reasoning that makes mixed intents fall back.
 */
describe("move-to arrows paired with a box", () => {
  const PAIRED =
    "the marked box at its tail is the subject to move, and the head is where it goes";
  const LONE = "move the subject at the tail to the position at the head";

  it("names the box when the tail is inside one", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([
          box({ x: 50, y: 50, w: 200, h: 200 }),
          arrow({ intent: "move-to", from: { x: 100, y: 100 } }),
        ]),
      ],
    });
    expect(prompt).toContain(PAIRED);
    expect(prompt).not.toContain(LONE);
  });

  it("keeps the lone wording when the tail is outside every box", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([
          box({ x: 800, y: 500, w: 200, h: 200 }),
          arrow({ intent: "move-to", from: { x: 100, y: 100 } }),
        ]),
      ],
    });
    expect(prompt).toContain(LONE);
    expect(prompt).not.toContain(PAIRED);
  });

  it("keeps the lone wording when only some tails are boxed", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([
          box({ x: 50, y: 50, w: 200, h: 200 }),
          arrow({ intent: "move-to", from: { x: 100, y: 100 } }),
          arrow({ intent: "move-to", from: { x: 1500, y: 800 } }),
        ]),
      ],
    });
    expect(prompt).toContain(LONE);
    expect(prompt).not.toContain(PAIRED);
  });

  it("treats a tail exactly on the boundary as inside", () => {
    // A tail drawn on the edge is a tail meant to be on the object; a strict
    // test would quietly drop back to the vaguer sentence.
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([
          box({ x: 100, y: 100, w: 200, h: 200 }),
          arrow({ intent: "move-to", from: { x: 100, y: 300 } }),
        ]),
      ],
    });
    expect(prompt).toContain(PAIRED);
  });

  it("does not pair with a box that was demoted to a point", () => {
    // 6px of a 2000px width normalizes to 3/1000, under MIN_BOX_SPAN, so no
    // <bbox> tag is sent — "the marked box at its tail" would name nothing.
    seq = 0;
    const { prompt, warnings } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([
          box({ x: 98, y: 50, w: 6, h: 200 }),
          arrow({ intent: "move-to", from: { x: 100, y: 100 } }),
        ]),
      ],
    });
    expect(prompt).not.toContain("<bbox>");
    expect(warnings.some((w) => /sent as a point/.test(w))).toBe(true);
    expect(prompt).toContain(LONE);
    expect(prompt).not.toContain(PAIRED);
  });

  it("leaves the other intents alone even when a box contains the tail", () => {
    seq = 0;
    for (const intent of ["look-toward", "extend-along", "point-at"] as const) {
      const { prompt } = compileAnnotationPrompt({
        instruction: "x",
        refs: [
          ref([
            box({ x: 50, y: 50, w: 200, h: 200 }),
            arrow({ intent, from: { x: 100, y: 100 } }),
          ]),
        ],
      });
      expect(prompt).not.toContain(PAIRED);
    }
  });

  it("still emits the box as a target tag, not only as arrow prose", () => {
    // The pairing sentence explains the bbox; it must not replace it.
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([
          box({ x: 50, y: 50, w: 200, h: 200 }),
          arrow({ intent: "move-to", from: { x: 100, y: 100 } }),
        ]),
      ],
    });
    expect(prompt).toContain("<bbox>");
    expect(prompt).toContain(PAIRED);
  });
});

// ─────────────────────────── Word cap ─────────────────────────────────────

describe("word cap", () => {
  it("warns without throwing or truncating", () => {
    const instruction = Array.from({ length: 12 }, (_, i) => `word${i}`).join(" ");
    seq = 0;
    const result = compileAnnotationPrompt({
      instruction,
      refs: [ref([])],
      maxWords: 10,
    });

    expect(result.warnings).toEqual([
      "Instruction is 12 words, over the 10-word cap; the model may ignore later sentences.",
    ]);
    expect(result.prompt).toBe(instruction);
  });

  it("counts the user instruction only, not the generated suffix", () => {
    seq = 0;
    const result = compileAnnotationPrompt({
      instruction: "one two three",
      refs: [ref([point({ x: 840, y: 318 }, { note: "a rather long note here" })])],
      maxWords: 5,
    });
    // The suffix alone is well over 5 words; the warning must not fire.
    expect(result.warnings).toEqual([]);
  });

  it("defaults to 600 words", () => {
    const instruction = Array.from({ length: 601 }, (_, i) => `w${i}`).join(" ");
    seq = 0;
    const result = compileAnnotationPrompt({ instruction, refs: [] });
    expect(result.warnings).toEqual([
      "Instruction is 601 words, over the 600-word cap; the model may ignore later sentences.",
    ]);
  });
});

// ─────────────────────────── Purity ───────────────────────────────────────

describe("purity", () => {
  it("returns an identical string on repeated calls", () => {
    const build = () => {
      seq = 0;
      return compileAnnotationPrompt({
        instruction: "Repeatable.",
        refs: [
          ref([
            point({ x: 840, y: 318 }, { note: "n" }),
            box({ x: 240, y: 200, w: 720, h: 560 }),
            brush(),
            arrow({ intent: "move-to" }),
          ]),
        ],
      });
    };
    expect(build().prompt).toBe(build().prompt);
  });

  it("does not mutate the input annotations array", () => {
    seq = 0;
    const annotations: Annotation[] = [
      point({ x: 1024, y: 640 }),
      point({ x: 840, y: 318 }),
    ];
    const snapshot = annotations.map((a) => a.id);
    compileAnnotationPrompt({ instruction: "x", refs: [ref(annotations)] });
    expect(annotations.map((a) => a.id)).toEqual(snapshot);
  });

  it("handles an empty instruction without a leading blank line", () => {
    seq = 0;
    const { prompt } = compileAnnotationPrompt({
      instruction: "   ",
      refs: [ref([point({ x: 840, y: 318 })])],
    });
    expect(prompt.startsWith("Reference image 1 interactive targets")).toBe(true);
  });

  it("returns an empty prompt for no instruction and no refs", () => {
    const result = compileAnnotationPrompt({ instruction: "", refs: [] });
    expect(result).toEqual({ prompt: "", plans: [], warnings: [] });
  });
});

describe("reference roles (§5C)", () => {
  it("says nothing when there is only a base image", () => {
    // A single-image edit has nothing to disambiguate. Explaining that
    // reference 1 is the image being edited is noise the model reads past.
    const r = compileAnnotationPrompt({
      instruction: "make it walnut",
      refs: [ref([])],
    });
    expect(r.prompt).toBe("make it walnut");
  });

  it("describes each non-base role and anchors it to the base image", () => {
    const r = compileAnnotationPrompt({
      instruction: "put the bottle on the marble",
      refs: [
        ref([]),
        ref([], { index: 2, refId: "b", role: "subject", width: 100, height: 100 }),
        ref([], { index: 3, refId: "c", role: "style", width: 100, height: 100 }),
        ref([], { index: 4, refId: "d", role: "sketch", width: 100, height: 100 }),
      ],
    });
    expect(r.prompt).toContain("Reference image 2 is a subject reference");
    expect(r.prompt).toContain("Reference image 3 is a style reference");
    expect(r.prompt).toContain("Reference image 4 is a rough sketch");
    // Anchored, so the model matches lighting to one image rather than
    // averaging across the set.
    expect(r.prompt).toContain("of reference image 1");
    // A style reference must not have its content copied — that is the
    // difference between borrowing a look and pasting a second picture in.
    expect(r.prompt).toContain("Do not copy its content");
  });

  it("anchors to the first reference when no ref is marked base", () => {
    // Seedream treats image[0] as the subject whether or not anything is
    // labelled "base", so the first ref IS the anchor. The old wording said
    // "the first reference", which on a two-ref set told the model to match
    // reference 1 against itself.
    const r = compileAnnotationPrompt({
      instruction: "fuse these",
      refs: [
        ref([], { index: 1, refId: "a", role: "subject", width: 100, height: 100 }),
        ref([], { index: 2, refId: "b", role: "subject", width: 100, height: 100 }),
      ],
    });
    expect(r.prompt).toContain("of reference image 1");
    expect(r.prompt).not.toContain("the first reference");
    // The anchor does not describe itself.
    expect(r.prompt).not.toContain("Reference image 1 is a subject reference");
    expect(r.prompt).toContain("Reference image 2 is a subject reference");
  });

  it("keeps the anchor's own line when it does not point back at the anchor", () => {
    // Suppressing the anchor wholesale silently lost real guidance: a style
    // reference in slot 1 describes itself and is not circular, so it stays.
    const r = compileAnnotationPrompt({
      instruction: "fuse these",
      refs: [
        ref([], { index: 1, refId: "a", role: "style", width: 100, height: 100 }),
        ref([], { index: 2, refId: "b", role: "subject", width: 100, height: 100 }),
      ],
    });
    expect(r.prompt).toContain("Reference image 1 is a style reference");
    expect(r.prompt).toContain("Reference image 2 is a subject reference");
    expect(r.prompt).toContain("of reference image 1");
  });

  it("keeps the verified target format untouched alongside roles", () => {
    const r = compileAnnotationPrompt({
      instruction: "x",
      refs: [
        ref([point({ x: 500, y: 500 })]),
        ref([], { index: 2, refId: "b", role: "style", width: 100, height: 100 }),
      ],
    });
    expect(r.prompt).toContain(
      "Apply the requested edit specifically to these marked targets. Preserve unmarked regions unless the instruction explicitly says otherwise.",
    );
    expect(r.prompt).toContain("<point>[[250,500]]</point>");
  });
});
