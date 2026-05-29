/**
 * Studio Spaces — node graph type primitives.
 *
 * Every node renders the same envelope shape (`StudioNodeData<TForm>`):
 *   - `form`     — user-controlled fields (textarea text, selected model, …)
 *   - `outputs`  — last successful execute() result, indexed by output port id
 *   - `status`   — drives the header status dot + per-node Run button state
 *   - `lastRunHash` — fingerprint of (form + upstream inputs) at last success;
 *                     used by the runner to skip nodes that haven't changed.
 *
 * The envelope keys are deliberately string-typed so the type satisfies
 * React Flow's `Record<string, unknown>` constraint on `Node['data']`.
 */

export type NodeStatus = "idle" | "running" | "succeeded" | "failed";

/** All ports carry strings in v1 (URLs and prompts both). Type the value as
 *  string|undefined so missing/disconnected inputs are explicit. */
export type PortValue = string | undefined;

export type NodeOutputs = Record<string, PortValue>;

/** Node type ids — must stay in sync with `app/studio/nodes/*` and the
 *  `nodeTypes` map in `studio-canvas.tsx`. */
export const NODE_TYPE_IDS = [
  "textPrompt",
  "asset",
  "imageGen",
  "styleTransfer",
  "compare",
  "frameExtract",
  "videoGen",
  "preview",
  "webExtract",
  "promptComposer",
  "longVideo",
  "articleIngester",
  "articleNarration",
] as const;
export type NodeTypeId = (typeof NODE_TYPE_IDS)[number];

/** Index signature lets this generic envelope satisfy React Flow's
 *  `Record<string, unknown>` constraint on `Node['data']`. */
export type StudioNodeData<TForm = Record<string, unknown>> = {
  form: TForm;
  outputs: NodeOutputs;
  lastRunHash?: string;
  status: NodeStatus;
  progress?: string;
  error?: string;
  [key: string]: unknown;
};

export type PortSpec = {
  id: string;
  label: string;
  /** Reserved for v1.5 type-checked edges. Currently unused. */
  required?: boolean;
};

export type ExecuteCtx<TForm> = {
  form: TForm;
  inputs: NodeOutputs;
  signal: AbortSignal;
  onProgress?: (msg: string) => void;
  /** Write fields back into the node's persisted form mid-run. Used by
   *  long-running nodes to checkpoint progress so a failed run can be
   *  resumed rather than restarted from scratch. */
  onFormUpdate?: (patch: Partial<TForm>) => void;
  /** Studio project this run belongs to. Threaded through so node specs
   *  can attach lineage when they auto-save outputs into the Library
   *  (`source: "generated"` records gain a `projectId` link). */
  projectId?: string;
};

/** Static metadata + executor for each node type. Components live in their
 *  own files and are wired to the runtime via the registry. */
export type NodeTypeSpec<TForm = Record<string, unknown>> = {
  type: NodeTypeId;
  label: string;
  description: string;
  inputs: PortSpec[];
  outputs: PortSpec[];
  defaults: TForm;
  /** Stable fingerprint of (form + inputs). Equal hashes ⇒ runner can skip
   *  re-executing this node and reuse cached outputs. Implementations should
   *  include every field that affects the wire request. */
  hashInputs: (form: TForm, inputs: NodeOutputs) => string;
  execute: (ctx: ExecuteCtx<TForm>) => Promise<NodeOutputs>;
};
