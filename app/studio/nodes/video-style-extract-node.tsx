"use client";

import { memo, useCallback, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Wand2 } from "lucide-react";
import { NodeShell } from "./node-shell";
import {
  ENHANCED_PROMPT_FIDELITIES,
  type EnhancedPromptFidelity,
} from "@/lib/studio/video-style";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type VideoStyleExtractForm = {
  videoUrl: string;
  productContext: string;
  styleBrief: string;
  enhancedPrompt: string;
  fidelity: EnhancedPromptFidelity;
};

type AnalyzeStyleResponse = {
  styleBrief?: string;
  summary?: string;
  caveats?: string[];
  error?: string;
};

type EnhancePromptResponse = {
  enhancedPrompt?: string;
  error?: string;
};

export const VideoStyleExtractNode = memo(function VideoStyleExtractNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<VideoStyleExtractForm>;
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | undefined>();

  const update = useCallback(
    (patch: Partial<VideoStyleExtractForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<VideoStyleExtractForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  // Write the enhanced prompt both into the editable form field AND the node
  // output port so downstream nodes (video gen) pick it up when they read the
  // `prompt` output. Using setNodes keeps this out of the runner's hash/skip
  // logic — the button is a manual action, not part of execute().
  const writeEnhancedPrompt = useCallback(
    (value: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<VideoStyleExtractForm>;
          return {
            ...n,
            data: {
              ...prev,
              form: { ...prev.form, enhancedPrompt: value },
              outputs: { ...prev.outputs, prompt: value, text: value },
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const handleGenerateEnhanced = useCallback(async () => {
    const styleBrief = d.form.styleBrief.trim();
    const productContext = d.form.productContext.trim();
    if (!styleBrief) {
      setEnhanceError("Run the node first to generate a style brief.");
      return;
    }
    if (!productContext) {
      setEnhanceError("Enter a target product first.");
      return;
    }
    setEnhancing(true);
    setEnhanceError(undefined);
    try {
      const res = await fetch("/api/video/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleBrief, productContext, fidelity: d.form.fidelity }),
      });
      const json = (await res.json()) as EnhancePromptResponse;
      if (!res.ok || !json.enhancedPrompt) {
        throw new Error(json.error ?? "enhanced prompt generation failed");
      }
      writeEnhancedPrompt(json.enhancedPrompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setEnhanceError(message.slice(0, 200));
    } finally {
      setEnhancing(false);
    }
  }, [d.form.styleBrief, d.form.productContext, writeEnhancedPrompt]);

  const caveats = d.outputs.caveats;

  return (
    <NodeShell
      id={id}
      spec={videoStyleExtractSpec}
      data={d}
      selected={selected ?? false}
      width={380}
    >
      <Field label="Video URL">
        <textarea
          rows={2}
          value={d.form.videoUrl}
          onChange={(e) => update({ videoUrl: e.target.value })}
          placeholder="https://www.tiktok.com/@brand/video/..."
          className="nodrag nowheel w-full resize-none rounded-[8px] border border-border bg-panel px-2 py-1.5 font-mono text-[11px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
      </Field>

      <Field label="Style Brief (editable, product-agnostic)">
        <textarea
          rows={7}
          value={d.form.styleBrief}
          onChange={(e) => update({ styleBrief: e.target.value })}
          placeholder="Run the node to extract a product-agnostic style brief from the reference video. Edit freely."
          className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.5] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
      </Field>

      <Field label="Target Product (editable)">
        <input
          value={d.form.productContext}
          onChange={(e) => update({ productContext: e.target.value })}
          placeholder="Brand + product info, e.g. N°7 glossy pink lipstick"
          className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
      </Field>

      {/* ── Generate Enhanced Prompt (manual button, not part of execute) ── */}
      <div className="flex items-end justify-between gap-2">
        <Field label="Rewrite strength">
          <select
            value={d.form.fidelity}
            onChange={(e) => update({ fidelity: e.target.value as EnhancedPromptFidelity })}
            title={ENHANCED_PROMPT_FIDELITIES.find((f) => f.id === d.form.fidelity)?.hint}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
          >
            {ENHANCED_PROMPT_FIDELITIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          onClick={() => void handleGenerateEnhanced()}
          disabled={enhancing}
          title="Combine the style brief with the target product into a Seedance-ready prompt"
          className={[
            "nodrag inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.10em] transition-colors disabled:opacity-40",
            "border-border bg-panel text-ink-dim hover:border-accent/60 hover:text-ink",
          ].join(" ")}
        >
          <Wand2 className="size-3" />
          {enhancing ? "Generating…" : "Generate Enhanced Prompt"}
        </button>
      </div>
      {enhanceError && (
        <div className="rounded-[8px] border border-[oklch(0.72_0.18_70)]/40 bg-panel px-2 py-1.5 font-mono text-[10px] leading-[1.45] text-[oklch(0.78_0.15_70)]">
          {enhanceError}
        </div>
      )}

      <Field label="Enhanced Prompt (editable)">
        <textarea
          rows={9}
          value={d.form.enhancedPrompt}
          onChange={(e) => writeEnhancedPrompt(e.target.value)}
          placeholder="Click “Generate Enhanced Prompt”, or paste your own. Feed this into Video Gen."
          className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[10px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
      </Field>

      {caveats && (
        <div className="rounded-[8px] border border-[oklch(0.72_0.18_70)]/40 bg-panel px-2 py-1.5 font-mono text-[10px] leading-[1.45] text-[oklch(0.78_0.15_70)]">
          {caveats}
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

export const videoStyleExtractSpec: NodeTypeSpec<VideoStyleExtractForm> = {
  type: "videoStyleExtract",
  label: "Video Style Extract",
  description:
    "Analyze a reference video into a product-agnostic style brief, then combine it with your target product into a Seedance enhanced prompt.",
  inputs: [{ id: "prompt", label: "base prompt (optional)" }],
  outputs: [
    { id: "prompt", label: "enhanced prompt" },
    { id: "styleBrief", label: "style brief" },
    { id: "text", label: "text" },
  ],
  defaults: {
    videoUrl: "",
    productContext: "N°7 glossy pink lipstick",
    styleBrief: "",
    enhancedPrompt: "",
    fidelity: "faithful",
  },
  // Only the video URL drives the analysis. Editing the style brief, target
  // product, or enhanced prompt must NOT re-trigger the (expensive) video
  // analysis — those are user-controlled, downstream of the analysis.
  hashInputs: (form) => `vse4:${form.videoUrl}`,
  execute: async ({ form, signal, onProgress, onFormUpdate }) => {
    const videoUrl = form.videoUrl.trim();
    if (!videoUrl) throw new Error("Paste a TikTok or video URL to analyze.");

    onProgress?.("Analyzing video style…");
    const res = await fetch("/api/video/analyze-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl }),
      signal,
    });
    const json = (await res.json()) as AnalyzeStyleResponse;
    if (!res.ok) throw new Error(json.error ?? "video style analysis failed");
    if (!json.styleBrief) {
      throw new Error("No video style brief returned.");
    }

    // Persist the brief back into the editable form so the user can tweak it
    // before generating the enhanced prompt.
    onFormUpdate?.({ styleBrief: json.styleBrief });

    return {
      styleBrief: json.styleBrief,
      text: json.styleBrief,
      caveats: json.caveats?.join("\n"),
    };
  },
};
