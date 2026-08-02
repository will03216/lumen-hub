"use client";

/**
 * "Enhance" — rewrite what the user typed, on Seed 2.0 Pro.
 *
 * This replaced the preset chips. A preset writes a sentence FOR you and
 * discards what you had; it answers "what do I type?" for the five things
 * someone thought of in advance and nothing else. Enhancing takes what you
 * actually meant and says it the way the image model responds to, which works
 * for the sixth thing too.
 *
 * Two deliberate properties:
 *
 * · IT IS UNDOABLE, in one click, until you touch the box again. A rewrite you
 *   cannot reverse is a rewrite you have to read defensively before pressing,
 *   which is enough friction to stop people using it at all.
 *
 * · It only ever touches the INSTRUCTION. The `<point>` / `<bbox>` block and
 *   the raster prose are compiled from the marks and are byte-exact against
 *   BytePlus's own demo — a model that could reword those would eventually
 *   break the one verified thing in the feature.
 */

import * as React from "react";
import { Sparkles, Undo2 } from "lucide-react";
import type { Annotation, EditReference } from "@/lib/edit/types";

export function EnhanceButton({
  instruction,
  refs,
  annotations,
  onEnhanced,
}: {
  instruction: string;
  refs: EditReference[];
  annotations: Annotation[];
  /** Writes the rewritten text back into the prompt box. */
  onEnhanced: (instruction: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** The text as it was before the last enhance, for the undo. */
  const [previous, setPrevious] = React.useState<string | null>(null);

  // A rewrite the user has since edited is no longer the thing that would be
  // undone, so the offer retires itself rather than reverting to something
  // stale.
  const undoable = previous !== null && previous !== instruction;

  async function enhance() {
    const current = instruction.trim();
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/edit/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: current, context: describe(refs, annotations) }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        instruction?: string;
        error?: string;
      };
      if (!res.ok || !data.instruction) {
        setError(data.error ?? `Enhance failed (${res.status}).`);
        return;
      }
      setPrevious(current);
      onEnhanced(data.instruction);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => void enhance()}
        disabled={busy || !instruction.trim()}
        title="Rewrite this instruction the way the image model responds to"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-border-strong hover:text-ink disabled:opacity-40 disabled:hover:border-border disabled:hover:text-ink-dim"
      >
        <Sparkles className="size-3" />
        {busy ? "Enhancing…" : "Enhance"}
      </button>

      {undoable && (
        <button
          onClick={() => {
            onEnhanced(previous);
            setPrevious(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute transition-colors hover:text-ink"
        >
          <Undo2 className="size-3" />
          Undo
        </button>
      )}

      {error && (
        <span className="text-[11px] text-[oklch(0.72_0.22_15)]">{error}</span>
      )}
    </div>
  );
}

/**
 * What the model is told about the canvas — counts and roles, never
 * coordinates.
 *
 * Knowing a region is already marked changes the rewrite for the better ("the
 * cap is dark green" rather than "the cap on the left is dark green", since
 * the position is already attached numerically). Handing it the actual numbers
 * makes it repeat them in prose, which duplicates the tag block and is exactly
 * the confusion the system prompt tells it to avoid.
 */
function describe(refs: EditReference[], annotations: Annotation[]): string {
  const visible = annotations.filter((a) => !a.hidden);
  const parts: string[] = [];
  if (visible.length > 0) {
    const kinds = new Map<string, number>();
    for (const a of visible) kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1);
    parts.push(
      `${visible.length} mark${visible.length === 1 ? "" : "s"} already placed (${[...kinds]
        .map(([k, n]) => `${n} ${k}`)
        .join(", ")})`,
    );
  }
  const extra = refs.filter((r) => r.role !== "base");
  if (extra.length > 0) {
    parts.push(
      `${extra.length} extra reference${extra.length === 1 ? "" : "s"} (${extra
        .map((r) => r.role)
        .join(", ")})`,
    );
  }
  return parts.join("; ");
}
