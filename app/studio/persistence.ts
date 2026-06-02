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
  updateProject(projectId, { canvas });
}

export function clearCanvas(projectId: string): void {
  updateProject(projectId, { canvas: { nodes: [], edges: [] } });
}
