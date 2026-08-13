"use client";

/**
 * The keyframe ledger, as a list.
 *
 * Two states per row and they are independent, which is why each gets its own
 * indicator: whether the frame has been EDITED (Seedream ran), and whether it
 * has been INGESTED (the asset library accepted it). A frame can be edited and
 * not ingested — it still renders under the bookend variants and not under the
 * tagged ones — so collapsing them into one "ready" light would hide the
 * difference that decides which variants are available.
 *
 * The role badge is derived from the active variant rather than stored, so it
 * stays honest when the variant changes underneath it.
 */

import * as React from "react";
import { AlertTriangle, Check, Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { Keyframe, PromptVariantId } from "@/lib/video-edit/types";
import { rolesForVariant } from "@/lib/video-edit/variant-select";
import { cn } from "@/lib/utils";

export function KeyframeRail({
  keyframes,
  activeId,
  variant,
  onSelect,
  onRemove,
  onRetryUpload,
}: {
  keyframes: Keyframe[];
  activeId: string | null;
  variant: PromptVariantId;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onRetryUpload: (id: string) => void;
}) {
  const roles = React.useMemo(
    () => rolesForVariant(variant, keyframes),
    [variant, keyframes],
  );

  if (keyframes.length === 0) {
    return (
      <p className="px-1 text-[12px] leading-relaxed text-ink-mute">
        No keyframes yet. Scrub to a moment and hit{" "}
        <span className="text-ink-dim">Grab frame</span> — that frame becomes
        the thing you mark up.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {keyframes.map((k) => {
        const role = roles.get(k.id);
        const active = k.id === activeId;
        return (
          <div
            key={k.id}
            className={cn(
              "group rounded-[10px] border transition-colors",
              active
                ? "border-border-strong bg-panel"
                : "border-transparent hover:border-border",
            )}
          >
            <button
              onClick={() => onSelect(k.id)}
              className="flex w-full items-center gap-2.5 px-2 py-2 text-left"
            >
              <span className="relative size-10 shrink-0 overflow-hidden rounded-[6px] bg-[var(--bg)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- CDN
                    host isn't in the image allow-list and this is a 40px
                    thumbnail. */}
                <img
                  src={k.editedFrameUrl ?? k.sourceFrameUrl}
                  alt=""
                  className="size-full object-cover"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[11px] tabular-nums text-ink">
                  {k.t.toFixed(3)}s
                </span>
                <span className="block truncate text-[11px] text-ink-mute">
                  {k.instruction.trim() || "no instruction yet"}
                </span>
              </span>

              <span className="flex shrink-0 flex-col items-end gap-1">
                {role && role !== "reference" && (
                  <span className="rounded-full border border-border px-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-ink-mute">
                    {role === "first_frame" ? "first" : "last"}
                  </span>
                )}
                <EditDot kf={k} />
              </span>
            </button>

            {/* Actions and failures, only when there is something to say. */}
            {(k.editError || k.assetError || active) && (
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <span className="min-w-0 flex-1 truncate text-[10px] text-[oklch(0.72_0.22_15)]">
                  {k.editError ?? k.assetError ?? ""}
                </span>
                <span className="flex shrink-0 gap-1">
                  {k.assetStatus === "failed" && k.editedFrameUrl && (
                    <button
                      onClick={() => onRetryUpload(k.id)}
                      title="Retry the asset-library upload"
                      className="rounded-full p-1 text-ink-mute transition-colors hover:text-ink"
                    >
                      <RefreshCw className="size-3" />
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(k.id)}
                    title="Remove this keyframe"
                    className="rounded-full p-1 text-ink-mute transition-colors hover:text-[oklch(0.72_0.22_15)]"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Edit state and ingest state in one glyph, in priority order: a failure beats
 * progress, progress beats done. Titles carry the detail rather than a legend
 * nobody reads.
 */
function EditDot({ kf }: { kf: Keyframe }) {
  if (kf.editStatus === "rendering") {
    return <Loader2 className="size-3 animate-spin text-ink-dim" />;
  }
  if (kf.editStatus === "failed") {
    return (
      <AlertTriangle
        className="size-3 text-[oklch(0.72_0.22_15)]"
        aria-label="Frame edit failed"
      />
    );
  }
  if (!kf.editedFrameUrl) {
    return (
      <span
        title="Not edited yet"
        className="size-2 rounded-full border border-border-strong"
      />
    );
  }
  if (kf.assetStatus === "uploading" || kf.assetStatus === "pending") {
    return <Loader2 className="size-3 animate-spin text-ink-mute" />;
  }
  if (kf.assetStatus === "failed") {
    return (
      <AlertTriangle
        className="size-3 text-[oklch(0.78_0.16_75)]"
        aria-label="Edited, but not in the asset library — tagged variants are unavailable"
      />
    );
  }
  return <Check className="size-3 text-[var(--ok)]" aria-label="Ready" />;
}
