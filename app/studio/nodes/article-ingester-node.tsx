"use client";

import { memo, useCallback, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type ArticleIngesterForm = {
  /** Raw article text — overridden by the `text` input port at run time. */
  articleText: string;
  /** Article URL — overridden by the `url` input port at run time. */
  articleUrl: string;
  /** Claude model to use for prompt generation. */
  claudeModel: string;
  /** User's Claude API key — stored in form, sent server-side only. */
  claudeApiKey: string;
  /** Selected system prompt preset key, or "custom". */
  systemPromptPreset: string;
  /** Free-form system prompt used when preset is "custom". */
  customSystemPrompt: string;
  /** Number of shots to generate (1 = single prompt). */
  shotCount: number;
  /** Duration of each shot in seconds. */
  shotDuration: number;
  /** AI-generated visual shot prompts, user-editable before wiring downstream. */
  generatedPrompt: string;
  /** AI-generated anchor narration script, user-editable before wiring downstream. */
  narrationText: string;
};

type IngestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

const CLAUDE_MODELS = [
  { id: "claude-opus-4-7", label: "Opus 4.7" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
] as const;

export const SYSTEM_PROMPT_PRESETS: { id: string; label: string; prompt: string }[] = [
  {
    id: "news",
    label: "News Production",
    prompt:
      "You are a cinematographer for a broadcast news studio. For every shot, describe a news anchor presenting at a studio desk — specify the camera angle (e.g. wide establishing, medium, tight close-up, over-shoulder), camera movement (e.g. slow push-in, subtle pan, static locked-off, gentle dolly), studio environment (modern newsroom backdrop, anchor desk, professional broadcast lighting, softboxes, LED panels, screens displaying graphics), and cinematic qualities (shallow depth of field, color grading, lens focal length). The anchor's energy and body language should reflect the tone of the story. Do NOT describe scenes, events, or locations from the article — only the studio and the anchor delivering the news.",
  },
  {
    id: "chef",
    label: "Chef / Food",
    prompt:
      "You are a director for a cooking show. Write each shot as exactly four short sentences — no labels, no numbered structure, no ALL CAPS, no semicolons joining multiple ideas. Sentence 1: subject (chef's appearance, established in shot 1 and repeated verbatim every shot) + one primary action verb + direct object. Sentence 2: one explicit camera move with start and end framing (e.g. 'La cámara arranca en plano medio y realiza un lento push-in hasta primer plano en los 10 segundos'). Sentence 3: kitchen environment — surface material, 2–3 specific props visible in frame, background depth. Sentence 4: lighting and style — describe light colour and direction in plain words (e.g. 'luz cálida lateral izquierda con relleno frontal suave'), then framing style (e.g. 'programa culinario broadcast, profundidad de campo reducida, grano fino'). Do NOT use post-processing terms like 'grado ámbar' or 'color grade' — describe the light itself. Do NOT use Kelvin values. Output in the same language as the article.",
  },
  {
    id: "generic",
    label: "Generic Visual",
    prompt:
      "You are a creative director who transforms written content into richly detailed visual prompts for AI image and video generation. Given an article or text, extract the most compelling visual concept — a scene, emotion, or narrative moment — and synthesize it into a single vivid prompt. Cover subject, setting, composition, lighting, color palette, mood, and cinematic style. Output ONLY the prompt text — no preamble, no explanation, no quotes.",
  },
  {
    id: "custom",
    label: "Custom…",
    prompt: "",
  },
];

export function buildUserMessage(content: string, shotCount: number, shotDuration: number): string {
  const totalSeconds = shotCount * shotDuration;
  const shotsInstruction =
    shotCount <= 1
      ? `Generate 1 visual shot prompt based on the most compelling aspect of this content.`
      : `Generate exactly ${shotCount} visual shot prompts for a ${totalSeconds}-second video (${shotCount} shots × ${shotDuration}s each). Each prompt describes a single ${shotDuration}-second clip.`;

  return (
    `Here is the article content:\n\n${content}\n\n` +
    `Focus only on the main article text. Ignore ads, video embeds, YouTube links, related articles, author bios, comments, and navigation text.\n\n` +
    `${shotsInstruction}\n\n` +
    `Also write a narration script with exactly ${shotCount} sentences — one per shot. ` +
    `Each sentence must be no longer than ${Math.floor(shotDuration * 1.5)} words to fit within ${shotDuration} seconds of speech. ` +
    `Each sentence must describe what the chef is actively doing in that shot (not quote the article or make general comments about the dish). ` +
    `Natural spoken delivery, present tense.\n\n` +
    `Respond in the same language as the article.\n\n` +
    `Respond with valid JSON only, no markdown fences:\n` +
    `{"shots":["<prompt 1>","<prompt 2>",...],"anchorScript":"<narration>"}`
  );
}

export function resolveSystemPrompt(form: Pick<ArticleIngesterForm, "systemPromptPreset" | "customSystemPrompt">): string {
  if (form.systemPromptPreset === "custom") return form.customSystemPrompt.trim();
  return SYSTEM_PROMPT_PRESETS.find((p) => p.id === form.systemPromptPreset)?.prompt ?? SYSTEM_PROMPT_PRESETS[0].prompt;
}

export const ArticleIngesterNode = memo(function ArticleIngesterNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const d = data as StudioNodeData<ArticleIngesterForm>;
  const [ingestState, setIngestState] = useState<IngestState>({ status: "idle" });
  const [showApiKey, setShowApiKey] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);

  const update = useCallback(
    (patch: Partial<ArticleIngesterForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<ArticleIngesterForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

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

  const handleGenerate = useCallback(async () => {
    const portInputs = resolvePortInputs();
    const articleText = (portInputs.text ?? d.form.articleText).trim();
    const articleUrl = (portInputs.url ?? d.form.articleUrl).trim();

    if (!articleText && !articleUrl) {
      setIngestState({ status: "error", message: "Paste article text or provide a URL to ingest." });
      return;
    }
    if (!d.form.claudeApiKey.trim()) {
      setIngestState({ status: "error", message: "Enter your Claude API key to continue." });
      return;
    }
    const systemPrompt = resolveSystemPrompt(d.form);
    if (!systemPrompt) {
      setIngestState({ status: "error", message: "Enter a custom system prompt or choose a preset." });
      return;
    }

    setIngestState({ status: "loading" });
    try {
      const res = await fetch("/api/article-to-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleText,
          articleUrl,
          claudeModel: d.form.claudeModel,
          claudeApiKey: d.form.claudeApiKey.trim(),
          systemPrompt,
          shotCount: d.form.shotCount,
          shotDuration: d.form.shotDuration,
        }),
      });
      const json = (await res.json()) as { error?: string; prompt?: string; narration?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      update({ generatedPrompt: json.prompt ?? "", narrationText: json.narration ?? "" });
      setIngestState({ status: "idle" });
    } catch (err) {
      setIngestState({
        status: "error",
        message: err instanceof Error ? err.message : "generation failed",
      });
    }
  }, [d.form, resolvePortInputs, update]);

  const copyCurl = useCallback(async () => {
    const portInputs = resolvePortInputs();
    try {
      const res = await fetch("/api/article-to-prompt/curl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleText: (portInputs.text ?? d.form.articleText).trim(),
          articleUrl: (portInputs.url ?? d.form.articleUrl).trim(),
          claudeModel: d.form.claudeModel,
          systemPrompt: resolveSystemPrompt(d.form),
          shotCount: d.form.shotCount,
          shotDuration: d.form.shotDuration,
        }),
      });
      const data = (await res.json()) as { curl?: string };
      if (!res.ok || !data.curl) return;
      await navigator.clipboard.writeText(data.curl);
      setCurlCopied(true);
      setTimeout(() => setCurlCopied(false), 2000);
    } catch {
      // clipboard write may fail in non-secure contexts; silently ignore
    }
  }, [d.form, resolvePortInputs]);

  const hasPrompt = d.form.generatedPrompt.length > 0;
  const hasNarration = d.form.narrationText.length > 0;
  const isCustom = d.form.systemPromptPreset === "custom";
  const activePresetPrompt = isCustom
    ? null
    : SYSTEM_PROMPT_PRESETS.find((p) => p.id === d.form.systemPromptPreset)?.prompt ?? null;

  return (
    <NodeShell
      id={id}
      spec={articleIngesterSpec}
      data={d}
      selected={selected ?? false}
      width={420}
    >
      {/* ── Article URL ────────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          Article URL
          <span className="normal-case tracking-normal text-ink-mute">or connect ← url port</span>
        </span>
        <input
          type="url"
          value={d.form.articleUrl}
          onChange={(e) => update({ articleUrl: e.target.value })}
          placeholder="https://…"
          className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
      </label>

      {/* ── Article text ───────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          Article Text
          <span className="normal-case tracking-normal text-ink-mute">or connect ← text port</span>
        </span>
        <textarea
          rows={6}
          value={d.form.articleText}
          onChange={(e) => update({ articleText: e.target.value })}
          placeholder="Paste the article content here…"
          className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
      </label>

      {/* ── System prompt preset ───────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            System Prompt
          </span>
          <select
            value={d.form.systemPromptPreset}
            onChange={(e) =>
              update({ systemPromptPreset: e.target.value, generatedPrompt: "", narrationText: "" })
            }
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
          >
            {SYSTEM_PROMPT_PRESETS.map(({ id: pid, label }) => (
              <option key={pid} value={pid}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {/* Read-only preview for built-in presets */}
        {activePresetPrompt && (
          <div className="rounded-[8px] border border-border bg-panel-2 px-2 py-1.5 font-mono text-[9px] leading-[1.6] text-ink-dim">
            {activePresetPrompt}
          </div>
        )}

        {/* Editable textarea for custom preset */}
        {isCustom && (
          <textarea
            rows={5}
            value={d.form.customSystemPrompt}
            onChange={(e) => update({ customSystemPrompt: e.target.value })}
            placeholder="You are a… Output ONLY the prompt text."
            className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
          />
        )}
      </div>

      {/* ── Shot count + duration ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Shots
          </span>
          <input
            type="number"
            min={1}
            max={20}
            step={1}
            value={d.form.shotCount}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) update({ shotCount: Math.min(20, Math.max(1, v)), generatedPrompt: "", narrationText: "" });
            }}
            className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
          />
          <span className="mt-0.5 block font-mono text-[8px] text-ink-mute">
            prompts to generate
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Shot Duration
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={60}
              step={1}
              value={d.form.shotDuration}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) update({ shotDuration: Math.min(60, Math.max(1, v)), generatedPrompt: "", narrationText: "" });
              }}
              className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
            />
            <span className="shrink-0 font-mono text-[9px] text-ink-dim">s</span>
          </div>
          <span className="mt-0.5 block font-mono text-[8px] text-ink-mute">
            {d.form.shotCount * d.form.shotDuration}s total
          </span>
        </label>
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

      {/* ── Generate button + curl copy ────────────────────────────── */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={ingestState.status === "loading"}
          className="nodrag flex-1 rounded-[8px] border border-accent bg-accent-soft px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent hover:text-accent-ink disabled:opacity-40"
        >
          {ingestState.status === "loading" ? "Generating…" : "Generate Prompt from Article"}
        </button>
        <button
          type="button"
          onClick={() => void copyCurl()}
          title="Copy curl command for this request (API key replaced with $CLAUDE_API_KEY)"
          className="nodrag shrink-0 rounded-[8px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[10px] text-ink-dim transition-colors hover:border-accent hover:text-accent"
        >
          {curlCopied ? "Copied!" : "curl"}
        </button>
      </div>

      {/* ── Error ─────────────────────────────────────────────────── */}
      {ingestState.status === "error" && (
        <div className="rounded-[8px] border border-[oklch(0.65_0.22_25)]/40 bg-panel px-2 py-1.5 font-mono text-[10px] text-[oklch(0.65_0.22_25)]">
          {ingestState.message}
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
            value={d.form.generatedPrompt}
            onChange={(e) => update({ generatedPrompt: e.target.value })}
            className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.5] text-ink transition-colors focus:border-accent focus:outline-none"
          />
        </label>
      )}

      {/* ── Anchor narration (editable) ────────────────────────────── */}
      {hasNarration && (
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Anchor Narration · edit before wiring
          </span>
          <textarea
            rows={8}
            value={d.form.narrationText}
            onChange={(e) => update({ narrationText: e.target.value })}
            className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.5] text-ink transition-colors focus:border-accent focus:outline-none"
          />
        </label>
      )}

      {/* ── Idle hint ──────────────────────────────────────────────── */}
      {ingestState.status === "idle" && !hasPrompt && (
        <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-[1.6] text-ink-dim">
          Paste article text or a URL → pick a system prompt → enter your API key →{" "}
          <span className="text-ink">Generate</span> → edit the prompt →{" "}
          <span className="text-ink">Run</span> to emit it downstream.
        </div>
      )}
    </NodeShell>
  );
});

