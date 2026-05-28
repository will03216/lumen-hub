/**
 * Graph runner — topological execution of the canvas.
 *
 * Two entry points:
 *   - `runGraph(nodes, edges, …)` — execute everything in dependency order
 *     ("Run all" toolbar button)
 *   - `runUpstreamOf(target, …)` — execute the target node and any of its
 *     ancestors that are stale ("Run" button on a single node)
 *
 * Cache / stale logic:
 *   Each node spec exposes `hashInputs(form, inputs)` returning a stable
 *   string fingerprint of every value that affects its wire request. After
 *   a successful execute() we store that hash on `node.data.lastRunHash`.
 *   On the next run, if `currentHash === lastRunHash` AND we already have
 *   outputs cached, we **skip** executing this node and forward the cached
 *   outputs to its descendants. That makes Run-all idempotent and per-node
 *   Run cheap — only the changed branch re-fires.
 */

import type { Edge, Node } from "@xyflow/react";
import type { NodeOutputs, StudioNodeData } from "./types";
import { getNodeSpec } from "./nodes/registry";

export type RunnerUpdate = (
  nodeId: string,
  patch: Partial<StudioNodeData<unknown>>,
) => void;

/** Kahn's algorithm. Returns `{ error: 'cycle' }` if the graph has a loop. */
export function topoSort(
  nodes: Node[],
  edges: Edge[],
): string[] | { error: "cycle" } {
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (!inDeg.has(e.target) || !adj.has(e.source)) continue;
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    adj.get(e.source)!.push(e.target);
  }
  const order: string[] = [];
  const queue: string[] = [];
  for (const [id, d] of inDeg) if (d === 0) queue.push(id);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (inDeg.get(next) ?? 1) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== nodes.length) return { error: "cycle" };
  return order;
}

/** Pull each connected upstream output port into the keyed-by-target-handle
 *  map this node's `execute` will receive. Disconnected handles end up
 *  `undefined`, which downstream specs interpret per their own rules
 *  (image-gen throws "prompt is required"; video-gen treats `image` as
 *  optional).
 *
 *  When multiple edges share the same target handle (e.g. several Asset nodes
 *  all wired into one "references" port), their values are joined with "\n".
 *  Consumers that expect multi-value input split on "\n". */
function gatherInputs(
  nodeId: string,
  edges: Edge[],
  outputsByNode: Map<string, NodeOutputs>,
): NodeOutputs {
  const collected: Record<string, string[]> = {};
  for (const e of edges) {
    if (e.target !== nodeId) continue;
    const upstream = outputsByNode.get(e.source);
    if (!upstream) continue;
    const fromPort = e.sourceHandle ?? "default";
    const toPort = e.targetHandle ?? "default";
    const val = upstream[fromPort];
    if (val === undefined) continue;
    (collected[toPort] ??= []).push(val);
  }
  const inputs: NodeOutputs = {};
  for (const [port, vals] of Object.entries(collected)) {
    inputs[port] = vals.join("\n");
  }
  return inputs;
}

/**
 * Execute every node in dependency order. Failures stop their own subtree
 * but don't cancel sibling branches — a broken Image Gen on the left half
 * of the canvas shouldn't kill an unrelated Video Gen on the right.
 */
export async function runGraph(
  nodes: Node[],
  edges: Edge[],
  update: RunnerUpdate,
  signal: AbortSignal,
  options: {
    onRunningNodeChange?: (id: string | null) => void;
    /** Threaded into each node spec's ExecuteCtx so Library auto-save can
     *  attach project lineage. Optional — left undefined when called from
     *  contexts that don't belong to a Studio project. */
    projectId?: string;
  } = {},
): Promise<void> {
  const sorted = topoSort(nodes, edges);
  if ("error" in sorted) {
    throw new Error("Cycle detected in graph");
  }

  // Seed the in-memory output cache from existing node.data.outputs so
  // unchanged upstream nodes can hand their cached values to descendants
  // without re-executing.
  const outputsByNode = new Map<string, NodeOutputs>();
  for (const n of nodes) {
    const data = n.data as StudioNodeData<unknown> | undefined;
    if (data?.outputs) outputsByNode.set(n.id, data.outputs);
  }

  const failed = new Set<string>();

  for (const nodeId of sorted) {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");

    const node = nodes.find((n) => n.id === nodeId);
    if (!node || !node.type) continue;
    const spec = getNodeSpec(node.type);
    if (!spec) continue;
    const data = node.data as StudioNodeData<unknown>;

    // Short-circuit if any upstream this run failed: don't execute, don't
    // mark failed (this node itself is fine), but propagate "skipped".
    const upstreamFailed = edges.some(
      (e) => e.target === nodeId && failed.has(e.source),
    );
    if (upstreamFailed) {
      update(nodeId, {
        status: "idle",
        error: "Upstream node failed",
      });
      failed.add(nodeId);
      continue;
    }

    const inputs = gatherInputs(nodeId, edges, outputsByNode);
    const currentHash = spec.hashInputs(data.form, inputs);

    // Cache hit: same form + same upstream → reuse last outputs.
    if (
      data.lastRunHash &&
      data.lastRunHash === currentHash &&
      data.outputs &&
      Object.keys(data.outputs).length > 0
    ) {
      outputsByNode.set(nodeId, data.outputs);
      continue;
    }

    options.onRunningNodeChange?.(nodeId);
    update(nodeId, {
      status: "running",
      error: undefined,
      progress: undefined,
    });

    try {
      const outputs = await spec.execute({
        form: data.form,
        inputs,
        signal,
        onProgress: (msg) => update(nodeId, { progress: msg }),
        onFormUpdate: (patch) =>
          update(nodeId, {
            form: { ...(data.form as Record<string, unknown>), ...(patch as Record<string, unknown>) },
          }),
        projectId: options.projectId,
      });
      outputsByNode.set(nodeId, outputs);
      update(nodeId, {
        status: "succeeded",
        outputs,
        lastRunHash: currentHash,
        progress: undefined,
        error: undefined,
      });
    } catch (err) {
      // User-initiated cancel: bubble out and stop the loop. Don't mark
      // this node as "failed" — Cancel is not an error condition.
      const isAbort =
        signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && /aborted/i.test(err.message));
      if (isAbort) {
        update(nodeId, {
          status: "idle",
          progress: undefined,
          error: undefined,
        });
        options.onRunningNodeChange?.(null);
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      // Clear lastRunHash so the next Run always retries a failed node,
      // even if form + inputs haven't changed since the last success.
      update(nodeId, { status: "failed", error: msg, progress: undefined, lastRunHash: undefined });
      failed.add(nodeId);
    }
  }

  options.onRunningNodeChange?.(null);
}

/**
 * Execute `targetId` plus every ancestor it depends on. Used by the
 * per-node Run button so the user can iterate on a single branch without
 * re-running the entire canvas.
 */
export async function runUpstreamOf(
  targetId: string,
  nodes: Node[],
  edges: Edge[],
  update: RunnerUpdate,
  signal: AbortSignal,
  options: {
    onRunningNodeChange?: (id: string | null) => void;
    projectId?: string;
  } = {},
): Promise<void> {
  // BFS the target's ancestor set
  const wanted = new Set<string>([targetId]);
  const stack = [targetId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of edges) {
      if (e.target === id && !wanted.has(e.source)) {
        wanted.add(e.source);
        stack.push(e.source);
      }
    }
  }
  const subset = nodes.filter((n) => wanted.has(n.id));
  const subEdges = edges.filter(
    (e) => wanted.has(e.source) && wanted.has(e.target),
  );
  await runGraph(subset, subEdges, update, signal, options);
}
