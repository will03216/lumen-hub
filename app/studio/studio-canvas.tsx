"use client";

import "@xyflow/react/dist/style.css";
import "./studio.css";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";

import { TextPromptNode } from "./nodes/text-prompt-node";
import { AssetNode } from "./nodes/asset-node";
import { ImageGenNode } from "./nodes/image-gen-node";
import { StyleTransferNode } from "./nodes/style-transfer-node";
import { CompareNode } from "./nodes/compare-node";
import { FrameExtractNode } from "./nodes/frame-extract-node";
import { VideoGenNode } from "./nodes/video-gen-node";
import { PreviewNode } from "./nodes/preview-node";
import { WebExtractNode } from "./nodes/web-extract-node";
import { PromptComposerNode } from "./nodes/prompt-composer-node";
import { PromptOptimizerNode } from "./nodes/prompt-optimizer-node";
import { LongVideoNode } from "./nodes/long-video-node";
import { ArticleIngesterNode } from "./nodes/article-ingester-node";
import { ArticleNarrationNode } from "./nodes/article-narration-node";
import { MusicOverlayNode } from "./nodes/music-overlay-node";
import { VideoStitchNode } from "./nodes/video-stitch-node";
import { VideoUpscaleNode } from "./nodes/video-upscale-node";
import { UrlInputNode } from "./nodes/url-input-node";
import { getNodeSpec } from "./nodes/registry";
import { NodePalette } from "./node-palette";
import { Toolbar } from "./toolbar";
import { runGraph, runUpstreamOf } from "./runner";
import { saveCanvas, clearCanvas } from "./persistence";
import { RunnerContext } from "./runner-context";
import { getProject, updateProject } from "@/lib/studio/projects";
import type { StudioNodeData } from "./types";

const nodeTypes: NodeTypes = {
  textPrompt: TextPromptNode,
  asset: AssetNode,
  imageGen: ImageGenNode,
  styleTransfer: StyleTransferNode,
  compare: CompareNode,
  frameExtract: FrameExtractNode,
  videoGen: VideoGenNode,
  preview: PreviewNode,
  webExtract: WebExtractNode,
  promptComposer: PromptComposerNode,
  promptOptimizer: PromptOptimizerNode,
  longVideo: LongVideoNode,
  articleIngester: ArticleIngesterNode,
  articleNarration: ArticleNarrationNode,
  musicOverlay: MusicOverlayNode,
  videoStitch: VideoStitchNode,
  videoUpscale: VideoUpscaleNode,
  urlInput: UrlInputNode,
};

/** Build the `data` envelope for a freshly-instantiated node, seeded with
 *  the spec's defaults. Always start in `idle` with no outputs/hash so the
 *  runner treats it as stale on first run. */
function makeDefaultData(type: string): StudioNodeData<unknown> {
  const spec = getNodeSpec(type);
  return {
    form: spec?.defaults ?? {},
    outputs: {},
    status: "idle",
  };
}

type Phase = "missing" | "ready";

/** One-shot lazy hydration of the canvas from the persisted project.
 *
 * Computed inside a `useState` initializer (not a `useEffect`) so we
 * never trigger the cascading-renders lint and the user lands on the
 * fully-populated graph in a single commit. Safe because this component
 * only mounts on the client (see studio-canvas-loader.tsx — `ssr: false`),
 * so calling `getProject` (which touches localStorage) at first-render
 * time is well-defined. */
function hydrate(projectId: string): {
  phase: Phase;
  name: string;
  nodes: Node[];
  edges: Edge[];
} {
  const project = getProject(projectId);
  if (!project) {
    return { phase: "missing", name: "Untitled", nodes: [], edges: [] };
  }
  const nodes = project.canvas.nodes.map<Node>((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    // Re-seed with defaults, then overlay persisted values so that:
    //  - new fields added to a spec after the canvas was saved get their
    //    default rather than landing as `undefined` at execute time.
    //  - user-modified values from the last session are preserved.
    data: {
      ...makeDefaultData(n.type),
      form: {
        ...(getNodeSpec(n.type)?.defaults ?? {}),
        ...(n.data.form ?? {}),
      } as Record<string, unknown>,
      // Restore persisted generation results so videos/images survive reload.
      ...(n.data.outputs ? { outputs: n.data.outputs } : {}),
      ...(n.data.lastRunHash ? { lastRunHash: n.data.lastRunHash } : {}),
      ...(n.data.status ? { status: n.data.status } : {}),
    },
  }));
  const edges = project.canvas.edges.map<Edge>((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
  }));
  return { phase: "ready", name: project.name, nodes, edges };
}

