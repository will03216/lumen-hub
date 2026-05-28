/**
 * Horizontal row of recent-render thumbnails for one side, persisted per
 * (kind, side) upstream in compare-panel.tsx. Pure presentational + dispatch.
 *
 * The three actions per thumb (select / restore-to-form / open-in-Studio)
 * are SIBLING buttons, not nested — HTML forbids interactive-inside-
 * interactive, and screen readers get cleaner semantics this way.
 *
 * Dead-thumb self-heal: BytePlus CDN URLs are signed + TTL'd, so onError
 * fires onPrune to drop the entry — the strip cleans itself up silently
 * rather than leaving 404'd thumbs in the rail.
 */

import { cn } from "@/lib/utils";
import type { HistoryItem } from "@/lib/compare/saved-history";

export function HistoryStrip({
  items,
  selectedIdx,
  onSelect,
  onRestore,
  onPrune,
}: {
  items: HistoryItem[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  onRestore?: (item: HistoryItem) => void;
  onPrune: (url: string) => void;
}) {
  // Single Date.now() per render so all N thumbs compute their relative
  // labels off the same instant — and we don't pay N Date allocations
  // when the strip rerenders on every video polling tick.
  const now = Date.now();
  return (
    <div
      className="flex items-stretch gap-1.5"
      role="toolbar"
      aria-label="Render history"
    >
      {items.map((item, idx) => {
        const active = idx === selectedIdx;
        const label = `${item.model} · ${formatRelativeTime(item.ts, now)}`;
        const studioUrl = buildStudioUrl(item);
        return (
          <div
            key={`${item.ts}-${idx}`}
            className="group relative h-14 w-14 shrink-0"
          >
            <button
              type="button"
              onClick={() => onSelect(idx)}
              aria-pressed={active}
              title={label}
              className={cn(
                "absolute inset-0 overflow-hidden rounded-[8px] border bg-bg-2 transition-all cursor-pointer",
                active
                  ? "border-accent ring-1 ring-accent"
                  : "border-border hover:border-[var(--line-strong)]",
              )}
            >
              {item.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => onPrune(item.url)}
                />
              ) : (
                <>
                  <video
                    src={item.url}
                    // metadata-only preload gets the poster frame without
                    // pulling the full clip. muted satisfies autoplay policies
                    // in case the browser decides to decode eagerly.
                    preload="metadata"
                    muted
                    playsInline
                    onError={() => onPrune(item.url)}
                    className="absolute inset-0 h-full w-full object-cover bg-black"
                  />
                  {/* Play-triangle overlay so videos are distinguishable from
                      images at a glance. */}
                  <div
                    aria-hidden
                    className="absolute inset-0 grid place-items-center bg-black/30"
                  >
                    <span className="font-mono text-[11px] leading-none text-ink/90">
                      ▸
                    </span>
                  </div>
                </>
              )}
            </button>
            {/* Restore corner — repopulates the Compare form with this
                frame's prompt + params. Sibling of the select button to
                avoid nested interactives. Hidden when shell didn't wire
                onRestore (defensive; the shell always does today). */}
            {onRestore && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore(item);
                }}
                title="Restore this frame's prompt + params"
                aria-label="Restore to form"
                className="absolute -left-1 -top-1 grid size-5 place-items-center rounded-full border border-border bg-bg font-mono text-[10px] leading-none text-ink-dim opacity-0 transition-all hover:border-accent hover:text-accent group-hover:opacity-100 focus:opacity-100"
              >
                ⟲
              </button>
            )}
            {/* Studio handoff — sibling of the select button so the two
                interactive elements don't nest. New tab keeps the Compare
                session intact while the user iterates downstream. */}
            <a
              href={studioUrl}
              target="_blank"
              rel="noreferrer"
              title="Open this frame in Generator"
              className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-border bg-bg font-mono text-[10px] leading-none text-ink-dim opacity-0 transition-all hover:border-accent hover:text-accent group-hover:opacity-100 focus:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              ↗
            </a>
          </div>
        );
      })}
    </div>
  );
}

/** Build a Studio handoff URL from a history item. Mirrors the param shape
 *  consumed by `hydrateFromQuery` in lib/reels/preset-bridge.ts. Image keeps
 *  it minimal (size); video carries the full input quartet so the Studio
 *  form opens in the same posture the user just rendered. */
function buildStudioUrl(item: HistoryItem): string {
  const sp = new URLSearchParams();
  sp.set("prompt", item.prompt);
  sp.set("model", item.model);
  if (item.kind === "image") {
    if (item.size) sp.set("size", item.size);
  } else {
    sp.set("ratio", item.ratio);
    sp.set("resolution", item.resolution);
    sp.set("duration", String(item.duration));
    sp.set("mode", item.mode);
  }
  return `/generate?${sp.toString()}`;
}

/** "Just now" / "3m ago" / "1h ago" — compact relative time for tooltips.
 *  Doesn't tick live; acceptable since the strip re-renders frequently
 *  enough during normal use, and tooltip text is ephemeral anyway. `now`
 *  is passed in so all thumbs in one render share the same instant. */
function formatRelativeTime(ts: number, now: number): string {
  const diffSec = Math.max(0, Math.round((now - ts) / 1000));
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.round(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
