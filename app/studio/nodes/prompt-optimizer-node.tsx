"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useEdges, useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type PromptOptimizerForm = {
  /** Raw prompt to optimize — overridden by the `text` input port at run time. */
  rawPrompt: string;
  /** Generation mode the optimized prompt targets. */
  mode: string;
  /** Number of shots: 1 = single-paragraph prompt, 2–3 = `Shot N:` grammar. */
  shotCount: number;
  /** Claude model to use for optimization. */
  claudeModel: string;
  /** User's Claude API key — stored in form, sent server-side only. */
  claudeApiKey: string;
  /** Selected system prompt preset key, or "custom". */
  systemPromptPreset: string;
  /** Free-form system prompt used when preset is "custom". */
  customSystemPrompt: string;
  /** Output language key: "match" | "en" | "es" | "fr" | "zh" | "custom". */
  outputLanguage: string;
  /** Free-form language instruction used when outputLanguage is "custom". */
  customOutputLanguage: string;
  /** AI-optimized prompt, user-editable before wiring downstream. */
  optimizedPrompt: string;
  /** Duration (seconds) computed by the optimizer via duration-calculus; 0 = unset. */
  recommendedDuration: number;
};

/** Count non-empty lines in a newline-joined multi-edge port value. */
function countRefs(joined: string | undefined): number {
  if (!joined) return 0;
  return joined.split("\n").map((s) => s.trim()).filter(Boolean).length;
}

type OptimizeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

