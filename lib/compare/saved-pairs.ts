"use client";

/**
 * Compare — user-saved pair presets, persisted to localStorage.
 *
 * Built-in pairs live in `PAIR_PRESETS` (pairs.ts) — curated, typed at
 * compile time. User-saved pairs are a runtime-mutable layer alongside
 * them: save the current (a, b) with a label, and it joins the quick-
 * switch row forever after. localStorage-scoped (per browser, per origin).
 *
 * Schema is deliberately minimal. We don't carry prompt, refs, seed, or
 * any render inputs — a "pair" is just the engine match-up. The shell's
 * URL keeps the prompt; saved pairs keep the pairing.
 *
 * Stale-entry handling: model IDs move between deploys (adding new ones,
 * deprecating old ones). `readSavedPairs` filters through `isValidPair`
 * on hydrate so an old entry with a removed model won't render a broken
 * chip or break the shell. Users silently lose unreachable entries; we
 * don't surface a migration UI for v1.
 */

import {
  isValidPair,
  modelKind,
  type CompareKind,
} from "./pairs";
import { findImageModel, findVideoModel } from "@/lib/studio/models";

const STORAGE_KEY = "lumen.compare.savedPairs";

export type SavedPair = {
  /** Deterministic from (a, b) so upsert dedupes on repeat save. */
  slug: string;
  kind: CompareKind;
  label: string;
  a: string;
  b: string;
  savedAt: number;
};

// ────────────────────────── localStorage I/O ────────────────────────────

/** Read saved pairs from localStorage. Returns [] under SSR / on parse
 *  failure / on quota-blocked reads. Filters out entries whose model ids
 *  are no longer known to the current build (see isValidPair). */
export function readSavedPairs(): SavedPair[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p: unknown): p is SavedPair =>
        typeof p === "object" &&
        p !== null &&
        "slug" in p &&
        "a" in p &&
        "b" in p &&
        "label" in p &&
        typeof (p as SavedPair).slug === "string" &&
        typeof (p as SavedPair).a === "string" &&
        typeof (p as SavedPair).b === "string" &&
        typeof (p as SavedPair).label === "string" &&
        isValidPair((p as SavedPair).a, (p as SavedPair).b),
    );
  } catch {
    return [];
  }
}

/** Persist saved pairs. Silent no-op under SSR / quota-full / private mode —
 *  session-local state keeps working even when disk is unavailable. */
export function writeSavedPairs(pairs: SavedPair[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pairs));
  } catch {
    // ignore
  }
}

/** Cross-tab sync. Browsers fire `storage` events on every OTHER tab when a
 *  tab writes to localStorage — so if tab A saves a new pair, tab B's chip
 *  row can grow the chip without a reload. The originating tab doesn't fire
 *  its own event (state there is already fresh via the setter).
 *
 *  Callers pass a void callback; they re-read via `readSavedPairs()` inside
 *  it. Returns an unsubscribe function suitable for a React effect cleanup.
 *  Filters by `e.key` so unrelated localStorage churn (reels, studio state)
 *  doesn't cause spurious re-hydrates. */
export function subscribeSavedPairs(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

// ────────────────────────── Mutations (pure) ────────────────────────────

/** Dedupe-by-(a,b) upsert. Latest-first. Returns the input unchanged when
 *  the pair isn't valid (unknown model ids or mismatched kinds). */
export function upsertSavedPair(
  existing: SavedPair[],
  input: { a: string; b: string; label: string },
): SavedPair[] {
  const kind = modelKind(input.a);
  if (!kind || !isValidPair(input.a, input.b)) return existing;
  const slug = `saved:${input.a}:${input.b}`;
  const label = input.label.trim() || defaultPairLabel(input.a, input.b);
  const next: SavedPair = {
    slug,
    kind,
    label,
    a: input.a,
    b: input.b,
    savedAt: Date.now(),
  };
  const withoutDupe = existing.filter((p) => p.slug !== slug);
  return [next, ...withoutDupe];
}

export function removeSavedPair(
  existing: SavedPair[],
  slug: string,
): SavedPair[] {
  return existing.filter((p) => p.slug !== slug);
}

// ────────────────────────── Label derivation ────────────────────────────

/** "5.0 Lite × 4.5" / "2.0 × 2.0 Fast" — concise default label from model
 *  dropdown labels, with the redundant "Seedream" / "Seedance" family word
 *  stripped. Row fits cleanly in a chip without wrapping. */
export function defaultPairLabel(aId: string, bId: string): string {
  return `${stripFamily(labelFor(aId))} × ${stripFamily(labelFor(bId))}`;
}

function labelFor(id: string): string {
  return (
    findImageModel(id)?.label ??
    findVideoModel(id)?.label ??
    id
  );
}

function stripFamily(label: string): string {
  return label.replace(/^Seedream\s+/i, "").replace(/^Seedance\s+/i, "");
}
