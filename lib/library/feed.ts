/**
 * Creations feed aggregator — pure functions over Library + in-flight.
 *
 * `/generate` shows a chronological cross-kind feed (Image + Video + Audio)
 * with date buckets (Today / Yesterday / This week / Older). This module
 * owns the merge + sort + bucket logic so the React component layer can
 * stay declarative and `useSyncExternalStore` snapshots stay shallow.
 *
 * Inputs
 * ------
 * - `assets`: every saved record from `lib/library/assets.ts`.
 * - `pendingImages` / `pendingVideos`: in-flight queues from
 *   `lib/library/in-flight.ts`. We surface them as a synthetic "pending"
 *   entry at the top of "today" so users see immediate feedback while a
 *   render is cooking.
 * - `filterKind` / `favoritesOnly`: filter chip state (All / Image / Video /
 *   Audio / ♥).
 *
 * Output
 * ------
 * Ordered list of `CreationGroup`s — each group is a date bucket with its
 * entries already filtered + sorted (newest first). Empty buckets are
 * omitted so the UI doesn't render naked headers.
 */

import type { Asset, AssetKind } from "./assets";
import type { InFlightImage, InFlightVideo } from "./in-flight";
import { dateBucket, BUCKET_ORDER, type DateBucket } from "./time";

// ─────────────────────────── Types ──────────────────────────────────────

export type FeedKind = "image" | "video" | "audio";

/** Filter chips. `null` ≈ "All". */
export type FeedFilterKind = FeedKind | null;

export type CreationEntry =
  | {
      type: "asset";
      kind: FeedKind;
      createdAt: number;
      asset: Asset;
    }
  | {
      type: "pending-image";
      kind: "image";
      createdAt: number;
      pending: InFlightImage;
    }
  | {
      type: "pending-video";
      kind: "video";
      createdAt: number;
      pending: InFlightVideo;
    };

export type CreationGroup = {
  bucket: DateBucket;
  entries: CreationEntry[];
};

// ─────────────────────────── Aggregator ─────────────────────────────────

export type BuildFeedInput = {
  assets: readonly Asset[];
  pendingImages: readonly InFlightImage[];
  pendingVideos: readonly InFlightVideo[];
  /** When set, drop entries whose kind doesn't match. `null` = no filter. */
  filterKind?: FeedFilterKind;
  /** When true, drop entries whose asset isn't pinned. Pending entries
   *  are dropped under favoritesOnly (they aren't pinnable yet). */
  favoritesOnly?: boolean;
  /** Inject for testing — defaults to `Date.now()` at call time. */
  now?: number;
};

export function buildCreationsFeed(input: BuildFeedInput): CreationGroup[] {
  const {
    assets,
    pendingImages,
    pendingVideos,
    filterKind = null,
    favoritesOnly = false,
    now = Date.now(),
  } = input;

  const entries: CreationEntry[] = [];

  // 1. Pending renders first — synthetic entries at "now" so they bubble
  //    to the top of Today.
  if (!favoritesOnly) {
    for (const p of pendingImages) {
      if (filterKind !== null && filterKind !== "image") continue;
      entries.push({
        type: "pending-image",
        kind: "image",
        createdAt: p.startedAt,
        pending: p,
      });
    }
    for (const p of pendingVideos) {
      if (filterKind !== null && filterKind !== "video") continue;
      entries.push({
        type: "pending-video",
        kind: "video",
        createdAt: p.startedAt,
        pending: p,
      });
    }
  }

  // 2. Saved assets — drop kinds the feed doesn't track (reference
  //    uploads aren't "creations") plus anything filtered out by chips.
  for (const a of assets) {
    if (!isFeedKind(a.kind)) continue;
    if (filterKind !== null && filterKind !== a.kind) continue;
    if (favoritesOnly && !a.pinned) continue;
    entries.push({
      type: "asset",
      kind: a.kind,
      createdAt: a.createdAt,
      asset: a,
    });
  }

  // 3. Sort newest first, then partition into date buckets.
  entries.sort((a, b) => b.createdAt - a.createdAt);

  const buckets = new Map<DateBucket, CreationEntry[]>();
  for (const e of entries) {
    const b = dateBucket(e.createdAt, now);
    const list = buckets.get(b);
    if (list) list.push(e);
    else buckets.set(b, [e]);
  }

  // 4. Emit groups in canonical order, skipping empties.
  const groups: CreationGroup[] = [];
  for (const b of BUCKET_ORDER) {
    const list = buckets.get(b);
    if (list && list.length > 0) groups.push({ bucket: b, entries: list });
  }
  return groups;
}

// ─────────────────────────── Helpers ────────────────────────────────────

function isFeedKind(k: AssetKind): k is FeedKind {
  return k === "image" || k === "video" || k === "audio";
}
