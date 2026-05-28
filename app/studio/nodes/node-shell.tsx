"use client";

import type { ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import { Loader2, Play, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRunner } from "../runner-context";
import type { NodeStatus, PortSpec, StudioNodeData } from "../types";

/** NodeShell only ever reads the static metadata off a spec — never calls
 *  `execute` or `hashInputs`. Narrowing the prop to just the fields we use
 *  sidesteps the function-parameter contravariance problem callers would
 *  otherwise hit when passing in their typed `NodeTypeSpec<TForm>`. */
type NodeShellSpec = {
  label: string;
  inputs: PortSpec[];
  outputs: PortSpec[];
};

const STATUS_DOT: Record<NodeStatus, string> = {
  idle: "bg-ink-mute",
  running: "bg-accent animate-pulse-soft",
  succeeded: "bg-ok",
  failed: "bg-[oklch(0.65_0.22_25)]",
};

/**
 * Shared chrome around every node:
 *   ┌── corner ticks ──┐
 *   │ § LABEL  ●  Run  │  header (status dot + per-node Run/Stop)
 *   ├──────────────────┤
 *   │ <children>       │  body — node-specific form + preview
 *   ├──────────────────┤
 *   │ progress / error │  footer (only shown when there's something to say)
 *   └──────────────────┘
 *
 * Handles are positioned absolutely on the left/right edges. Multi-port nodes
 * spread their handles vertically across 35–65% of card height (see
 * `handleTopPercent`); single-port nodes sit at 50%.
 *
 * The Run / Stop button is wired via `useRunner()` so the canvas-level
 * AbortController stays the source of truth — node components never own
 * cancellation state.
 */
export function NodeShell({
  id,
  spec,
  data,
  selected,
  width = 280,
  children,
}: {
  id: string;
  spec: NodeShellSpec;
  data: StudioNodeData<unknown>;
  selected: boolean;
  /** Override card width. Video gen has more controls so it asks for 320. */
  width?: number;
  children: ReactNode;
}) {
  const {
    runNode,
    cancel,
    deleteNode,
    runningNodeId,
    running: anyRunning,
  } = useRunner();
  const isThisRunning = data.status === "running" && runningNodeId === id;
  // Disable Run on every other node while one is in flight — keeps the
  // single-AbortController model honest.
  const runDisabled = anyRunning && !isThisRunning;
  // Same rule for delete: don't yank a node out from under an in-flight
  // execute; the user must Stop first. Other (idle) nodes can still be
  // deleted while a sibling runs on an unrelated branch.
  const deleteDisabled = isThisRunning;

  return (
    <div
      style={{ width }}
      className={cn(
        "relative rounded-[14px] border bg-panel-2 text-ink shadow-[0_24px_60px_rgba(0,0,0,0.5)] transition-colors",
        selected
          ? "border-accent"
          : "border-border hover:border-[var(--line-strong)]",
      )}
    >
      {/* Corner ticks — pure decoration matching the rest of the app */}
      <span className="pointer-events-none absolute -left-px -top-px size-2 border-l border-t border-[var(--line-strong)]" />
      <span className="pointer-events-none absolute -right-px -top-px size-2 border-r border-t border-[var(--line-strong)]" />
      <span className="pointer-events-none absolute -bottom-px -left-px size-2 border-b border-l border-[var(--line-strong)]" />
      <span className="pointer-events-none absolute -bottom-px -right-px size-2 border-b border-r border-[var(--line-strong)]" />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn("size-1.5 rounded-full", STATUS_DOT[data.status])}
          />
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
            § {spec.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isThisRunning ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cancel();
              }}
              className="nodrag inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-accent hover:text-accent"
              title="Cancel this run"
            >
              <Square className="size-2.5 fill-current" /> Stop
            </button>
          ) : (
            <button
              type="button"
              disabled={runDisabled}
              onClick={(e) => {
                e.stopPropagation();
                runNode(id);
              }}
              className="nodrag inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-30 disabled:hover:bg-accent-soft disabled:hover:text-accent"
              title={runDisabled ? "Another node is running" : "Run this node"}
            >
              <Play className="size-2.5 fill-current" /> Run
            </button>
          )}
          <button
            type="button"
            disabled={deleteDisabled}
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
            className="nodrag inline-flex size-6 items-center justify-center rounded-full border border-border bg-panel text-ink-dim transition-colors hover:border-[oklch(0.65_0.22_25)] hover:text-[oklch(0.78_0.20_25)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-ink-dim"
            title={
              deleteDisabled
                ? "Stop the run before deleting"
                : "Delete this node (or press Backspace when selected)"
            }
            aria-label="Delete node"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Body — node-specific content */}
      <div className="space-y-3 px-3 py-4">{children}</div>

      {/* Footer — only when there's progress or an error to surface */}
      {(data.progress || data.error) && (
        <div className="border-t border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.10em]">
          {data.error ? (
            <span className="text-[oklch(0.78_0.20_25)]">{data.error}</span>
          ) : (
            <span className="flex items-center gap-1.5 text-ink-dim">
              {isThisRunning && (
                <Loader2 className="size-2.5 animate-spin text-accent" />
              )}
              {data.progress}
            </span>
          )}
        </div>
      )}

      {/* Input handles — left edge, with inline labels */}
      {spec.inputs.map((p, i) => (
        <Handle
          key={`in-${p.id}`}
          type="target"
          position={Position.Left}
          id={p.id}
          isConnectable
          title={p.label}
          style={{ top: handleTopPercent(i, spec.inputs.length) }}
        />
      ))}
      {spec.inputs.map((p, i) => (
        <span
          key={`in-lbl-${p.id}`}
          className="pointer-events-none absolute left-2 -translate-y-1/2 font-mono text-[7px] uppercase tracking-[0.06em] text-ink-mute"
          style={{ top: handleTopPercent(i, spec.inputs.length) }}
        >
          {p.label}
        </span>
      ))}
      {/* Output handles — right edge, with inline labels */}
      {spec.outputs.map((p, i) => (
        <Handle
          key={`out-${p.id}`}
          type="source"
          position={Position.Right}
          id={p.id}
          isConnectable
          title={p.label}
          style={{ top: handleTopPercent(i, spec.outputs.length) }}
        />
      ))}
      {spec.outputs.map((p, i) => (
        <span
          key={`out-lbl-${p.id}`}
          className="pointer-events-none absolute right-2 -translate-y-1/2 text-right font-mono text-[7px] uppercase tracking-[0.06em] text-ink-mute"
          style={{ top: handleTopPercent(i, spec.outputs.length) }}
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}

/** Spread N handles evenly across 35–65% of card height; single handle stays
 *  centred. Pixel anchoring would be sturdier but cards are dynamic-height
 *  (preview thumbs grow them) and percentage degrades gracefully. */
function handleTopPercent(index: number, total: number): string {
  if (total <= 1) return "50%";
  const start = 35;
  const end = 65;
  const step = (end - start) / (total - 1);
  return `${start + index * step}%`;
}
