"use client";

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

export type ImageGenForm = {
  model: string;
  size: string;
  /** Stored as string so the input can stay empty (= "let server pick"). */
  seed: string;
};

export const ImageGenNode = memo(function ImageGenNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<ImageGenForm>;

  const update = useCallback(
    (patch: Partial<ImageGenForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<ImageGenForm>;
          return {
            ...n,
            data: { ...prev, form: { ...prev.form, ...patch } },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const url = d.outputs.url;

  return (
    <NodeShell
      id={id}
      spec={imageGenSpec}
      data={d}
      selected={selected ?? false}
    >
      <Field label="Model">
        <select
          value={d.form.model}
          onChange={(e) => update({ model: e.target.value })}
          className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
        >
          {IMAGE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.hint}
            </option>
          ))}
        </select>
      </Field>

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
            placeholder="random"
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
        </Field>
      </div>

      {url && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-panel">
          {/* Plain <img>: BytePlus signed URLs vary by region; using next/image
              would require allowlisting every host. */}
          <img
            src={url}
            alt="generated"
            className="block h-auto w-full"
            draggable={false}
          />
        </div>
      )}
    </NodeShell>
  );
});

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

export const imageGenSpec: NodeTypeSpec<ImageGenForm> = {
  type: "imageGen",
  label: "Image Gen",
  description: "Generate a still via Seedream — i2i when an image is wired.",
  inputs: [
    { id: "prompt", label: "prompt" },
    { id: "image", label: "image" },
  ],
  outputs: [{ id: "url", label: "url" }],
  defaults: {
    model: DEFAULT_IMAGE_MODEL_ID,
    size: DEFAULT_IMAGE_SIZE,
    seed: "",
  },
  hashInputs: (form, inputs) =>
    `i:${form.model}|${form.size}|${form.seed}|${inputs.prompt ?? ""}|${inputs.image ?? ""}`,
  execute: async ({ form, inputs, signal, projectId }) => {
    const prompt = inputs.prompt?.trim();
    if (!prompt) throw new Error("Prompt input is required");

    const body: Record<string, unknown> = {
      prompt,
      model: form.model,
      size: form.size,
    };
    const seedNum = form.seed.trim() ? Number(form.seed) : NaN;
    if (Number.isFinite(seedNum)) body.seed = seedNum;
    // Wired image input → i2i. The /api/image route accepts a string or
    // string[]; this canvas-side node carries one value per input port,
    // so we always send a single string.
    if (inputs.image) body.image = inputs.image;

    const res = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "image generation failed");
    const url: string | undefined = data?.data?.[0]?.url;
    if (!url) throw new Error("No image url in response");
    // Stage as a draft — the user picks which canvas renders graduate
    // into Library via the Drafts band on the Generator page (or, post-
    // §60, the Library page). projectId tags the draft with its source
    // canvas for lineage; the id is a stable URL hash so re-runs upsert.
    stageGeneratedImage({
      url,
      prompt,
      model: form.model,
      size: form.size,
      seed: Number.isFinite(seedNum) ? seedNum : undefined,
      projectId,
    });
    return { url };
  },
};
