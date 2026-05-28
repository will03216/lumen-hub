import * as React from "react";
import { cn } from "@/lib/utils";

export interface ModeBtnProps {
  active?: boolean;
  onClick?: () => void;
  glyph: string;
  label: string;
  sub: string;
  className?: string;
}

export function ModeBtn({
  active,
  onClick,
  glyph,
  label,
  sub,
  className,
}: ModeBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-2 rounded-[12px] border p-3 text-left transition-all cursor-pointer hover:-translate-y-px",
        active
          ? "border-accent bg-accent-soft"
          : "border-border bg-panel hover:border-[var(--line-strong)]",
        className,
      )}
    >
      <span
        className={cn(
          "font-serif italic text-[26px] leading-none",
          active ? "text-accent" : "text-ink",
        )}
      >
        {glyph}
      </span>
      <span className="block">
        <span className="block text-[12px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          {sub}
        </span>
      </span>
    </button>
  );
}
