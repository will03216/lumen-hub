"use client";

import { memo, useCallback, useState } from "react";
import { useReactFlow, useNodes, useEdges, type NodeProps } from "@xyflow/react";
import {
  VIDEO_MODELS,
  VIDEO_RATIOS,
  DEFAULT_VIDEO_MODEL_ID,
  findVideoModel,
} from "@/lib/studio/models";
import { stageGeneratedVideo } from "@/lib/library/auto-save";
import { NodeShell } from "./node-shell";
import { sleepCancellable } from "../util";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type ArticleNarrationForm = {
  model: string;
  resolution: string;
  ratio: string;
  durationEach: number;
  /** Selected context preset key, or "custom". */
  contextPreset: string;
  /** Prepended to every shot prompt — sets overall style, studio look, quality bar. */
  systemPrompt: string;
  /** Clip URLs written after each shot succeeds — allows resuming a partial run. */
  completedClipUrls?: string[];
};

type AssetRef =
  | { kind: "asset"; asset_id: string; type: "image" | "video" }
  | { kind: "url"; url: string; type: "image" | "video" };

function parseAssetRef(raw: string): AssetRef {
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const isVideo = /\.(mp4|webm|mov|avi)(\?|$)/i.test(raw);
    return { kind: "url", url: raw, type: isVideo ? "video" : "image" };
  }
  const pipe = raw.indexOf("|");
  if (pipe !== -1) {
    const suffix = raw.slice(pipe + 1);
    return { kind: "asset", asset_id: raw.slice(0, pipe), type: suffix === "video" ? "video" : "image" };
  }
  return { kind: "asset", asset_id: raw, type: "image" };
}

const POLL_INITIAL_DELAY_MS = 20_000;
const POLL_INTERVAL_MS = 8_000;
const POLL_MAX_TRIES = 80;

const NEWS_SYSTEM_PROMPT =
  "Broadcast news studio. Anchor at desk. Softbox key light, cool-neutral grade, consistent studio lighting throughout.";

const CHEF_SYSTEM_PROMPT =
  "Kitchen set. Chef at wooden workbench. Overhead key light, soft frontal fill, warm amber grade, shallow depth of field.";

const DEFAULT_SYSTEM_PROMPT = NEWS_SYSTEM_PROMPT;

const CONTEXT_PRESETS = [
  { id: "news", label: "News Studio", prompt: NEWS_SYSTEM_PROMPT },
  { id: "chef", label: "Chef / Kitchen", prompt: CHEF_SYSTEM_PROMPT },
  { id: "custom", label: "Custom…", prompt: "" },
] as const;

/** Parse the numbered shot list from Article Ingester:
 *  "1. Wide shot…\n\n2. Close-up…" → ["Wide shot…", "Close-up…"] */
function parseShots(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const numbered = trimmed.split(/\n+(?=\d+[\.\)])/);
  if (numbered.length > 1) {
    return numbered.map((s) => s.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean);
  }
  const paragraphs = trimmed.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;
  return [trimmed];
}

/** Split narration text into N equal portions by sentence. */
function splitNarration(text: string, count: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) ?? [text];
  const portions: string[] = [];
  const perShot = Math.ceil(sentences.length / count);
  for (let i = 0; i < count; i++) {
    const chunk = sentences.slice(i * perShot, (i + 1) * perShot).join("").trim();
    portions.push(chunk);
  }
  return portions;
}

/** Combine visual shot prompt + narration portion into one Seedance prompt. */
function buildShotPrompt(visualPrompt: string, narration: string): string {
  const parts: string[] = [visualPrompt.trim()];
  if (narration.trim()) parts.push(`Audio: "${narration.trim()}"`);
  return parts.join("\n\n");
}

