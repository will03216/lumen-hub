/**
 * Unit tests for pairs — URL parse/serialize + the strict seed contract.
 *
 * Why these specific cases:
 *   · `?seed=…` is the one input that travels between strangers (Copy link
 *     → Slack → click). A loose parser that accepts `12e3` would surprise
 *     a recipient by quietly running a different seed than the sender saw,
 *     which is the exact opposite of the feature's purpose.
 *   · The serializer's gate (positive integer only) and the parser's gate
 *     (digits-only regex) need to agree so that a roundtrip never adds or
 *     drops a seed silently. The roundtrip test pins that contract.
 *   · Pair validation isn't seed-related, but it's small enough that
 *     covering it here keeps the file self-contained — one place to look
 *     when something on /compare goes sideways.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAIR,
  isValidPair,
  modelKind,
  resolveQuery,
  serializeQuery,
} from "./pairs";

const IMG_A = "seedream-5-0-lite-260128";
const IMG_B = "seedream-4-5-251128";
const VID_A = "dreamina-seedance-2-0-260128";
const VID_B = "dreamina-seedance-2-0-fast-260128";
const UNKNOWN = "nonexistent-model-id";

// ────────────────────────── modelKind / isValidPair ─────────────────────

describe("modelKind", () => {
  it("classifies seedream-* as image", () => {
    expect(modelKind(IMG_A)).toBe("image");
    expect(modelKind(IMG_B)).toBe("image");
  });

  it("classifies dreamina-seedance-* and seedance-* as video", () => {
    expect(modelKind(VID_A)).toBe("video");
    expect(modelKind("seedance-1-5-pro-251215")).toBe("video");
  });

  it("returns null for unknown prefixes", () => {
    expect(modelKind(UNKNOWN)).toBeNull();
    expect(modelKind("")).toBeNull();
  });
});

describe("isValidPair", () => {
  it("accepts two image models", () => {
    expect(isValidPair(IMG_A, IMG_B)).toBe(true);
  });

  it("accepts two video models", () => {
    expect(isValidPair(VID_A, VID_B)).toBe(true);
  });

  it("rejects mismatched kinds — image × video", () => {
    expect(isValidPair(IMG_A, VID_A)).toBe(false);
  });

  it("rejects either side being unknown", () => {
    expect(isValidPair(IMG_A, UNKNOWN)).toBe(false);
    expect(isValidPair(UNKNOWN, IMG_A)).toBe(false);
  });
});

// ────────────────────────── resolveQuery: pair fallback ─────────────────

describe("resolveQuery — pair fallback", () => {
  it("returns the requested pair when both ids are known and same kind", () => {
    const q = resolveQuery({ a: IMG_A, b: IMG_B });
    expect(q.a).toBe(IMG_A);
    expect(q.b).toBe(IMG_B);
    expect(q.kind).toBe("image");
  });

  it("falls back to DEFAULT_PAIR when a/b are missing", () => {
    const q = resolveQuery({});
    expect(q.a).toBe(DEFAULT_PAIR.a);
    expect(q.b).toBe(DEFAULT_PAIR.b);
    expect(q.kind).toBe(DEFAULT_PAIR.kind);
  });

  it("falls back to DEFAULT_PAIR when a/b are mismatched kinds", () => {
    const q = resolveQuery({ a: IMG_A, b: VID_A });
    expect(q.a).toBe(DEFAULT_PAIR.a);
    expect(q.b).toBe(DEFAULT_PAIR.b);
  });

  it("preserves the prompt regardless of pair validity", () => {
    // A bad pair shouldn't drop the user's typed prompt — they should land
    // on the default pair with their text intact, ready to retry.
    const q = resolveQuery({ a: UNKNOWN, b: UNKNOWN, prompt: "neon street" });
    expect(q.prompt).toBe("neon street");
    expect(q.a).toBe(DEFAULT_PAIR.a);
  });
});

// ────────────────────────── resolveQuery: seed parser ───────────────────

describe("resolveQuery — seed parsing", () => {
  it("accepts a positive integer string", () => {
    expect(resolveQuery({ a: IMG_A, b: IMG_B, seed: "42" }).seed).toBe(42);
    expect(resolveQuery({ a: IMG_A, b: IMG_B, seed: "1" }).seed).toBe(1);
  });

  it("accepts a large but safe-integer seed", () => {
    expect(resolveQuery({ a: IMG_A, b: IMG_B, seed: "999999" }).seed).toBe(
      999999,
    );
  });

  it("returns undefined for missing seed", () => {
    expect(resolveQuery({ a: IMG_A, b: IMG_B }).seed).toBeUndefined();
  });

  it("returns undefined for empty / whitespace-only", () => {
    expect(resolveQuery({ a: IMG_A, b: IMG_B, seed: "" }).seed).toBeUndefined();
    expect(
      resolveQuery({ a: IMG_A, b: IMG_B, seed: "   " }).seed,
    ).toBeUndefined();
  });

  it("returns undefined for zero — treated as 'no pinned seed'", () => {
    // Engines treat seed=0 as a sentinel; we'd rather emit nothing than
    // forward an ambiguous zero that one side might interpret as random.
    expect(
      resolveQuery({ a: IMG_A, b: IMG_B, seed: "0" }).seed,
    ).toBeUndefined();
  });

  it("returns undefined for negatives", () => {
    expect(
      resolveQuery({ a: IMG_A, b: IMG_B, seed: "-1" }).seed,
    ).toBeUndefined();
  });

  it("returns undefined for decimals", () => {
    expect(
      resolveQuery({ a: IMG_A, b: IMG_B, seed: "12.5" }).seed,
    ).toBeUndefined();
  });

  it("returns undefined for scientific notation — Number() would coerce 12e3 → 12000", () => {
    // This is the whole reason the parser uses a strict /^[0-9]+$/ regex
    // instead of Number()'s permissive coercion. A recipient clicking a
    // ?seed=12e3 link should NOT silently get seed 12000.
    expect(
      resolveQuery({ a: IMG_A, b: IMG_B, seed: "12e3" }).seed,
    ).toBeUndefined();
  });

  it("returns undefined for non-numeric junk", () => {
    expect(
      resolveQuery({ a: IMG_A, b: IMG_B, seed: "oops" }).seed,
    ).toBeUndefined();
    expect(
      resolveQuery({ a: IMG_A, b: IMG_B, seed: "12abc" }).seed,
    ).toBeUndefined();
  });

  it("returns undefined when seed is provided as an array", () => {
    // Next.js can hand us `string[]` for repeated keys (?seed=1&seed=2).
    // The contract degrades to undefined rather than picking one.
    expect(
      resolveQuery({ a: IMG_A, b: IMG_B, seed: ["1", "2"] }).seed,
    ).toBeUndefined();
  });

  it("preserves seed even when pair falls back to DEFAULT_PAIR", () => {
    // A bad pair shouldn't strip the seed — the user might fix the pair
    // and expect their pinned seed to still apply.
    const q = resolveQuery({ a: UNKNOWN, b: UNKNOWN, seed: "42" });
    expect(q.seed).toBe(42);
    expect(q.a).toBe(DEFAULT_PAIR.a);
  });
});

// ────────────────────────── serializeQuery ──────────────────────────────

describe("serializeQuery", () => {
  it("emits a, b, prompt when present", () => {
    const sp = serializeQuery({ a: IMG_A, b: IMG_B, prompt: "neon city" });
    expect(sp.get("a")).toBe(IMG_A);
    expect(sp.get("b")).toBe(IMG_B);
    expect(sp.get("prompt")).toBe("neon city");
  });

  it("drops empty/whitespace prompt", () => {
    expect(serializeQuery({ a: IMG_A, b: IMG_B, prompt: "" }).has("prompt"))
      .toBe(false);
    expect(serializeQuery({ a: IMG_A, b: IMG_B, prompt: "   " }).has("prompt"))
      .toBe(false);
  });

  it("emits seed when it's a positive integer", () => {
    const sp = serializeQuery({ a: IMG_A, b: IMG_B, seed: 42 });
    expect(sp.get("seed")).toBe("42");
  });

  it("drops seed for 0, negative, NaN, and float values", () => {
    // Same gate as the parser — only positive integers travel. Anything
    // else would surprise a recipient or get rejected by the engine.
    expect(serializeQuery({ a: IMG_A, b: IMG_B, seed: 0 }).has("seed")).toBe(
      false,
    );
    expect(serializeQuery({ a: IMG_A, b: IMG_B, seed: -1 }).has("seed")).toBe(
      false,
    );
    expect(
      serializeQuery({ a: IMG_A, b: IMG_B, seed: 12.5 }).has("seed"),
    ).toBe(false);
    expect(serializeQuery({ a: IMG_A, b: IMG_B, seed: NaN }).has("seed")).toBe(
      false,
    );
  });

  it("drops seed when undefined", () => {
    expect(
      serializeQuery({ a: IMG_A, b: IMG_B, seed: undefined }).has("seed"),
    ).toBe(false);
  });
});

// ────────────────────────── roundtrip ───────────────────────────────────

describe("seed roundtrip — serialize then resolve", () => {
  it("preserves a positive integer seed across the boundary", () => {
    const sp = serializeQuery({ a: IMG_A, b: IMG_B, seed: 42 });
    const params: Record<string, string> = {};
    sp.forEach((v, k) => {
      params[k] = v;
    });
    const q = resolveQuery(params);
    expect(q.seed).toBe(42);
  });

  it("a missing seed stays missing — never a phantom 0", () => {
    const sp = serializeQuery({ a: IMG_A, b: IMG_B });
    const params: Record<string, string> = {};
    sp.forEach((v, k) => {
      params[k] = v;
    });
    expect(resolveQuery(params).seed).toBeUndefined();
  });

  it("a dropped seed (e.g. 0 in → undefined out) survives the roundtrip", () => {
    // serializeQuery refuses to emit seed=0; resolveQuery would refuse to
    // parse it anyway. Together: the bad value is gone after one trip.
    const sp = serializeQuery({ a: IMG_A, b: IMG_B, seed: 0 });
    const params: Record<string, string> = {};
    sp.forEach((v, k) => {
      params[k] = v;
    });
    expect(resolveQuery(params).seed).toBeUndefined();
  });
});
