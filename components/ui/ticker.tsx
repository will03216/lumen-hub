import * as React from "react";

export type TickerItem = { n?: string; t: string };

export function Ticker({ items }: { items: TickerItem[] }) {
  return (
    <div className="overflow-hidden border-y border-border py-3.5">
      <div className="flex w-max gap-[72px] animate-marquee whitespace-nowrap">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex gap-[72px] shrink-0">
            {items.map((it, i) => (
              <span
                key={i}
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim flex items-center gap-3"
              >
                {it.n && <span className="text-accent">{it.n}</span>}
                {it.t}
                <span className="size-1 rounded-full bg-[var(--line-strong)] ml-12" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
