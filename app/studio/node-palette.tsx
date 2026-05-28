"use client";

import { ALL_NODE_SPECS } from "./nodes/registry";

/**
 * Left rail: each node type listed as a draggable card. Drag handler sets
 * `application/lumen-node` to the node type id; the canvas's `onDrop`
 * reads it and instantiates a fresh node at the cursor's flow position.
 */
export function NodePalette() {
  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-border bg-bg-2">
      <div className="shrink-0 p-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        § Palette
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
      <div className="flex flex-col gap-2">
        {ALL_NODE_SPECS.map((spec) => (
          <div
            key={spec.type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/lumen-node", spec.type);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="cursor-grab rounded-[10px] border border-border bg-panel p-2.5 transition-colors hover:border-accent active:cursor-grabbing"
            title={spec.description}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink">
              {spec.label}
            </div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-dim">
              {spec.description}
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
              <span>
                in {spec.inputs.length} · out {spec.outputs.length}
              </span>
              <span className="opacity-60">drag →</span>
            </div>
          </div>
        ))}
      </div>
      </div>
      <div className="shrink-0 border-t border-border p-3 font-mono text-[9px] uppercase leading-[1.5] tracking-[0.12em] text-ink-mute">
        Drag a node onto the canvas. Wire ports left → right. Click Run.
      </div>
    </aside>
  );
}
