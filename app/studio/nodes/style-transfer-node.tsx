"use client";

/**
 * Style Transfer Node — multi-ref Seedream image generation framed as
 * "take this content, render it in this style".
 *
 * Why a dedicated node when imageGen already accepts a wired image?
 * imageGen's single `image` port handles i2i (one ref). Style transfer
 * is a fundamentally two-ref operation: a *style* reference (palette,
 * texture, mood) and a *content* reference (subject, composition).
 * BytePlus Seedream's multi-ref accepts up to 10 references; passing
 * exactly two with a prompt that names the relationship is the
 * cleanest expression of the intent.
 *
 * The node degrades sensibly: with one ref it acts like a single-ref
 * imageGen, with both it does true style transfer, with none it errors
 * (a pure-prompt render is what the existing imageGen is for).
 */

import { memo, useCallback } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import {
  IMAGE_MODELS,
  IMAGE_SIZES,
  DEFAULT_IMAGE_SIZE,
} from "@/lib/studio/models";
import { stageGeneratedImage } from "@/lib/library/auto-save";
import { NodeShell } from "./node-shell";
import { requestImage } from "@/lib/compare/request-image";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type StyleTransferForm = {
  model: string;
  size: string;
  seed: string;
};

/** Default to Seedream 4.5 — it's the model with the strongest multi-ref
 *  + character-consistency story, which is what style transfer leans on.
 *  5.0 Lite is faster but the multi-ref fidelity is noticeably weaker
 *  for a two-image fusion. */
const DEFAULT_STYLE_MODEL = "seedream-4-5-251128";

export const StyleTransferNode = memo(function StyleTransferNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<StyleTransferForm>;

  const update = useCallback(
    (patch: Partial<StyleTransferForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<StyleTransferForm>;
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
      spec={styleTransferSpec}
      data={d}
      selected={selected ?? false}
      width={320}
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

      <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-snug text-ink-dim">
        Wire <span className="text-ink">style</span> + <span className="text-ink">content</span>
        {" "}image inputs and a prompt that names how to combine them, e.g.
        “the subject of [content] in the palette + brushwork of [style]”.
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

export const styleTransferSpec: NodeTypeSpec<StyleTransferForm> = {
  type: "styleTransfer",
  label: "Style Transfer",
  description:
    "Combine a style reference + a content reference via Seedream multi-ref.",
  inputs: [
    { id: "prompt", label: "prompt" },
    { id: "style", label: "style" },
    { id: "content", label: "content" },
  ],
  outputs: [{ id: "url", label: "url" }],
  defaults: {
    model: DEFAULT_STYLE_MODEL,
    size: DEFAULT_IMAGE_SIZE,
    seed: "",
  },
  hashInputs: (form, inputs) =>
    [
      "st",
      form.model,
      form.size,
      form.seed,
      inputs.prompt ?? "",
      inputs.style ?? "",
      inputs.content ?? "",
    ].join("|"),
  execute: async ({ form, inputs, signal, projectId }) => {
    const prompt = inputs.prompt?.trim();
    if (!prompt) throw new Error("Prompt input is required");

    // Build the references list — at least one image must be wired,
    // otherwise this node degenerates to plain text-to-image (use
    // the regular Image Gen node for that).
    const refs: string[] = [];
    if (inputs.style) refs.push(inputs.style);
    if (inputs.content) refs.push(inputs.content);
    if (refs.length === 0) {
      throw new Error(
        "Wire at least one image input (style, content, or both)",
      );
    }

    // BytePlus accepts a single string or string[] under `image`.
    // The single-string path is faster on the server side; use it when
    // we only have one ref so we don't pay the multi-ref planning cost.
    const image: string | string[] = refs.length === 1 ? refs[0] : refs;

    const body: Record<string, unknown> = {
      prompt,
      model: form.model,
      size: form.size,
      image,
    };
    const seedNum = form.seed.trim() ? Number(form.seed) : NaN;
    if (Number.isFinite(seedNum)) body.seed = seedNum;

    const res = await requestImage(body, signal);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "style transfer failed");
    const url: string | undefined = data?.data?.[0]?.url;
    if (!url) throw new Error("No image url in response");

    // Stage as a draft (post-§60). User commits via the Drafts band.
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