function StudioCanvasInner({ projectId }: { projectId: string }) {
  const [initial] = useState(() => hydrate(projectId));
  const [phase] = useState<Phase>(initial.phase);
  const [name, setName] = useState(initial.name);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [running, setRunning] = useState(false);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Debounced canvas autosave — runs at most once every 500 ms after a
  // change settles. Cleanup on every re-render means we always cancel
  // the previous timer and re-arm with the latest snapshot, mimicking
  // trailing-edge debounce. Bails when the project is missing so a stale
  // URL can't accidentally write back into a non-existent slot.
  useEffect(() => {
    if (phase !== "ready") return;
    const t = setTimeout(() => saveCanvas(projectId, nodes, edges), 500);
    return () => clearTimeout(t);
  }, [projectId, phase, nodes, edges]);

  // ---------- Project name ----------
  // Eager save (no debounce): rename is a discrete action — click → type →
  // blur. The toolbar already commits on blur/Enter, so by the time we
  // land here the user has stopped typing.
  const handleRename = useCallback(
    (next: string) => {
      setName(next);
      updateProject(projectId, { name: next });
    },
    [projectId],
  );

  // ---------- Graph editing ----------
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, animated: false }, eds));
    },
    [setEdges],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<StudioNodeData<unknown>>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? { ...n, data: { ...(n.data as object), ...patch } }
            : n,
        ),
      );
    },
    [setNodes],
  );

  // ---------- Drag-and-drop instantiation ----------
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/lumen-node");
      if (!type || !getNodeSpec(type)) return;
      // screenToFlowPosition translates the drop point into the canvas's
      // pan/zoom-aware coordinate system, so the node lands under the cursor
      // even after the user has zoomed or panned around.
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const id = `${type}-${Math.random().toString(36).slice(2, 9)}`;
      setNodes((nds) =>
        nds.concat({
          id,
          type,
          position,
          data: makeDefaultData(type),
        } as Node),
      );
    },
    [screenToFlowPosition, setNodes],
  );

  // ---------- Runner ----------
  // Each "Run" call snapshots the latest nodes/edges via refs to avoid the
  // closure-captures-stale-state problem (the run can take 90s; the user
  // might edit unrelated nodes mid-run, and we don't want those edits to
  // perturb the in-flight execution).
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const startRun = useCallback(
    async (kind: "all" | "node", nodeId?: string) => {
      if (running) return;
      setRunning(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const opts = {
          onRunningNodeChange: setRunningNodeId,
          // Thread projectId so node specs can attach lineage when they
          // auto-save into the Library.
          projectId,
        };
        if (kind === "all") {
          await runGraph(
            nodesRef.current,
            edgesRef.current,
            updateNode,
            ctrl.signal,
            opts,
          );
        } else if (nodeId) {
          await runUpstreamOf(
            nodeId,
            nodesRef.current,
            edgesRef.current,
            updateNode,
            ctrl.signal,
            opts,
          );
        }
      } catch {
        // Per-node failures are already surfaced in node.data.error by the
        // runner; aborts are intentional. Nothing to do at the canvas level.
      } finally {
        setRunning(false);
        setRunningNodeId(null);
        abortRef.current = null;
      }
    },
    [running, updateNode, projectId],
  );

  const handleRunAll = useCallback(() => {
    void startRun("all");
  }, [startRun]);

  const handleRerunAll = useCallback(() => {
    // Strip cached hashes so the runner treats every node as stale.
    const stripped = nodesRef.current.map((n) => ({
      ...n,
      data: { ...n.data, lastRunHash: undefined },
    }));
    nodesRef.current = stripped;
    setNodes(stripped);
    void startRun("all");
  }, [startRun, setNodes]);
  const handleRunNode = useCallback(
    (id: string) => {
      void startRun("node", id);
    },
    [startRun],
  );
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Cull touching edges first so React Flow never frame-renders an
  // orphaned wire pointing at a node that's about to vanish.
  const handleDeleteNode = useCallback(
    (id: string) => {
      setEdges((eds) =>
        eds.filter((e) => e.source !== id && e.target !== id),
      );
      setNodes((nds) => nds.filter((n) => n.id !== id));
    },
    [setNodes, setEdges],
  );

  const handleClear = useCallback(() => {
    if (running) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Clear the canvas? Saved nodes and wires will be lost.")
    ) {
      return;
    }
    setNodes([]);
    setEdges([]);
    clearCanvas(projectId);
  }, [projectId, running, setNodes, setEdges]);

  if (phase === "missing") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          404 · Project not found
        </span>
        <p className="max-w-md text-[14px] text-ink-dim">
          This canvas is missing or was created in a different browser. Local
          projects live in this device&rsquo;s storage only.
        </p>
        <Link
          href="/studio"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent-ink hover:opacity-95"
        >
          ← Back to My Studio
        </Link>
      </div>
    );
  }

  return (
    <RunnerContext.Provider
      value={{
        runNode: handleRunNode,
        cancel: handleCancel,
        running,
        runningNodeId,
        deleteNode: handleDeleteNode,
      }}
    >
      <div className="flex h-full w-full">
        <NodePalette />
        <div className="flex flex-1 flex-col">
          <Toolbar
            projectName={name}
            onRename={handleRename}
            nodeCount={nodes.length}
            edgeCount={edges.length}
            running={running}
            runningNodeId={runningNodeId}
            onRunAll={handleRunAll}
            onRerunAll={handleRerunAll}
            onCancel={handleCancel}
            onClear={handleClear}
          />
          <div
            ref={wrapperRef}
            className="studio-canvas relative flex-1"
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.25}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ animated: false }}
              // Both keys delete the selected node(s) and edges. Inputs
              // and textareas inside nodes still capture the key locally
              // (they have their own focus), so this only fires when the
              // canvas itself or a node card is the active element.
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background gap={32} size={1} color="rgba(242,240,232,0.06)" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                maskColor="rgba(5,5,10,0.85)"
                nodeColor={() => "var(--accent)"}
                nodeStrokeColor={() => "var(--accent)"}
              />
            </ReactFlow>
          </div>
        </div>
      </div>
    </RunnerContext.Provider>
  );
}

export default function StudioCanvas({ projectId }: { projectId: string }) {
  return (
    <ReactFlowProvider>
      <StudioCanvasInner projectId={projectId} />
    </ReactFlowProvider>
  );
}
