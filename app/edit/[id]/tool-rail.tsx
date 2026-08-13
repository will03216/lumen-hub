"use client";

/**
 * Tool picker for the annotation canvas.
 *
 * The four tools are not interchangeable and the copy says so, because the
 * choice determines how the mark reaches the model. Point and box become
 * coordinate tags in the prompt with the image left untouched; brush and
 * arrow have to be drawn into a copy of the pixels and described in prose,
 * which is inherently less precise. A user who reaches for the brush when a
 * box would do gets a worse edit, so the hints steer toward the vector tools.
 */

import { Brush, Hand, MoveUpRight, Pin, Square, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditTool } from "./edit-canvas";

const TOOLS: Array<{
  id: EditTool;
  label: string;
  hint: string;
  Icon: typeof Pin;
}> = [
  { id: "point", label: "Point", hint: "Pinpoint one object", Icon: Pin },
  { id: "box", label: "Box", hint: "Edit a whole region", Icon: Square },
  { id: "brush", label: "Brush", hint: "Paint a rough area", Icon: Brush },
  {
    id: "arrow",
    label: "Arrow",
    hint: "Show where something goes",
    Icon: MoveUpRight,
  },
  { id: "text", label: "Text", hint: "Label a spot, or add real text", Icon: Type },
  { id: "pan", label: "Pan", hint: "Move the canvas", Icon: Hand },
];

export function ToolRail({
  tool,
  onToolChange,
  brushWidth,
  onBrushWidthChange,
}: {
  tool: EditTool;
  onToolChange: (t: EditTool) => void;
  brushWidth: number;
  onBrushWidthChange: (w: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {TOOLS.map(({ id, label, hint, Icon }) => (
          <button
            key={id}
            onClick={() => onToolChange(id)}
            title={hint}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors",
              tool === id
                ? "border-border-strong bg-panel text-ink"
                : "border-transparent text-ink-mute hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[13px] leading-tight">{label}</span>
              <span className="block truncate text-[10px] leading-tight text-ink-mute">
                {hint}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Only meaningful for the two tools that actually paint pixels. */}
      {(tool === "brush" || tool === "arrow") && (
        <div className="space-y-1.5 px-1">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
            <span>Width</span>
            <span>{brushWidth}px</span>
          </div>
          <input
            type="range"
            min={2}
            max={80}
            step={2}
            value={brushWidth}
            onChange={(e) => onBrushWidthChange(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
            aria-label="Brush width"
          />
        </div>
      )}
    </div>
  );
}
