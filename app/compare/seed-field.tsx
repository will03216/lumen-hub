"use client";

/**
 * Compare-specific seed input + "🎲 random" chip + dynamic reproducibility
 * helper. Used by both ImageControls and VideoControls so the affordance
 * for pinning a deterministic seed (and the helper that explains what the
 * shareable link will do) stays identical on both axes.
 *
 * The Studio surfaces have their own seed inputs but lack the "shareable
 * link reproduces this exact roll" angle — that's why this composite
 * lives here rather than in components/ui/.
 */

import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";

export function SeedField({
  seed,
  onSeedChange,
  onRandomize,
}: {
  seed: string;
  onSeedChange: (s: string) => void;
  /** Generates a fresh positive integer and pins it. Wired in the shell so
   *  one source produces the random — useful when we add "save with this
   *  exact seed" later. */
  onRandomize: () => void;
}) {
  const pinned = seed.trim() !== "";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label>Seed (both sides)</Label>
        <Chip
          onClick={onRandomize}
          title={
            pinned
              ? "Reroll: generate a new pinned seed"
              : "Pin a fresh random seed so the Copy-link recipient hits the same dice roll"
          }
        >
          🎲 {pinned ? "reroll" : "random"}
        </Chip>
      </div>
      <NumberInput
        value={seed}
        onChange={(e) => onSeedChange(e.target.value)}
        placeholder="random each render"
      />
      {/* Dynamic helper — telegraphs what the shareable link will do. The
          static "fairest comparison" text was true but didn't tell the user
          whether their Copy-link will reproduce. */}
      <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ink-dim">
        {pinned ? (
          <>
            Pinned · link reproduces this exact roll.{" "}
            <button
              type="button"
              onClick={() => onSeedChange("")}
              className="underline decoration-dotted underline-offset-[3px] hover:text-ink"
            >
              clear
            </button>
          </>
        ) : (
          <>Random each render — link will re-roll for the recipient.</>
        )}
      </p>
    </div>
  );
}
