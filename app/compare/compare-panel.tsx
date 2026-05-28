"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  findImageModel,
  findVideoModel,
  type VideoMode,
  type VideoRatio,
  type VideoResolution,
} from "@/lib/studio/models";
import { useImageRender } from "@/lib/compare/use-image-render";
import { useVideoRender } from "@/lib/compare/use-video-render";
import type { CompareKind } from "@/lib/compare/pairs";
import {
  MAX_HISTORY,
  type HistoryItem,
  readHistoryBucket,
  subscribeSavedHistory,
  writeHistoryBucket,
} from "@/lib/compare/saved-history";
import { ImageResultTile } from "./image-result-tile";
import { VideoResultTile } from "./video-result-tile";
import { HistoryStrip } from "./history-strip";

/**
 * ComparePanel — one side of the split.
 *
 * Contract with the shell:
 *  - `trigger` is a monotonically increasing counter. Each time it changes AND
 *    `params` is non-null, the panel fires a fresh render. The shell snapshots
 *    all kind-specific fields at "Render both" press time, so typing the prompt
 *    afterwards won't re-fire this panel.
 *  - `modelId` + `onModelChange` let the user swap engines without touching
 *    the other side.
 *  - `kind` gates which render hook runs and which tile shape renders. The
 *    shell keeps `kind` and the snapshot's discriminator in sync; the panel
 *    also resets hook state when `kind` flips so yesterday's frame from the
 *    other axis can't flash through.
 *
 * Both `useImageRender` and `useVideoRender` mount unconditionally (React hook
 * rules), but only the active one is fed params or read from for the tile.
 */

// ─────────────────────────── Params ─────────────────────────────────────
// The shell hands the panel a kind-tagged snapshot WITHOUT model — the panel
// has `modelId` as a prop and injects it into the actual hook call. Keeping
// model out of the snapshot means the shell's "Render both" is a single
// setState, not a per-side branch.

export type ComparePanelImageParams = {
  kind: "image";
  prompt: string;
  size: string;
  seed?: number;
  image?: string | string[];
  sequential?: boolean;
  max_images?: number;
};

export type ComparePanelVideoParams = {
  kind: "video";
  prompt: string;
  mode: VideoMode;
  resolution: VideoResolution;
  duration: number;
  ratio: VideoRatio;
  seed?: number;
  camerafixed?: boolean;
  audio?: boolean;
  startFrame?: string;
};

export type ComparePanelParams =
  | ComparePanelImageParams
  | ComparePanelVideoParams;

/** Per-side accent — Side A = warm orange, Side B = cool blue. The two
 *  hues are the only place "which side am I looking at" is communicated
 *  visually, so they live in one map rather than ternary'd inline at the
 *  call site. Same accent ought to drive future side-coded affordances
 *  (slider tints, history-strip badges) — keep them pulling from here. */
const SIDE_ACCENT: Record<"A" | "B", string> = {
  A: "hsl(28 90% 55%)",
  B: "hsl(200 80% 60%)",
};

// ─────────────────────────── Component ──────────────────────────────────

/** What a side publishes upward when its render lands (or clears). The shell
 *  aggregates both sides' results to enable the Export chip. Note this is
 *  scoped to the *displayed* frame — if the user clicks back in the history
 *  strip, this publishes the older frame so Export captures what's on screen,
 *  not whatever finished most recently. */
export type PanelResult =
  | { kind: "image"; url: string; size?: string }
  | { kind: "video"; url: string; ratio: string };

// ─────────────────────────── History ────────────────────────────────────
// Per-(kind, side) stack of the last few successful renders, persisted to
// localStorage (see lib/compare/saved-history.ts for the type + storage).
// Kind flip swaps buckets rather than clearing — the image history lives on
// while you're in video mode and vice versa. modelId swaps leave the current
// bucket untouched: comparing the same prompt across engines is the point of
// the strip, so yesterday's Seedream 4.5 frame stays visible when you flip
// side A to Seedream 5.0.

type ComparePanelProps = {
  side: "A" | "B";
  modelId: string;
  onModelChange: (id: string) => void;
  kind: CompareKind;
  trigger: number;
  params: ComparePanelParams | null;
  /** Fires with the rendered result on success, null on reset / error / kind
   *  flip. The shell pairs both sides' results for export. */
  onResult?: (result: PanelResult | null) => void;
  /** Forwarded to the internal <video> element so the shell can read
   *  currentTime + capture the current frame for video pair exports. */
  videoRef?: React.Ref<HTMLVideoElement>;
  /** Fired when the user clicks the ⟲ corner on a history thumb. Shell
   *  repopulates the prompt + this side's model + kind-specific inputs so
   *  the user can re-run or tweak without retyping. */
  onRestore?: (item: HistoryItem) => void;
  /** Fired when the user clicks 🔍 Inspect on the tile's hover overlay.
   *  Shell owns the lightbox state; it passes this in only when BOTH
   *  sides are loaded so the dialog always has a full pair to show. */
  onInspect?: () => void;
};

