"use client";

/**
 * GenerateShell — top-level layout for /generate after the Freepik-style
 * redesign.
 *
 * Layout
 * ------
 * - Page hero (unchanged) — `§ GENERATOR · SESSION 0421` plate +
 *   "Direct a new shot." headline.
 * - Two-column body:
 *   · Left sidebar (380px, sticky): `<SidebarTabs>` + active kind's
 *     controls (`ImageGenerator` / `VideoGenerator` / `AudioGenerator`).
 *   · Right feed: `<CreationsFeed>` — cross-kind chronological list of
 *     every render the user has ever produced. Survives sidebar tab
 *     switches because it reads from module-level stores.
 *
 * State
 * -----
 * `activeKind` lives in this shell so the sidebar tab + the URL stay
 * in sync; the feed reads the global stores so it doesn't care which
 * kind is selected.
 *
 * What this replaces
 * ------------------
 * - Old horizontal `<TabsList>` (Image/Video/Audio/Compare) →
 *   `<SidebarTabs>` (Image/Video/Audio only).
 * - `Compare` Tab — dropped from /generate; standalone `/compare` is
 *   still the canonical route.
 * - Style preset chip rail under the hero — dropped (can return as a
 *   sidebar block in a later iteration).
 * - Studio foot strip — dropped; redundant once the feed becomes the
 *   primary visual anchor.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ImageGenerator } from "@/components/image-generator";
import { VideoGenerator } from "@/components/video-generator";
import { AudioGenerator } from "@/components/audio-generator";
import {
  SidebarTabs,
  type GenerateKind,
} from "@/components/generate/sidebar-tabs";
import { CreationsFeed } from "@/components/generate/creations-feed";
import type { PresetHydration } from "@/lib/reels/preset-bridge";
import type { ReelTemplate } from "@/lib/reels/templates";

/** Public initial-tab union — kept wider than `GenerateKind` so existing
 *  links carrying `?tab=compare` don't error at the type level. Compare
 *  values fall back to "image" on the client side. */
export type GenerateInitialTab = GenerateKind | "compare";

export function GenerateTabs({
  initialTab,
  hydrated,
}: {
  initialTab: GenerateInitialTab;
  hydrated: PresetHydration | null;
}) {
  const router = useRouter();
  const seed: GenerateKind =
    initialTab === "compare" ? "image" : initialTab;
  const [activeKind, setActiveKindState] = React.useState<GenerateKind>(seed);

  // When the URL changes via soft navigation (e.g. Creations feed
  // "Create Video" handoff), `initialTab` re-arrives with the new value
  // but `activeKind`'s state initializer has already fired once and
  // won't re-run on its own. This effect bridges that gap so external
  // tab switches stay in sync with the sidebar.
  React.useEffect(() => {
    const next: GenerateKind =
      initialTab === "compare" ? "image" : initialTab;
    if (next !== activeKind) setActiveKindState(next);
    // `activeKind` intentionally omitted from deps — we only want
    // outside-driven changes to flip the tab, not internal flips
    // (those already update the state directly).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  function setActiveKind(next: GenerateKind) {
    setActiveKindState(next);
    // Keep the URL ?tab= param in sync so refresh / share preserves the
    // active sidebar tab. `replace` (not push) avoids polluting back-
    // history with every flip.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      router.replace(`${url.pathname}?${url.searchParams.toString()}`, {
        scroll: false,
      });
    }
  }

  return (
    <div>
      {/* Hero */}
      <div className="border-b border-border">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-end gap-5 px-7 pb-6 pt-8 md:grid-cols-[1fr_auto] md:gap-6 md:pt-10">
          <div>
            <span className="plate inline-flex">§ GENERATOR · SESSION 0421</span>
            <h1
              className="font-serif mt-3 text-ink"
              style={{
                fontSize: "clamp(40px, 6vw, 80px)",
                letterSpacing: "-0.02em",
                lineHeight: 0.95,
              }}
            >
              Direct a new <span className="italic">shot.</span>
            </h1>
          </div>
          <div className="hidden md:flex items-end justify-end">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              ⌘↵ render
            </span>
          </div>
        </div>
      </div>

      {hydrated?.template && (
        <PresetBreadcrumb hydrated={hydrated} template={hydrated.template} />
      )}

      {/* Body — sidebar + feed.
          On lg+: the grid takes a fixed viewport height and each column
          scrolls independently (Freepik pattern). Below lg they stack
          and follow normal page scroll. The `280px` offset accounts for
          the site header + hero region above; tweak together if either
          grows. */}
      <div className="mx-auto w-full max-w-[1440px] px-7 pt-8">
        <div className="grid grid-cols-1 gap-7 lg:h-[calc(100vh-260px)] lg:min-h-[560px] lg:grid-cols-[380px_1fr]">
          <aside className="flex flex-col gap-4 pb-10 lg:overflow-y-auto lg:pr-2">
            <SidebarTabs value={activeKind} onChange={setActiveKind} />
            {/* Each generator renders its own Panel stack + Generate
                button. They unmount on tab switch — the in-flight queue
                survives in module-level stores so the feed never drops
                a "Rendering…" tile. */}
            {activeKind === "image" && (
              <ImageGenerator
                initial={hydrated?.kind === "image" ? hydrated.state : undefined}
              />
            )}
            {activeKind === "video" && (
              <VideoGenerator
                initial={hydrated?.kind === "video" ? hydrated.state : undefined}
              />
            )}
            {activeKind === "audio" && <AudioGenerator />}
          </aside>

          <div className="pb-10 lg:overflow-y-auto lg:pr-2">
            <CreationsFeed />
          </div>
        </div>
      </div>
    </div>
  );
}

