/**
 * Labelling rules.
 *
 * These matter more than they look. A label is not decoration — it is quoted
 * verbatim into the prompt's target-notes line, which the model reads as
 * prose tied to a specific coordinate ("Mark 01 (point 1) — remove the
 * logo"). So a label that silently changes meaning re-points a user's written
 * instruction at a different mark, and the only symptom is a wrong edit.
 *
 * The gap-filling test is the one that would otherwise get "simplified" into
 * a bug: numbering by count instead of by highest-seen is one character
 * shorter and quietly reuses a retired name.
 */

import { describe, expect, it } from "vitest";
import { buildAnnotation, nextLabel } from "./annotations";
import { MARKER_COLOR, type Annotation } from "./types";

function mark(kind: Annotation["kind"], label: string): Annotation {
  const base = { id: label, label, color: MARKER_COLOR, createdAt: 0 };
  switch (kind) {
    case "point":
      return { ...base, kind: "point", at: { x: 0, y: 0 } };
    case "box":
      return { ...base, kind: "box", rect: { x: 0, y: 0, w: 1, h: 1 } };
    case "brush":
      return { ...base, kind: "brush", points: [0, 0, 1, 1], width: 8 };
    case "arrow":
      return {
        ...base,
        kind: "arrow",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 1 },
        width: 8,
      };
  }
}

describe("nextLabel", () => {
  it("starts each kind at 01 and zero-pads", () => {
    expect(nextLabel("point", [])).toBe("Mark 01");
    expect(nextLabel("box", [])).toBe("Region 01");
    expect(nextLabel("brush", [])).toBe("Paint 01");
    expect(nextLabel("arrow", [])).toBe("Arrow 01");
  });

  it("numbers each kind independently", () => {
    const existing = [mark("point", "Mark 01"), mark("point", "Mark 02")];
    expect(nextLabel("point", existing)).toBe("Mark 03");
    // Boxes are unaffected by how many points exist.
    expect(nextLabel("box", existing)).toBe("Region 01");
  });

  it("continues past a deletion instead of reusing a retired name", () => {
    // The user wrote a note against "Mark 01", then deleted it. Handing that
    // name to a new mark would silently re-point any surviving reference.
    const afterDelete = [mark("point", "Mark 02"), mark("point", "Mark 03")];
    expect(nextLabel("point", afterDelete)).toBe("Mark 04");
  });

  it("ignores labels that don't match the scheme", () => {
    // A user-renamed mark must not break numbering for everything after it.
    const existing = [mark("point", "the candle"), mark("point", "Mark 07")];
    expect(nextLabel("point", existing)).toBe("Mark 08");
  });

  it("keeps padding for numbers past 99", () => {
    expect(nextLabel("point", [mark("point", "Mark 99")])).toBe("Mark 100");
  });
});

describe("buildAnnotation", () => {
  it("carries geometry through unchanged and stamps identity", () => {
    const a = buildAnnotation(
      { kind: "box", rect: { x: 10, y: 20, w: 30, h: 40 } },
      [],
      { id: "abc", now: 1234, color: "#00FFEE" },
    );
    expect(a).toEqual({
      id: "abc",
      kind: "box",
      label: "Region 01",
      color: "#00FFEE",
      createdAt: 1234,
      rect: { x: 10, y: 20, w: 30, h: 40 },
    });
  });

  it("defaults to the marker colour", () => {
    const a = buildAnnotation({ kind: "point", at: { x: 1, y: 2 } }, [], {
      id: "x",
    });
    expect(a.color).toBe(MARKER_COLOR);
  });

  it("builds every kind with its own geometry field", () => {
    const brush = buildAnnotation(
      { kind: "brush", points: [0, 0, 5, 5], width: 12 },
      [],
      { id: "b" },
    );
    expect(brush).toMatchObject({ kind: "brush", points: [0, 0, 5, 5], width: 12 });

    const arrow = buildAnnotation(
      { kind: "arrow", from: { x: 0, y: 0 }, to: { x: 9, y: 9 }, width: 4 },
      [],
      { id: "a" },
    );
    expect(arrow).toMatchObject({
      kind: "arrow",
      from: { x: 0, y: 0 },
      to: { x: 9, y: 9 },
    });
  });
});
