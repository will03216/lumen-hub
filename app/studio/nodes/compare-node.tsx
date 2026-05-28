"use client";

/**
 * Compare Node — A/B render the same prompt through two image engines
 * in one canvas step.
 *
 * The /compare page covers session-shaped A/B work where the user wants
 * pinning, history, and a slider lightbox. The node form fits a
 * different use case: A/B is one move inside a longer canvas workflow.
 * For example "render this prompt through 4.5 + Lite, pick the
 * stronger one as input to the next Style Transfer". Both variants
 * auto-save to the Library so the keepers survive even when the
 * Compare node itself is deleted later.
 *
 * Outputs are two distinct URL ports (`urlA`, `urlB`) so downstream
 * nodes can take either side. The node body shows a side-by-side
 * thumbnail strip after a successful run for at-a-glance comparison.
 */

import { memo, useCallback } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import {
  IMAGE_MODELS,
  IMAGE_SIZES,
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_IMAGE_SIZE,
} from "@/lib/studio/models";
import { stageGeneratedImage } from "@/lib/library/auto-save";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type CompareForm = {
  modelA: string;
  modelB: string;
  size: string;
  seed: string;
};

/** Default the two sides to the two distinct image families we ship —
 *  4.5 (highest fidelity, multi-ref) vs 5.0 Lite (fast, balanced).
 *  Same-model on both sides is allowed (lets the user diff seeds with
 *  the same engine) but the default gives a useful pair on first drop. */
const DEFAULT_MODEL_A = "seedream-4-5-251128";
const DEFAULT_MODEL_B = DEFAULT_IMAGE_MODEL_ID;

export const CompareNode = memo(function CompareNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<CompareForm>;

  const update = useCallback(
    (patch: Partial<CompareForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<CompareForm>;
          return {
            ...n,
            data: { ...prev, form: { ...prev.form, ...patch } },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const urlA = d.outputs.urlA;
  const urlB = d.outputs.urlB;

  return (
    <NodeShell
      id={id}
      spec={compareSpec}
      data={d}
      selected={selected ?? false}
      width={340}
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="Model A">
          <select
            value={d.form.modelA}
            onChange={(e) => update({ modelA: e.target.value })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model B">
          <select
            value={d.form.modelB}
            onChange={(e) => update({ modelB: e.target.value })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Size">
          <select
            value={d.form.size}
            onChange={(e) => update({ size: e.target.value })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {IMAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Seed">
          <input
            type="text"
            inputMode="numeric"
            value={d.form.seed}
            onChange={(e) => update({ seed: e.target.value })}
            placeholder="random (shared)"
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
        </Field>
      </div>

      {(urlA || urlB) && (
        <div className="grid grid-cols-2 gap-2">
          <SidePreview label="A" url={urlA} />
          <SidePreview label="B" url={urlB} />
        </div>
      )}
    </NodeShell>
  );
});

function SidePreview({
  label,
  url,
}: {
  label: "A" | "B";
  url: string | undefined;
}) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-border bg-black">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`side ${label}`}
          className="block h-auto w-full"
          draggable={false}
        />
      ) : (
        <div className="grid h-24 place-items-center font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          {label} · awaiting
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
        {label}
      </span>
      {children}
    </label>
  );
}

// ─────────────────────────── Spec ────────────────────────────────────

/** Single image render against one model. Pulled out so the parallel
 *  Promise.all can call it twice without re-shaping the request body
 *  per side. */
async function renderOne(params: {
  prompt: string;
  model: string;
  size: string;
  seed: number | undefined;
  signal: AbortSignal;
}): Promise<string> {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    model: params.model,
    size: params.size,
  };
  if (params.seed !== undefined) body.seed = params.seed;

  const res = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: params.signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "image render failed");
  const url: string | undefined = data?.data?.[0]?.url;
  if (!url) throw new Error("no url in response");
  return url;
}

export const compareSpec: NodeTypeSpec<CompareForm> = {
  type: "compare",
  label: "Compare A/B",
  description:
    "Render the same prompt through two engines in parallel. Both auto-save.",
  inputs: [{ id: "prompt", label: "prompt" }],
  outputs: [
    { id: "urlA", label: "url A" },
    { id: "urlB", label: "url B" },
  ],
  defaults: {
    modelA: DEFAULT_MODEL_A,
    modelB: DEFAULT_MODEL_B,
    size: DEFAULT_IMAGE_SIZE,
    seed: "",
  },
  hashInputs: (form, inputs) =>
    `c:${form.modelA}|${form.modelB}|${form.size}|${form.seed}|${inputs.prompt ?? ""}`,
  execute: async ({ form, inputs, signal, projectId, onProgress }) => {
    const prompt = inputs.prompt?.trim();
    if (!prompt) throw new Error("Prompt input is required");

    // Same seed on both sides when supplied — that's the controlled-
    // variable point of A/B. Empty seed means each side rolls
    // independently (less rigorous, but what users want when exploring).
    const seedNum = form.seed.trim() ? Number(form.seed) : NaN;
    const seed = Number.isFinite(seedNum) ? seedNum : undefined;

    onProgress?.("Rendering both sides…");

    // Promise.all so the longer of the two dictates wall-clock; one
    // side's failure surfaces as a thrown error and aborts via
    // the runner's signal-handling. A future variant could use
    // allSettled to surface a partial result, but for a comparison
    // surface a half-result is misleading.
    const [urlA, urlB] = await Promise.all([
      renderOne({ prompt, model: form.modelA, size: form.size, seed, signal }),
      renderOne({ prompt, model: form.modelB, size: form.size, seed, signal }),
    ]);

    // Stage both as drafts (post-§60). The user picks which side wins
    // via the Drafts band — same idempotent helper Generator uses, so
    // re-runs upsert by URL hash.
    stageGeneratedImage({
      url: urlA,
      prompt,
      model: form.modelA,
      size: form.size,
      seed,
      projectId,
    });
    stageGeneratedImage({
      url: urlB,
      prompt,
      model: form.modelB,
      size: form.size,
      seed,
      projectId,
    });

    return { urlA, urlB };
  },
};
