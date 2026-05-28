"use client";

/**
 * Library — main shell.
 *
 * Filter chips on top, asset grid in the middle, detail drawer slides in
 * from the right when a card is clicked. The store is local to this device
 * (see `lib/library/assets.ts`); future commits add server sync without
 * changing this surface.
 *
 * The shell intentionally does little — the grid is a flat list driven by
 * a single filter selector. Sub-features (collections tree, multi-select
 * batch ops, tag editing) are deferred to a follow-up so this commit ships
 * something useful end-to-end.
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chip } from "@/components/ui/chip";
import {
  type Asset,
  type AssetKind,
  getAssetsServerSnapshot,
  getAssetsSnapshot,
  subscribeAssets,
} from "@/lib/library/assets";
import { AssetCard } from "./asset-card";
import { AssetDetailDrawer } from "./asset-detail";
import { EmptyState } from "./empty-state";
import { GroupsPanel } from "./groups-panel";

type Filter = "all" | AssetKind | "pinned" | "groups";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "reference", label: "References" },
  { id: "pinned", label: "Pinned" },
  { id: "groups", label: "BytePlus Groups" },
];

/** Coerce a `?kind=` query param into our Filter union. Anything
 *  unrecognized falls back to "all" rather than crashing on bad input. */
function coerceFilter(raw: string | null): Filter {
  if (raw === "image" || raw === "video" || raw === "reference") return raw;
  if (raw === "pinned") return "pinned";
  if (raw === "groups") return "groups";
  return "all";
}

export function LibraryShell() {
  const assets = useSyncExternalStore(
    subscribeAssets,
    getAssetsSnapshot,
    getAssetsServerSnapshot,
  );
  // Honour ?kind= deep-links. A bare ?groupId= without kind= implies groups.
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilter = coerceFilter(
    searchParams.get("kind") ?? (searchParams.get("groupId") ? "groups" : null),
  );
  const [filter, setFilterState] = useState<Filter>(initialFilter);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const setFilter = useCallback(
    (f: Filter) => {
      setFilterState(f);
      const params = new URLSearchParams(searchParams.toString());
      if (f === "all") params.delete("kind");
      else params.set("kind", f);
      // Clear group selection when leaving the groups tab
      if (f !== "groups") params.delete("groupId");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const filtered = useMemo(() => filterAssets(assets, filter), [assets, filter]);
  const selected = useMemo<Asset | null>(
    () => (selectedId ? assets.find((a) => a.id === selectedId) ?? null : null),
    [selectedId, assets],
  );

  const counts = useMemo(() => buildCounts(assets), [assets]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <span className="plate inline-flex">§ LIBRARY · ASSETS</span>
        <h1
          className="font-serif mt-3 text-ink"
          style={{
            fontSize: "clamp(40px, 6vw, 80px)",
            letterSpacing: "-0.02em",
            lineHeight: 1.04,
          }}
        >
          Every render, in one place.
        </h1>
        <p className="mt-4 max-w-[640px] text-ink-dim">
          Generated stills and clips land here automatically. Pick one to
          remix, drop into a Canvas node, or export.
        </p>
      </header>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            active={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className="ml-1 text-ink-dim/70">{counts[f.id]}</span>
          </Chip>
        ))}
      </div>

      {/* Groups panel — full-width when that tab is active */}
      {filter === "groups" ? (
        <GroupsPanel />
      ) : assets.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <FilterEmpty filter={filter} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((asset) => (
            <li key={asset.id}>
              <AssetCard
                asset={asset}
                onClick={() => setSelectedId(asset.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <AssetDetailDrawer
          asset={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Sub-helpers ──────────────────────────────

function filterAssets(assets: Asset[], filter: Filter): Asset[] {
  if (filter === "all") return assets;
  if (filter === "pinned") return assets.filter((a) => a.pinned);
  return assets.filter((a) => a.kind === filter);
}

function buildCounts(assets: Asset[]): Record<Filter, number> {
  const counts: Record<Filter, number> = {
    all: assets.length,
    image: 0,
    video: 0,
    audio: 0,
    reference: 0,
    pinned: 0,
    groups: 0,
  };
  for (const a of assets) {
    counts[a.kind]++;
    if (a.pinned) counts.pinned++;
    if (a.byteplusGroupId) counts.groups++;
  }
  return counts;
}

function FilterEmpty({ filter }: { filter: Filter }) {
  return (
    <div className="rounded-[14px] border border-border bg-panel/30 p-12 text-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
        Nothing here yet
      </span>
      <p className="mt-3 text-ink-dim">
        No {filter === "pinned" ? "pinned" : `${filter}`} assets in the
        library yet.
      </p>
    </div>
  );
}
