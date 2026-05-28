"use client";

/**
 * CreationsFeed — cross-kind chronological feed on the right of /generate.
 *
 * Subscribes to:
 *   • `subscribeAssets`  — saved Library records (image + video + audio).
 *   • `subscribeInFlight` — pending image / video renders so users see
 *     "Rendering…" placeholders the instant they hit Generate.
 *
 * Filter chips along the top filter by kind (All / Image / Video / Audio)
 * plus a Favorites-only toggle. Filter state stays local to the feed;
 * the chips never affect the sidebar's active Tab.
 *
 * Entries are bucketed by date (Today / Yesterday / This week / Older);
 * empty buckets are dropped so the feed reads tightly.
 */

import * as React from "react";
import {
  getAssetsServerSnapshot,
  getAssetsSnapshot,
  subscribeAssets,
} from "@/lib/library/assets";
import {
  getInFlightImagesServerSnapshot,
  getInFlightVideosServerSnapshot,
  listInFlightImages,
  listInFlightVideos,
  subscribeInFlight,
} from "@/lib/library/in-flight";
import {
  buildCreationsFeed,
  type FeedFilterKind,
} from "@/lib/library/feed";
import { bucketLabel } from "@/lib/library/time";
import { cn } from "@/lib/utils";
import { CreationRow } from "./creation-row";

// ─────────────────────────── Filter chip set ────────────────────────────

const FILTER_CHIPS: Array<{
  id: FeedFilterKind | "favorites";
  label: string;
}> = [
  { id: null, label: "All" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "favorites", label: "♥ Favorites" },
];

// ─────────────────────────── Main component ─────────────────────────────

export function CreationsFeed() {
  const assets = React.useSyncExternalStore(
    subscribeAssets,
    getAssetsSnapshot,
    getAssetsServerSnapshot,
  );
  const pendingImages = React.useSyncExternalStore(
    subscribeInFlight,
    listInFlightImages,
    getInFlightImagesServerSnapshot,
  );
  const pendingVideos = React.useSyncExternalStore(
    subscribeInFlight,
    listInFlightVideos,
    getInFlightVideosServerSnapshot,
  );

  const [filter, setFilter] = React.useState<FeedFilterKind | "favorites">(
    null,
  );

  const groups = React.useMemo(() => {
    const favoritesOnly = filter === "favorites";
    const filterKind: FeedFilterKind =
      filter === "favorites" || filter === null ? null : filter;
    return buildCreationsFeed({
      assets,
      pendingImages,
      pendingVideos,
      filterKind,
      favoritesOnly,
    });
  }, [assets, pendingImages, pendingVideos, filter]);

  const totalEntries = groups.reduce((n, g) => n + g.entries.length, 0);

  return (
    <section className="flex min-h-[60vh] flex-col gap-4">
      {/* Header strip — title + filter chips.
          Sticky inside the scroll container so the filter UI stays
          reachable when the user is deep in older creations. The bg
          fades cover scrolled-under rows below it. */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/95 pb-3 pt-1 backdrop-blur">
        <h2 className="font-serif text-[22px] italic text-ink">Creations</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_CHIPS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={String(f.id)}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-7 items-center rounded-full border px-3 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors cursor-pointer",
                  active
                    ? "border-accent bg-accent text-bg"
                    : "border-border text-ink-dim hover:border-[var(--line-strong)] hover:text-ink",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Empty state. */}
      {totalEntries === 0 ? (
        <EmptyFeed filter={filter} />
      ) : (
        <ol className="flex flex-col gap-6">
          {groups.map((g) => (
            <li key={g.bucket}>
              <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
                § {bucketLabel(g.bucket)} · {g.entries.length}
              </h3>
              <ul className="flex flex-col gap-3">
                {g.entries.map((e) => {
                  const key =
                    e.type === "asset"
                      ? `a:${e.asset.id}`
                      : `p:${e.type}:${e.pending.id}`;
                  return (
                    <li key={key}>
                      <CreationRow entry={e} />
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ─────────────────────────── Empty state ────────────────────────────────

function EmptyFeed({
  filter,
}: {
  filter: FeedFilterKind | "favorites";
}) {
  const copy =
    filter === "favorites"
      ? "Nothing pinned yet. Pin a creation to surface it here."
      : filter !== null
        ? `No ${filter} creations yet.`
        : "Awaiting your first prompt.";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-border bg-panel/30 py-20 text-center">
      <span className="font-serif text-[20px] italic text-ink-dim">
        {copy}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
        Renders land here automatically once they finish.
      </span>
    </div>
  );
}

