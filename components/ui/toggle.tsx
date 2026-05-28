import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  className?: string;
}

export function Toggle({ checked, onChange, label, hint, className }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={cn(
        "flex items-center justify-between gap-3 rounded-[10px] border border-border bg-panel px-3 py-2 text-left transition-colors cursor-pointer hover:border-[var(--line-strong)]",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-ink">{label}</span>
        {hint && (
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim">
            {hint}
          </span>
        )}
      </span>
      <span
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-[var(--line-strong)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-3 rounded-full bg-[var(--bg)] transition-transform",
            checked ? "translate-x-3" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
