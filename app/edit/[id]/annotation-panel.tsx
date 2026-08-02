"use client";

/**
 * The list of marks on the active reference, with a per-mark note field.
 *
 * The note is the reason this panel exists rather than the canvas being the
 * only surface. A note is quoted verbatim into the prompt's target-notes line
 * ("Region 02 (box 1) — replace the surface with brushed steel"), which lets
 * a user attach a *different* instruction to each mark instead of writing one
 * sentence that has to cover every region at once.
 *
 * Worth knowing: with no notes at all, the compiled prompt is byte-identical
 * to what BytePlus's own demo produces. Notes are the one place this feature
 * extrapolates past the verified format, which is why they are opt-in per
 * mark rather than a field we always send.
 */

import * as React from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import type { Annotation } from "@/lib/edit/types";
import { cn } from "@/lib/utils";

export function AnnotationPanel({
  annotations,
  selectedId,
  onSelect,
  onPatch,
  onRemove,
}: {
  annotations: Annotation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // Deliberately narrower than Partial<Annotation>: Annotation is a
  // discriminated union, so spreading an arbitrary partial of it onto a
  // member is unsound (it would let a `rect` land on a point). These are the
  // only two fields this panel edits.
  onPatch: (id: string, patch: { note?: string; hidden?: boolean }) => void;
  onRemove: (id: string) => void;
}) {
  if (annotations.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-mute">
        No marks yet. Pick a tool and click the image to point at what should
        change — everything you don&apos;t mark stays as it is.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {annotations.map((a) => (
        <div
          key={a.id}
          onClick={() => onSelect(a.id)}
          className={cn(
            "cursor-pointer rounded-[10px] border p-2 transition-colors",
            a.id === selectedId
              ? "border-border-strong bg-[var(--bg)]"
              : "border-border hover:border-border-strong",
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: a.color }}
              aria-hidden
            />
            <span className="flex-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
              {a.label}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPatch(a.id, { hidden: !a.hidden });
              }}
              title={a.hidden ? "Show on canvas" : "Hide on canvas"}
              className="text-ink-mute transition-colors hover:text-ink"
            >
              {a.hidden ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(a.id);
              }}
              title="Delete mark"
              className="text-ink-mute transition-colors hover:text-[oklch(0.72_0.22_15)]"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>

          <input
            value={a.note ?? ""}
            onChange={(e) => onPatch(a.id, { note: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="What should change here?"
            className="mt-1.5 w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-mute"
          />
        </div>
      ))}

      {/* A hidden mark is still stored but is excluded from the compiled
          prompt — say so, or "hidden" looks purely cosmetic. */}
      {annotations.some((a) => a.hidden) && (
        <p className="px-1 text-[11px] leading-relaxed text-ink-mute">
          Hidden marks aren&apos;t sent to the model.
        </p>
      )}
    </div>
  );
}
