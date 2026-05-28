import * as React from "react";
import { cn } from "@/lib/utils";

export interface PanelProps {
  index: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Panel({ index, title, children, className }: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-[14px] border border-border bg-panel overflow-hidden",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          § {index} {title}
        </span>
        <span className="font-serif italic text-[14px] text-ink-dim">
          {index}
        </span>
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}