export const ArticleNarrationNode = memo(function ArticleNarrationNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const allNodes = useNodes();
  const allEdges = useEdges();
  const d = data as StudioNodeData<ArticleNarrationForm>;

  const update = useCallback(
    (patch: Partial<ArticleNarrationForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<ArticleNarrationForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  const resolveInput = useCallback(
    (handle: string): string => {
      const values: string[] = [];
      for (const edge of allEdges) {
        if (edge.target !== id || edge.targetHandle !== handle) continue;
        const src = allNodes.find((n) => n.id === edge.source);
        if (!src) continue;
        const val = (src.data as StudioNodeData<unknown>).outputs?.[edge.sourceHandle ?? "default"];
        if (val) values.push(val as string);
      }
      return values.join("\n");
    },
    [id, allNodes, allEdges],
  );

  const [curlCopied, setCurlCopied] = useState<number | null>(null);

  const copyShotCurl = useCallback(
    async (shotIndex: number) => {
      const promptRaw = resolveInput("prompt").trim();
      const narration = resolveInput("narration").trim();
      const shots = parseShots(promptRaw);
      if (!shots[shotIndex]) return;

      const narrationPortions = splitNarration(narration, shots.length);
      const combinedPrompt = buildShotPrompt(
        shots[shotIndex],
        narrationPortions[shotIndex] ?? "",
      );

      const modelCaps = findVideoModel(d.form.model)?.caps;
      const validDurations = modelCaps?.durations ?? [5, 10];
      const durationEach = validDurations.includes(d.form.durationEach)
        ? d.form.durationEach
        : validDurations[validDurations.length - 1];

      const body: Record<string, unknown> = {
        prompt: combinedPrompt,
        model: d.form.model,
        resolution: d.form.resolution,
        duration: durationEach,
        ratio: d.form.ratio,
        audio: true,
      };

      // Asset ID references
      const refsRaw = resolveInput("references").trim();
      if (refsRaw) {
        const assetRefs = refsRaw
          .split("\n").map((r) => r.trim()).filter(Boolean)
          .map(parseAssetRef)
          .filter((r): r is Extract<AssetRef, { kind: "asset" }> => r.kind === "asset")
          .map(({ asset_id, type }) => ({ role: "subject" as const, asset_id, type }));
        if (assetRefs.length > 0) body.references = assetRefs;
      }

      // Reference image URLs
      const refUrlsRaw = resolveInput("referenceUrls").trim();
      if (refUrlsRaw) {
        const urlRefs = refUrlsRaw.split("\n").map((u) => u.trim()).filter(Boolean);
        if (urlRefs.length > 0) {
          body.images = urlRefs.map((url) => ({ url, role: "reference_image" }));
        }
      }

      // Shot 1+ receives the previous clip as reference_video at runtime.
      // That URL is only known during execution, so it is omitted here.

      try {
        const res = await fetch("/api/video/curl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { curl?: string };
        if (!res.ok || !data.curl) return;
        // Append a note for shots after the first so the reader knows
        // reference_video is injected at run time.
        const curl =
          shotIndex > 0
            ? `${data.curl}\n\n# Note: shot ${shotIndex + 1} also receives the previous clip\n# as reference_video at run time (URL unknown until shot ${shotIndex} completes).`
            : data.curl;
        await navigator.clipboard.writeText(curl);
        setCurlCopied(shotIndex);
        setTimeout(() => setCurlCopied(null), 2000);
      } catch {
        // clipboard write may fail in non-secure contexts; silently ignore
      }
    },
    [d.form, resolveInput],
  );

  const caps = findVideoModel(d.form.model)?.caps;
  const liveShots = parseShots(resolveInput("prompt") || "");
  const liveNarration = resolveInput("narration").trim();
  const liveNarrationPortions = liveShots.length > 0 ? splitNarration(liveNarration, liveShots.length) : [];
  const shotCount = liveShots.length || 1;
  const totalSeconds = shotCount * d.form.durationEach;
  const url = d.outputs.url as string | undefined;

  return (
    <NodeShell id={id} spec={articleNarrationSpec} data={d} selected={selected ?? false} width={440}>
      {/* ── Video model ───────────────────────────────────────────── */}
      <Field label="Video Model">
        <select
          value={d.form.model}
          onChange={(e) => {
            const next = e.target.value;
            const cap = findVideoModel(next)?.caps;
            update({
              model: next,
              completedClipUrls: undefined,
              resolution: cap?.resolutions.includes(
                d.form.resolution as "480p" | "720p" | "768p" | "1080p",
              )
                ? d.form.resolution
                : (cap?.resolutions[0] ?? "720p"),
              durationEach: cap?.durations.includes(d.form.durationEach)
                ? d.form.durationEach
                : (cap?.durations[cap.durations.length - 1] ?? 10),
            });
          }}
          className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
        >
          {VIDEO_MODELS.filter((m) => m.id.startsWith("dreamina-seedance-2-")).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.hint}
            </option>
          ))}
        </select>
      </Field>

      {/* ── Resolution / ratio / duration ─────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Resolution">
          <select
            value={d.form.resolution}
            onChange={(e) => update({ resolution: e.target.value })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {(caps?.resolutions ?? ["720p"]).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Ratio">
          <select
            value={d.form.ratio}
            onChange={(e) => update({ ratio: e.target.value })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {VIDEO_RATIOS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Shot Duration">
          <select
            value={String(d.form.durationEach)}
            onChange={(e) =>
              update({ durationEach: Number(e.target.value), completedClipUrls: undefined })
            }
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {(caps?.durations ?? [5, 10]).map((dur) => (
              <option key={dur} value={dur}>{dur}s</option>
            ))}
          </select>
        </Field>
      </div>

      {/* ── Context preset + system prompt ────────────────────────── */}
      <div className="space-y-1.5">
        <Field label="Context · applied to every shot">
          <select
            value={d.form.contextPreset}
            onChange={(e) => {
              const preset = CONTEXT_PRESETS.find((p) => p.id === e.target.value);
              update({
                contextPreset: e.target.value,
                systemPrompt: preset?.id !== "custom" ? (preset?.prompt ?? "") : d.form.systemPrompt,
                completedClipUrls: undefined,
              });
            }}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {CONTEXT_PRESETS.map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </Field>
        {/* Read-only preview for built-in presets */}
        {d.form.contextPreset !== "custom" && d.form.systemPrompt && (
          <div className="rounded-[8px] border border-border bg-panel-2 px-2 py-1.5 font-mono text-[9px] leading-[1.6] text-ink-dim">
            {d.form.systemPrompt}
          </div>
        )}
        {/* Editable textarea for custom */}
        {d.form.contextPreset === "custom" && (
          <textarea
            rows={3}
            value={d.form.systemPrompt}
            onChange={(e) => update({ systemPrompt: e.target.value })}
            placeholder="Describe the visual environment and style for every shot…"
            className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
          />
        )}
      </div>

      {/* ── Summary ───────────────────────────────────────────────── */}
      <div className="rounded-[8px] border border-border bg-panel px-2.5 py-2 font-mono text-[10px] text-ink-dim">
        {shotCount} shot{shotCount !== 1 ? "s" : ""} × {d.form.durationEach}s ={" "}
        <span className="text-ink">{totalSeconds}s video</span>
        {" · "}narration split across shots · native audio via Seedance 2.0
        {d.form.completedClipUrls?.length ? (
          <span className="ml-1 text-accent">
            · {d.form.completedClipUrls.length} clip{d.form.completedClipUrls.length > 1 ? "s" : ""} done
          </span>
        ) : null}
      </div>

      {/* ── Per-shot preview + curl ───────────────────────────────── */}
      {liveShots.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
            Shot prompts · curl to test each
          </span>
          {liveShots.map((shot, i) => {
            const combined = buildShotPrompt(
              shot,
              liveNarrationPortions[i] ?? "",
            );
            return (
              <div key={i} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-ink-dim">
                    Shot {i + 1}
                    {i > 0 && (
                      <span className="ml-1 text-ink-mute">
                        · reference_video from shot {i} added at runtime
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyShotCurl(i)}
                    className="nodrag font-mono text-[9px] text-ink-dim transition-colors hover:text-accent"
                    title={`Copy curl for shot ${i + 1}`}
                  >
                    {curlCopied === i ? "Copied!" : "curl"}
                  </button>
                </div>
                <textarea
                  rows={5}
                  readOnly
                  value={combined}
                  className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel-2 px-2 py-1.5 text-[10px] leading-[1.5] text-ink-dim"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Output video ──────────────────────────────────────────── */}
      {url && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={url} controls playsInline className="block h-auto w-full" />
        </div>
      )}

      {/* ── Idle hint ─────────────────────────────────────────────── */}
      {!url && d.status === "idle" && (
        <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-[1.6] text-ink-dim">
          Connect Article Ingester →{" "}
          <span className="text-ink">prompt</span> +{" "}
          <span className="text-ink">narration</span> →{" "}
          <span className="text-ink">Run</span>. Narration is split across shots and passed to
          Seedance 2.0 native audio.
        </div>
      )}
    </NodeShell>
  );
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
        {label}
      </span>
      {children}
    </label>
  );
}

export const articleNarrationSpec: NodeTypeSpec<ArticleNarrationForm> = {
  type: "articleNarration",
  label: "Article Narration",
  description:
    "Generate a narrated news video: splits anchor script across shots, injects narration into each Seedance 2.0 prompt, enables native audio, stitches into one video.",
  inputs: [
    { id: "prompt", label: "prompt (shots)" },
    { id: "narration", label: "narration (script)" },
    { id: "referenceUrls", label: "reference URLs" },
    { id: "references", label: "asset IDs" },
  ],
  outputs: [{ id: "url", label: "url" }],
  defaults: {
    model: DEFAULT_VIDEO_MODEL_ID,
    resolution: "720p",
    ratio: "16:9",
    durationEach: 10,
    contextPreset: "news",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    completedClipUrls: undefined,
  },
  hashInputs: (form, inputs) =>
    [
      "an2",
      form.model,
      form.resolution,
      form.ratio,
      form.durationEach,
      form.contextPreset,
      form.systemPrompt.slice(0, 80),
      (inputs.prompt ?? "").slice(0, 200),
      (inputs.narration ?? "").slice(0, 200),
      inputs.referenceUrls ?? "",
      inputs.references ?? "",
    ].join("|"),
  execute: async ({ form, inputs, signal, onProgress, onFormUpdate, projectId }) => {
    const promptRaw = (inputs.prompt as string | undefined)?.trim() ?? "";
    const narration = (inputs.narration as string | undefined)?.trim() ?? "";

    if (!promptRaw) throw new Error("Connect the prompt output from Article Ingester.");
    if (!narration) throw new Error("Connect the narration output from Article Ingester.");

    const shots = parseShots(promptRaw);
    if (shots.length === 0) throw new Error("No shots found in the prompt input.");

    const narrationPortions = splitNarration(narration, shots.length);

    const isV2 = form.model.startsWith("dreamina-seedance-2-");
    if (!isV2) throw new Error("Article Narration requires a Seedance 2.0 model.");

    const modelCaps = findVideoModel(form.model)?.caps;
    const validDurations = modelCaps?.durations ?? [5, 10];
    const durationEach = validDurations.includes(form.durationEach)
      ? form.durationEach
      : validDurations[validDurations.length - 1];

    // ── Generate clips sequentially ───────────────────────────────────────────
    const resumeUrls = form.completedClipUrls ?? [];
    const resumeIdx = Math.min(resumeUrls.length, shots.length);
    const clipUrls: string[] = resumeUrls.slice(0, resumeIdx);
    let previousClipUrl: string | undefined = clipUrls[clipUrls.length - 1];

    if (resumeIdx > 0) {
      onProgress?.(`Resuming from shot ${resumeIdx + 1}/${shots.length}…`);
    }

    for (let i = 0; i < shots.length; i++) {
      if (i < resumeIdx) continue;

      onProgress?.(`Generating shot ${i + 1}/${shots.length}…`);

      const combinedPrompt = buildShotPrompt(
        shots[i],
        narrationPortions[i] ?? "",
      );

      const body: Record<string, unknown> = {
        prompt: combinedPrompt,
        model: form.model,
        resolution: form.resolution,
        duration: durationEach,
        ratio: form.ratio,
        audio: true,
      };

      // Asset ID references (e.g. from Web Extract → assetId port)
      const refsRaw = (inputs.references as string | undefined) ?? "";
      if (refsRaw.trim()) {
        const assetRefs = refsRaw
          .split("\n").map((r) => r.trim()).filter(Boolean)
          .map(parseAssetRef)
          .filter((r): r is Extract<AssetRef, { kind: "asset" }> => r.kind === "asset")
          .map(({ asset_id, type }) => ({ role: "subject" as const, asset_id, type }));
        if (assetRefs.length > 0) body.references = assetRefs;
      }

      // Reference image URLs (e.g. from Web Extract → images port)
      const refUrlsRaw = (inputs.referenceUrls as string | undefined) ?? "";
      if (refUrlsRaw.trim()) {
        const urlRefs = refUrlsRaw.split("\n").map((u) => u.trim()).filter(Boolean);
        if (urlRefs.length > 0) {
          body.images = urlRefs.map((url) => ({ url, role: "reference_image" }));
        }
      }

      // Reference-chain for visual continuity between shots
      if (previousClipUrl) {
        body.videos = [{ url: previousClipUrl, role: "reference_video" }];
      }

      const submitRes = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      const submitData = await submitRes.json() as { id?: string; error?: string };
      if (!submitRes.ok) throw new Error(submitData.error ?? `Shot ${i + 1} task creation failed`);
      const taskId = submitData.id;
      if (!taskId) throw new Error(`No task id for shot ${i + 1}`);

      onProgress?.(`Shot ${i + 1}/${shots.length} — waiting for render…`);
      await sleepCancellable(POLL_INITIAL_DELAY_MS, signal);

      let clipUrl: string | undefined;
      for (let tries = 1; tries <= POLL_MAX_TRIES; tries++) {
        const elapsed = Math.round((POLL_INITIAL_DELAY_MS + (tries - 1) * POLL_INTERVAL_MS) / 1000);
        onProgress?.(`Shot ${i + 1}/${shots.length} — rendering… ${elapsed}s`);
        const pollRes = await fetch(
          `/api/video/${taskId}?model=${encodeURIComponent(form.model)}`,
          { signal },
        );
        const pollData = await pollRes.json() as {
          status?: string;
          content?: { video_url?: string };
          error?: { message?: string };
        };
        if (!pollRes.ok) throw new Error("poll failed");
        if (pollData.status === "succeeded") {
          clipUrl = pollData.content?.video_url;
          if (!clipUrl) throw new Error(`Shot ${i + 1} succeeded but returned no URL`);
          break;
        }
        if (pollData.status === "failed") throw new Error(pollData.error?.message ?? `Shot ${i + 1} failed`);
        if (pollData.status === "cancelled") throw new Error(`Shot ${i + 1} cancelled`);
        await sleepCancellable(POLL_INTERVAL_MS, signal);
      }
      if (!clipUrl) throw new Error(`Shot ${i + 1} timed out`);

      stageGeneratedVideo({
        taskId,
        videoUrl: clipUrl,
        prompt: combinedPrompt,
        model: form.model,
        ratio: form.ratio,
        duration: durationEach,
        resolution: form.resolution,
        mode: previousClipUrl ? "i2v" : "t2v",
        projectId,
      });

      clipUrls.push(clipUrl);
      previousClipUrl = clipUrl;
      onFormUpdate?.({ completedClipUrls: [...clipUrls] });
    }

    // ── Stitch all clips ──────────────────────────────────────────────────────
    onProgress?.(`Stitching ${clipUrls.length} clips…`);
    const stitchRes = await fetch("/api/video/stitch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrls: clipUrls }),
      signal,
    });
    const stitchData = await stitchRes.json() as { url?: string; error?: string };
    if (!stitchRes.ok) throw new Error(stitchData.error ?? "stitching failed");
    const url = stitchData.url;
    if (!url) throw new Error("Stitch returned no URL");

    onFormUpdate?.({ completedClipUrls: undefined });
    return { url };
  },
};
