import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  accent?: boolean;
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, active, accent, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.10em] transition-all cursor-pointer whitespace-nowrap",
        active
          ? "border-ink bg-ink text-[var(--bg)]"
          : accent
            ? "border-accent text-accent hover:bg-accent-soft"
            : "border-border text-ink-dim hover:border-[var(--line-strong)] hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
Chip.displayName = "Chip";
