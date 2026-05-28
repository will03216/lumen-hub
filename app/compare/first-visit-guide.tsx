"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * FirstVisitGuide — a one-time dismissible strip that walks a first-time
 * visitor through the Compare workflow in four numbered pills.
 *
 * Why this exists: the Compare surface has three independent axes (pair
 * picker, prompt, per-side controls) and a few keyboard shortcuts, and
 * "Render both" only lights up once a pair is valid. Without a nudge,
 * first-time users tend to write a prompt, notice nothing happens, and
 * bounce. This guide says the quiet parts out loud.
 *
 * Dismissal is stored per-device in localStorage under
 * `compare:guide-dismissed`. Once clicked, it's gone for good — we don't
 * want to be the onboarding banner that comes back every visit. There's
 * no explicit "show me again" button; that's a deliberate minimalism
 * trade-off (users who need it again have the inline chips and the
 * header shortcut hint to lean on).
 *
 * Renders nothing on the server + first hydration tick (we only know
 * localStorage once mounted), so there's no flash-of-banner for repeat
 * visitors on slow connections.
 */

const STORAGE_KEY = "compare:guide-dismissed";

export function FirstVisitGuide() {
  // `null` = not decided yet (pre-hydration); `true`/`false` = decided.
  // Tri-state avoids the FOUC where repeat visitors see the banner flash
  // for one paint before localStorage resolves.
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
      setShow(!dismissed);
    } catch {
      // localStorage can throw in embedded contexts (Safari private mode,
      // some WebViews). Falling back to "don't show" keeps the UI calm;
      // the guide is nice-to-have, not load-bearing.
      setShow(false);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Swallow — failing to persist just means they see it again next
      // visit, not a broken surface.
    }
  };

  if (!show) return null;

  return (
    <div className="border-b border-border bg-bg-2">
      <div className="mx-auto flex w-full max-w-[1440px] items-start justify-between gap-4 px-4 py-3 md:px-7">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          <span className="text-accent">HOW IT WORKS</span>
          <Step n="01" text="Pick a pair" />
          <Step n="02" text="Write one prompt" />
          <Step n="03" text="Render both" />
          <Step n="04" text="Save or share" />
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss guide"
          className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-dim hover:bg-bg-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Numbered pill — "01 · Pick a pair". Kept inline rather than reusing the
 *  Panel `index` style because Panel implies a whole card; we just need a
 *  numbered label. */
function Step({ n, text }: { n: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-ink">{n}</span>
      <span className="text-ink-dim">{text}</span>
    </span>
  );
}