export const articleIngesterSpec: NodeTypeSpec<ArticleIngesterForm> = {
  type: "articleIngester",
  label: "Article Ingester",
  description:
    "Ingest raw article text or a URL and use Claude to generate a rich visual prompt for any downstream generation node.",
  inputs: [
    { id: "text", label: "text" },
    { id: "url", label: "url" },
  ],
  outputs: [
    { id: "prompt", label: "prompt" },
    { id: "narration", label: "narration" },
  ],
  defaults: {
    articleText: "",
    articleUrl: "",
    claudeModel: "claude-opus-4-7",
    claudeApiKey: "",
    systemPromptPreset: "news",
    customSystemPrompt: "",
    shotCount: 6,
    shotDuration: 10,
    generatedPrompt: "",
    narrationText: "",
  },
  hashInputs: (form, inputs) =>
    `ai1:${form.claudeModel}|${form.systemPromptPreset}|${form.customSystemPrompt.slice(0, 60)}|${form.shotCount}|${form.shotDuration}|${form.generatedPrompt.slice(0, 80)}|${form.narrationText.slice(0, 80)}|${(inputs.text ?? form.articleText).slice(0, 120)}|${inputs.url ?? form.articleUrl}`,
  execute: async ({ form, inputs, signal, onProgress }) => {
    const articleText = ((inputs.text as string) ?? form.articleText).trim();
    const articleUrl = ((inputs.url as string) ?? form.articleUrl).trim();

    if (form.generatedPrompt.trim()) {
      return {
        prompt: form.generatedPrompt.trim(),
        narration: form.narrationText.trim(),
      };
    }

    if (!articleText && !articleUrl) {
      throw new Error("Add article text or a URL — or use the Generate button first.");
    }
    if (!form.claudeApiKey.trim()) {
      throw new Error("Enter your Claude API key in the node settings.");
    }
    const systemPrompt = resolveSystemPrompt(form);
    if (!systemPrompt) {
      throw new Error("Enter a custom system prompt or choose a preset.");
    }

    onProgress?.(`Generating prompt with ${form.claudeModel}…`);
    const res = await fetch("/api/article-to-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articleText,
        articleUrl,
        claudeModel: form.claudeModel,
        claudeApiKey: form.claudeApiKey.trim(),
        systemPrompt,
        shotCount: form.shotCount,
        shotDuration: form.shotDuration,
      }),
      signal,
    });
    const json = (await res.json()) as { error?: string; prompt?: string; narration?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    const prompt = json.prompt ?? "";
    if (!prompt) throw new Error("No prompt returned from Claude.");
    return { prompt, narration: json.narration ?? "" };
  },
};
