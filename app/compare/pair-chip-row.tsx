"use client";

/**
 * PairChipRow — the horizontal pair selector that lives in the page
 * header. Built-in pairs (PAIR_PRESETS) come first, then any locally-
 * saved pairs, then the inline "＋ save current" affordance when the
 * current selection is novel.
 *
 * Two visual layouts share one component:
 *   · narrow viewport — a single horizontal-scroll strip so the row
 *     can't push render controls down the page (native inertial scroll
 *     on mobile; we hide the webkit bar so it doesn't intrude on the
 *     chip rail).
 *   · md+ — the original wrap-centered layout.
 *
 * The shell owns the truth (active pair, saved list, validity); this
 * component is purely presentational + click-dispatch. That keeps the
 * ⌘S keyboard shortcut, the URL serializer, and the chip row in
 * lock-step without prop-threading every internal piece of state.
 *
 * SavedChip is intentionally a sibling button (not nested inside the
 * pair Chip) for its `×` corner — HTML forbids interactive-inside-
 * interactive, and screen readers get cleaner semantics this way.
 */

import { Chip } from "@/components/ui/chip";
import {
  type CompareKind,
  PAIR_PRESETS,
} from "@/lib/compare/pairs";
import type { SavedPair } from "@/lib/compare/saved-pairs";

export function PairChipRow({
  activeA,
  activeB,
  onPick,
  activeKind,
  savedPairs,
  onSaveCurrent,
  onRemoveSaved,
  canSave,
  alreadyPresent,
}: {
  activeA: string;
  activeB: string;
  onPick: (a: string, b: string) => void;
  activeKind: CompareKind;
  savedPairs: SavedPair[];
  onSaveCurrent: () => void;
  onRemoveSaved: (slug: string) => void;
  /** Hides the save chip when the current pair is invalid (mismatched
   *  kinds etc). Should match the shell's isValidPair(a, b) result. */
  canSave: boolean;
  /** True when current (a, b) is already a built-in OR a saved entry.
   *  Hides the `＋ save current` chip; shared with the ⌘S shortcut in
   *  the shell so both UI affordances agree on what's savable. */
  alreadyPresent: boolean;
}) {
  const imagePairs = PAIR_PRESETS.filter((p) => p.kind === "image");
  const videoPairs = PAIR_PRESETS.filter((p) => p.kind === "video");
  const savedImage = savedPairs.filter((p) => p.kind === "image");
  const savedVideo = savedPairs.filter((p) => p.kind === "video");

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {/* Narrow viewports: single horizontal-scroll strip so the row stays one
          line and doesn't push the render controls down the page. The native
          inertial scroll is fine on mobile; we hide the webkit bar so it doesn't
          intrude on the chip rail. md+ gets the old wrap-centered layout. */}
      <div className="flex w-full max-w-full items-center gap-1.5 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:w-auto md:max-w-none md:flex-wrap md:justify-center md:overflow-visible md:whitespace-normal">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          Image
        </span>
        {imagePairs.map((p) => {
          const active = activeA === p.a && activeB === p.b;
          return (
            <Chip
              key={p.slug}
              accent={active}
              onClick={() => onPick(p.a, p.b)}
            >
              {p.label}
            </Chip>
          );
        })}
        {savedImage.map((p) => (
          <SavedChip
            key={p.slug}
            pair={p}
            active={activeA === p.a && activeB === p.b}
            onPick={onPick}
            onRemove={onRemoveSaved}
          />
        ))}
        <span className="ml-3 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          Video
        </span>
        {videoPairs.map((p) => {
          const active = activeA === p.a && activeB === p.b;
          return (
            <Chip
              key={p.slug}
              accent={active}
              onClick={() => onPick(p.a, p.b)}
            >
              {p.label}
            </Chip>
          );
        })}
        {savedVideo.map((p) => (
          <SavedChip
            key={p.slug}
            pair={p}
            active={activeA === p.a && activeB === p.b}
            onPick={onPick}
            onRemove={onRemoveSaved}
          />
        ))}
        {canSave && !alreadyPresent && (
          <Chip
            onClick={onSaveCurrent}
            title="Save the current pair for quick access (⌘S)"
            className="ml-2"
          >
            ＋ save current
          </Chip>
        )}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
        current kind · {activeKind}
      </div>
    </div>
  );
}

/** Saved pair chip. Same visual weight as a built-in, with a hover-revealed
 *  `×` corner to delete. Delete button is a sibling (not nested) of the
 *  select chip so the two interactive elements don't violate HTML's
 *  no-interactive-inside-interactive rule. */
function SavedChip({
  pair,
  active,
  onPick,
  onRemove,
}: {
  pair: SavedPair;
  active: boolean;
  onPick: (a: string, b: string) => void;
  onRemove: (slug: string) => void;
}) {
  return (
    <div className="group relative inline-flex">
      <Chip accent={active} onClick={() => onPick(pair.a, pair.b)}>
        {pair.label}
      </Chip>
      <button
        type="button"
        onClick={() => onRemove(pair.slug)}
        title="Remove from saved pairs"
        aria-label={`Remove ${pair.label}`}
        className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full border border-border bg-bg font-mono text-[10px] leading-none text-ink-dim opacity-0 transition-all hover:border-[oklch(0.78_0.18_25)] hover:text-[oklch(0.78_0.18_25)] group-hover:opacity-100 focus:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
