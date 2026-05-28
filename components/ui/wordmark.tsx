import * as React from "react";

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 leading-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="text-ink"
      >
        <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="4.5" fill="var(--accent)" />
        <circle cx="12" cy="12" r="1.2" fill="var(--bg)" />
      </svg>
      <span
        className="font-serif text-ink"
        style={{ fontSize: size + 4, letterSpacing: "-0.02em" }}
      >
        Lumen
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim ml-0.5">
        HUB
      </span>
    </span>
  );
}
