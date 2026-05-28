/**
 * Compare — pair definitions + URL parse/serialize helpers.
 *
 * URL shape: /compare?a=<modelId>&b=<modelId>&prompt=<encoded>&seed=<n>
 * - Model IDs are the source of truth (no slugs, no lookup tables).
 * - Pair kind (image | video) is inferred from the selected model IDs.
 * - Prompt survives pair swaps because it lives in the URL.
 * - Seed is optional. When present and shared via Copy link, recipients
 *   reproduce the exact same render — the whole point of the link being
 *   a "look at this comparison" signal rather than a "vibes-similar" one.
 *   Refs and start frames stay session-local on purpose: re-uploading
 *   them is the user's chance to try the comparison with different inputs.
 *
 * Phase 1 ships image pairs only. Video pairs will slot in during Phase 2.
 */

import { IMAGE_MODELS, type ImageModel } from "@/lib/studio/models";

export type CompareKind = "image" | "video";

export type PairPreset = {
  /** Stable slug for the quick-switch chip label. Not in URL. */
  slug: string;
  kind: CompareKind;
  /** Short chip label shown in the quick-switch row. */
  label: string;
  /** One-line editorial note displayed near the active pair. */
  blurb: string;
  a: string; // model id
  b: string; // model id
};

/** Quick-switch presets surfaced as chips on the Compare page. */
export const PAIR_PRESETS: PairPreset[] = [
  {
    slug: "seedream-lite-vs-fidelity",
    kind: "image",
    label: "Lite vs Fidelity",
    blurb:
      "Seedream 5.0 Lite (fast, balanced) against Seedream 4.5 (highest fidelity, 4K).",
    a: "seedream-5-0-lite-260128",
    b: "seedream-4-5-251128",
  },
  {
    slug: "seedance-2-vs-2fast",
    kind: "video",
    label: "2.0 vs 2.0 Fast",
    blurb:
      "Seedance 2.0 (standard) against 2.0 Fast (~25% cheaper, faster queue). Same caps, quality vs throughput.",
    a: "dreamina-seedance-2-0-260128",
    b: "dreamina-seedance-2-0-fast-260128",
  },
  {
    slug: "seedance-2-vs-1-5",
    kind: "video",
    label: "2.0 vs 1.5 Pro",
    blurb:
      "Seedance 2.0 (native audio, 4–15s) against 1.5 Pro (up to 1080p, 5/10s only). Audio vs resolution trade.",
    a: "dreamina-seedance-2-0-260128",
    b: "seedance-1-5-pro-251215",
  },
];

/** The default pair for /compare with no query params. */
export const DEFAULT_PAIR: PairPreset = PAIR_PRESETS[0];

// ────────────────────────────── derivation ──────────────────────────────

/** Kind of a model ID — inferred from the ID prefix. */
export function modelKind(id: string): CompareKind | null {
  if (id.startsWith("seedream-")) return "image";
  if (id.startsWith("dreamina-seedance-") || id.startsWith("seedance-")) {
    return "video";
  }
  return null;
}

/** True when both model IDs are known and the same kind. */
export function isValidPair(a: string, b: string): boolean {
  const ka = modelKind(a);
  const kb = modelKind(b);
  return ka !== null && kb !== null && ka === kb;
}

/** Known image models as the Compare model picker list. */
export function imageModelsForPicker(): readonly ImageModel[] {
  return IMAGE_MODELS;
}

// ────────────────────────────── URL (de)serialize ───────────────────────

export type CompareQuery = {
  a: string;
  b: string;
  prompt: string;
  kind: CompareKind;
  /** Pinned seed for deterministic reruns. Undefined = "let the engine
   *  pick a random one each render", which is what a Compare user usually
   *  wants while iterating. Defined ⇒ the URL also encodes it, so
   *  Copy-link recipients hit the same dice roll. */
  seed?: number;
};

/**
 * Resolve an incoming searchParams object to a CompareQuery. Falls back to the
 * default pair when `a` / `b` are missing or invalid. Kind is derived from the
 * resolved `a`. Seed parses tolerantly — anything that isn't a positive
 * integer string drops to `undefined` rather than throwing, so a malformed
 * `?seed=oops` link still loads with the default behaviour.
 */
export function resolveQuery(
  params: Record<string, string | string[] | undefined>,
): CompareQuery {
  const a = typeof params.a === "string" ? params.a : "";
  const b = typeof params.b === "string" ? params.b : "";
  const prompt = typeof params.prompt === "string" ? params.prompt : "";
  const seed = parseSeedParam(params.seed);

  if (isValidPair(a, b)) {
    return { a, b, prompt, kind: modelKind(a) as CompareKind, seed };
  }
  return {
    a: DEFAULT_PAIR.a,
    b: DEFAULT_PAIR.b,
    prompt,
    kind: DEFAULT_PAIR.kind,
    seed,
  };
}

/** Serialize a CompareQuery back into a URLSearchParams-safe object. Drops
 *  empty strings so the URL stays tidy. Seed is emitted only when it's a
 *  positive integer — `0`, NaN, negative, and float values are treated as
 *  "no pinned seed" because they'd surprise a recipient who clicks the link
 *  expecting deterministic reproduction. */
export function serializeQuery(q: Partial<CompareQuery>): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.a) sp.set("a", q.a);
  if (q.b) sp.set("b", q.b);
  if (q.prompt && q.prompt.trim()) sp.set("prompt", q.prompt);
  if (
    typeof q.seed === "number" &&
    Number.isInteger(q.seed) &&
    q.seed > 0
  ) {
    sp.set("seed", String(q.seed));
  }
  return sp;
}

/** Strict positive-integer parser for `?seed=…`. The strictness matters
 *  because Copy-link recipients expect the seed they click to be the seed
 *  that ran — a permissive `Number()` would coerce `12e3` to 12000 and
 *  silently change which dice roll the user saw. Anything ambiguous
 *  (empty, decimal, negative, scientific) degrades to undefined. */
function parseSeedParam(raw: string | string[] | undefined): number | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (!/^[0-9]+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0) return undefined;
  return n;
}