export function ComparePanel({
  side,
  modelId,
  onModelChange,
  kind,
  trigger,
  params,
  onResult,
  videoRef,
  onRestore,
  onInspect,
}: ComparePanelProps) {
  // Destructure to stable refs — the hook returns a fresh object every render
  // but `run` / `reset` / `state` themselves are referentially stable. Passing
  // the whole hook return into an effect's deps would trip it on every parent
  // re-render even though the guard would no-op; destructuring keeps deps tight.
  const { state: imageState, run: imageRun, reset: imageReset } = useImageRender();
  const { state: videoState, run: videoRun, reset: videoReset } = useVideoRender();
  const lastFiredTick = useRef(0);

  // Render history — index 0 is the most recent render. selectedIdx drives
  // which frame the tile + onResult publish; 0 means "follow the latest".
  // Freshly-completed renders always reset selection to 0 so the user sees
  // their new frame when it lands, even if they were browsing older ones.
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Fire on trigger change. Guarded by lastFiredTick so a stray re-render
  // (e.g. onModelChange while trigger is stale) can't retrigger the fetch.
  // The branch on params.kind chooses which hook runs; `modelId` is injected
  // here so the shell's snapshot stays side-agnostic.
  useEffect(() => {
    if (trigger <= 0) return;
    if (trigger === lastFiredTick.current) return;
    if (!params) return;
    lastFiredTick.current = trigger;
    if (params.kind === "image") {
      void imageRun({ ...params, model: modelId });
    } else {
      void videoRun({ ...params, model: modelId });
    }
  }, [trigger, params, modelId, imageRun, videoRun]);

  // Reset on kind flip OR per-side engine change. Either invalidates the
  // previous render — leaving the old tile up would mislabel the result once
  // the Side-A dropdown says "Seedream 5.0 Lite" but the tile still shows a
  // 4.5 frame. Same argument for pair-chip swaps (which change modelId too).
  // The onResult(null) published by the next effect pass keeps the shell's
  // export chip honest. Note this resets the hook but NOT the history stack:
  // modelId change leaves older frames visible for cross-engine comparison.
  useEffect(() => {
    imageReset();
    videoReset();
    lastFiredTick.current = 0;
  }, [kind, modelId, imageReset, videoReset]);

  // Hydrate from localStorage on mount AND on (kind, side) change. Kind flip
  // now swaps buckets rather than clearing — the image history persists while
  // you're in video mode and vice versa. selectedIdx resets to 0 so you see
  // the top-of-stack entry for whichever bucket just became visible. Engine
  // swaps (same kind) don't fire this effect — they'd be a bucket no-op
  // anyway, and the old comparison-across-engines behaviour stays intact.
  //
  // Note: `side` never actually changes for a given panel instance, but
  // including it in deps keeps the contract obvious — if you ever swap the
  // letter via the prop, the effect re-hydrates to match.
  useEffect(() => {
    setHistory(readHistoryBucket(kind, side));
    setSelectedIdx(0);
  }, [kind, side]);

  // Cross-tab sync. Another tab's successful render writes its own bucket;
  // our listener re-reads the bucket for our (kind, side). We don't touch
  // selectedIdx on remote change because the user may be browsing older
  // frames and a silent jump-to-latest would be disorienting — the new
  // frame appears in the strip but the viewer stays where they are.
  useEffect(() => {
    return subscribeSavedHistory(() => {
      setHistory(readHistoryBucket(kind, side));
    });
  }, [kind, side]);

  // Write-through setter. The two success-push effects and the onError-prune
  // handler all go through this so on-disk state and in-memory state stay in
  // lockstep. Wrapping setState avoids an effect-driven persist loop (which
  // would race with the hydrate effect on kind flip).
  const persistedSetHistory = useCallback(
    (updater: React.SetStateAction<HistoryItem[]>) => {
      setHistory((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: HistoryItem[]) => HistoryItem[])(prev)
            : updater;
        writeHistoryBucket(kind, side, next);
        return next;
      });
    },
    [kind, side],
  );

  // Push successes into the history stack. Guarded by a URL equality check
  // against history[0] — a parent re-render that re-evaluates this effect
  // without a new render shouldn't double-push the same frame. Always resets
  // selectedIdx to 0 so the user sees their freshly-landed frame.
  //
  // Snapshot also pulls `prompt` + video inputs from `params` (the shell's
  // last-committed input snapshot) so history items can round-trip into
  // Studio even after the user edits prompt / toggles controls. params is
  // the same thing that drove the render that just finished, thanks to the
  // hook's AbortController cancelling older flights before new ones land.
  useEffect(() => {
    if (
      kind === "image" &&
      imageState.status === "success" &&
      params?.kind === "image"
    ) {
      const first = imageState.images[0];
      if (!first) return;
      persistedSetHistory((h) => {
        if (h[0]?.kind === "image" && h[0].url === first.url) return h;
        const next: HistoryItem = {
          kind: "image",
          url: first.url,
          size: first.size,
          model: modelId,
          prompt: params.prompt,
          ts: Date.now(),
          elapsedMs: imageState.elapsedMs,
        };
        return [next, ...h].slice(0, MAX_HISTORY);
      });
      setSelectedIdx(0);
    } else if (
      kind === "video" &&
      videoState.status === "success" &&
      params?.kind === "video"
    ) {
      persistedSetHistory((h) => {
        if (h[0]?.kind === "video" && h[0].url === videoState.videoUrl) return h;
        const next: HistoryItem = {
          kind: "video",
          url: videoState.videoUrl,
          ratio: videoState.ratio,
          model: modelId,
          prompt: params.prompt,
          resolution: params.resolution,
          duration: params.duration,
          mode: params.mode,
          ts: Date.now(),
          elapsedMs: videoState.elapsedMs,
        };
        return [next, ...h].slice(0, MAX_HISTORY);
      });
      setSelectedIdx(0);
    }
  }, [kind, imageState, videoState, modelId, params, persistedSetHistory]);

  // Display-state memos. The tile reads from these instead of the raw hook
  // state so a selected old frame can override hook.status === "idle" after
  // a reset, or override a stale success when the user is browsing history.
  //
  // Priority: busy > error > selected-history > hook state. Busy + error
  // outrank history because those signals need to reach the user regardless
  // of what they were looking at (a new render is in flight; something
  // failed). Otherwise, whichever frame is selected wins, with hook state
  // as the fallback for idle/empty.
  const displayImageState = useMemo<typeof imageState>(() => {
    if (imageState.status === "loading" || imageState.status === "error") {
      return imageState;
    }
    const item = history[selectedIdx];
    if (item && item.kind === "image") {
      return {
        status: "success",
        images: [{ url: item.url, size: item.size }],
        elapsedMs: item.elapsedMs,
      };
    }
    return imageState;
  }, [imageState, history, selectedIdx]);

  const displayVideoState = useMemo<typeof videoState>(() => {
    if (
      videoState.status === "submitting" ||
      videoState.status === "polling" ||
      videoState.status === "error"
    ) {
      return videoState;
    }
    const item = history[selectedIdx];
    if (item && item.kind === "video") {
      return {
        status: "success",
        videoUrl: item.url,
        elapsedMs: item.elapsedMs,
        ratio: item.ratio,
        taskId: "", // not read by the tile
      };
    }
    return videoState;
  }, [videoState, history, selectedIdx]);

  // Publish result state upward. Watches the DISPLAY state (not the raw
  // hook state) so Export captures whatever the user is currently looking at,
  // including older frames selected from the history strip. Fires into
  // (null → value → null) transitions so the shell's export chip stays
  // coherent across history-selection flips.
  useEffect(() => {
    if (!onResult) return;
    if (kind === "image") {
      if (displayImageState.status === "success") {
        const first = displayImageState.images[0];
        if (first) {
          onResult({ kind: "image", url: first.url, size: first.size });
          return;
        }
      }
      onResult(null);
    } else {
      if (displayVideoState.status === "success") {
        onResult({
          kind: "video",
          url: displayVideoState.videoUrl,
          ratio: displayVideoState.ratio,
        });
        return;
      }
      onResult(null);
    }
  }, [kind, displayImageState, displayVideoState, onResult]);

  const modelLabel =
    kind === "image"
      ? findImageModel(modelId)?.label ?? modelId
      : findVideoModel(modelId)?.label ?? modelId;
  const modelHint =
    kind === "image"
      ? findImageModel(modelId)?.hint ?? ""
      : findVideoModel(modelId)?.hint ?? "";
  const modelOptions = kind === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const sideAccent = SIDE_ACCENT[side];

  // Per-side Retry — re-runs just this panel using the same snapshot the
  // shell last handed down. Skips lastFiredTick bookkeeping (which exists
  // for the shell-wide trigger pathway) since we're firing out-of-band.
  // The hook's own AbortController handles any stragglers.
  const onRetry = () => {
    if (!params) return;
    if (params.kind === "image") void imageRun({ ...params, model: modelId });
    else void videoRun({ ...params, model: modelId });
  };

  // Self-heal for dead thumbs. BytePlus URLs are signed + TTL'd, so an
  // entry can outlive its URL after a long absence. Each <img>/<video> in
  // the strip calls this on load failure; we drop the matching entry and
  // clamp selectedIdx to the new bucket length. The clamp piggybacks on
  // the history updater so it sees the freshly-pruned length (and so we
  // don't need `history` in deps — keeping it would re-create the callback
  // on every history mutation, invalidating HistoryStrip's onPrune prop).
  const pruneHistoryByUrl = useCallback(
    (url: string) => {
      persistedSetHistory((h) => {
        const next = h.filter((it) => it.url !== url);
        setSelectedIdx((idx) => Math.min(idx, Math.max(0, next.length - 1)));
        return next;
      });
    },
    [persistedSetHistory],
  );

  return (
    <section className="flex flex-col gap-3">
      {/* Panel header — side badge + model picker */}
      <header className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-panel px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-7 place-items-center rounded-[8px] font-serif italic text-[15px] leading-none text-bg"
            style={{ background: sideAccent }}
            aria-label={`Side ${side}`}
          >
            {side}
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
              Engine · Side {side}
            </div>
            <div className="truncate text-[13px] font-medium text-ink">
              {modelLabel}
            </div>
          </div>
        </div>
        <div className="min-w-[168px] shrink-0">
          <Select value={modelId} onValueChange={onModelChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Result tile — kind-branched. Fed the DISPLAY state so history
          selection overrides the raw hook output when appropriate. The
          tile owns its own fallback for paramsSize/paramsRatio when the
          shell hasn't snapshotted yet. */}
      {kind === "image" ? (
        <ImageResultTile
          state={displayImageState}
          paramsSize={params?.kind === "image" ? params.size : undefined}
          side={side}
          onReset={imageReset}
          onRetry={params ? onRetry : undefined}
          onInspect={onInspect}
        />
      ) : (
        <VideoResultTile
          state={displayVideoState}
          paramsRatio={params?.kind === "video" ? params.ratio : undefined}
          side={side}
          onReset={videoReset}
          onRetry={params ? onRetry : undefined}
          videoRef={videoRef}
          onInspect={onInspect}
        />
      )}

      {/* History strip — localStorage-backed stack of recent successful
          renders for this (kind, side). Hidden while empty (don't add
          vertical noise on first-load). */}
      {history.length > 0 && (
        <HistoryStrip
          items={history}
          selectedIdx={selectedIdx}
          onSelect={setSelectedIdx}
          onRestore={onRestore}
          onPrune={pruneHistoryByUrl}
        />
      )}

      {/* Footnote */}
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
        <span>
          {statusLabel(kind, displayImageState, displayVideoState)}
          {selectedIdx > 0 && history[selectedIdx] ? (
            <span className="ml-2 text-accent">
              · Frame {history.length - selectedIdx} of {history.length}
            </span>
          ) : null}
        </span>
        <span>{modelHint}</span>
      </div>
    </section>
  );
}

// ─────────────────────────── Status line ────────────────────────────────

function statusLabel(
  kind: CompareKind,
  img: ReturnType<typeof useImageRender>["state"],
  vid: ReturnType<typeof useVideoRender>["state"],
): string {
  if (kind === "image") {
    if (img.status === "success")
      return `${(img.elapsedMs / 1000).toFixed(1)}s · ${
        img.images[0]?.size ?? "—"
      }`;
    if (img.status === "loading") return "Awaiting frame…";
    if (img.status === "error") return "Render failed";
    return "Idle";
  }
  if (vid.status === "success")
    return `${(vid.elapsedMs / 1000).toFixed(1)}s · ${vid.ratio}`;
  if (vid.status === "submitting") return "Submitting task…";
  if (vid.status === "polling")
    return `Polling · ${(vid.elapsedMs / 1000).toFixed(0)}s`;
  if (vid.status === "error") return "Render failed";
  return "Idle";
}

