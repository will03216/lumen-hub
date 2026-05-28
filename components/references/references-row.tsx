"use client";

/**
 * ReferencesRow — replaces the body of §02 References after §67.
 *
 * Compact 3-button row matching the Freepik design: Style / Character /
 * + Add. Each button opens the §67 ReferencePicker modal pre-routed to
 * the matching panel. The header carries the live "N/MAX" counter +
 * a thumbnail strip of currently-selected refs (so users see what's
 * loaded without opening the modal).
 *
 * Selected refs and the cap live in `ImageGenerator` — this row just
 * surfaces them and forwards button clicks.
 */

import * as React from "react";
import { Plus, Sparkles, User, X } from "lucide-react";
import type { RefImage } from "@/components/ui/reference-image-input";
import { cn } from "@/lib/utils";

export type ReferencePickerTab = "style" | "character" | "history";

export type ReferencesRowProps = {
  value: RefImage[];
  maxCount: number;
  onOpen: (tab: ReferencePickerTab) => void;
  onRemove: (index: number) => void;
};

export function ReferencesRow({
  value,
  maxCount,
  onOpen,
  onRemove,
}: ReferencesRowProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Counter — sits inline so the panel's "§ 02 References" header
          is reserved for the panel chrome. */}
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
        <span>Selected</span>
        <span>
          <span className={value.length > 0 ? "text-ink" : ""}>
            {value.length}
          </span>
          /{maxCount}
        </span>
      </div>

      {/* Selected thumbs — only renders when there's at least one ref.
          Prompt-style refs (§68) get a small text plate instead of an
          image thumb because there's no URL to render. */}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((ref, i) => (
            <li key={i} className="group relative">
              <div
                className="size-12 overflow-hidden rounded-[8px] border border-border bg-panel"
                title={ref.label ?? ref.value}
              >
                {ref.kind === "prompt" ? (
                  <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[oklch(0.22_0.05_270)] to-[oklch(0.12_0.02_270)] px-1 text-center font-serif text-[9px] leading-tight text-ink">
                    {ref.label ?? "#prompt"}
                  </span>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={ref.value}
                    alt={ref.label ?? `ref ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ref ${i + 1}`}
                className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full border border-border bg-bg text-[10px] leading-none text-ink-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink cursor-pointer"
              >
                <X className="size-2.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Three big tap targets. Same visual weight as Freepik's pattern:
          rounded square cards with an icon + label. */}
      <div className="grid grid-cols-3 gap-2">
        <RowButton icon={<Sparkles className="size-4" />} label="Style" onClick={() => onOpen("style")} />
        <RowButton icon={<User className="size-4" />} label="Character" onClick={() => onOpen("character")} />
        <RowButton icon={<Plus className="size-4" />} label="Add" onClick={() => onOpen("history")} accent />
      </div>
    </div>
  );
}

function RowButton({
  icon,
  label,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-[12px] border bg-panel py-3 text-[12px] text-ink transition-all hover:-translate-y-px cursor-pointer",
        accent
          ? "border-dashed border-[var(--line-strong)] hover:border-accent hover:text-accent"
          : "border-border hover:border-[var(--line-strong)]",
      )}
    >
      <span className="text-ink-dim group-hover:text-ink">{icon}</span>
      <span className="font-mono text-[11px] uppercase tracking-[0.10em]">
        {label}
      </span>
    </button>
  );
}
