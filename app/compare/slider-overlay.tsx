"use client";

import { useCallback, useRef, useState } from "react";

/**
 * SliderOverlay — A/B reveal compare for image pairs.
 *
 * Stacks A over B inside a single aspect-ratio container; a vertical
 * split line reveals more/less of A based on pointer position. Click
 * anywhere in the frame to jump the split there; drag from anywhere
 * in the frame to scrub smoothly. Keyboard users can focus the handle
 * and nudge with arrows (±2%) or Shift+arrows (±10%). Home / End jump
 * to the edges. Double-click anywhere snaps back to 50% — the "show me
 * the neutral reference" gesture that image-compare tools have trained
 * users to expect.
 *
 * Only meaningful for image kind — video has scrub-the-timeline as its
 * natural comparison channel, and two independently-playing videos
 * don't overlay cleanly anyway. The shell gates mounting on
 * `kind === "image"` + both sides landed.
 *
 * Aspect ratio comes from the A-side result size ("WxH"). Both sides
 * share the shell's `size` state, so B matches A by construction — no
 * scaling mismatch to reconcile. We still object-cover in case the
 * engine rounded dimensions differently.
 */
export function SliderOverlay({
  aUrl,
  bUrl,
  aLabel,
  bLabel,
  size,
}: {
  aUrl: string;
  bUrl: string;
  aLabel: string;
  bLabel: string;
  /** "WxH" from PanelResult.size, e.g. "2048x2048". Falls back to 1:1
   *  if unparseable — a missing ratio would otherwise collapse the
   *  container to zero height under `aspect-ratio`. */
  size?: string;
}) {
  const [pos, setPos] = useState(50);
  // `focused` tracks keyboard focus on the handle so we can reveal the
  // shortcut hint row only when it's actually useful. Showing it always
  // would add visual weight to a widget whose whole point is staying out
  // of the way of the images.
  const [focused, setFocused] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Parse "2048x2048" → 2048/2048. Non-numeric or malformed falls back
  // to 1:1; images are object-cover'd so layout stays sane either way.
  const aspect = parseAspect(size);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Capture so move events keep flowing even if the cursor leaves
      // the frame mid-drag. Without this, fast flicks near the edge
      // stop updating when the pointer exits the container.
      e.currentTarget.setPointerCapture(e.pointerId);
      updateFromClientX(e.clientX);
    },
    [updateFromClientX],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only scrub while the primary button is held — no hover-scrub.
      // buttons is a bitmask; 1 == primary held.
      if (e.buttons !== 1) return;
      updateFromClientX(e.clientX);
    },
    [updateFromClientX],
  );

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPos((p) => Math.max(0, p - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPos((p) => Math.min(100, p + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPos(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setPos(100);
    } else if (e.key === " " || e.key === "Enter") {
      // Space / Enter also snap to 50% — mirrors the double-click gesture
      // for keyboard users. Standard WAI-ARIA slider behaviour differs
      // (Space has no default), so the extra binding is a convenience,
      // not a pattern violation.
      e.preventDefault();
      setPos(50);
    }
  }, []);

  // Double-click resets to 50% — the canonical "show me the neutral
  // reference" gesture in image-compare tools (juxtapose, KeyShade,
  // Lightroom's before/after). Bound on the container so it works even
  // when the pointer isn't directly on the handle.
  const onDoubleClick = useCallback(() => setPos(50), []);

  return (
    <div className="relative">
      <div
        ref={frameRef}
        className="relative w-full select-none touch-none overflow-hidden rounded-[12px] border border-border bg-bg-2"
        style={{ aspectRatio: aspect }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onDoubleClick={onDoubleClick}
      >
        {/* B is the underlying layer — fully painted; A reveals on top. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bUrl}
          alt={bLabel}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        {/* A is clipped from the right, revealing only 0..pos%. clip-path
            on an <img> is GPU-composited so dragging stays buttery even
            on weaker Android devices. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={aUrl}
          alt={aLabel}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 calc(100% - ${pos}%) 0 0)` }}
        />

        {/* Tick marks at 25 / 50 / 75 — a three-mark scale gives a
            quick visual reference without the 0/100 ticks that would
            clash with the rounded frame corners. The 50-mark is a bit
            longer so the midpoint reads at a glance. Pointer-events off
            so the ticks never swallow a drag. */}
        {[25, 50, 75].map((t) => (
          <div
            key={t}
            aria-hidden
            className="pointer-events-none absolute top-0 w-px bg-ink/25"
            style={{
              left: `${t}%`,
              height: t === 50 ? "10px" : "6px",
            }}
          />
        ))}
        {[25, 50, 75].map((t) => (
          <div
            key={`b-${t}`}
            aria-hidden
            className="pointer-events-none absolute bottom-0 w-px bg-ink/25"
            style={{
              left: `${t}%`,
              height: t === 50 ? "10px" : "6px",
            }}
          />
        ))}

        {/* Split line — purely visual; pointer events pass through so
            dragging from anywhere in the frame works, not just the line. */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-ink/90"
          style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
          aria-hidden
        />

        {/* Focusable handle — role=slider for screen readers; keyboard
            users tab here to arrow-key scrub. Handle accepts pointer
            events so clicking directly on it also works (the container
            onPointerDown captures the same event via bubbling). */}
        <div
          role="slider"
          aria-label="A/B split position"
          aria-valuenow={Math.round(pos)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="absolute top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border-2 border-ink bg-bg shadow-lg outline-none ring-accent transition-transform hover:scale-110 focus-visible:ring-2"
          style={{ left: `${pos}%` }}
        >
          <span
            className="font-mono text-[12px] leading-none text-ink"
            aria-hidden
          >
            ⇔
          </span>
        </div>

        {/* Percentage readout — tiny mono label under the handle, shown
            whenever the pointer is engaged (focus) so the user can
            eyeball "am I at 47% or 53%?" without squinting at ticks.
            Aligned with the handle via the same left:{pos}% trick. */}
        {focused && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 translate-y-3 font-mono text-[10px] tracking-[0.10em] text-ink/80"
            style={{ left: `${pos}%`, top: "calc(50% + 18px)" }}
            aria-hidden
          >
            {Math.round(pos)}%
          </div>
        )}

        {/* Corner labels — A top-left (mirrors where A renders when the
            split is at 100%), B top-right. `plate` is our mono chip
            utility from globals.css. pointer-events-none so the labels
            never swallow a drag that starts on top of them. */}
        <div className="pointer-events-none absolute left-3 top-3">
          <span className="plate">A · {aLabel}</span>
        </div>
        <div className="pointer-events-none absolute right-3 top-3">
          <span className="plate">B · {bLabel}</span>
        </div>
      </div>

      {/* Keyboard-shortcut hint — fades in only while the handle has
          focus, so the UI stays quiet for pointer-only users and only
          surfaces the syntax when it's actionable. Kept outside the
          aspect-ratio frame so it never steals pixels from the images. */}
      <div
        className={
          "mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim transition-opacity duration-200 " +
          (focused ? "opacity-100" : "opacity-0")
        }
        aria-hidden={!focused}
      >
        <span>← → · ±2%</span>
        <span>Shift + ← → · ±10%</span>
        <span>Home / End · edges</span>
        <span>Space / dbl-click · 50%</span>
      </div>
    </div>
  );
}

/** "2048x2048" → "2048 / 2048" (CSS aspect-ratio syntax). Defensive
 *  against the field being undefined or a non-WxH string — a degenerate
 *  ratio would otherwise collapse the container to 0 height and the
 *  whole slider would disappear. */
function parseAspect(size: string | undefined): string {
  if (!size) return "1 / 1";
  const m = /^(\d+)x(\d+)$/i.exec(size);
  if (!m) return "1 / 1";
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return "1 / 1";
  return `${w} / ${h}`;
}
