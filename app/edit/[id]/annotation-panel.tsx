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
import { markColor, type Annotation } from "@/lib/edit/types";
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
  onPatch: (
    id: string,
    patch: { note?: string; hidden?: boolean; text?: string; mode?: "label" | "render" },
  ) => void;
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
              // markColor, not a.color: point and box are drawn in the
              // display colour and never carry theirs into the request, so
              // the dot has to agree with the canvas rather than with the
              // stored value (which is also what old sessions have).
              style={{ background: markColor(a) }}
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

          {/*
            A text mark is placed EMPTY — the Konva stage has no DOM to type
            into — so this input is the only way it ever gets its words.
            Without it the text tool silently places invisible marks.
          */}
          {a.kind === "text" && (
            <div className="mt-1.5 space-y-1.5">
              <input
                autoFocus={a.id === selectedId && !a.text}
                value={a.text}
                onChange={(e) => onPatch(a.id, { text: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                placeholder={a.mode === "render" ? "SALE" : "the one on the left"}
                className="w-full rounded-[6px] border border-border bg-transparent px-2 py-1 text-[12px] text-ink outline-none placeholder:text-ink-mute focus:border-ink-dim"
              />
              {/* The two modes produce completely different output, so the
                  choice has to be visible and changeable after the fact —
                  not only at the moment the mark was placed. */}
              <div className="flex gap-1">
                {(
                  [
                    ["label", "Note", "Explains the spot. Never appears in the result."],
                    ["render", "In shot", "Drawn into the frame and kept in the result."],
                  ] as const
                ).map(([mode, label, hint]) => (
                  <button
                    key={mode}
                    title={hint}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPatch(a.id, { mode });
                    }}
                    className={cn(
                      "rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors",
                      a.mode === mode
                        ? "border-border-strong text-ink"
                        : "border-border text-ink-mute hover:text-ink",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* A label's own words ARE its note, so a second free-text field
              would be two places to say one thing. */}
          {a.kind !== "text" && (
            <input
              value={a.note ?? ""}
              onChange={(e) => onPatch(a.id, { note: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="What should change here?"
              className="mt-1.5 w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-mute"
            />
          )}
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
