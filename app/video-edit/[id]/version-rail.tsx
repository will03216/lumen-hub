"use client";

/**
 * Render history, and the way back to a previous one.
 *
 * Restoring is not "show me that clip again" — it puts the SESSION back into
 * the state that produced it, keyframes and marks included. That is goal G7,
 * and it is the difference between a history you can look at and one you can
 * work from: a version's output is only reproducible alongside the ledger that
 * generated it, and a restore that dropped the marks would leave the user
 * looking at settings whose regions no longer exist.
 *
 * Each row names the variant it used. When a render disappoints, "which
 * strategy was that?" is the first question, and it is otherwise unanswerable
 * from the clip alone.
 */

import * as React from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import type { VideoEditVersion } from "@/lib/video-edit/types";
import { cn } from "@/lib/utils";

export function VersionRail({
  versions,
  onRestore,
  onView,
  viewingId,
}: {
  versions: VideoEditVersion[];
  onRestore: (id: string) => void;
  onView: (id: string | null) => void;
  viewingId: string | null;
}) {
  if (versions.length === 0) return null;

  // Newest first: the one you just made is the one you want.
  const ordered = [...versions].reverse();

  return (
    <div className="space-y-1.5">
      <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
        Renders
      </span>
      {ordered.map((v) => (
        <div
          key={v.id}
          className={cn(
            "rounded-[10px] border px-2 py-1.5 transition-colors",
            v.id === viewingId
              ? "border-border-strong bg-panel"
              : "border-transparent hover:border-border",
          )}
        >
          <button
            onClick={() => onView(v.id === viewingId ? null : v.id)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className="shrink-0 rounded-full border border-border px-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute">
              {v.variant}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] text-ink-dim">
                {v.intent.trim() || "no intent recorded"}
              </span>
              <span className="block font-mono text-[9px] text-ink-mute">
                {v.duration}s · {v.resolution} · {v.ratio}
                {v.elapsedMs ? ` · ${Math.round(v.elapsedMs / 1000)}s` : ""}
              </span>
            </span>
            <Status version={v} />
          </button>

          {v.error && (
            <p className="mt-1 text-[10px] leading-relaxed text-[oklch(0.78_0.16_75)]">
              {v.error}
            </p>
          )}

          {v.status === "done" && (
            <button
              onClick={() => onRestore(v.id)}
              title="Put the session back into the state that produced this render"
              className="mt-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute transition-colors hover:text-ink"
            >
              <RotateCcw className="size-2.5" />
              Restore its keyframes
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Status({ version }: { version: VideoEditVersion }) {
  if (version.status === "pending") {
    return <Loader2 className="size-3 shrink-0 animate-spin text-ink-mute" />;
  }
  if (version.status === "failed") {
    return (
      <AlertTriangle
        className="size-3 shrink-0 text-[oklch(0.72_0.22_15)]"
        aria-label="Failed"
      />
    );
  }
  return <span className="size-2 shrink-0 rounded-full bg-[var(--ok)]" />;
}
