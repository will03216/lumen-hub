/**
 * Unit tests for saved-pairs — localStorage-backed user presets.
 *
 * Covers the contract surface:
 *   · `upsertSavedPair` / `removeSavedPair` — pure mutations, dedupe semantics
 *   · `defaultPairLabel` — label derivation + family-word stripping
 *   · `readSavedPairs` / `writeSavedPairs` — persistence + stale-entry filter
 *
 * localStorage is provided by happy-dom (see vitest.config.ts). We reset
 * it between tests so one test's write can't leak into the next one's read.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultPairLabel,
  readSavedPairs,
  removeSavedPair,
  upsertSavedPair,
  writeSavedPairs,
  type SavedPair,
} from "./saved-pairs";

// Known-good IDs from PAIR_PRESETS — keeping tests coupled to real IDs
// means a typo'd model rename breaks this suite loudly instead of silently
// skating through on a fabricated string.
const IMG_A = "seedream-5-0-lite-260128";
const IMG_B = "seedream-4-5-251128";
const VID_A = "dreamina-seedance-2-0-260128";
const VID_B = "dreamina-seedance-2-0-fast-260128";
const UNKNOWN = "nonexistent-model-id";

beforeEach(() => {
  window.localStorage.clear();
});

// ────────────────────────── defaultPairLabel ────────────────────────────

describe("defaultPairLabel", () => {
  it("joins two known image labels with × separator and strips family word", () => {
    // findImageModel returns "Seedream 5.0 Lite" / "Seedream 4.5"
    // stripFamily → "5.0 Lite" / "4.5"
    expect(defaultPairLabel(IMG_A, IMG_B)).toBe("5.0 Lite × 4.5");
  });

  it("strips Seedance family word for video pairs too", () => {
    expect(defaultPairLabel(VID_A, VID_B)).toBe("2.0 × 2.0 Fast");
  });

  it("falls back to raw id when the model id isn't known", () => {
    expect(defaultPairLabel(UNKNOWN, IMG_A)).toBe(`${UNKNOWN} × 5.0 Lite`);
  });
});

// ────────────────────────── upsertSavedPair ─────────────────────────────

describe("upsertSavedPair", () => {
  it("prepends a new entry (latest-first) with derived slug", () => {
    const existing: SavedPair[] = [];
    const next = upsertSavedPair(existing, {
      a: IMG_A,
      b: IMG_B,
      label: "my favourite pair",
    });
    expect(next).toHaveLength(1);
    expect(next[0].slug).toBe(`saved:${IMG_A}:${IMG_B}`);
    expect(next[0].label).toBe("my favourite pair");
    expect(next[0].kind).toBe("image");
    expect(next[0].a).toBe(IMG_A);
    expect(next[0].b).toBe(IMG_B);
  });

  it("dedupes on repeat save of the same (a, b) — replaces in place", () => {
    const first = upsertSavedPair([], {
      a: IMG_A,
      b: IMG_B,
      label: "v1",
    });
    const second = upsertSavedPair(first, {
      a: IMG_A,
      b: IMG_B,
      label: "v2",
    });
    expect(second).toHaveLength(1);
    expect(second[0].label).toBe("v2");
  });

  it("moves re-saved pair to top even when other entries exist", () => {
    const a = upsertSavedPair([], { a: IMG_A, b: IMG_B, label: "first" });
    const b = upsertSavedPair(a, { a: VID_A, b: VID_B, label: "second" });
    // Re-save `first` — it should move back to the top, still deduped.
    const c = upsertSavedPair(b, { a: IMG_A, b: IMG_B, label: "first-again" });
    expect(c).toHaveLength(2);
    expect(c[0].label).toBe("first-again");
    expect(c[1].label).toBe("second");
  });

  it("returns input unchanged when pair is invalid (unknown model id)", () => {
    const existing: SavedPair[] = [];
    const next = upsertSavedPair(existing, {
      a: UNKNOWN,
      b: IMG_B,
      label: "bogus",
    });
    expect(next).toBe(existing);
  });

  it("returns input unchanged when a/b kinds mismatch (image × video)", () => {
    const existing: SavedPair[] = [];
    const next = upsertSavedPair(existing, {
      a: IMG_A,
      b: VID_A,
      label: "mixed",
    });
    expect(next).toBe(existing);
  });

  it("falls back to default label when user passes empty string", () => {
    const next = upsertSavedPair([], { a: IMG_A, b: IMG_B, label: "" });
    expect(next[0].label).toBe(defaultPairLabel(IMG_A, IMG_B));
  });

  it("trims whitespace-only labels to the default", () => {
    const next = upsertSavedPair([], { a: IMG_A, b: IMG_B, label: "   " });
    expect(next[0].label).toBe(defaultPairLabel(IMG_A, IMG_B));
  });
});

// ────────────────────────── removeSavedPair ─────────────────────────────

describe("removeSavedPair", () => {
  it("drops the entry whose slug matches", () => {
    const pairs = upsertSavedPair([], {
      a: IMG_A,
      b: IMG_B,
      label: "x",
    });
    const next = removeSavedPair(pairs, `saved:${IMG_A}:${IMG_B}`);
    expect(next).toHaveLength(0);
  });

  it("is a no-op when no entry matches", () => {
    const pairs = upsertSavedPair([], {
      a: IMG_A,
      b: IMG_B,
      label: "x",
    });
    const next = removeSavedPair(pairs, "saved:nope:nope");
    expect(next).toEqual(pairs);
  });
});

// ────────────────────────── read / write + stale filter ─────────────────

describe("readSavedPairs / writeSavedPairs", () => {
  it("returns [] when storage is empty", () => {
    expect(readSavedPairs()).toEqual([]);
  });

  it("returns [] when storage JSON is malformed", () => {
    window.localStorage.setItem("lumen.compare.savedPairs", "{not json");
    expect(readSavedPairs()).toEqual([]);
  });

  it("returns [] when storage is not an array (schema drift)", () => {
    window.localStorage.setItem(
      "lumen.compare.savedPairs",
      JSON.stringify({ not: "an array" }),
    );
    expect(readSavedPairs()).toEqual([]);
  });

  it("round-trips a written list identically", () => {
    const pairs = upsertSavedPair([], {
      a: IMG_A,
      b: IMG_B,
      label: "trip",
    });
    writeSavedPairs(pairs);
    expect(readSavedPairs()).toEqual(pairs);
  });

  it("filters out entries with stale / unknown model ids on hydrate", () => {
    // Hand-crafted payload: one valid, one with a stale model id. The stale
    // one fails isValidPair and must not appear in the hydrated list.
    const stale: SavedPair = {
      slug: "saved:ghost:ghost2",
      kind: "image",
      label: "ghost pair",
      a: "ghost-model",
      b: "also-ghost",
      savedAt: Date.now(),
    };
    const fresh: SavedPair = {
      slug: `saved:${IMG_A}:${IMG_B}`,
      kind: "image",
      label: "fresh",
      a: IMG_A,
      b: IMG_B,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(
      "lumen.compare.savedPairs",
      JSON.stringify([stale, fresh]),
    );
    const hydrated = readSavedPairs();
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].slug).toBe(fresh.slug);
  });

  it("filters out entries missing required fields", () => {
    const malformed = [
      { slug: "x", a: IMG_A }, // missing b, label
      { slug: "y", a: IMG_A, b: IMG_B }, // missing label
      null, // not an object
      "oops", // primitive
    ];
    window.localStorage.setItem(
      "lumen.compare.savedPairs",
      JSON.stringify(malformed),
    );
    expect(readSavedPairs()).toEqual([]);
  });
});