const CLAUDE_MODELS = [
  { id: "claude-opus-4-7", label: "Opus 4.7" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
] as const;

const MODE_OPTIONS = [
  { id: "t2v", label: "Text → Video (T2V)" },
  { id: "i2v", label: "Image → Video (I2V)" },
  { id: "r2v", label: "Motion transfer (R2V)" },
  { id: "v2v", label: "Face swap (V2V)" },
] as const;

/**
 * The Seedance optimizer system prompt is a faithful, condensed encoding of the
 * bundled Claude skill's prompt-optimization pipeline
 * (claude_skill/references/prompt-guidance.md + prompt-prose-craft.md): the
 * 6-component formula, the anti-slop pass, the prose-craft rules, the `Shot N:`
 * multi-shot grammar, and the integrity check. Edit here to retune behavior.
 */
const SEEDANCE_OPTIMIZER_PROMPT = [
  "You are a Seedance 2.0 prompt optimizer. You rewrite a raw idea into one dense, render-reliable video prompt. The optimizer is a scalpel, not a blender: keep the user's intent, amplitude, and any concrete specs — only fix what is vague or unsafe.",
  "",
  "THE 6-COMPONENT FORMULA — order matters; Seedance honors the earliest strong instruction. Assemble in this order:",
  "Subject → Action → Environment → Camera → Lighting → Style → Constraints.",
  "1. Subject: who/what, singular if possible (age, clothing, material, identity).",
  "2. Action: ONE present-tense verb kept as a verb, one physical movement. If the subject IS an action (latte art = pouring, stir-fry = tossing), render it being performed, never as a finished product.",
  "3. Environment: location + 1–2 renderable atmospheric elements (drifting steam, dust motes, passersby).",
  "4. Camera: shot size + ONE move + angle/lens cue. One primary move only.",
  "5. Lighting: a NAMED source — the single highest-leverage quality lever. Never skip it.",
  "6. Style: one concrete visual anchor + 1–2 modifiers.",
  "7. Constraints (last): negatives, tempo, consistency, written inline.",
  "",
  "FRONT-LOADING: the first clause is always a concrete noun doing a concrete verb in a concrete place. Never open with style keywords, meta-instructions ('Generate a video where…'), or negatives.",
  "",
  "ANTI-SLOP PASS — delete every vague mood word: cinematic (alone), epic, beautiful, stunning, amazing, masterpiece, 8K ultra-real, fast/dynamic (unqualified), 'lots of movement'. Replace emotion adjectives (sad, emotional, happy expression) with physical behavior (brows pull in, jaw tightens, two tears spill). Anti-slop trades vague intensity for CONCRETE intensity — it does not turn the energy down. If the user asked for big/intense, keep it big and make it physical.",
  "KEEP (these are signal, not slop): film stock (Kodak Vision3 250D), focal length + aperture (50mm anamorphic, T2.8), named light (magic-hour rim light from camera-back), director color refs (Wong Kar-wai color), concrete atmosphere (dust motes in the beam, heat shimmer). NEVER keep camera brand names (ARRI, RED, Sony) — drop them; stock + focal length + aperture are fine.",
  "",
  "PROSE-CRAFT PASS:",
  "- Verb physics: replace generic verbs with verbs encoding weight/speed/resistance + one consequence clause ('trudges through wet sand, each boot sinking and pulling free').",
  "- Temporal markers: for any shot with progression use 'at the start… then… by the end…'.",
  "- Sensory compression: material + condition + light interaction in one clause, not separate sentences.",
  "- Present tense only. No negation — rewrite negatives as positives ('clean wall', not 'no text on the wall'). Break nested who/which/that chains into short declarative sentences.",
  "- Pair every named material with one imperfection + its light interaction.",
  "",
  "MULTI-SHOT: for 2–3 shots use the `Shot N:` grammar — a shared technical preamble (film stock, lens, color grade, lighting, atmosphere), an identity sentence, then `Shot 1 (≈Xs): [shot size + one move] — [one action]. [this shot's sound].` ≈4–6s per shot, max 3 shots. End each shot sentence on its completed beat. Never use JSON or bullet lists. For an unbroken take, say 'single continuous take, no cuts'.",
  "",
  "REFERENCES: if the idea names reference assets, tag each inline as [image1], [image2], [video1], [audio1] (1-indexed) next to the entity it describes — placed adjacent to the noun, not floating at the end.",
  "",
  "LENGTH TARGETS: single simple shot 50–80 words; single layered 80–120; multi-shot 200–350 (preamble ≤120, each shot ≤40). Past 150 words a single-paragraph prompt averages out — stay dense.",
  "",
  "SAFETY: no real public figures, named IP, or branded music — rewrite only the offending span to an original description, not the whole prompt.",
  "",
  "INTEGRITY CHECK before you answer: one primary camera move + one action verb (per shot); lighting named; no banned mood words or bare emotion adjectives; no camera brand names; no conflicting style/motion; style has a concrete anchor; present tense; negatives rewritten positive.",
  "",
  "OUTPUT ONLY the optimized prompt text — no preamble, no explanation, no quotes, no markdown fences, no JSON.",
].join("\n");

export const SYSTEM_PROMPT_PRESETS: { id: string; label: string; prompt: string }[] = [
  {
    id: "seedance",
    label: "Seedance Optimizer",
    prompt: SEEDANCE_OPTIMIZER_PROMPT,
  },
  {
    id: "custom",
    label: "Custom…",
    prompt: "",
  },
];

export const LANGUAGE_OPTIONS = [
  { id: "match", label: "Match input" },
  { id: "en", label: "English" },
  { id: "zh", label: "Chinese" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "custom", label: "Custom…" },
] as const;

/**
 * The base directive. Language is NOT appended here — the route adds it to the
 * user message, keeping this base static so it caches cleanly alongside the
 * server-injected reference docs.
 */
export function resolveSystemPrompt(
  form: Pick<PromptOptimizerForm, "systemPromptPreset" | "customSystemPrompt">,
): string {
  return form.systemPromptPreset === "custom"
    ? form.customSystemPrompt.trim()
    : (SYSTEM_PROMPT_PRESETS.find((p) => p.id === form.systemPromptPreset)?.prompt ?? SYSTEM_PROMPT_PRESETS[0].prompt);
}

export const PromptOptimizerNode = memo(function PromptOptimizerNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const allEdges = useEdges();
  const d = data as StudioNodeData<PromptOptimizerForm>;
  const [optimizeState, setOptimizeState] = useState<OptimizeState>({ status: "idle" });
  const [showApiKey, setShowApiKey] = useState(false);

  // Reactive list of wired reference ports, for the tag-preview indicator.
  const wiredRefs = useMemo(() => {
    const handles = new Set(
      allEdges
        .filter((e) => e.target === id && e.targetHandle)
        .map((e) => e.targetHandle as string),
    );
    const parts: string[] = [];
    if (handles.has("image")) parts.push("[image] subject");
    if (handles.has("refImages")) parts.push("[image] refs");
    if (handles.has("refVideo")) parts.push("[video]");
    if (handles.has("refAudio")) parts.push("[audio]");
    return parts;
  }, [allEdges, id]);

  const update = useCallback(
    (patch: Partial<PromptOptimizerForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<PromptOptimizerForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  // Multiple edges into the same handle are joined with "\n" — matches the
  // runner's gatherInputs() so the Generate button and Run behave identically.
  const resolvePortInputs = useCallback((): Record<string, string> => {
    const edges = getEdges().filter((e) => e.target === id);
    const nodes = getNodes();
    const collected: Record<string, string[]> = {};
    for (const edge of edges) {
      if (!edge.targetHandle || !edge.sourceHandle) continue;
      const src = nodes.find((n) => n.id === edge.source);
      if (!src) continue;
      const val = (src.data as StudioNodeData<unknown>).outputs?.[edge.sourceHandle];
      if (val) (collected[edge.targetHandle] ??= []).push(val as string);
    }
    const result: Record<string, string> = {};
    for (const [port, vals] of Object.entries(collected)) result[port] = vals.join("\n");
    return result;
  }, [id, getNodes, getEdges]);

  const handleGenerate = useCallback(async () => {
    const portInputs = resolvePortInputs();
    const rawPrompt = (portInputs.text ?? d.form.rawPrompt).trim();

    if (!rawPrompt) {
      setOptimizeState({ status: "error", message: "Type a raw prompt or connect the ← text port." });
      return;
    }
    if (!d.form.claudeApiKey.trim()) {
      setOptimizeState({ status: "error", message: "Enter your Claude API key to continue." });
      return;
    }
    const systemPrompt = resolveSystemPrompt(d.form);
    if (!systemPrompt) {
      setOptimizeState({ status: "error", message: "Enter a custom system prompt or choose a preset." });
      return;
    }

    const references = {
      subjectImages: countRefs(portInputs.image),
      refImages: countRefs(portInputs.refImages),
      videos: countRefs(portInputs.refVideo),
      audios: countRefs(portInputs.refAudio),
    };

    setOptimizeState({ status: "loading" });
    try {
      const res = await fetch("/api/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawPrompt,
          mode: d.form.mode,
          shotCount: d.form.shotCount,
          claudeModel: d.form.claudeModel,
          claudeApiKey: d.form.claudeApiKey.trim(),
          systemPrompt,
          useSkillDocs: d.form.systemPromptPreset === "seedance",
          references,
          outputLanguage: d.form.outputLanguage,
          customOutputLanguage: d.form.customOutputLanguage,
        }),
      });
      const json = (await res.json()) as { error?: string; prompt?: string; duration?: number | null };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      update({ optimizedPrompt: json.prompt ?? "", recommendedDuration: json.duration ?? 0 });
      setOptimizeState({ status: "idle" });
    } catch (err) {
      setOptimizeState({
        status: "error",
        message: err instanceof Error ? err.message : "optimization failed",
      });
    }
  }, [d.form, resolvePortInputs, update]);

  const hasPrompt = d.form.optimizedPrompt.length > 0;
  const isCustom = d.form.systemPromptPreset === "custom";
  const isCustomLang = d.form.outputLanguage === "custom";
  const activePresetPrompt = isCustom
    ? null
    : SYSTEM_PROMPT_PRESETS.find((p) => p.id === d.form.systemPromptPreset)?.prompt ?? null;

  return (
    <NodeShell
      id={id}
      spec={promptOptimizerSpec}
      data={d}
      selected={selected ?? false}
      width={420}
    >
      {/* ── Raw prompt ─────────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          Raw Prompt
          <span className="normal-case tracking-normal text-ink-mute">or connect ← text port</span>
        </span>
        <textarea
          rows={5}
          value={d.form.rawPrompt}
          onChange={(e) => update({ rawPrompt: e.target.value })}
          placeholder="cool skateboard video, cinematic, fast, epic tricks…"
          className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
      </label>

      {/* ── Reference ports indicator ──────────────────────────────── */}
      {wiredRefs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[8px] border border-border bg-panel-2 px-2 py-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
            Refs · tagged inline
          </span>
          {wiredRefs.map((r) => (
            <span
              key={r}
              className="rounded-full border border-border bg-panel px-1.5 py-0.5 font-mono text-[9px] text-ink-dim"
            >
              {r}
            </span>
          ))}
        </div>
      )}

      {/* ── System prompt preset ───────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Optimizer Preset
          </span>
          <select
            value={d.form.systemPromptPreset}
            onChange={(e) => update({ systemPromptPreset: e.target.value, optimizedPrompt: "" })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
          >
            {SYSTEM_PROMPT_PRESETS.map(({ id: pid, label }) => (
              <option key={pid} value={pid}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {/* Read-only preview for the built-in Seedance preset */}
        {activePresetPrompt && (
          <details className="rounded-[8px] border border-border bg-panel-2 px-2 py-1.5">
            <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
              Seedance best-practice rules · preview
            </summary>
            <div className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[9px] leading-[1.6] text-ink-dim nowheel">
              {activePresetPrompt}
            </div>
            <p className="mt-1.5 border-t border-border pt-1.5 font-mono text-[8px] leading-[1.5] text-ink-mute">
              Grounded server-side in the bundled skill&apos;s reference docs (6-component,
              prose-craft, duration-calculus, shot-design, + genre/character/audio docs
              matched to your brief), with extended thinking.
            </p>
          </details>
        )}

        {/* Editable textarea for custom preset */}
        {isCustom && (
          <textarea
            rows={6}
            value={d.form.customSystemPrompt}
            onChange={(e) => update({ customSystemPrompt: e.target.value })}
            placeholder="You are a prompt optimizer… Output ONLY the optimized prompt text."
            className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
          />
        )}
      </div>

      {/* ── Mode + shots ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Mode
          </span>
          <select
            value={d.form.mode}
            onChange={(e) => update({ mode: e.target.value, optimizedPrompt: "" })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
          >
            {MODE_OPTIONS.map(({ id: mid, label }) => (
              <option key={mid} value={mid}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Shots
          </span>
          <input
            type="number"
            min={1}
            max={3}
            step={1}
            value={d.form.shotCount}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) update({ shotCount: Math.min(3, Math.max(1, v)), optimizedPrompt: "" });
            }}
            className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
          />
          <span className="mt-0.5 block font-mono text-[8px] text-ink-mute">
            1 = single paragraph · 2–3 = Shot N:
          </span>
        </label>
      </div>

      {/* ── Output language ───────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Output Language
          </span>
          <select
            value={d.form.outputLanguage}
            onChange={(e) => update({ outputLanguage: e.target.value, optimizedPrompt: "" })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
          >
            {LANGUAGE_OPTIONS.map(({ id: lid, label }) => (
              <option key={lid} value={lid}>{label}</option>
            ))}
          </select>
        </label>
        {isCustomLang && (
          <input
            type="text"
            value={d.form.customOutputLanguage}
            onChange={(e) => update({ customOutputLanguage: e.target.value, optimizedPrompt: "" })}
            placeholder="e.g. Write the optimized prompt in Japanese."
            className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
          />
        )}
      </div>

      {/* ── Claude model + API key ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Claude Model
          </span>
          <select
            value={d.form.claudeModel}
            onChange={(e) => update({ claudeModel: e.target.value })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
          >
            {CLAUDE_MODELS.map(({ id: mid, label }) => (
              <option key={mid} value={mid}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            API Key
            <button
              type="button"
              onClick={() => setShowApiKey((s) => !s)}
              className="nodrag normal-case tracking-normal text-ink-mute hover:text-ink"
            >
              {showApiKey ? "hide" : "show"}
            </button>
          </span>
          <input
            type={showApiKey ? "text" : "password"}
            value={d.form.claudeApiKey}
            onChange={(e) => update({ claudeApiKey: e.target.value })}
            placeholder="sk-ant-…"
            className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel px-2 py-1 font-mono text-[11px] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      {/* ── Generate button ────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={optimizeState.status === "loading"}
        className="nodrag w-full rounded-[8px] border border-accent bg-accent-soft px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-40"
      >
        {optimizeState.status === "loading" ? "Optimizing…" : "Optimize Prompt"}
      </button>

      {/* ── Error ─────────────────────────────────────────────────── */}
      {optimizeState.status === "error" && (
        <div className="rounded-[8px] border border-[oklch(0.65_0.22_25)]/40 bg-panel px-2 py-1.5 font-mono text-[10px] text-[oklch(0.65_0.22_25)]">
          {optimizeState.message}
        </div>
      )}

      {/* ── Optimized prompt (editable) ────────────────────────────── */}
      {hasPrompt && (
        <label className="block">
          <span className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Optimized Prompt · edit before wiring
            {d.form.recommendedDuration > 0 && (
              <span
                className="normal-case tracking-normal text-accent"
                title="Computed via the skill's duration-calculus — set Video Gen's duration to match"
              >
                ⏱ {d.form.recommendedDuration}s recommended
              </span>
            )}
          </span>
          <textarea
            rows={10}
            value={d.form.optimizedPrompt}
            onChange={(e) => update({ optimizedPrompt: e.target.value })}
            className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.5] text-ink transition-colors focus:border-accent focus:outline-none"
          />
        </label>
      )}

      {/* ── Idle hint ──────────────────────────────────────────────── */}
      {optimizeState.status === "idle" && !hasPrompt && (
        <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-[1.6] text-ink-dim">
          Type a raw prompt or wire ← text → pick mode + shots → enter your API key →{" "}
          <span className="text-ink">Optimize</span> → edit →{" "}
          <span className="text-ink">Run</span> to emit it downstream.
        </div>
      )}
    </NodeShell>
  );
});

