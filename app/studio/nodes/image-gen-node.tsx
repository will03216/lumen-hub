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
import { userKey } from "@/lib/storage-user";
import {
  runCriticLoopGuard,
  isGuarded,
  type QAFields,
  type QAOutputs,
  type ParamOverrides,
} from "./qa-guard";
import { QABadge } from "./qa-result";
import { NodeShell } from "./node-shell";
import type { NodeOutputs, NodeTypeSpec, StudioNodeData } from "../types";

export type ImageGenForm = {
  model: string;
  size: string;
  /** Stored as string so the input can stay empty (= "let server pick"). */
  seed: string;
} & QAFields;

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

      <QABadge outputs={d.outputs} />

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
    qaChecks: [],
    qaMinScore: 0.85,
    regenCap: 0,
  },
  hashInputs: (form, inputs) =>
    `i2:${form.model}|${form.size}|${form.seed}|${(form.qaChecks ?? []).join(",")}|${form.qaMinScore ?? ""}|${form.regenCap ?? 0}|${inputs.prompt ?? ""}|${inputs.image ?? ""}`,
  execute: async ({ form, inputs, signal, onProgress, projectId }) => {
    const basePrompt = inputs.prompt?.trim();
    if (!basePrompt) throw new Error("Prompt input is required");

    const baseSeedNum = form.seed.trim() ? Number(form.seed) : NaN;
    const baseSeed = Number.isFinite(baseSeedNum) ? baseSeedNum : undefined;

    let lastSeed: number | undefined;
    async function generateOnce(
      prompt: string,
      seedValue: number | undefined,
      overrides?: ParamOverrides,
    ): Promise<string> {
      lastSeed = seedValue;
      const body: Record<string, unknown> = {
        prompt,
        model: form.model,
        size: (overrides?.size as string) ?? form.size,
      };
      if (seedValue !== undefined) body.seed = seedValue;
      // Wired image input → i2i. Held constant across regen attempts.
      if (inputs.image) body.image = inputs.image;

      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "image generation failed");
      const u: string | undefined = data?.data?.[0]?.url;
      if (!u) throw new Error("No image url in response");
      return u;
    }

    let url: string;
    let qaOutputs: QAOutputs = {};
    if (isGuarded(form)) {
      let claudeKey: string | undefined;
      try {
        claudeKey = localStorage.getItem(userKey("lumen.forge.claudeKey.v1")) ?? undefined;
      } catch {
        claudeKey = undefined;
      }
      const guarded = await runCriticLoopGuard({
        kind: "image",
        basePrompt,
        qa: form,
        signal,
        onProgress,
        baseSeed,
        mode: "t2v",
        label: basePrompt.slice(0, 48),
        projectId,
        claudeKey,
        generate: generateOnce,
      });
      url = guarded.url;
      qaOutputs = guarded.outputs;
    } else {
      url = await generateOnce(basePrompt, baseSeed);
    }

    // Stage the final accepted still as a draft (lineage via projectId).
    stageGeneratedImage({
      url,
      prompt: basePrompt,
      model: form.model,
      size: form.size,
      seed: lastSeed,
      projectId,
    });

    const out: NodeOutputs = { url, ...qaOutputs };
    return out;
  },
};
