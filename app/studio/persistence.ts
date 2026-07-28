/**
 * Per-project canvas I/O.
 *
 * Thin shim over `lib/studio/projects.ts` so the rest of the canvas code
 * stays project-id-aware without knowing about the underlying store
 * shape, the v1→v2 migration, or the localStorage key. If we ever move
 * persistence server-side, only this file and `lib/studio/projects.ts`
 * have to change.
 *
 * Saved shape:
 *   - Form values, node positions, and edge graph are always preserved.
 *   - `outputs`, `lastRunHash`, and terminal `status` ("succeeded" / "failed")
 *     are also saved so generated video/image URLs survive a page refresh.
 *     The URLs themselves remain valid (hosted on TOS) so restoring them is
 *     safe. Transient fields (`progress`, `error`, running status) are dropped.
 */

import type { Edge, Node } from "@xyflow/react";
import {
  getProject,
  updateProject,
  type CanvasShape,
  type PersistedNode,
  type PersistedEdge,
} from "@/lib/studio/projects";
import type { StudioNodeData } from "./types";

export type { CanvasShape, PersistedNode, PersistedEdge } from "@/lib/studio/projects";

export function loadCanvas(projectId: string): CanvasShape | null {
  return getProject(projectId)?.canvas ?? null;
}

// Last persisted shape per project, serialized. Lets saveCanvas skip a
// write-through when the computed CanvasShape is byte-identical to what we
// last saved. This matters during a run: the runner ticks `progress` on
// every message, mutating node data and re-arming the autosave debounce —
// but persistence strips those transient fields, so the persisted shape is
// usually unchanged. Without this guard each tick fires a full-project
// upsert to /api/studio/sync. Keyed by projectId so switching projects
// can't cross-contaminate. In-memory only: a fresh load saves once, which
// is correct.
const lastSaved = new Map<string, string>();

export function saveCanvas(
  projectId: string,
  nodes: Node[],
  edges: Edge[],
): void {
  const canvas: CanvasShape = {
    nodes: nodes.map<PersistedNode>((n) => ({
      id: n.id,
      type: n.type ?? "textPrompt",
      position: n.position,
      data: {
        form: (n.data as StudioNodeData<unknown> | undefined)?.form ?? {},
        outputs: (n.data as StudioNodeData<unknown> | undefined)?.outputs as Record<string, string | undefined> | undefined,
        lastRunHash: (n.data as StudioNodeData<unknown> | undefined)?.lastRunHash,
        // Only persist terminal statuses — never "running" or transient state.
        status: (() => {
          const s = (n.data as StudioNodeData<unknown> | undefined)?.status;
          return s === "succeeded" || s === "failed" ? s : undefined;
        })(),
      },
    })),
    edges: edges.map<PersistedEdge>((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    })),
  };

  // Skip the write-through when nothing persisted actually changed, so
  // transient progress ticks during a run don't fire redundant cloud syncs.
  const serialized = JSON.stringify(canvas);
  if (lastSaved.get(projectId) === serialized) return;
  lastSaved.set(projectId, serialized);

  updateProject(projectId, { canvas });
}

export function clearCanvas(projectId: string): void {
  updateProject(projectId, { canvas: { nodes: [], edges: [] } });
}
