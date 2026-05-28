"use client";

import { memo, useCallback, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type PromptComposerForm = {
  goal: string;
  targetModel: "seedream" | "seedance" | "generic";
  /** Manual image URL — overridden by the `image` input port at run time. */
  imageUrl: string;
  /** Manual video URL — overridden by the `video` input port at run time. */
  videoUrl: string;
  /** AI-generated prompt, user-editable before wiring downstream. */
  composedPrompt: string;
  /** Sampling temperature 0–2. Higher = more creative/varied output. */
  temperature: number;
  /** Max tokens for the Seed 2.0 Pro response. */
  maxTokens: number;
  /** Extra instructions appended to the system prompt. */
  extraInstruction: string;
};

type ComposeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

const TARGET_MODELS = [
  { id: "seedream", label: "Seedream" },
  { id: "seedance", label: "Seedance" },
  { id: "generic", label: "Generic" },
] as const;

const TOKEN_PRESETS = [
  { value: 200, label: "Short · 200" },
  { value: 500, label: "Medium · 500" },
  { value: 1000, label: "Detailed · 1000" },
  { value: 2000, label: "Long · 2000" },
  { value: 4096, label: "Rich · 4096" },
  { value: 8192, label: "Max · 8192" },
];

export const PromptComposerNode = memo(function PromptComposerNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const d = data as StudioNodeData<PromptComposerForm>;
  const [composeState, setComposeState] = useState<ComposeState>({ status: "idle" });
  const [showSettings, setShowSettings] = useState(false);

  const update = useCallback(
    (patch: Partial<PromptComposerForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<PromptComposerForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  // Read current outputs from upstream nodes connected to this node's input ports.
  // Mirrors what the runner passes as `inputs` at execute time.
  const resolvePortInputs = useCallback((): Record<string, string> => {
    const edges = getEdges().filter((e) => e.target === id);
    const nodes = getNodes();
    const result: Record<string, string> = {};
    for (const edge of edges) {
      if (!edge.targetHandle || !edge.sourceHandle) continue;
      const src = nodes.find((n) => n.id === edge.source);
      if (!src) continue;
      const val = (src.data as StudioNodeData<unknown>).outputs?.[edge.sourceHandle];
      if (val) result[edge.targetHandle] = val as string;
    }
    return result;
  }, [id, getNodes, getEdges]);

  const handleCompose = useCallback(async () => {
    const portInputs = resolvePortInputs();
    const goal = d.form.goal.trim();
    const text = portInputs.text ?? "";
    const imageUrl = (portInputs.image || d.form.imageUrl).trim();
    const videoUrl = (portInputs.video || d.form.videoUrl).trim();

    if (!goal && !text && !imageUrl && !videoUrl) {
      setComposeState({ status: "error", message: "Add a goal, text, image, or video to compose." });
      return;
    }

    setComposeState({ status: "loading" });
    try {
      const res = await fetch("/api/compose-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          targetModel: d.form.targetModel,
          text,
          imageUrl,
          videoUrl,
          temperature: d.form.temperature,
          maxTokens: d.form.maxTokens,
          extraInstruction: d.form.extraInstruction,
        }),
      });
      const json = (await res.json()) as { error?: string; prompt?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      update({ composedPrompt: json.prompt ?? "" });
      setComposeState({ status: "idle" });
    } catch (err) {
      setComposeState({
        status: "error",
        message: err instanceof Error ? err.message : "compose failed",
      });
    }
  }, [d.form, resolvePortInputs, update]);

  const hasPrompt = d.form.composedPrompt.length > 0;

  return (
    <NodeShell
      id={id}
      spec={promptComposerSpec}
      data={d}
      selected={selected ?? false}
      width={400}
    >
      {/* ── Target model pills ─────────────────────────────────────── */}
      <div className="flex gap-1">
        {TARGET_MODELS.map(({ id: mid, label }) => (
          <button
            key={mid}
            type="button"
            onClick={() => update({ targetModel: mid, composedPrompt: "" })}
            className={[
              "nodrag flex-1 rounded-[7px] border py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors",
              d.form.targetModel === mid
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-panel text-ink-dim hover:border-accent/60 hover:text-ink",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Goal ───────────────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          Goal
        </span>
        <textarea
          rows={4}
          value={d.form.goal}
          onChange={(e) => update({ goal: e.target.value })}
          placeholder="Describe what you want to generate…"
          className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
      </label>

      {/* ── Image URL ──────────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          Image URL
          <span className="normal-case tracking-normal text-ink-mute">or connect ← port</span>
        </span>
        <input
          type="url"
          value={d.form.imageUrl}
          onChange={(e) => update({ imageUrl: e.target.value })}
          placeholder="https://… or data:image/…"
          className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
      </label>

      {/* ── Video URL ──────────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          Video URL
          <span className="normal-case tracking-normal text-ink-mute">or connect ← port</span>
        </span>
        <input
          type="url"
          value={d.form.videoUrl}
          onChange={(e) => update({ videoUrl: e.target.value })}
          placeholder="https://…"
          className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
      </label>

      {/* ── Model Settings (collapsible) ───────────────────────────── */}
      <div className="rounded-[8px] border border-border bg-panel">
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          className="nodrag flex w-full items-center justify-between px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
        >
          <span>Model Settings</span>
          <span className="text-[10px]">{showSettings ? "▴" : "▾"}</span>
        </button>

        {showSettings && (
          <div className="space-y-2.5 border-t border-border px-2.5 pb-2.5 pt-2">
            {/* Temperature + Max Tokens row */}
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
                  Temperature
                </span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={d.form.temperature}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) update({ temperature: Math.min(2, Math.max(0, v)) });
                  }}
                  className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel-2 px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                />
                <span className="mt-0.5 block font-mono text-[8px] text-ink-mute">
                  0 = precise · 2 = creative
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
                  Max Tokens
                </span>
                <select
                  value={d.form.maxTokens}
                  onChange={(e) => update({ maxTokens: parseInt(e.target.value, 10) })}
                  className="nodrag w-full rounded-[8px] border border-border bg-panel-2 px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
                >
                  {TOKEN_PRESETS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Extra Instruction */}
            <label className="block">
              <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
                Extra Instruction
              </span>
              <textarea
                rows={2}
                value={d.form.extraInstruction}
                onChange={(e) => update({ extraInstruction: e.target.value })}
                placeholder="e.g. Always include warm golden lighting…"
                className="nodrag nowheel w-full resize-none rounded-[8px] border border-border bg-panel-2 px-2 py-1.5 text-[11px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>

      {/* ── Compose button ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => void handleCompose()}
        disabled={composeState.status === "loading"}
        className="nodrag w-full rounded-[8px] border border-accent bg-accent-soft px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-40"
      >
        {composeState.status === "loading" ? "Composing…" : "Compose with Seed 2.0 Pro"}
      </button>

      {/* ── Compose error ──────────────────────────────────────────── */}
      {composeState.status === "error" && (
        <div className="rounded-[8px] border border-[oklch(0.65_0.22_25)]/40 bg-panel px-2 py-1.5 font-mono text-[10px] text-[oklch(0.65_0.22_25)]">
          {composeState.message}
        </div>
      )}

      {/* ── Generated prompt (editable) ────────────────────────────── */}
      {hasPrompt && (
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Generated Prompt · edit before wiring
          </span>
          <textarea
            rows={10}
            value={d.form.composedPrompt}
            onChange={(e) => update({ composedPrompt: e.target.value })}
            className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.5] text-ink transition-colors focus:border-accent focus:outline-none"
          />
        </label>
      )}

      {/* ── Idle hint ──────────────────────────────────────────────── */}
      {composeState.status === "idle" && !hasPrompt && (
        <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-[1.6] text-ink-dim">
          Set a goal → connect context inputs → <span className="text-ink">Compose</span> → edit
          the prompt → <span className="text-ink">Run</span> to emit it downstream.
        </div>
      )}
    </NodeShell>
  );
});

export const promptComposerSpec: NodeTypeSpec<PromptComposerForm> = {
  type: "promptComposer",
  label: "Prompt Composer",
  description:
    "Feed text, images, or video into Seed 2.0 Pro to generate a rich prompt for Seedream or Seedance.",
  inputs: [
    { id: "text", label: "text" },
    { id: "image", label: "image" },
    { id: "video", label: "video" },
    { id: "audio", label: "audio" },
  ],
  outputs: [
    { id: "prompt", label: "prompt" },
    { id: "text", label: "text" },
  ],
  defaults: {
    goal: "",
    targetModel: "seedream",
    imageUrl: "",
    videoUrl: "",
    composedPrompt: "",
    temperature: 0.8,
    maxTokens: 500,
    extraInstruction: "",
  },
  hashInputs: (form, inputs) =>
    `pc2:${form.targetModel}|${form.temperature}|${form.maxTokens}|${form.goal.slice(0, 60)}|${form.extraInstruction.slice(0, 40)}|${form.composedPrompt.slice(0, 80)}|${inputs.text ?? ""}|${inputs.image ?? ""}|${inputs.video ?? ""}`,
  execute: async ({ form, inputs, signal, onProgress }) => {
    const effectiveText = ((inputs.text as string) ?? "").trim();
    const effectiveImageUrl = ((inputs.image as string) || form.imageUrl).trim();
    const effectiveVideoUrl = ((inputs.video as string) || form.videoUrl).trim();

    // User has already composed (and optionally edited) — emit directly.
    if (form.composedPrompt.trim()) {
      return { prompt: form.composedPrompt.trim(), text: form.composedPrompt.trim() };
    }

    // No pre-composed prompt — generate on the fly.
    const goal = form.goal.trim();
    if (!goal && !effectiveText && !effectiveImageUrl && !effectiveVideoUrl) {
      throw new Error("Add a goal, text, image, or video — or use the Compose button first.");
    }

    onProgress?.("Composing prompt with Seed 2.0 Pro…");
    const res = await fetch("/api/compose-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal,
        targetModel: form.targetModel,
        text: effectiveText,
        imageUrl: effectiveImageUrl,
        videoUrl: effectiveVideoUrl,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
        extraInstruction: form.extraInstruction,
      }),
      signal,
    });
    const json = (await res.json()) as { error?: string; prompt?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    const prompt = json.prompt ?? "";
    if (!prompt) throw new Error("No prompt returned from Seed 2.0 Pro");
    return { prompt, text: prompt };
  },
};
