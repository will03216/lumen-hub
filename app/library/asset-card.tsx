"use client";

/**
 * Asset card — single grid cell in /library.
 *
 * Square thumbnail (cover-fit) with a hover overlay surfacing the prompt.
 * Click anywhere opens the detail drawer; pin/delete moved to the drawer
 * to keep the grid quiet — multi-action chips on a tile read busy at this
 * density.
 *
 * Videos use `<video>` with `preload="metadata"` so the browser pulls
 * dimensions + first-frame poster without downloading the full clip.
 * BytePlus URLs are routed through the same /api/media proxy used by
 * /compare so cross-origin playback / CORS-tainting issues stay solved.
 */

import type { Asset } from "@/lib/library/assets";
import { AssetMedia } from "@/components/library/asset-media";
import { relativeTime } from "@/lib/library/time";
import { cn } from "@/lib/utils";

export function AssetCard({
  asset,
  onClick,
}: {
  asset: Asset;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative block aspect-square w-full overflow-hidden rounded-[12px] border border-border bg-panel text-left transition-colors",
        "hover:border-ink-dim",
      )}
    >
      <AssetMedia
        asset={asset}
        variant="thumb"
        className="absolute inset-0 h-full w-full object-cover bg-black"
      />

      {/* Pin badge — visible always so the user can scan pinned items at
          a glance. Tiny so it doesn't compete with the prompt overlay. */}
      {asset.pinned && (
        <span
          className="absolute right-2 top-2 inline-flex h-5 items-center rounded-full bg-ink/90 px-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-bg backdrop-blur-sm"
          aria-label="Pinned"
        >
          pin
        </span>
      )}

      {/* Kind badge — bottom-left corner. */}
      <span className="absolute bottom-2 left-2 inline-flex h-5 items-center rounded-full bg-bg/85 px-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim backdrop-blur-sm">
        {asset.kind === "video" ? "vid" : asset.kind === "reference" ? "ref" : "img"}
      </span>

      {/* Hover overlay with truncated prompt + relative time. */}
      <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
        {asset.prompt && (
          <p className="line-clamp-2 text-[12px] leading-tight text-ink">
            {asset.prompt}
          </p>
        )}
        <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
          {relativeTime(asset.createdAt)}
        </span>
      </div>
    </button>
  );
}

// `relativeTime` is now imported from `lib/library/time.ts` so the
// Creations feed can share the same formatter.
