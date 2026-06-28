"use client";

/**
 * Compare — per-side render history, persisted to localStorage.
 *
 * Each ComparePanel keeps a stack of recent successful renders; this module
 * is the storage layer behind that stack. Buckets are keyed by (kind, side)
 * so the four combinations — image/A, image/B, video/A, video/B — each have
 * their own history. Kind flip (image ↔ video) doesn't drop the other axis's
 * history; it's still in storage, just hidden while you're on the other side.
 *
 * URL caveat: the `url` field on each item is a BytePlus CDN URL (signed,
 * TTL'd). Entries survive reload only within that TTL — past it, the thumb
 * will 404. The panel reacts to load errors by pruning that entry on the fly,
 * so the strip self-heals without a manual migration step.
 *
 * The `HistoryItem` type lives here (not in compare-panel.tsx) so both the
 * panel AND the shell can import it — the shell needs the type to handle the
 * restore-to-form callback that threads back from the history strip.
 */

import type { VideoMode, VideoResolution } from "@/lib/studio/models";
import type { CompareKind } from "./pairs";

/** Hard cap per bucket. Matches what the strip shows without wrapping. */
export const MAX_HISTORY = 6;

/** Side discriminator for keyed buckets. */
export type HistorySide = "A" | "B";

/** Snapshot of a single successful render. Carries enough to:
 *   · Render a thumbnail (url + aspect metadata)
 *   · Round-trip into Studio (prompt + model + kind-specific params)
 *   · Restore params back into the Compare form (same fields)
 *  Refs and seed are intentionally omitted — refs as base64 won't round-trip
 *  through a URL, and re-using an exact seed isn't usually the user's intent
 *  when clicking "restore" (they want to iterate, not reproduce). */
export type HistoryItem =
  | {
      kind: "image";
      url: string;
      size?: string;
      model: string;
      prompt: string;
      ts: number;
      elapsedMs: number;
    }
  | {
      kind: "video";
      url: string;
      ratio: string;
      model: string;
      prompt: string;
      resolution: VideoResolution;
      duration: number;
      mode: VideoMode;
      ts: number;
      elapsedMs: number;
    };

// ────────────────────────── Storage shape ──────────────────────────────

/** Top-level payload: one bucket per (kind, side) pair. Missing buckets
 *  default to []. Stored as a single JSON blob under one key to keep the
 *  read/write cost to one localStorage call per update. */
type HistoryStorage = {
  image: { A: HistoryItem[]; B: HistoryItem[] };
  video: { A: HistoryItem[]; B: HistoryItem[] };
};

import { userKey } from '@/lib/storage-user';

const STORAGE_KEY = () => userKey("lumen.compare.history");

const EMPTY_STORAGE: HistoryStorage = {
  image: { A: [], B: [] },
  video: { A: [], B: [] },
};

// ────────────────────────── I/O ────────────────────────────────────────

/** Read the whole storage blob. SSR-safe; returns empty on parse failure. */
function readAll(): HistoryStorage {
  if (typeof window === "undefined") return EMPTY_STORAGE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY());
    if (!raw) return EMPTY_STORAGE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_STORAGE;
    // Per-bucket validation — drop anything that doesn't smell like a
    // HistoryItem. Prevents a shape drift (old field, renamed kind) from
    // nuking the strip entirely.
    return {
      image: {
        A: sanitizeBucket(parsed?.image?.A, "image"),
        B: sanitizeBucket(parsed?.image?.B, "image"),
      },
      video: {
        A: sanitizeBucket(parsed?.video?.A, "video"),
        B: sanitizeBucket(parsed?.video?.B, "video"),
      },
    };
  } catch {
    return EMPTY_STORAGE;
  }
}

function sanitizeBucket(raw: unknown, kind: CompareKind): HistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is HistoryItem => isValidItem(it, kind))
    .slice(0, MAX_HISTORY);
}

function isValidItem(it: unknown, expectedKind: CompareKind): boolean {
  if (!it || typeof it !== "object") return false;
  const o = it as Record<string, unknown>;
  if (o.kind !== expectedKind) return false;
  if (typeof o.url !== "string" || !o.url) return false;
  if (typeof o.model !== "string" || !o.model) return false;
  if (typeof o.prompt !== "string") return false;
  if (typeof o.ts !== "number") return false;
  if (typeof o.elapsedMs !== "number") return false;
  if (expectedKind === "video") {
    if (typeof o.ratio !== "string") return false;
    if (typeof o.resolution !== "string") return false;
    if (typeof o.duration !== "number") return false;
    if (typeof o.mode !== "string") return false;
  }
  return true;
}

/** Silent write. Quota-full / private-mode / SSR all no-op safely —
 *  session-local history keeps working even if disk is unavailable. */
function writeAll(storage: HistoryStorage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY(), JSON.stringify(storage));
  } catch {
    // ignore
  }
}

// ────────────────────────── Public API ─────────────────────────────────

/** Read one (kind, side) bucket. Caps at MAX_HISTORY defensively — on-disk
 *  state might predate a cap change, and we don't want to blow past the
 *  strip's visual budget. */
export function readHistoryBucket(
  kind: CompareKind,
  side: HistorySide,
): HistoryItem[] {
  const all = readAll();
  return all[kind][side].slice(0, MAX_HISTORY);
}

/** Write one bucket. Reads the rest so we don't clobber the three buckets
 *  we're not currently touching. */
export function writeHistoryBucket(
  kind: CompareKind,
  side: HistorySide,
  items: HistoryItem[],
): void {
  const all = readAll();
  all[kind][side] = items.slice(0, MAX_HISTORY);
  writeAll(all);
}

/** Wipe a single bucket. Exposed for a future "clear history" action;
 *  currently the panel only calls this indirectly via writeHistoryBucket([]). */
export function clearHistoryBucket(
  kind: CompareKind,
  side: HistorySide,
): void {
  writeHistoryBucket(kind, side, []);
}

/** Cross-tab sync. `storage` events fire on every OTHER tab when one tab
 *  writes — so a render landing in tab A can grow tab B's history strip
 *  without a reload. The originating tab doesn't fire its own event
 *  (in-memory state there is already fresh via persistedSetHistory).
 *
 *  The whole HistoryStorage blob is the unit of write, so a single event
 *  may indicate a change to any of the four buckets. Subscribers re-read
 *  the bucket they care about via `readHistoryBucket(kind, side)` inside
 *  the callback; the extra read is essentially free (one JSON parse).
 *
 *  Returns an unsubscribe function for React effect cleanup. */
export function subscribeSavedHistory(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY()) return;
    onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
