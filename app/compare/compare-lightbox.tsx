"use client";

/**
 * CompareLightbox — full-viewport A/B inspector.
 *
 * Why this lives at all: the default Compare grid caps each tile around
 * 600px wide, which is enough to glance at an A/B but not enough to
 * audit the details where AI image/video generation fails (faces,
 * hands, text legibility, motion coherence). This surface takes both
 * sides to the full viewport with synchronised zoom + pan (image) or
 * synchronised scrub + play (video), so inspecting one side is always
 * inspecting the SAME region on the other.
 *
 * Trigger lives in each result tile's hover overlay ("🔍 Inspect") but
 * opening state is shell-owned — both A and B's data flow in as props
 * rather than either tile reaching up.
 *
 * Native `<dialog>` for focus trap, backdrop, Esc dismissal, and tab-
 * containment without a useEffect spiderweb.
 *
 * Sync model:
 *   · image  → `zoom` + `pan` are single state variables; both sides
 *              read them so the transform is identical
 *   · video  → one side is the "leader" (whichever was last interacted
 *              with); timeupdate on the leader sets currentTime on the
 *              follower, and play/pause propagates
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Chip } from "@/components/ui/chip";
import { DownloadButton } from "@/components/ui/download-button";
import { mediaProxyUrl } from "@/lib/compare/media-proxy";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

type ImageSide = { url: string; label: string; size?: string };
type VideoSide = { url: string; label: string; ratio: string };

type Props = {
  open: boolean;
  onClose: () => void;
  prompt: string;
} & (
  | { kind: "image"; a: ImageSide; b: ImageSide }
  | { kind: "video"; a: VideoSide; b: VideoSide }
);

export function CompareLightbox(props: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (props.open && !dlg.open) dlg.showModal();
    else if (!props.open && dlg.open) dlg.close();
  }, [props.open]);

  // Native dialog fires 'close' on Esc / form method="dialog" submit;
  // propagate so React's `open` boolean stays in sync with the DOM.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handler = () => props.onClose();
    dlg.addEventListener("close", handler);
    return () => dlg.removeEventListener("close", handler);
  }, [props.onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-black/90 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full w-full flex-col bg-bg text-ink">
        {/* Mount only while open so each open starts at fresh zoom=1 /
            pan=0, and so document-level listeners don't fire against a
            closed dialog. */}
        {props.open ? (
          <>
            <TopBar prompt={props.prompt} onClose={props.onClose} />
            {props.kind === "image" ? (
              <ImageInspector a={props.a} b={props.b} />
            ) : (
              <VideoInspector a={props.a} b={props.b} />
            )}
          </>
        ) : null}
      </div>
    </dialog>
  );
}

// ────────────────────────── Top bar ───────────────────────────────────

function TopBar({ prompt, onClose }: { prompt: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-panel/60 px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="plate shrink-0">§ INSPECT</span>
        <span className="min-w-0 truncate font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          {prompt}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim md:inline">
          Esc close · +/− zoom · 0 reset
        </span>
        <Chip onClick={onClose} title="Close inspector (Esc)">
          Close ✕
        </Chip>
      </div>
    </div>
  );
}

// ────────────────────────── Image inspector ───────────────────────────

function ImageInspector({ a, b }: { a: ImageSide; b: ImageSide }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const draggingRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Multiplicative so each step feels constant regardless of current
  // level (a 25% step at 100% feels the same as a 25% step at 400%).
  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));
  }, []);
  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't steal keys from form fields (none today, but a future
      // "annotate" input shouldn't get swallowed).
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"))
        return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(1 / ZOOM_STEP);
      } else if (e.key === "0") {
        e.preventDefault();
        reset();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoomBy, reset]);

  // Wheel-to-zoom needs a non-passive listener to preventDefault — React's
  // synthetic onWheel is passive, so the page behind the dialog scrolls.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Smaller factor than the keyboard step so trackpad scroll feels
      // smooth rather than steppy. deltaY < 0 = scroll up = zoom in.
      zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Pointer drag to pan. No-op at zoom=1 (nowhere to pan to).
  function onPointerDown(e: React.PointerEvent) {
    if (zoom <= 1) return;
    draggingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = draggingRef.current;
    if (!d) return;
    setPan({
      x: d.panX + (e.clientX - d.startX),
      y: d.panY + (e.clientY - d.startY),
    });
  }
  function onPointerUp(e: React.PointerEvent) {
    draggingRef.current = null;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released by browser — fine */
    }
  }

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const zoomPercent = Math.round(zoom * 100);

  return (
    <>
      <div
        ref={stageRef}
        className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border md:grid-cols-2"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {[a, b].map((side, i) => (
          <div
            key={i}
            className="relative flex items-center justify-center overflow-hidden bg-bg-2"
            style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
          >
            <SideBadge label={side.label} meta={side.size} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={side.url}
              alt={side.label}
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
              style={{
                transform,
                transformOrigin: "center",
                // Skip transition during drag so the image tracks 1:1;
                // re-enable when idle so keyboard/wheel steps glide.
                transition: dragging ? "none" : "transform 100ms ease-out",
              }}
            />
          </div>
        ))}
      </div>
      <InspectorToolbar
        zoomPercent={zoomPercent}
        onZoomIn={() => zoomBy(ZOOM_STEP)}
        onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
        onReset={reset}
        sides={[a, b]}
      />
    </>
  );
}

