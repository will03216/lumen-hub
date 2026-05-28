"use client";

/**
 * ErrorLegend — a "?" chip in the Compare header that opens a popover
 * listing the eight error categories the render hooks can produce, each
 * with its accent dot, short label, and a one-line "what to do" blurb.
 *
 * Why this exists: the error tile already shows a `detail` string, but
 * nothing connects category names ("rate-limit", "task-expired") to a
 * mental model the user can carry across failures. A scannable reference
 * card answers "what am I actually looking at?" in one click, without
 * consuming header pixels while closed.
 *
 * Content discipline: blurbs are single-sentence, present-tense, and end
 * with the user's next action. Keep them in sync with the tile's copy in
 * `ErrorClass.detail` (lib/compare/error-class.ts) — the tile is the
 * truth at runtime, the legend is the overview. Substance must match;
 * the legend can be terser.
 *
 * Drift guard: the `LEGEND` table below is keyed by `ErrorType`, so
 * adding a new union variant makes TypeScript fail until every consumer
 * (tile eyebrow via `ERROR_DISPLAY`, legend row via this table) is
 * updated. No runtime drift detector needed.
 *
 * Dismissal: Escape closes and restores focus to the trigger; clicking
 * anywhere outside the popover or trigger closes. We don't trap focus
 * (this is a reference surface, not a modal) — keyboard users can tab
 * into the panel but aren't forced to.
 */

import { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import type { ErrorType } from "@/lib/compare/error-class";
import { ERROR_DISPLAY } from "@/lib/compare/error-display";

/** Per-category user-facing explanation. ≤ 30 words. Starts with a
 *  plain-English definition of the class and ends with the fix. */
const LEGEND: Record<ErrorType, string> = {
  moderation:
    "BytePlus refused the prompt (content policy). Soften or rephrase the wording — Retry is hidden because the same text will fail again.",
  "invalid-input":
    "Parameters were invalid (prompt length, size, or duration). Adjust the input; the same request won't succeed as-is.",
  "rate-limit":
    "Too many requests in a short window. Wait ~30s — Compare only auto-retries when the suggested delay is under 10s.",
  server:
    "BytePlus or the render proxy coughed. Usually transient — Compare silently retries once before surfacing this tile.",
  network:
    "The request never reached the server. Check your connection (or VPN) and hit Retry.",
  timeout:
    "Polling ceiling hit (~10 min). Retry starts a fresh task — the second attempt is usually faster.",
  "task-expired":
    "BytePlus forgot the task id mid-poll (usually a server reboot). Retry resubmits from scratch.",
  unknown:
    "An unclassified failure — the raw message is on the tile. Retry, and please tell us if you see it twice.",
};

/** Row order matters — group by "what do I do?": can't-retry first (red),
 *  then transient upstream (orange), then time-bound (yellow), then the
 *  mystery bucket. Matches the scan order a user most likely wants. */
const ORDERED_TYPES: ErrorType[] = [
  "moderation",
  "invalid-input",
  "rate-limit",
  "server",
  "network",
  "timeout",
  "task-expired",
  "unknown",
];

export function ErrorLegend() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes + restores focus to the trigger. Only bind the key
  // listener while open — otherwise every Compare page pays for a global
  // keydown listener that does nothing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Outside-click dismissal. Bind on `mousedown` (not click) so a text
  // selection that starts inside the panel and releases outside doesn't
  // accidentally close it — a subtle but annoying misbehaviour in early
  // dropdown implementations across the web.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (
        t &&
        !panelRef.current?.contains(t) &&
        !triggerRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative">
      <Chip
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        active={open}
        aria-expanded={open}
        aria-controls="compare-error-legend"
        aria-label="Error categories legend"
        title="What do these error labels mean?"
      >
        <HelpCircle className="size-3.5" aria-hidden />
        <span className="sr-only">Error legend</span>
      </Chip>
      {open && (
        <div
          ref={panelRef}
          id="compare-error-legend"
          role="dialog"
          aria-label="Error categories"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-bg shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
              Error categories
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              aria-label="Close legend"
              className="inline-flex size-6 items-center justify-center rounded-full text-ink-dim hover:bg-bg-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
          <ul className="divide-y divide-border">
            {ORDERED_TYPES.map((t) => {
              const { label, color } = ERROR_DISPLAY[t];
              return (
                <li key={t} className="flex gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className="mt-1 size-2 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div
                      className="font-mono text-[10px] uppercase tracking-[0.14em]"
                      style={{ color }}
                    >
                      {label}
                    </div>
                    <p className="text-[12px] leading-relaxed text-ink-dim">
                      {LEGEND[t]}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
