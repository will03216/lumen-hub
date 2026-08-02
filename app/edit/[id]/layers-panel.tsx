"use client";

/**
 * Layer separation — PRD §5B.
 *
 * Splits a finished image into a background plate plus independent
 * transparent layers, each with a name and a bounding box. Nothing else in
 * the competitive set does this, which is exactly why it is worth showing.
 *
 * Two things shape this UI more than they look:
 *
 * · The upstream response is PREVIEW-FLAGGED AND NON-FINAL. Everything
 *   arrives through lib/edit/layers-normalize.ts, which tolerates missing
 *   fields, either bbox form, and unrecognised entries. This panel must never
 *   assume a field is present — a run that returns layers with no names is a
 *   usable run, not a broken one.
 *
 * · The feature is behind NEXT_PUBLIC_EDIT_LAYERS. It can be absent from a
 *   given BytePlus account, so the failure mode "your key doesn't have this"
 *   has to read as a capability gap rather than a bug.
 *
 * ── Scope: this is a layer LIST, not the layer VIEWER in PRD §5B ──────────
 *
 * What ships here: run a separation, see every layer with its name,
 * description and thumbnail, toggle visibility, re-run with different
 * settings. What the PRD additionally specifies and this does NOT do:
 * drag-to-reposition, corner-scale, z-reorder, per-layer re-edit through the
 * 5A path, and export of the recomposition. Those need a second Konva stage
 * with a Transformer over the layer set, which is its own piece of work.
 * Stated plainly rather than left to be discovered.
 */

import * as React from "react";
import { Eye, EyeOff, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LayerState } from "@/lib/edit/use-layer-separation";
import type { EditReference } from "@/lib/edit/types";
import { cn } from "@/lib/utils";

export function LayersPanel({
  reference,
  state,
  onSeparate,
  onToggle,
}: {
  reference: EditReference | null;
  state: LayerState;
  onSeparate: (maxLayers: number, mode: "auto" | "region") => void;
  onToggle: (index: number) => void;
}) {
  const [maxLayers, setMaxLayers] = React.useState(10);
  const [mode, setMode] = React.useState<"auto" | "region">("auto");
  const busy = state.status === "running";

  // The hook holds one result slot and the agent can separate any reference,
  // so a result is only shown under the reference it actually came from —
  // otherwise ref B's layers appear beneath ref A's thumbnail.
  const mine = state.refId === null || state.refId === reference?.id;

  // Region mode separates only what is inside a box mark, so it is offered
  // only when there is one to separate. Without this the option is a button
  // that always fails.
  const boxes = (reference?.annotations ?? []).filter(
    (a) => a.kind === "box" && !a.hidden,
  ).length;
  React.useEffect(() => {
    if (boxes === 0) setMode("auto");
  }, [boxes]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Layers className="size-3.5 text-ink-mute" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          Layers
        </span>
        {state.layers.length > 0 && mine && (
          <span className="ml-auto font-mono text-[10px] text-ink-mute">
            {state.layers.length}
          </span>
        )}
      </div>

      {(state.status === "idle" || !mine) && (
        <p className="text-[12px] leading-relaxed text-ink-mute">
          Split this image into a background plus separate transparent
          elements you can move, hide, or re-edit on their own.
        </p>
      )}

      {/* Always available, never gated on status. Gating the control on
          `idle` made this a one-shot button: after any run — succeeded or
          failed — there was no way to retry, change the layer count, or
          switch modes short of reloading the page. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute">
            Max
            <input
              type="number"
              min={1}
              max={10}
              disabled={busy}
              value={maxLayers}
              onChange={(e) =>
                // Clamped here as well as server-side: the route rejects
                // anything outside 1..10, and a 400 is a poor way to learn it.
                setMaxLayers(
                  Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                )
              }
              className="w-12 rounded border border-border bg-transparent px-1.5 py-0.5 text-ink outline-none focus:border-ink-dim"
            />
          </label>
          {boxes > 0 && (
            <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute">
              Mode
              <select
                disabled={busy}
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value === "region" ? "region" : "auto")
                }
                className="rounded border border-border bg-transparent px-1 py-0.5 text-ink outline-none focus:border-ink-dim"
              >
                <option value="auto">Auto</option>
                <option value="region">Boxed ({boxes})</option>
              </select>
            </label>
          )}
          <Button
            size="sm"
            variant="default"
            disabled={!reference || busy}
            onClick={() => onSeparate(maxLayers, mode)}
          >
            {state.status === "idle" || !mine ? "Separate" : "Separate again"}
          </Button>
        </div>
      </div>

      {busy && mine && (
        <div className="flex items-center gap-2 text-[12px] text-ink-mute">
          <Loader2 className="size-3 animate-spin" />
          Separating — this takes longer than a render.
        </div>
      )}

      {state.status === "failed" && mine && (
        <p className="text-[12px] leading-relaxed text-[oklch(0.72_0.22_15)]">
          {state.error ?? "Layer separation failed."}
        </p>
      )}

      {state.layers.length > 0 && mine && (
        <div className="space-y-1">
          {/* Top layer first, matching how a layers palette reads — the
              normalizer hands them back in paint order, background first. */}
          {[...state.layers].reverse().map((l) => {
            const isBackground = l.zIndex === 0;
            const hidden = state.hidden.has(l.index);
            return (
              <div
                key={l.index}
                className={cn(
                  "flex items-center gap-2 rounded-[8px] border border-border p-1.5",
                  hidden && "opacity-40",
                )}
              >
                <div className="size-8 shrink-0 overflow-hidden rounded-[4px] bg-[var(--bg)] bg-[length:8px_8px]">
                  {l.url && (
                    // eslint-disable-next-line @next/next/no-img-element -- remote CDN
                    <img
                      src={l.url}
                      alt=""
                      className="size-full object-contain"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-ink">
                    {isBackground ? "Background" : (l.name ?? `Layer ${l.zIndex}`)}
                  </div>
                  {l.description && (
                    <div className="truncate text-[10px] text-ink-mute">
                      {l.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onToggle(l.index)}
                  title={hidden ? "Show layer" : "Hide layer"}
                  className="shrink-0 text-ink-mute transition-colors hover:text-ink"
                >
                  {hidden ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Warnings are not errors. A response can be entirely usable and still
          warrant a note — "nothing was separated", a derived bbox, drift. */}
      {state.warnings.length > 0 && mine && (
        <ul className="space-y-0.5 text-[11px] leading-snug text-ink-mute">
          {state.warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
