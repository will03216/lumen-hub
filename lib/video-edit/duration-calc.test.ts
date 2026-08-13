import { describe, expect, it } from "vitest";
import {
  computeDuration,
  estimateBeats,
  estimateDialogueWords,
} from "./duration-calc";
import { MAX_WINDOW_SECONDS } from "./types";

describe("computeDuration", () => {
  it("never returns a value outside Seedance's own duration window", () => {
    expect(computeDuration({ beats: 0 }).seconds).toBe(4);
    // Reads the ceiling rather than repeating it — this assertion is about
    // the clamp holding, not about what the model's limit happens to be.
    expect(computeDuration({ beats: 99, dialogueWords: 500 }).seconds).toBe(
      MAX_WINDOW_SECONDS,
    );
  });

  it("prices beats and dialogue additively", () => {
    // 2 beats × 1.2 + 0.5 = 2.9; 10 words ÷ 2.3 + 1.5 = 5.85; total 8.75 → 9
    const out = computeDuration({ beats: 2, dialogueWords: 10 });
    expect(out.seconds).toBe(9);
    expect(out.basis).toContain("2 beats");
    expect(out.basis).toContain("10 words");
  });

  it("treats a camera move as a floor, not an addend", () => {
    // The move happens DURING the action, so adding its minimum on top would
    // double-count the same seconds.
    const withMove = computeDuration({ beats: 1, hasCameraMove: true });
    const withoutMove = computeDuration({ beats: 1 });
    expect(withoutMove.seconds).toBe(4); // 1.7 → floor
    expect(withMove.seconds).toBe(4);

    // A long action already past the minimum is not shortened by it.
    const long = computeDuration({ beats: 4, dialogueWords: 12, hasCameraMove: true });
    expect(long.seconds).toBeGreaterThan(4);
  });

  it("applies the multi-shot floor of ~4s per shot", () => {
    const out = computeDuration({ beats: 1, shots: 3 });
    expect(out.seconds).toBe(12);
    expect(out.basis).toContain("3 shots");
  });

  it("lets the working window cap the result, and says so", () => {
    // A render longer than the window it replaces cannot be spliced back
    // cleanly — the seam moves.
    const out = computeDuration({ beats: 4, dialogueWords: 20, windowSeconds: 6 });
    expect(out.seconds).toBe(6);
    expect(out.basis).toContain("window");
  });

  it("does not let the window cap push below the 4s floor", () => {
    // Seedance rejects anything under 4s, so a 2s window still renders 4s and
    // the caller deals with the overhang.
    const out = computeDuration({ beats: 1, windowSeconds: 2 });
    expect(out.seconds).toBe(4);
  });

  it("always returns a non-empty basis", () => {
    expect(computeDuration({ beats: 0 }).basis).toBeTruthy();
    expect(computeDuration({ beats: 3 }).basis).toBeTruthy();
  });
});

describe("estimateBeats", () => {
  it("counts clause separators that mark a new physical event", () => {
    expect(estimateBeats("she turns")).toBe(1);
    expect(estimateBeats("she turns and then the door opens")).toBe(2);
    expect(estimateBeats("she turns; the door opens. he steps through")).toBe(3);
  });

  it("does not treat a trailing comma-adverb as a second beat", () => {
    expect(estimateBeats("she turns, slowly")).toBe(1);
  });

  it("caps at the shot budget rather than pricing a novel", () => {
    expect(
      estimateBeats("a and then b and then c and then d and then e and then f"),
    ).toBe(4);
  });

  it("returns at least one beat for empty input", () => {
    expect(estimateBeats("")).toBe(1);
    expect(estimateBeats("   ")).toBe(1);
  });
});

describe("estimateDialogueWords", () => {
  it("counts only what is inside quotes", () => {
    expect(estimateDialogueWords('she says "we should go now"')).toBe(4);
  });

  it("handles curly quotes, which is what a paste from a doc produces", () => {
    expect(estimateDialogueWords("she says “we should go”")).toBe(3);
  });

  it("returns zero when there is no dialogue", () => {
    expect(estimateDialogueWords("she walks toward camera")).toBe(0);
  });

  it("sums several quoted lines", () => {
    expect(estimateDialogueWords('"go now" and later "come back"')).toBe(4);
  });
});
