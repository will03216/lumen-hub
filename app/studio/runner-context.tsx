"use client";

import { createContext, useContext } from "react";

/**
 * Bridge between individual nodes and the canvas-level runner.
 *
 * Per-node Run/Cancel buttons live inside `NodeShell`, but the actual
 * runner state (AbortController, in-flight flag) lives in `studio-canvas.tsx`
 * so it survives node re-renders. This context is the thin wire between
 * them — kept in its own module to avoid a circular import between the
 * canvas and the node files.
 */
export type RunnerContextValue = {
  /** Run this node (and any stale upstream nodes it depends on). */
  runNode: (id: string) => void;
  /** Abort the current run, if any. */
  cancel: () => void;
  /** True while any run (graph-wide or per-node) is in flight. */
  running: boolean;
  /** The single node currently mid-execute, or null. Used so only one node
   *  shows the Stop button and the others stay disabled but unobtrusive. */
  runningNodeId: string | null;
  /** Remove the node and any edges that referenced it. The canvas owns
   *  edge culling so React Flow never renders an orphaned wire. */
  deleteNode: (id: string) => void;
};

const noop = () => {};

export const RunnerContext = createContext<RunnerContextValue>({
  runNode: noop,
  cancel: noop,
  running: false,
  runningNodeId: null,
  deleteNode: noop,
});

export function useRunner() {
  return useContext(RunnerContext);
}