function PresetBreadcrumb({
  hydrated,
  template: tpl,
}: {
  hydrated: PresetHydration;
  /** Threaded explicitly so the parent's narrowing flows in — `hydrated.template`
   *  is now optional on the type level (Compare→Studio handoff has no template). */
  template: ReelTemplate;
}) {
  const industryHref = `/reels?industry=${tpl.industry}`;
  // "Clear" returns the user to a vanilla Studio at the same tab.
  const clearHref = `/generate?tab=${tpl.kind === "video" ? "video" : "image"}`;

  // Surface optional warnings the bridge produced.
  const warnings: string[] = [];
  if (hydrated.kind === "image" && hydrated.state.sizeFallback) {
    warnings.push(
      `Size adjusted to ${hydrated.state.size} — the template's exact (size × ratio) wasn't in the Studio dropdown.`,
    );
  }
  if (hydrated.kind === "video" && hydrated.state.requiresUserInput) {
    const map: Record<string, string> = {
      reference:
        "This template needs a Reference image — add at least one above to render.",
      "starting-frame":
        "This template needs a starting frame — upload one above to render.",
      "first-last-frames":
        "This template needs first + last keyframes — upload both above.",
    };
    warnings.push(map[hydrated.state.requiresUserInput] ?? "");
  }

  return (
    <div className="border-b border-border bg-accent-soft/30">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-7 py-3">
        <span className="plate shrink-0">From template</span>
        <Link
          href={industryHref}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim hover:text-ink transition-colors"
        >
          Reels / {tpl.industry}
        </Link>
        <span className="font-mono text-[10px] text-ink-dim">→</span>
        <span className="font-serif text-[15px] italic text-ink">
          {tpl.title}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
          · {tpl.kind} · {tpl.ratio.replace("/", ":")}
        </span>
        <Link
          href={clearHref}
          className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim hover:text-ink hover:border-ink transition-colors"
          title="Clear preset and reset Studio"
        >
          ✕ Clear preset
        </Link>
        {warnings.length > 0 && (
          <p className="basis-full font-mono text-[10px] uppercase tracking-[0.10em] leading-relaxed text-[oklch(0.78_0.18_70)]">
            ! {warnings.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
