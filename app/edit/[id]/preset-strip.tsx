"use client";

/**
 * The preset strip — one row of loaded examples above the prompt bar.
 *
 * PRD §4's first conclusion is that both competitive leaders open on a loaded
 * example rather than an empty canvas, and §3's G6 turns that into a
 * requirement: a salesperson has to run this demo unassisted. This strip is
 * the answer to "what do I type?" — a click writes a complete, model-shaped
 * instruction into the prompt box, which the user is then free to edit.
 *
 * Two deliberate restraints:
 *
 * · It stays ONE row. There are 32 presets; showing them all at once would
 *   make the strip taller than the prompt bar it serves, and the canvas is the
 *   thing the demo is about. Group tabs plus horizontal scroll keeps the
 *   footprint fixed no matter how many presets the registry grows to.
 *
 * · It applies rather than toggles. A preset is not a persistent mode — it
 *   hands the instruction to the parent (`onApply`) and forgets about it. The
 *   prompt box remains the single source of truth for what gets sent, so the
 *   user can overtype "deep forest green" without the UI disagreeing about
 *   whether a preset is still "on".
 *
 * `hasMark` gates the presets whose sentence is meaningless without a region.
 * Disabling them is better than letting them write "remove the marked object"
 * onto an unmarked canvas — that produces a confident, wrong render, which in
 * a live demo is worse than a greyed-out button with a reason attached.
 */

import * as React from "react";
import { Palette, Sticker, Type, Wand2 } from "lucide-react";
import { type EditPreset, presetsByGroup } from "@/lib/edit/presets";
import { cn } from "@/lib/utils";

const GROUPS: Array<{
  id: EditPreset["group"];
  label: string;
  Icon: typeof Wand2;
}> = [
  { id: "task", label: "Task", Icon: Wand2 },
  { id: "colour", label: "Colour", Icon: Palette },
  { id: "material", label: "Material", Icon: Sticker },
  { id: "text", label: "Text", Icon: Type },
];

const NEEDS_MARK_REASON =
  "Mark the image first — this preset edits a specific region.";

export function PresetStrip({
  onApply,
  hasMark,
}: {
  /** Called with the instruction text; the parent writes it to the store. */
  onApply: (instruction: string, presetId: string) => void;
  hasMark: boolean;
}): React.JSX.Element {
  const [group, setGroup] = React.useState<EditPreset["group"]>("task");
  const presets = React.useMemo(() => presetsByGroup(group), [group]);

  // Only surfaced when it's actionable. A standing "place a mark" nag on the
  // colour tab, where nothing is gated, would just be noise.
  const showLockNote = !hasMark && presets.some((p) => p.needsMark);

  return (
    <div className="flex items-center gap-3 px-1 py-1.5">
      <div
        role="tablist"
        aria-label="Preset groups"
        className="flex shrink-0 items-center gap-0.5"
      >
        {GROUPS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={group === id}
            onClick={() => setGroup(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-[8px] border px-2 py-1.5 text-[12px] transition-colors",
              group === id
                ? "border-border-strong bg-panel text-ink"
                : "border-transparent text-ink-mute hover:text-ink",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      <span className="h-7 w-px shrink-0 bg-[var(--bg)]" aria-hidden />

      {/* The scroller. min-w-0 is what lets it shrink instead of pushing the
          tabs off the left edge when the window is narrow. */}
      <div className="flex min-w-0 flex-1 items-stretch gap-1.5 overflow-x-auto">
        {presets.map((p) => {
          const locked = Boolean(p.needsMark) && !hasMark;
          return (
            <button
              key={p.id}
              type="button"
              disabled={locked}
              onClick={() => onApply(p.instruction(), p.id)}
              title={locked ? `${p.hint} — ${NEEDS_MARK_REASON}` : p.hint}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-left transition-colors",
                locked
                  ? "cursor-not-allowed border-border text-ink-mute opacity-45"
                  : "border-border text-ink hover:border-border-strong hover:bg-panel",
              )}
            >
              {p.swatch && (
                <span
                  className="size-3.5 shrink-0 rounded-full border border-border-strong"
                  style={{ background: p.swatch }}
                  aria-hidden
                />
              )}
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-[12px] leading-tight">
                  {p.label}
                </span>
                <span className="block whitespace-nowrap text-[10px] leading-tight text-ink-mute">
                  {p.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* The tooltip alone isn't enough: a disabled button doesn't reliably
          fire hover on every platform, and the reason is the whole point. */}
      {showLockNote && (
        <p className="hidden shrink-0 text-[11px] leading-tight text-ink-dim lg:block">
          Place a mark
          <br />
          to use these
        </p>
      )}
    </div>
  );
}
