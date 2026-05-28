"use client";

/**
 * Library empty state — what shows on first visit.
 *
 * Doubles as the orientation surface: explains *how* assets get here
 * (auto-save from Generator and Canvas) so users don't expect an upload
 * button before §47 ships one.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EmptyState() {
  return (
    <div className="rounded-[16px] border border-border bg-panel/30 p-10 text-center md:p-16">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
        Library is empty
      </span>
      <h2
        className="font-serif mt-3 text-ink"
        style={{
          fontSize: "clamp(22px, 2.4vw, 30px)",
          letterSpacing: "-0.01em",
        }}
      >
        Render something to start <em>filling it.</em>
      </h2>
      <p className="mx-auto mt-4 max-w-[480px] text-[13px] text-ink-dim">
        Every successful Generator and Canvas render lands here automatically.
        Pin the keepers, send a render back through Generator to remix.
      </p>
      <div className="mt-7 flex justify-center gap-2">
        <Button asChild variant="primary">
          <Link href="/generate">Open Generator →</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/studio">Open Canvas →</Link>
        </Button>
      </div>
    </div>
  );
}
