"use client";

/**
 * StoryboardView — scene card grid with generation controls.
 *
 * Each card shows:
 *  - 16:9 visual area: generated clip (video) > asset strip > placeholder
 *  - Duration + clip-status badges
 *  - Script excerpt
 *  - Generate / Regenerate / Cancel / Approve / Unapprove buttons
 *  - Elapsed timer while polling
 *
 * The parent passes `genMap` (live per-scene generation state) and the
 * callbacks to trigger generation, approval, and stitching.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Scene, ClipStatus } from "@/lib/story/stories";
import type { StoryGenMap } from "@/lib/story/use-story-generation";

export type StoryboardViewProps = {
  scenes: Scene[];
  genMap: StoryGenMap;
  model: string;
  isStitching: boolean;
  finalVideoUrl: string | null;
  onGenerate: (scene: Scene) => void;
  onCancelGenerate: (sceneId: string) => void;
  onApprove: (sceneId: string, approved: boolean) => void;
  onSelectScene: (sceneId: string) => void;
  onStitch: () => void;
  onGenerateAll: () => void;
};

export function StoryboardView({
  scenes,
  genMap = {},
  model,
  isStitching,
  finalVideoUrl,
  onGenerate,
  onCancelGenerate,
  onApprove,
  onSelectScene,
  onStitch,
  onGenerateAll,
}: StoryboardViewProps) {
  const approvedCount = scenes.filter((s) => s.approved).length;
  const doneCount = scenes.filter((s) => s.clipStatus === "done").length;
  const busyCount = Object.values(genMap).filter(
    (g) => g.status === "submitting" || g.status === "polling",
  ).length;

  if (scenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute">
          No scenes yet
        </span>
        <p className="max-w-[300px] text-[13px] leading-relaxed text-ink-dim">
          Write your story and click &ldquo;Break into scenes&rdquo; to populate the storyboard.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          <span>{scenes.length} scenes</span>
          {doneCount > 0 && <span className="text-ok">{doneCount} generated</span>}
          {approvedCount > 0 && <span className="text-ok">✓ {approvedCount} approved</span>}
          {busyCount > 0 && (
            <span className="text-accent animate-pulse">{busyCount} running…</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onGenerateAll}
            disabled={busyCount > 0}
            className={cn(
              "rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors disabled:opacity-40",
              "border-border text-ink-dim hover:border-border-strong hover:text-ink",
            )}
          >
            {busyCount > 0 ? `Generating (${busyCount})…` : "Generate All"}
          </button>

          <button
            onClick={onStitch}
            disabled={approvedCount === 0 || isStitching}
            className={cn(
              "rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors disabled:opacity-40",
              approvedCount > 0 && !isStitching
                ? "border-accent bg-accent/10 text-accent hover:bg-accent/20"
                : "border-border text-ink-dim",
            )}
          >
            {isStitching ? "Stitching…" : `Stitch ${approvedCount} clip${approvedCount !== 1 ? "s" : ""} →`}
          </button>
        </div>
      </div>

      {/* Final video player */}
      {finalVideoUrl && (
        <div className="rounded-[14px] border border-ok/30 bg-ok/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ok">
              ✓ Final video ready
            </span>
            <a
              href={finalVideoUrl}
              download
              className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink transition-colors"
            >
              Download ↓
            </a>
          </div>
          <video
            src={finalVideoUrl}
            controls
            className="w-full rounded-[10px] border border-border"
            style={{ maxHeight: 360 }}
          />
        </div>
      )}

      {/* Scene grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {scenes.map((scene) => (
          <StoryboardCard
            key={scene.id}
            scene={scene}
            genState={genMap[scene.id]}
            onGenerate={() => onGenerate(scene)}
            onCancel={() => onCancelGenerate(scene.id)}
            onApprove={(approved) => onApprove(scene.id, approved)}
            onEdit={() => onSelectScene(scene.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── Card ─────────────────────────────────────────

type CardProps = {
  scene: Scene;
  genState: StoryGenMap[string] | undefined;
  onGenerate: () => void;
  onCancel: () => void;
  onApprove: (approved: boolean) => void;
  onEdit: () => void;
};

function StoryboardCard({ scene, genState, onGenerate, onCancel, onApprove, onEdit }: CardProps) {
  const status = genState?.status ?? "idle";
  const isBusy = status === "submitting" || status === "polling";
  const hasClip = !!scene.clipUrl;

  return (
    <div className={cn(
      "flex flex-col gap-0 rounded-[14px] border bg-panel overflow-hidden transition-colors",
      scene.approved ? "border-ok/40" : "border-border",
    )}>
      {/* Visual area */}
      <div className="relative aspect-video w-full bg-panel-2 overflow-hidden">
        {hasClip ? (
          <video
            src={scene.clipUrl}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          />
        ) : scene.assets.character || scene.assets.background || scene.assets.prop ? (
          <AssetStrip scene={scene} />
        ) : (
          <PlaceholderFrame index={scene.index} />
        )}

        {/* Overlay while generating */}
        {isBusy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent animate-pulse">
              {status === "submitting" ? "Submitting…" : "Generating…"}
            </div>
            {genState && genState.elapsedMs > 0 && (
              <div className="font-mono text-[9px] text-ink-dim">
                {formatElapsed(genState.elapsedMs)}
              </div>
            )}
            <button
              onClick={onCancel}
              className="mt-1 rounded-full border border-border/60 bg-bg/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Error badge */}
        {status === "failed" && genState?.error && (
          <div className="absolute bottom-0 left-0 right-0 bg-[oklch(0.72_0.22_15)]/80 px-2 py-1 backdrop-blur-sm">
            <p className="truncate font-mono text-[9px] text-ink/90">{genState.error}</p>
          </div>
        )}

        {/* Duration badge */}
        <span className="absolute left-2 top-2 rounded-full border border-border/60 bg-bg/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink/80 backdrop-blur-sm">
          {scene.duration}s
        </span>

        {/* Approved badge */}
        {scene.approved && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-ok/50 bg-ok/20 px-2 py-0.5 backdrop-blur-sm">
            <span className="font-mono text-[9px] text-ok">✓ Approved</span>
          </span>
        )}
      </div>

      {/* Info row */}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
            Scene {scene.index + 1}
          </span>

          {/* Asset dots */}
          <div className="flex items-center gap-1">
            {(["character", "background", "prop"] as const).map((k) => (
              <span
                key={k}
                className={cn("size-1.5 rounded-full", scene.assets[k] ? "bg-ok" : "bg-border")}
                title={k}
              />
            ))}
          </div>
        </div>

        <p className="line-clamp-2 text-[12px] leading-[1.5] text-ink-dim min-h-[2lh]">
          {scene.script || <span className="italic text-ink-mute">No script</span>}
        </p>

        {/* Action row */}
        <div className="flex items-center gap-1.5 pt-0.5">
          {/* Generate / Regenerate */}
          {!isBusy && (
            <button
              onClick={onGenerate}
              className={cn(
                "flex-1 rounded-full border py-1 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors",
                hasClip
                  ? "border-border text-ink-mute hover:border-border-strong hover:text-ink"
                  : "border-accent bg-accent/10 text-accent hover:bg-accent/20",
              )}
            >
              {hasClip ? "Regen" : "Generate"}
            </button>
          )}

          {/* Approve toggle — only when clip exists */}
          {hasClip && !isBusy && (
            <button
              onClick={() => onApprove(!scene.approved)}
              className={cn(
                "flex-1 rounded-full border py-1 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors",
                scene.approved
                  ? "border-ok/50 bg-ok/10 text-ok hover:bg-ok/20"
                  : "border-border text-ink-mute hover:border-ok/40 hover:text-ok",
              )}
            >
              {scene.approved ? "✓ Approved" : "Approve"}
            </button>
          )}

          {/* Edit script shortcut */}
          <button
            onClick={onEdit}
            title="Edit in Script view"
            className="rounded-full border border-border px-2 py-1 font-mono text-[9px] text-ink-mute hover:text-ink transition-colors"
          >
            ✎
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Sub-components ───────────────────────────────

function AssetStrip({ scene }: { scene: Scene }) {
  const filled = [scene.assets.character, scene.assets.background, scene.assets.prop].filter(Boolean) as string[];
  return (
    <div className="absolute inset-0 flex">
      {filled.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={src} alt="" className="h-full flex-1 object-cover" style={{ minWidth: 0 }} />
      ))}
    </div>
  );
}

function PlaceholderFrame({ index }: { index: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <CornerTicks />
      <span className="font-serif italic text-[28px] text-ink-mute/30 select-none">{index + 1}</span>
      <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-ink-mute/40">No assets</span>
    </div>
  );
}

function CornerTicks() {
  const base = "absolute w-3 h-3 border-ink-mute/20";
  return (
    <>
      <span className={cn(base, "top-2 left-2 border-t border-l")} />
      <span className={cn(base, "top-2 right-2 border-t border-r")} />
      <span className={cn(base, "bottom-2 left-2 border-b border-l")} />
      <span className={cn(base, "bottom-2 right-2 border-b border-r")} />
    </>
  );
}

// ─────────────────────────── Utilities ────────────────────────────────────

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// Keep the unused import from Phase 2 quiet.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ClipStatus = ClipStatus;
