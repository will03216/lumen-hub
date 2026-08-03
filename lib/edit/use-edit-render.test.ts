/**
 * buildEditRequest — the pure half of the render hook.
 *
 * Two invariants here are invisible in the response, which is why they get
 * their own tests rather than being left to an integration check:
 *
 * · REF ORDER. Seedream treats the first entry of `image[]` as the subject.
 *   Put a style reference there instead and the model confidently edits the
 *   wrong picture — a plausible-looking result, no error anywhere.
 *
 * · TRANSPORT. A reference carrying brush or arrow markup must be flagged for
 *   compositing, because those annotations have no representation in the
 *   prompt at all. Get it wrong and the marks are described in prose that
 *   refers to markup the model was never shown.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSizeAllowed } from "@/lib/studio/models";
import { buildEditRequest } from "./use-edit-render";
import {
  __resetForTests,
  addRef,
  createEditSession,
  getEditSession,
  updateEditSession,
  upsertAnnotation,
} from "./sessions";
import { MARKER_COLOR, type Annotation } from "./types";

const PRO = "dola-seedream-5-0-pro-260628";

beforeEach(() => __resetForTests());
afterEach(() => __resetForTests());

function session(instruction = "make it walnut") {
  const s = createEditSession({
    baseRef: { url: "https://cdn.example/base.png", width: 1920, height: 1080 },
    model: PRO,
    instruction,
  });
  return getEditSession(s.id)!;
}

function box(id: string): Annotation {
  return {
    id,
    kind: "box",
    label: "Region 01",
    color: MARKER_COLOR,
    createdAt: 0,
    rect: { x: 192, y: 108, w: 384, h: 216 },
  };
}

function brush(id: string): Annotation {
  return {
    id,
    kind: "brush",
    label: "Paint 01",
    color: MARKER_COLOR,
    createdAt: 0,
    points: [10, 10, 50, 50, 90, 20],
    width: 24,
  };
}

describe("ref ordering", () => {
  it("puts the base ref first regardless of insertion order", () => {
    const s = session();
    addRef(s.id, {
      url: "https://cdn.example/style.png",
      width: 512,
      height: 512,
      role: "style",
    });
    const req = buildEditRequest(getEditSession(s.id)!);

    expect(req.orderedRefs.map((r) => r.role)).toEqual(["base", "style"]);
    expect(req.orderedRefs[0].url).toBe("https://cdn.example/base.png");
    // Wire indices are 1-based and follow that order.
    expect(req.plans.map((p) => p.index)).toEqual([1, 2]);
  });

  it("handles a session with no refs at all", () => {
    const s = createEditSession({ instruction: "a candle", model: PRO });
    const req = buildEditRequest(getEditSession(s.id)!);
    expect(req.orderedRefs).toEqual([]);
    expect(req.refIds).toEqual([]);
  });
});

describe("prompt compilation", () => {
  it("passes a bare instruction through when there are no marks", () => {
    expect(buildEditRequest(session("   make it walnut   ")).prompt).toBe(
      "make it walnut",
    );
  });

  it("appends coordinate tags once a box is placed", () => {
    const s = session();
    upsertAnnotation(s.id, s.refs[0].id, box("b1"));
    const req = buildEditRequest(getEditSession(s.id)!);

    expect(req.prompt).toContain("Reference image 1 interactive targets");
    // 192/1920 -> 100, 108/1080 -> 100, 576/1920 -> 300, 324/1080 -> 300
    expect(req.prompt).toContain("<bbox>[[100,100,300,300]]</bbox>");
    expect(req.prompt).not.toContain("<point>");
  });
});

describe("transport", () => {
  it("keeps a vector-only ref on the clean transport", () => {
    const s = session();
    upsertAnnotation(s.id, s.refs[0].id, box("b1"));
    const req = buildEditRequest(getEditSession(s.id)!);
    expect(req.plans[0].transport).toBe("clean");
  });

  it("flags a ref with brush markup for compositing", () => {
    const s = session();
    upsertAnnotation(s.id, s.refs[0].id, brush("p1"));
    const req = buildEditRequest(getEditSession(s.id)!);
    expect(req.plans[0].transport).toBe("composite");
    expect(req.plans[0].rasterAnnotationIds).toEqual(["p1"]);
  });

  it("keeps the coordinate tags when a ref has BOTH kinds", () => {
    // The composite is pixel-identical outside the strokes, so the box
    // coordinates still address the same content. Dropping them would throw
    // away precision the user deliberately placed.
    const s = session();
    upsertAnnotation(s.id, s.refs[0].id, box("b1"));
    upsertAnnotation(s.id, s.refs[0].id, brush("p1"));
    const req = buildEditRequest(getEditSession(s.id)!);

    expect(req.plans[0].transport).toBe("composite");
    expect(req.prompt).toContain("<bbox>");
    expect(req.prompt).toContain("hand-drawn markup");
  });
});

describe("sizing", () => {
  it("sizes from the base ref and stays legal for the model", () => {
    const req = buildEditRequest(session());
    expect(isSizeAllowed(req.size, PRO)).toBe(true);
    const [w, h] = req.size.split("x").map(Number);
    expect(w).toBeGreaterThan(h); // 1920x1080 source
  });

  it("honours an aspect override stored on the session", () => {
    const s = session();
    updateEditSession(s.id, { aspectRatio: "9:16" });
    const req = buildEditRequest(getEditSession(s.id)!);
    const [w, h] = req.size.split("x").map(Number);
    expect(h).toBeGreaterThan(w);
  });

  it("carries the seed through when set, and omits it when not", () => {
    const s = session();
    expect(buildEditRequest(getEditSession(s.id)!).seed).toBeUndefined();
    updateEditSession(s.id, { seed: 42 });
    expect(buildEditRequest(getEditSession(s.id)!).seed).toBe(42);
  });
});