/** Reference inputs are passed straight through on matching output ports so a
 *  single Asset → Optimizer → Video Gen chain keeps the prompt's [imageN] tags
 *  aligned with the assets the downstream node actually receives. */
function passthroughRefs(inputs: Record<string, unknown>): Record<string, string | undefined> {
  return {
    image: (inputs.image as string) || undefined,
    refImages: (inputs.refImages as string) || undefined,
    refVideo: (inputs.refVideo as string) || undefined,
    refAudio: (inputs.refAudio as string) || undefined,
  };
}

export const promptOptimizerSpec: NodeTypeSpec<PromptOptimizerForm> = {
  type: "promptOptimizer",
  label: "Prompt Optimizer",
  description:
    "Rewrite a raw idea into a dense, render-reliable Seedance prompt using the bundled skill's 6-component + anti-slop + prose-craft pipeline (via Claude). Wire reference assets to tag them inline as [imageN]/[videoN]/[audioN]; they pass through in order.",
  inputs: [
    { id: "text", label: "text" },
    { id: "image", label: "subject img" },
    { id: "refImages", label: "ref images" },
    { id: "refVideo", label: "ref video" },
    { id: "refAudio", label: "ref audio" },
  ],
  outputs: [
    { id: "prompt", label: "prompt" },
    { id: "image", label: "subject img" },
    { id: "refImages", label: "ref images" },
    { id: "refVideo", label: "ref video" },
    { id: "refAudio", label: "ref audio" },
  ],
  defaults: {
    rawPrompt: "",
    mode: "t2v",
    shotCount: 1,
    claudeModel: "claude-opus-4-7",
    claudeApiKey: "",
    systemPromptPreset: "seedance",
    customSystemPrompt: "",
    outputLanguage: "match",
    customOutputLanguage: "",
    optimizedPrompt: "",
    recommendedDuration: 0,
  },
  hashInputs: (form, inputs) =>
    `po2:${form.claudeModel}|${form.systemPromptPreset}|${form.customSystemPrompt.slice(0, 60)}|${form.mode}|${form.shotCount}|${form.outputLanguage ?? "match"}|${(form.customOutputLanguage ?? "").slice(0, 40)}|${form.optimizedPrompt.slice(0, 80)}|${(inputs.text ?? form.rawPrompt).slice(0, 160)}|i${countRefs(inputs.image as string)}|r${countRefs(inputs.refImages as string)}|v${countRefs(inputs.refVideo as string)}|a${countRefs(inputs.refAudio as string)}`,
  execute: async ({ form, inputs, signal, onProgress, onFormUpdate }) => {
    const rawPrompt = ((inputs.text as string) ?? form.rawPrompt).trim();
    const passthrough = passthroughRefs(inputs);

    // Edited / already-generated prompt short-circuits the LLM call, but still
    // forwards the reference assets so downstream binding stays intact.
    if (form.optimizedPrompt.trim()) {
      return { prompt: form.optimizedPrompt.trim(), ...passthrough };
    }

    if (!rawPrompt) {
      throw new Error("Add a raw prompt or connect the text port — or use the Optimize button first.");
    }
    if (!form.claudeApiKey.trim()) {
      throw new Error("Enter your Claude API key in the node settings.");
    }
    const systemPrompt = resolveSystemPrompt(form);
    if (!systemPrompt) {
      throw new Error("Enter a custom system prompt or choose a preset.");
    }

    const references = {
      subjectImages: countRefs(inputs.image as string),
      refImages: countRefs(inputs.refImages as string),
      videos: countRefs(inputs.refVideo as string),
      audios: countRefs(inputs.refAudio as string),
    };

    onProgress?.(`Optimizing prompt with ${form.claudeModel}…`);
    const res = await fetch("/api/optimize-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawPrompt,
        mode: form.mode,
        shotCount: form.shotCount,
        claudeModel: form.claudeModel,
        claudeApiKey: form.claudeApiKey.trim(),
        systemPrompt,
        useSkillDocs: form.systemPromptPreset === "seedance",
        references,
        outputLanguage: form.outputLanguage,
        customOutputLanguage: form.customOutputLanguage,
      }),
      signal,
    });
    const json = (await res.json()) as { error?: string; prompt?: string; duration?: number | null };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    const prompt = json.prompt ?? "";
    if (!prompt) throw new Error("No optimized prompt returned from Claude.");
    // Persist the optimized prompt + duration so re-runs short-circuit and the
    // recommended duration shows in the node.
    onFormUpdate?.({ optimizedPrompt: prompt, recommendedDuration: json.duration ?? 0 });
    return { prompt, ...passthrough };
  },
};
