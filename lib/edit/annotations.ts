/**
 * Turning a finished gesture into a stored annotation.
 *
 * Split out of the canvas because labelling is the one part of drawing that
 * is neither geometry nor rendering: it depends on what is already on the
 * reference. Keeping it pure means the numbering rules are testable without
 * a Stage, and means the agent tools in a later phase can create marks
 * through exactly the same path a human does — same labels, same caps, same
 * shape — rather than a parallel one that drifts.
 *
 * Labels are per-kind and per-reference. They appear verbatim in the prompt's
 * target-notes line ("Mark 01 (point 1) — remove the logo"), which is why
 * they are stable, human-readable, and assigned at creation rather than
 * derived from array position at compile time: deleting the first mark must
 * not silently renumber every note the user has already written.
 */

import type { Annotation, EditToolKind, Vec } from "./types";
import { MARKER_COLOR } from "./types";

/** What a completed canvas gesture produces, before it has an identity. */
export type DraftAnnotation =
  | { kind: "point"; at: Vec }
  | { kind: "box"; rect: { x: number; y: number; w: number; h: number } }
  | { kind: "brush"; points: number[]; width: number }
  | { kind: "arrow"; from: Vec; to: Vec; width: number };

/** The human word for each tool, used as the label stem. */
const LABEL_STEM: Record<EditToolKind, string> = {
  point: "Mark",
  box: "Region",
  brush: "Paint",
  arrow: "Arrow",
};

/**
 * Next label for `kind` on a reference that already holds `existing`.
 *
 * Numbering continues past deletions rather than filling gaps: if the user
 * has Mark 01 and Mark 02, deletes Mark 01, and draws again, they get Mark 03.
 * Reusing "Mark 01" would silently repoint any note that referred to the
 * original — and notes are free text the model reads literally.
 */
export function nextLabel(kind: EditToolKind, existing: Annotation[]): string {
  const stem = LABEL_STEM[kind];
  let highest = 0;
  for (const a of existing) {
    if (a.kind !== kind) continue;
    const m = new RegExp(`^${stem} (\\d+)$`).exec(a.label);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `${stem} ${String(highest + 1).padStart(2, "0")}`;
}

export type BuildOpts = {
  /** Injected so tests are deterministic and the agent path can be replayed. */
  id: string;
  now?: number;
  color?: string;
};

/** Draft + identity -> the annotation that gets stored. */
export function buildAnnotation(
  draft: DraftAnnotation,
  existing: Annotation[],
  opts: BuildOpts,
): Annotation {
  const base = {
    id: opts.id,
    label: nextLabel(draft.kind, existing),
    color: opts.color ?? MARKER_COLOR,
    createdAt: opts.now ?? 0,
  };

  switch (draft.kind) {
    case "point":
      return { ...base, kind: "point", at: draft.at };
    case "box":
      return { ...base, kind: "box", rect: draft.rect };
    case "brush":
      return {
        ...base,
        kind: "brush",
        points: draft.points,
        width: draft.width,
      };
    case "arrow":
      return {
        ...base,
        kind: "arrow",
        from: draft.from,
        to: draft.to,
        width: draft.width,
      };
  }
}
