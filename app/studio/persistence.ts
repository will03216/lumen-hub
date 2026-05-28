/**
 * Per-project canvas I/O.
 *
 * Thin shim over `lib/studio/projects.ts` so the rest of the canvas code
 * stays project-id-aware without knowing about the underlying store
 * shape, the v1→v2 migration, or the localStorage key. If we ever move
 * persistence server-side, only this file and `lib/studio/projects.ts`
 * have to change.
 *
 * Saved shape is **lossy on purpose**:
 *   - `outputs`, `status`, `progress`, `error`, `lastRunHash` are stripped
 *     so a reload always starts in `idle`. Re-running is one click and
 *     keeps stale generations from masquerading as fresh.
 *   - Form values + node positions + edge graph are preserved fully so
 *     the user lands on the exact layout they left.
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