// ────────────────────────── Video inspector ───────────────────────────

function VideoInspector({ a, b }: { a: VideoSide; b: VideoSide }) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  // Whichever side the user last interacted with is the leader; its
  // events propagate. pointerdown/keydown on the wrapper covers play,
  // seek-bar drag, and keyboard scrub (controls live in shadow DOM).
  const leaderRef = useRef<"a" | "b">("a");

  useEffect(() => {
    const va = videoARef.current;
    const vb = videoBRef.current;
    if (!va || !vb) return;

    // 0.05s epsilon is wider than native timeupdate granularity
    // (~250ms), so a leader's seek doesn't ping-pong with the
    // follower's own tick events.
    const sync = (from: HTMLVideoElement, to: HTMLVideoElement) => {
      if (Math.abs(to.currentTime - from.currentTime) > 0.05) {
        to.currentTime = from.currentTime;
      }
    };

    const pairs = [
      { key: "a" as const, me: va, peer: vb },
      { key: "b" as const, me: vb, peer: va },
    ];
    const cleanups = pairs.map(({ key, me, peer }) => {
      const onTime = () => {
        if (leaderRef.current === key) sync(me, peer);
      };
      const onPlay = () => {
        leaderRef.current = key;
        if (peer.paused) void peer.play().catch(() => {});
      };
      const onPause = () => {
        if (leaderRef.current === key && !peer.paused) peer.pause();
      };
      me.addEventListener("timeupdate", onTime);
      me.addEventListener("play", onPlay);
      me.addEventListener("pause", onPause);
      return () => {
        me.removeEventListener("timeupdate", onTime);
        me.removeEventListener("play", onPlay);
        me.removeEventListener("pause", onPause);
      };
    });
    return () => cleanups.forEach((c) => c());
  }, []);

  const markLeader = useCallback((side: "a" | "b") => {
    leaderRef.current = side;
  }, []);

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border md:grid-cols-2">
        {([
          { side: a, ref: videoARef, key: "a" as const },
          { side: b, ref: videoBRef, key: "b" as const },
        ]).map(({ side, ref, key }) => (
          <div
            key={key}
            className="relative flex items-center justify-center overflow-hidden bg-bg-2"
            onPointerDown={() => markLeader(key)}
            onKeyDown={() => markLeader(key)}
          >
            <SideBadge label={side.label} meta={side.ratio} />
            <video
              ref={ref}
              // Same-origin proxy — see video-result-tile.tsx for the
              // CORS / taint rationale.
              src={mediaProxyUrl(side.url)}
              controls
              playsInline
              loop
              className="max-h-full max-w-full object-contain bg-black"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-panel/60 px-5 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
          Scrub or play either side — the other follows
        </span>
        <SidePairDownloads sides={[a, b]} />
      </div>
    </>
  );
}

// ────────────────────────── Sub-components ───────────────────────────

function SideBadge({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-[6px] bg-black/60 px-2 py-1 backdrop-blur-sm">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink">
        {label}
      </div>
      {meta ? (
        <div className="font-mono text-[9px] tracking-[0.10em] text-ink-dim">
          {meta}
        </div>
      ) : null}
    </div>
  );
}

function InspectorToolbar({
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onReset,
  sides,
}: {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  sides: readonly { url: string; label: string }[];
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-panel/60 px-5 py-3">
      <div className="flex items-center gap-1.5">
        <Chip onClick={onZoomOut} title="Zoom out (−)">
          −
        </Chip>
        <span className="min-w-[3.5em] text-center font-mono text-[11px] tabular-nums text-ink-dim">
          {zoomPercent}%
        </span>
        <Chip onClick={onZoomIn} title="Zoom in (+)">
          +
        </Chip>
        <Chip onClick={onReset} title="Reset zoom and pan (0)">
          Reset
        </Chip>
      </div>
      <SidePairDownloads sides={sides} />
    </div>
  );
}

function SidePairDownloads({
  sides,
}: {
  sides: readonly { url: string; label: string }[];
}) {
  return (
    <div className="flex gap-1.5">
      {sides.map((s) => (
        // Same-origin via the proxy so the browser actually honors the
        // `download` attribute — cross-origin `download` is a no-op in
        // Chrome/Firefox and would just navigate to the asset.
        <DownloadButton
          key={s.label}
          href={mediaProxyUrl(s.url)}
          label={`${s.label} ↓`}
        />
      ))}
    </div>
  );
}

// ────────────────────────── Utils ─────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
