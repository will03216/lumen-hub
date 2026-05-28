/**
 * Result surface for one side of a video Compare. Same shape as
 * ImageResultTile plus the submitting/polling phases (BytePlus video is
 * a queued task, not a single round-trip). `videoRef` is forwarded so the
 * shell can read currentTime when the user clicks Export — that's how
 * "scrub to the moment, capture this frame" works without the panel
 * owning export state. ProgressRing is private because it's a
 * fake-progress indicator and should not be reused where a real signal
 * exists.
 */

import { Chip } from "@/components/ui/chip";
import { DownloadButton } from "@/components/ui/download-button";
import { CornerTicks } from "@/components/ui/placeholder-tile";
import { mediaProxyUrl } from "@/lib/compare/media-proxy";
import type { useVideoRender } from "@/lib/compare/use-video-render";
import { EmptyOverlay, ErrorTileBody, TileFrame } from "./tile-chrome";

export function VideoResultTile({
  state,
  paramsRatio,
  side,
  onReset,
  onRetry,
  videoRef,
  onInspect,
}: {
  state: ReturnType<typeof useVideoRender>["state"];
  /** Last-known ratio from the shell's snapshot (e.g. "16:9"). Optional —
   *  the panel can render before "Render both" lands a snapshot. We
   *  default to 16:9 so the placeholder holds a sensible aspect. */
  paramsRatio?: string;
  side: "A" | "B";
  onReset: () => void;
  /** Provided only when the shell has a snapshot to re-run. When absent,
   *  error tiles fall back to Dismiss-only. */
  onRetry?: () => void;
  videoRef?: React.Ref<HTMLVideoElement>;
  /** Provided only when BOTH sides are loaded — gated upstream so the
   *  lightbox never opens with half a pair. */
  onInspect?: () => void;
}) {
  const ratioStr = paramsRatio ?? "16:9";
  const ratio = ratioStr.replace(":", "/");

  if (state.status === "success") {
    const tileRatio = (state.ratio || ratioStr).replace(":", "/");
    return (
      <div
        className="group relative overflow-hidden rounded-[12px] border border-border bg-panel"
        style={{ aspectRatio: tileRatio }}
      >
        <video
          ref={videoRef}
          // Route through our /api/media proxy so the browser sees the asset
          // as same-origin. BytePlus's video CDN doesn't serve CORS headers
          // that satisfy `<video crossOrigin>` preflight, which freezes the
          // element at 0:00; same-origin skips CORS entirely and also keeps
          // canvas.drawImage un-tainted for the export path.
          src={mediaProxyUrl(state.videoUrl)}
          controls
          playsInline
          loop
          className="absolute inset-0 h-full w-full object-cover bg-black"
        />
        <CornerTicks />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink/80">
            {state.ratio} · {(state.elapsedMs / 1000).toFixed(1)}s
          </span>
          <div className="flex gap-1.5">
            {onInspect && (
              <Chip
                onClick={onInspect}
                title="Inspect both sides at full screen with synced playback"
              >
                🔍 Inspect
              </Chip>
            )}
            <Chip
              onClick={() => {
                if (typeof window !== "undefined")
                  navigator.clipboard?.writeText(state.videoUrl);
              }}
              title="Copy URL"
            >
              ↗
            </Chip>
            {/* Route the download through our proxy — the HTML `download`
                attribute is silently ignored on cross-origin URLs, so
                clicking a BytePlus CDN link would just navigate instead
                of saving. Same-origin via the proxy fixes that. */}
            <DownloadButton href={mediaProxyUrl(state.videoUrl)} />
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "submitting" || state.status === "polling") {
    const elapsed =
      state.status === "polling" ? state.elapsedMs : Date.now() - state.startedAt;
    const phase = state.status === "polling" ? "Polling" : "Submitting";
    return (
      <TileFrame ratio={ratio} shimmer>
        <div className="absolute left-3.5 top-3.5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink">
          <span className="size-1.5 rounded-full bg-accent animate-pulse-soft" />
          {phase} · Side {side}
        </div>
        <div className="absolute right-3.5 top-3.5 font-mono text-[10px] tracking-[0.10em] text-ink-dim">
          {(elapsed / 1000).toFixed(0)}s
        </div>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            {/* Approximate progress ring — BytePlus doesn't expose true
                task progress, so we interpolate against a typical render
                time (2 min) and cap at 95% so the ring never "fills" and
                lies about being done. During "submitting" the ring just
                ticks at its minimum so there's still motion. */}
            <ProgressRing
              elapsedMs={elapsed}
              phase={state.status === "submitting" ? "submitting" : "polling"}
            />
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
              {state.status === "polling"
                ? "Task queued · renders take 1–3 min"
                : "Handing task to queue"}
            </div>
            {/* Cancel wires to the hook's reset(), which aborts the poll loop. */}
            <div className="mt-3 inline-flex">
              <Chip onClick={onReset}>Cancel</Chip>
            </div>
          </div>
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

// ─────────────────────────── Progress ring ──────────────────────────────

/** Typical BytePlus render time — used only to interpolate the ring fill
 *  and never shown to the user as a truth-claim. 120 s is the midpoint of
 *  the "1–3 min" label we already surface; being a bit pessimistic means
 *  the ring fills steadily rather than jumping early then stalling. */
const EXPECTED_RENDER_MS = 120_000;

/** Fill ceiling so the ring never completes until the task actually does.
 *  A ring that hits 100% and keeps waiting reads as "the UI is lying". */
const MAX_RING_FRACTION = 0.95;

function ProgressRing({
  elapsedMs,
  phase,
}: {
  elapsedMs: number;
  phase: "submitting" | "polling";
}) {
  // SVG circle progress uses stroke-dasharray/stroke-dashoffset. We set
  // the dasharray to the full circumference, then reveal the filled arc
  // by shrinking dashoffset toward 0. The -90deg rotation puts the start
  // of the arc at 12 o'clock (CSS defaults put it at 3).
  const radius = 34;
  const strokeWidth = 2;
  const circumference = 2 * Math.PI * radius;
  // During "submitting" we freeze at 10% — the task hasn't been queued
  // upstream yet, showing time-based progress would over-promise. Once
  // polling starts, interpolate against EXPECTED_RENDER_MS.
  const fraction =
    phase === "submitting"
      ? 0.1
      : Math.min(MAX_RING_FRACTION, elapsedMs / EXPECTED_RENDER_MS);
  const dashoffset = circumference * (1 - fraction);
  return (
    <div className="relative inline-grid size-[88px] place-items-center">
      <svg
        aria-hidden
        className="absolute inset-0 -rotate-90"
        width="88"
        height="88"
        viewBox="0 0 88 88"
      >
        {/* Track — dim base ring the fill rides on. */}
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke="rgba(242,240,232,0.10)"
          strokeWidth={strokeWidth}
        />
        {/* Fill arc — accent colour, rounded cap so the leading edge
            doesn't look like a chopped pie slice. Transition smooths
            the 1-Hz tick bumps in state.elapsedMs so the ring glides
            rather than stepping. */}
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke="oklch(0.70 0.18 55)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      {/* Centre label — elapsed seconds, monospace so the digits don't
          jitter horizontally as tens → hundreds. */}
      <div className="text-center">
        <div className="font-mono text-[18px] leading-none text-ink">
          {(elapsedMs / 1000).toFixed(0)}
        </div>
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          sec
        </div>
      </div>
    </div>
  );
}
