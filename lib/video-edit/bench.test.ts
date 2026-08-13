import { describe, expect, it } from "vitest";
import {
  MIN_RUNS_FOR_A_VERDICT,
  TIE_THRESHOLD,
  classifyIntent,
  formatReport,
  measuredDefaultsFrom,
  summarize,
  verdictFor,
  type BenchResult,
} from "./bench";
import type { PromptVariantId } from "./types";

function run(
  variant: PromptVariantId,
  fidelity: number,
  persistence: number,
  over: Partial<BenchResult> = {},
): BenchResult {
  return {
    clipId: `c-${Math.round(fidelity * 100)}-${variant}`,
    editClass: "appearance",
    variant,
    score: {
      editFidelity: fidelity,
      editPersistence: persistence,
      sourceFidelity: 4,
      motionQuality: 4,
    },
    ...over,
  };
}

/** N scored runs for a variant, all the same, so counts are easy to reason about. */
function runs(
  variant: PromptVariantId,
  n: number,
  fidelity: number,
  persistence: number,
  over: Partial<BenchResult> = {},
): BenchResult[] {
  return Array.from({ length: n }, (_, i) => ({
    ...run(variant, fidelity, persistence, over),
    clipId: `${variant}-${i}`,
  }));
}

describe("summarize", () => {
  it("multiplies fidelity by persistence per run, not average by average", () => {
    // The two differ, and only the per-run form says "this variant both landed
    // the edit AND held it on the same clip". Averaging first lets a variant
    // that nails one and fails the other look competent.
    const results = [run("A", 5, 1), run("A", 1, 5)];
    const s = summarize(results, "A");
    expect(s.headline).toBe(5); // (5×1 + 1×5) / 2
    // Product of the averages would be 3 × 3 = 9.
    expect(s.editFidelity).toBe(3);
    expect(s.editPersistence).toBe(3);
  });

  it("treats a zero on either axis as a zero overall", () => {
    // A change present at frame one and gone by the last frame is not half a
    // success; it is a failure that demos well.
    const s = summarize([run("A", 5, 0)], "A");
    expect(s.headline).toBe(0);
  });

  it("counts failures by cause rather than folding them into the mean", () => {
    // A moderation block and a bad render need different fixes, and averaging
    // them together hides which one a variant suffers from.
    const results: BenchResult[] = [
      run("A", 4, 4),
      { clipId: "x", editClass: "appearance", variant: "A", failure: "moderation" },
      { clipId: "y", editClass: "appearance", variant: "A", failure: "timeout" },
    ];
    const s = summarize(results, "A");
    expect(s.n).toBe(1);
    expect(s.failures).toEqual({ moderation: 1, error: 0, timeout: 1 });
    expect(s.failureRate).toBeCloseTo(2 / 3);
    // The score is unaffected by the failures — they are reported separately.
    expect(s.headline).toBe(16);
  });

  it("returns zeroes rather than NaN for a variant with no runs", () => {
    const s = summarize([], "C");
    expect(s.headline).toBe(0);
    expect(s.n).toBe(0);
    expect(s.failureRate).toBe(0);
  });
});

describe("verdictFor", () => {
  it("refuses to call a winner on thin evidence", () => {
    const v = verdictFor(runs("A", MIN_RUNS_FOR_A_VERDICT - 1, 5, 5), "appearance");
    expect(v.winner).toBeNull();
    expect(v.reason).toMatch(/not enough/i);
  });

  it("refuses to call a winner when the top two are within noise", () => {
    // A default chosen from a 0.1 difference over three clips is not a
    // measurement.
    const results = [...runs("A", 4, 4, 4), ...runs("B", 4, 4, 4)];
    const v = verdictFor(results, "appearance");
    expect(v.winner).toBeNull();
    expect(v.reason).toMatch(/too close/i);
  });

  it("calls a winner when it is clearly ahead", () => {
    const results = [...runs("A", 4, 5, 5), ...runs("B", 4, 2, 2)];
    const v = verdictFor(results, "appearance");
    expect(v.winner).toBe("A");
    expect(v.ranking[0].variant).toBe("A");
  });

  it("ranks every variant, including the ones that never ran", () => {
    // A variant with no data has to appear in the report as having no data,
    // rather than vanishing and looking like it was never considered.
    const v = verdictFor(runs("A", 4, 5, 5), "appearance");
    expect(v.ranking).toHaveLength(5);
    expect(v.ranking.filter((r) => r.n === 0)).toHaveLength(4);
  });

  it("scopes to its own edit class", () => {
    const results = [
      ...runs("A", 4, 5, 5),
      ...runs("B", 4, 5, 5, { editClass: "motion" }),
    ];
    const appearance = verdictFor(results, "appearance");
    expect(appearance.ranking.find((r) => r.variant === "B")!.n).toBe(0);
  });

  it("uses the stated tie threshold, so the bar is arguable rather than hidden", () => {
    const clear = [
      ...runs("A", 4, 5, 5),
      ...runs("B", 4, 5, 5 - (TIE_THRESHOLD + 1) / 5),
    ];
    expect(verdictFor(clear, "appearance").winner).toBe("A");
  });
});

describe("measuredDefaultsFrom", () => {
  it("only records classes that actually produced a verdict", () => {
    // A class we did not measure keeps using the §10.3 hypothesis rather than
    // inheriting another class's answer.
    const results = [...runs("A", 4, 5, 5), ...runs("B", 4, 1, 1)];
    const defaults = measuredDefaultsFrom(results);
    expect(defaults.appearance).toBe("A");
    expect(defaults.compositional).toBeUndefined();
    expect(defaults.motion).toBeUndefined();
  });

  it("is empty before any bench has run", () => {
    expect(measuredDefaultsFrom([])).toEqual({});
  });
});

describe("classifyIntent", () => {
  it("shares its vocabulary with the live selector", () => {
    // If the bench classifies "remove the cup" as compositional and the
    // selector does not, the measured default gets applied to a different
    // population than it was measured on.
    expect(classifyIntent("remove the paper cup")).toBe("compositional");
    expect(classifyIntent("add a neon sign")).toBe("compositional");
    expect(classifyIntent("she walks toward camera")).toBe("motion");
    expect(classifyIntent("the camera pushes in")).toBe("motion");
    expect(classifyIntent("make the jacket black leather")).toBe("appearance");
  });

  it("prefers compositional when an intent is both", () => {
    // "remove the sign as she walks" is an add/remove that happens to have
    // motion in it; the compositional half is the harder constraint.
    expect(classifyIntent("remove the sign as she walks past")).toBe(
      "compositional",
    );
  });
});

describe("formatReport", () => {
  it("says plainly when a class has no winner", () => {
    expect(formatReport(runs("A", 1, 5, 5))).toMatch(/No winner/);
  });

  it("reports every class, not only the ones with data", () => {
    const report = formatReport(runs("A", 4, 5, 5));
    expect(report).toContain("## appearance");
    expect(report).toContain("## compositional");
    expect(report).toContain("## motion");
  });
});
