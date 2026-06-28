/**
 * Drafts — DEPRECATED staging area for renders awaiting user confirmation.
 *
 * Status (post Freepik-style redesign)
 * ------------------------------------
 * No UI surface consumes this store any more. Renders now commit
 * directly to Library via `lib/library/auto-save.ts` and the new
 * `<CreationsFeed>` reads from `assets.ts` + `in-flight.ts`. The file
 * is kept around so:
 *   • Any external integration that still calls `addDraft` doesn't break.
 *   • Pre-existing localStorage data at `lumen.library.drafts.v1` can
 *     still be inspected if a user needs to recover something.
 *
 * Plan
 * ----
 * Once the v1 drafts data is migrated (or expired), delete this file
 * and its localStorage key. Tracking under §64.
 *
 * Original §60 rationale (kept for context)
 * -----------------------------------------
 * Until §60, every Generator and Canvas render went straight into the
 * Library via auto-save. That auto-commit cluttered Library with throw-
 * away rolls. §60 split drafts out so users could curate before
 * committing. The §64 Creations-feed redesign moved curation onto the
 * row itself (pin / delete chips), making the staging step redundant.
 *
 * Storage / sync model
 * --------------------
 * - localStorage at `lumen.library.drafts.v1`. Persists across reloads
 *   but never leaves the device.
 * - Same `useSyncExternalStore` plumbing as `assets.ts`.
 *
 * Schema
 * ------
 * Reuses the `Asset` shape verbatim.
 */

import {
  addAsset,
  type Asset,
  type CreateAssetInput,
  getAsset as getCommittedAsset,
} from "./assets";
import { mirrorAsset } from "./mirror";

import { userKey } from '@/lib/storage-user';

const STORAGE_KEY = () => userKey("lumen.library.drafts.v1");

type StoreShape = {
  version: 1;
  drafts: Record<string, Asset>;
};

const EMPTY_STORE: StoreShape = { version: 1, drafts: {} };

// ─────────────────────────── Storage I/O ───────────────────────────────

function readStore(): StoreShape {
  if (typeof window === "undefined") return EMPTY_STORE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY());
    if (!raw) return { version: 1, drafts: {} };
    const parsed = JSON.parse(raw) as StoreShape;
    if (parsed.version !== 1 || !parsed.drafts) return EMPTY_STORE;
    return parsed;
  } catch {
    return EMPTY_STORE;
  }
}

function writeStore(store: StoreShape): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(store));
  } catch {
    // Quota / serialization swallowed — same trade-off as assets.ts.
  }
}

// ─────────────────────────── In-memory cache ───────────────────────────

let cache: StoreShape | null = null;
type Listener = () => void;
const listeners = new Set<Listener>();

function getCached(): StoreShape {
  if (!cache) cache = readStore();
  return cache;
}

function commit(next: StoreShape): void {
  cache = next;
  writeStore(next);
  for (const fn of listeners) fn();
}

// ─────────────────────────── Public API ────────────────────────────────

export type CreateDraftInput = CreateAssetInput;

/** Stage a new draft. Idempotent on `id` so re-fires (React strict-mode,
 *  poll loop double-firing on success) upsert instead of duplicating. */
export function addDraft(input: CreateDraftInput): Asset {
  // Skip if this id has already been committed to Library — prevents the
  // post-commit mirror-update path or a stale Generator click from re-
  // staging an asset the user already saved.
  if (input.id && getCommittedAsset(input.id)) {
    return getCommittedAsset(input.id) as Asset;
  }

  const now = Date.now();
  const id = input.id ?? cryptoId();
  const existing = getCached().drafts[id];
  const draft: Asset = {
    ...input,
    id,
    tags: input.tags ?? [],
    pinned: input.pinned ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const store = getCached();
  commit({ ...store, drafts: { ...store.drafts, [id]: draft } });
  return draft;
}

export function getDraft(id: string): Asset | null {
  return getCached().drafts[id] ?? null;
}

export function listDrafts(): Asset[] {
  const store = getCached();
  return Object.values(store.drafts).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

export function removeDraft(id: string): boolean {
  const store = getCached();
  if (!store.drafts[id]) return false;
  const { [id]: _, ...rest } = store.drafts;
  commit({ ...store, drafts: rest });
  return true;
}

/** Move a draft into Library. Returns the saved asset, or `null` if the
 *  draft id wasn't found. Calls `addAsset` (which fires cloud sync) and
 *  triggers the mirror request — both deferred until commit so we don't
 *  pay for content the user discards. */
export function commitDraft(id: string): Asset | null {
  const draft = getDraft(id);
  if (!draft) return null;
  const asset = addAsset({
    id: draft.id,
    kind: draft.kind,
    url: draft.url,
    source: draft.source,
    prompt: draft.prompt,
    model: draft.model,
    seed: draft.seed,
    size: draft.size,
    ratio: draft.ratio,
    duration: draft.duration,
    params: draft.params,
    derivedFrom: draft.derivedFrom,
    projectId: draft.projectId,
    title: draft.title,
    thumbUrl: draft.thumbUrl,
  });
  removeDraft(id);
  if (typeof window !== "undefined") {
    void mirrorAsset(asset).catch(() => {
      // mirrorAsset records its own failure status.
    });
  }
  return asset;
}

/** Bulk commit — convenience for the "Save all" button. */
export function commitAllDrafts(): Asset[] {
  return listDrafts()
    .map((d) => commitDraft(d.id))
    .filter((a): a is Asset => a !== null);
}

/** Bulk discard — companion to commitAllDrafts. */
export function discardAllDrafts(): number {
  const ids = listDrafts().map((d) => d.id);
  for (const id of ids) removeDraft(id);
  return ids.length;
}

// ─────────────────────────── React glue ───────────────────────────────

export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let snapshotCache: { store: StoreShape; list: Asset[] } | null = null;

export function getDraftsSnapshot(): Asset[] {
  const store = getCached();
  if (snapshotCache && snapshotCache.store === store) return snapshotCache.list;
  const list = listDrafts();
  snapshotCache = { store, list };
  return list;
}

const SERVER_SNAPSHOT: Asset[] = [];
export function getDraftsServerSnapshot(): Asset[] {
  return SERVER_SNAPSHOT;
}

// ─────────────────────────── Helpers ───────────────────────────────────

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `draft_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// ─────────────────────────── Test-only reset ──────────────────────────

export function __resetForTests(): void {
  cache = null;
  snapshotCache = null;
  listeners.clear();
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY());
    } catch {
      // ignore
    }
  }
}
