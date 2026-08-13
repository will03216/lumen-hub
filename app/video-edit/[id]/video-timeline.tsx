"use client";

/**
 * The scrubber, the filmstrip and the Grab button.
 *
 * ── The one thing this component must get right ─────────────────────────
 *
 * The timestamp it reports is the decoder's, never the slider's. The slider
 * sets an intent; `grabFrameAt` resolves what the decoder actually presented,
 * and THAT is what travels. The displayed time updates to the resolved value
 * after a grab for exactly this reason — if the user asked for 3.20 and got
 * 3.17, the UI has to say 3.17, or the ledger and the screen disagree and only
 * the ledger is right.
 *
 * The video element is owned here and handed up by ref, because the workspace
 * needs it to grab frames and this component needs it to play them. Two
 * elements pointed at the same URL would decode the clip twice and drift.
 */

import * as React from "react";
import { Loader2, Pause, Play, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mediaProxyUrl } from "@/lib/compare/media-proxy";
import { clampToClip, filmstripTimes } from "@/lib/video-edit/frame-grab";
import type { Keyframe, VideoSource, WorkingWindow } from "@/lib/video-edit/types";
import { cn } from "@/lib/utils";

const FILMSTRIP_COUNT = 12;

export function VideoTimeline({
  source,
  window: win,
  keyframes,
  videoRef,
  onGrab,
  onWindowChange,
  grabbing,
}: {
  source: VideoSource;
  window: WorkingWindow;
  keyframes: Keyframe[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onGrab: (at: number) => void;
  onWindowChange: (w: WorkingWindow) => void;
  grabbing: boolean;
}) {
  const [playhead, setPlayhead] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  // Playback drives the readout; scrubbing drives playback. Reading
  // currentTime on timeupdate is fine HERE — this is a display clock, not a
  // keyframe timestamp, and the two must not be confused.
  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => setPlayhead(el.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onLoaded = () => setReady(true);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeked", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("loadedmetadata", onLoaded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeked", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [videoRef]);

  const scrubTo = React.useCallback(
    (t: number) => {
      const el = videoRef.current;
      if (!el) return;
      const clamped = clampToClip(t, source.duration);
      el.currentTime = clamped;
      setPlayhead(clamped);
    },
    [videoRef, source.duration],
  );

  const strip = React.useMemo(
    () => filmstripTimes(source.duration, FILMSTRIP_COUNT),
    [source.duration],
  );

  const pct = (t: number) => (source.duration ? (t / source.duration) * 100 : 0);

  return (
    <div className="space-y-3">
      {/* Scrubber */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            if (el.paused) void el.play();
            else el.pause();
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-ink-dim transition-colors hover:border-border-strong hover:text-ink"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>

        <div className="relative min-w-0 flex-1">
          {/* The working window, drawn under the track. Everything outside it
              is footage the render will not touch. */}
          <div
            className="pointer-events-none absolute inset-y-0 rounded-full bg-[var(--accent)]/12"
            style={{
              left: `${pct(win.start)}%`,
              width: `${pct(win.end - win.start)}%`,
            }}
          />
          <input
            type="range"
            min={0}
            max={source.duration}
            step={0.01}
            value={playhead}
            onChange={(e) => scrubTo(Number(e.target.value))}
            className="relative w-full accent-[var(--accent)]"
            aria-label="Playhead"
          />
          {/* Keyframe pips. Position is the stored timestamp, so a pip that
              looks off-by-a-hair from where the user grabbed is the decoder
              telling the truth. */}
          {keyframes.map((k) => (
            <span
              key={k.id}
              title={`Keyframe @ ${k.t.toFixed(3)}s`}
              className={cn(
                "pointer-events-none absolute -bottom-1 size-1.5 -translate-x-1/2 rounded-full",
                k.editedFrameUrl ? "bg-[var(--ok)]" : "bg-ink-mute",
              )}
              style={{ left: `${pct(k.t)}%` }}
            />
          ))}
        </div>

        <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-dim">
          {playhead.toFixed(2)} / {source.duration.toFixed(2)}s
        </span>

        <Button
          size="sm"
          variant="primary"
          disabled={!ready || grabbing}
          onClick={() => onGrab(playhead)}
        >
          {grabbing ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <SquarePen className="mr-1.5 size-3.5" />
          )}
          Edit with marks
        </Button>
      </div>

      {/* Filmstrip. Click a thumbnail to scrub there. */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {strip.map((t) => (
          <FilmstripCell
            key={t}
            t={t}
            src={source.url}
            active={Math.abs(playhead - t) < source.duration / FILMSTRIP_COUNT / 2}
            onClick={() => scrubTo(t)}
          />
        ))}
      </div>

      {/* Working window. Only shown when the clip is longer than one render —
          on a short clip the whole thing IS the window and the control would
          be a decision nobody needs to make. */}
      {source.duration > 15 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
            Window
          </span>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-dim">
            start
            <input
              type="number"
              min={0}
              max={Math.max(0, source.duration - 4)}
              step={0.1}
              value={win.start.toFixed(1)}
              onChange={(e) => {
                const start = Math.max(0, Number(e.target.value));
                onWindowChange({
                  start,
                  // Keep the window legal in one move rather than letting the
                  // user create an invalid one and then complaining about it.
                  end: Math.min(source.duration, Math.max(start + 4, Math.min(win.end, start + 15))),
                });
              }}
              className="w-20 rounded-[6px] border border-border bg-transparent px-2 py-1 font-mono text-[11px] tabular-nums text-ink outline-none focus:border-ink-dim"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-dim">
            end
            <input
              type="number"
              min={4}
              max={source.duration}
              step={0.1}
              value={win.end.toFixed(1)}
              onChange={(e) => {
                const end = Math.min(source.duration, Number(e.target.value));
                onWindowChange({
                  start: Math.max(0, Math.min(win.start, end - 4), end - 15),
                  end,
                });
              }}
              className="w-20 rounded-[6px] border border-border bg-transparent px-2 py-1 font-mono text-[11px] tabular-nums text-ink outline-none focus:border-ink-dim"
            />
          </label>
          <span className="font-mono text-[10px] text-ink-mute">
            {(win.end - win.start).toFixed(1)}s · the rest of the clip is left
            untouched and spliced back around it
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * One filmstrip thumbnail.
 *
 * Its own <video> seeked once and drawn to a canvas would be the obvious
 * approach and would decode the clip twelve more times. This uses a single
 * `<video>` with a fragment URL instead — the browser fetches the byte range
 * around that timestamp and paints a poster frame, at a fraction of the cost.
 */
function FilmstripCell({
  t,
  src,
  active,
  onClick,
}: {
  t: number;
  src: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`${t.toFixed(1)}s`}
      className={cn(
        "relative h-12 w-20 shrink-0 overflow-hidden rounded-[6px] border bg-[var(--bg)] transition-colors",
        active ? "border-ink" : "border-border hover:border-border-strong",
      )}
    >
      <video
        src={`${mediaProxyUrl(src)}#t=${t}`}
        preload="metadata"
        muted
        playsInline
        className="pointer-events-none size-full object-cover"
      />
      <span className="absolute bottom-0 right-0 bg-[var(--bg)]/80 px-1 font-mono text-[8px] tabular-nums text-ink-mute">
        {t.toFixed(1)}
      </span>
    </button>
  );
}
