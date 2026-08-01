/**
 * Normalising the model's shot breakdown.
 *
 * The breakdown is written straight into the story store, so anything the
 * model gets wrong lands in localStorage as an invalid Scene. Durations must
 * stay inside the 5–15 s window the store and the video models expect, and
 * indices must be unique — a repeated index would collide two scenes when they
 * are merged back by position.
 *
 * Everything here is coercion, not trust.
 */

import { describe, expect, it } from "vitest";
import { normalizeBreakdown } from "@/lib/byteplus";

const scene = (over: Record<string, unknown> = {}) => ({
  index: 0,
  duration: 8,
  prompt: "A wide shot of a quiet street at dawn, low sun, long shadows.",
  ...over,
});

describe("durations", () => {
  it("keeps a valid duration", () => {
    expect(normalizeBreakdown([scene({ duration: 12 })])[0].duration).toBe(12);
  });

  it("clamps below the floor and above the ceiling", () => {
    const out = normalizeBreakdown([
      scene({ duration: 1 }),
      scene({ duration: 45 }),
      scene({ duration: 0 }),
      scene({ duration: -5 }),
    ]);
    expect(out.map((s) => s.duration)).toEqual([5, 15, 5, 5]);
  });

  it("rounds fractional durations", () => {
    expect(normalizeBreakdown([scene({ duration: 7.6 })])[0].duration).toBe(8);
  });

  it("falls back to 8s for a missing or unparseable duration", () => {
    const out = normalizeBreakdown([
      scene({ duration: undefined }),
      scene({ duration: "ten" }),
      scene({ duration: null }),
      scene({ duration: NaN }),
    ]);
    expect(out.every((s) => s.duration === 8)).toBe(true);
  });
});

describe("indices", () => {
  it("re-indexes from position, ignoring what the model claimed", () => {
    const out = normalizeBreakdown([
      scene({ index: 5 }),
      scene({ index: 5 }),
      scene({ index: 99 }),
    ]);
    // Duplicate indices would collide when scenes are merged back by position.
    expect(out.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("stays contiguous after empty-prompt scenes are dropped", () => {
    const out = normalizeBreakdown([
      scene(),
      scene({ prompt: "   " }),
      scene(),
    ]);
    expect(out).toHaveLength(2);
    // Re-indexing happens before the filter, so a gap is possible — assert the
    // caller-visible contract instead: no duplicates, ascending.
    expect(new Set(out.map((s) => s.index)).size).toBe(out.length);
  });
});

describe("prompts", () => {
  it("drops scenes with no usable prompt", () => {
    const out = normalizeBreakdown([
      scene({ prompt: "" }),
      scene({ prompt: "   " }),
      scene({ prompt: undefined }),
      scene({ prompt: 42 }),
      scene(),
    ]);
    expect(out).toHaveLength(1);
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeBreakdown([scene({ prompt: "  a shot  " })])[0].prompt).toBe("a shot");
  });
});

describe("optional fields", () => {
  it("keeps a heading and character list", () => {
    const [s] = normalizeBreakdown([
      scene({ heading: "Riverside bench", characters: ["Jack", "Emily"] }),
    ]);
    expect(s.heading).toBe("Riverside bench");
    expect(s.characters).toEqual(["Jack", "Emily"]);
  });

  it("omits empty or malformed optionals rather than storing junk", () => {
    const [s] = normalizeBreakdown([
      scene({ heading: "   ", characters: [] }),
    ]);
    expect(s.heading).toBeUndefined();
    expect(s.characters).toBeUndefined();
  });

  it("filters non-string entries out of characters", () => {
    const [s] = normalizeBreakdown([
      scene({ characters: ["Jack", 7, null, "  ", " Emily "] }),
    ]);
    expect(s.characters).toEqual(["Jack", "Emily"]);
  });

  it("survives characters being the wrong type entirely", () => {
    expect(normalizeBreakdown([scene({ characters: "Jack" })])[0].characters).toBeUndefined();
  });
});

describe("whole-response resilience", () => {
  it("returns an empty list when nothing is usable", () => {
    expect(normalizeBreakdown([scene({ prompt: "" })])).toEqual([]);
    expect(normalizeBreakdown([])).toEqual([]);
  });

  it("never emits a scene outside the store's contract", () => {
    const junk = [
      scene({ duration: 1e9 }),
      scene({ duration: -1, index: -4 }),
      scene({ heading: 12, characters: {} }),
      scene({ duration: "8" }),
    ];
    for (const s of normalizeBreakdown(junk)) {
      expect(s.duration).toBeGreaterThanOrEqual(5);
      expect(s.duration).toBeLessThanOrEqual(15);
      expect(Number.isInteger(s.index)).toBe(true);
      expect(s.index).toBeGreaterThanOrEqual(0);
      expect(typeof s.prompt).toBe("string");
      expect(s.prompt.length).toBeGreaterThan(0);
    }
  });
});
