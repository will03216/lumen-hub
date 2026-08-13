"use client";

/**
 * "Edit with marks" — the modal, following Dreamina's.
 *
 * Player on top, one row of tools under it, Save at the bottom. The whole
 * interaction is: scrub, draw, save. There is no render here and nothing to
 * approve — saving composites the marks into a copy of the frame and hands it
 * to the prompt as a chip.
 *
 * The tool row is deliberately flat rather than the labelled rail the image
 * editor uses. In the image editor the choice of tool changes how the mark
 * reaches the model (coordinate tags vs pixels) and the hints steer that
 * decision; here every mark is drawn into the same composite, so the tools
 * differ only in shape and icons are enough.
 */

import * as React from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import EditCanvasLoader from "@/app/edit/[id]/canvas-loader";
import type { EditTool } from "@/app/edit/[id]/edit-canvas";
import {
  Eraser,
  MoveUpRight,
  MapPin,
  Redo2,
  Scribble,
  Square,
  Type,
  Undo2,
} from "./mark-icons";
import { buildAnnotation, type DraftAnnotation } from "@/lib/edit/annotations";
import { MARKER_COLOR, MAX_ANNOTATIONS_PER_REF } from "@/lib/edit/types";
import { newEditId } from "@/lib/edit/sessions";
import { keyframeAsReference } from "@/lib/video-edit/use-frame-edit";
import {
  removeKeyframeAnnotation,
  setKeyframeAnnotations,
  upsertKeyframeAnnotation,
} from "@/lib/video-edit/sessions";
import type { Keyframe } from "@/lib/video-edit/types";
import { cn } from "@/lib/utils";

const TOOLS: Array<{ id: EditTool; Icon: typeof Square; title: string }> = [
  { id: "box", Icon: Square, title: "Box a region" },
  { id: "brush", Icon: Scribble, title: "Scribble over an area" },
  { id: "arrow", Icon: MoveUpRight, title: "Point from one place to another" },
  { id: "text", Icon: Type, title: "Add a text note" },
  { id: "point", Icon: MapPin, title: "Pin one spot" },
];

export function MarksModal({
  sessionId,
  keyframe,
  saving,
  onSave,
  onClose,
}: {
  sessionId: string;
  keyframe: Keyframe;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const [tool, setTool] = React.useState<EditTool>("box");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  /** Undo history for this sitting. Not persisted: undo is a within-the-modal
   *  affordance, and a stack that survived a reopen would let someone undo a
   *  mark they saved three edits ago. */
  const [history, setHistory] = React.useState<Keyframe["annotations"][]>([]);
  const [redo, setRedo] = React.useState<Keyframe["annotations"][]>([]);

  // Escape closes, matching every other modal in the app.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pushHistory = React.useCallback(() => {
    setHistory((h) => [...h.slice(-24), keyframe.annotations]);
    setRedo([]);
  }, [keyframe.annotations]);

  const commit = React.useCallback(
    (draft: DraftAnnotation) => {
      pushHistory();
      const ann = buildAnnotation(draft, keyframe.annotations, {
        id: newEditId(),
        now: Date.now(),
        color: MARKER_COLOR,
      });
      upsertKeyframeAnnotation(sessionId, keyframe.id, ann, MAX_ANNOTATIONS_PER_REF);
      setSelectedId(ann.id);
    },
    [sessionId, keyframe, pushHistory],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[1040px] flex-col gap-4 rounded-[18px] border border-border bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-serif text-[18px] text-ink">Edit with marks</span>
          <button
            onClick={onClose}
            className="text-ink-mute transition-colors hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/*
          An EXPLICIT height, not flex-1.

          The canvas measures its wrapper with a ResizeObserver and sizes the
          Konva stage from it. `flex-1` inside a column whose own height comes
          from its content is circular: the wrapper waits for the canvas, the
          canvas waits for the wrapper, the observer reports 0px and nothing
          renders. The image editor's viewport has always used a fixed height
          for exactly this reason.
        */}
        <div className="relative h-[min(58vh,560px)] overflow-hidden rounded-[12px] bg-[var(--bg)]">
          <EditCanvasLoader
            reference={keyframeAsReference(keyframe)}
            annotations={keyframe.annotations}
            tool={tool}
            brushWidth={16}
            color={MARKER_COLOR}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCommit={commit}
            onGeometry={(id, geometry) => {
              const existing = keyframe.annotations.find((a) => a.id === id);
              if (!existing) return;
              pushHistory();
              upsertKeyframeAnnotation(
                sessionId,
                keyframe.id,
                { ...existing, ...geometry } as typeof existing,
                MAX_ANNOTATIONS_PER_REF,
              );
            }}
          />
        </div>

        {/* One flat row, Dreamina-style. */}
        <div className="mx-auto flex w-fit items-center gap-1 rounded-[12px] border border-border px-2 py-1.5">
          {TOOLS.map(({ id, Icon, title }) => (
            <button
              key={id}
              title={title}
              onClick={() => setTool(id)}
              className={cn(
                "rounded-[8px] p-2 transition-colors",
                tool === id ? "bg-[var(--bg)] text-ink" : "text-ink-mute hover:text-ink",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}

          <span className="mx-1 h-5 w-px bg-border" />

          <button
            title={selectedId ? "Delete the selected mark" : "Clear every mark"}
            onClick={() => {
              pushHistory();
              if (selectedId) {
                removeKeyframeAnnotation(sessionId, keyframe.id, selectedId);
                setSelectedId(null);
              } else {
                setKeyframeAnnotations(sessionId, keyframe.id, []);
              }
            }}
            className="rounded-[8px] p-2 text-ink-mute transition-colors hover:text-ink"
          >
            <Eraser className="size-4" />
          </button>

          <span className="mx-1 h-5 w-px bg-border" />

          <button
            title="Undo"
            disabled={history.length === 0}
            onClick={() => {
              const prev = history.at(-1);
              if (!prev) return;
              setHistory((h) => h.slice(0, -1));
              setRedo((r) => [...r, keyframe.annotations]);
              setKeyframeAnnotations(sessionId, keyframe.id, prev);
            }}
            className="rounded-[8px] p-2 text-ink-mute transition-colors hover:text-ink disabled:opacity-30"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            title="Redo"
            disabled={redo.length === 0}
            onClick={() => {
              const next = redo.at(-1);
              if (!next) return;
              setRedo((r) => r.slice(0, -1));
              setHistory((h) => [...h, keyframe.annotations]);
              setKeyframeAnnotations(sessionId, keyframe.id, next);
            }}
            className="rounded-[8px] p-2 text-ink-mute transition-colors hover:text-ink disabled:opacity-30"
          >
            <Redo2 className="size-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
            Frame at {keyframe.t.toFixed(2)}s
            {keyframe.annotations.length > 0
              ? ` · ${keyframe.annotations.length} ${keyframe.annotations.length === 1 ? "mark" : "marks"}`
              : " · draw on the frame to say what should change"}
          </span>
          <Button
            size="md"
            variant="primary"
            disabled={saving || keyframe.annotations.length === 0}
            onClick={onSave}
          >
            {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
