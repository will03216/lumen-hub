/**
 * Result surface for one side of an image Compare. Pure presentational —
 * the panel feeds `state` which may be the live hook output OR a synthesised
 * success when the user is browsing an older history frame (see
 * displayImageState in compare-panel.tsx).
 */

import { Chip } from "@/components/ui/chip";
import { DownloadButton } from "@/components/ui/download-button";
import { CornerTicks } from "@/components/ui/placeholder-tile";
import type { useImageRender } from "@/lib/compare/use-image-render";
import { EmptyOverlay, ErrorTileBody, TileFrame } from "./tile-chrome";

export function ImageResultTile({
  state,
  paramsSize,
  side,
  onReset,
  onRetry,
  onInspect,
}: {
  state: ReturnType<typeof useImageRender>["state"];
  /** Last-known size from the shell's snapshot (e.g. "2048x2048"). Optional
   *  because the panel can render before the user has hit "Render both".
   *  We default to a 1:1 placeholder so the tile holds its space without
   *  snapping when the first render lands and replaces it. */
  paramsSize?: string;
  side: "A" | "B";
  onReset: () => void;
  /** Provided only when the shell has a snapshot to re-run. When absent,
   *  error tiles fall back to Dismiss-only. */
  onRetry?: () => void;
  /** Provided only when BOTH sides are loaded — the shell gates this so
   *  the Inspect chip never appears on a solo tile (the lightbox needs
   *  both A and B data). Same chip on either side opens the same dialog. */
  onInspect?: () => void;
}) {
  const sizeStr = paramsSize ?? "2048x2048";
  const [w, h] = sizeStr.split("x").map(Number);
  const ratio = w && h ? `${w}/${h}` : "1/1";

  if (state.status === "success") {
    const img = state.images[0];
    if (!img) {
      return (
        <TileFrame ratio={ratio}>
          <EmptyOverlay label="No image returned" />
        </TileFrame>
      );
    }
    return (
      <div
        className="group relative overflow-hidden rounded-[12px] border border-border bg-panel"
        style={{ aspectRatio: img.size ? img.size.replace("x", "/") : ratio }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.url}
          alt={`Side ${side} result`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <CornerTicks />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink/80">
            {img.size ?? sizeStr}
          </span>
          <div className="flex gap-1.5">
            {onInspect && (
              <Chip
                onClick={onInspect}
                title="Inspect both sides at full screen with synced zoom"
              >
                🔍 Inspect
              </Chip>
            )}
            <Chip
              onClick={() => {
                if (typeof window !== "undefined")
                  navigator.clipboard?.writeText(img.url);
              }}
              title="Copy URL"
            >
              ↗
            </Chip>
            <DownloadButton href={img.url} />
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <TileFrame ratio={ratio} shimmer>
        <div className="absolute left-3.5 top-3.5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink">
          <span className="size-1.5 rounded-full bg-accent animate-pulse-soft" />
          Rendering · Side {side}
        </div>
        <div className="absolute right-3.5 top-3.5 font-mono text-[10px] tracking-[0.10em] text-ink-dim">
          {sizeStr}
        </div>
      </TileFrame>
    );
  }

  if (state.status === "error") {
    return (
      <TileFrame ratio={ratio}>
        <ErrorTileBody
          errorClass={state.errorClass}
          attempts={state.attempts}
          onReset={onReset}
          onRetry={onRetry}
        />
      </TileFrame>
    );
  }

  return (
    <TileFrame ratio={ratio}>
      <EmptyOverlay label={`Side ${side} · awaiting render`} />
    </TileFrame>
  );
}
