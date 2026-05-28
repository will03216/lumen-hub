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

export type LongVideoForm = {
  model: string;
  resolution: string;
  durationEach: number;
  ratio: string;
  shotCount: number;
  audio: boolean;
  /** Pre-planned shot prompts. When set, execute() skips the planning API call. */
  plannedShots?: string[];
  /** Descriptive titles parallel to plannedShots (e.g. "Intro & Ingredients"). */
  plannedShotTitles?: string[];
  /** Clip URLs written by execute() after each shot succeeds. Allows resuming a
   *  partially-completed run without regenerating already-finished clips. */
  completedClipUrls?: string[];
};

type PlanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200;

export const LongVideoNode = memo(function LongVideoNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const allNodes = useNodes();
  const allEdges = useEdges();
  const d = data as StudioNodeData<LongVideoForm>;
  const [planState, setPlanState] = useState<PlanState>({ status: "idle" });

  const update = useCallback(
    (patch: Partial<LongVideoForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<LongVideoForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  const updateShot = useCallback(
    (index: number, value: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<LongVideoForm>;
          const shots = [...(prev.form.plannedShots ?? [])];
          shots[index] = value;
          return { ...n, data: { ...prev, form: { ...prev.form, plannedShots: shots } } };
        }),
      );
    },
    [id, setNodes],
  );

  // Resolve a wire value from the upstream node connected to a given input handle.
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

  const handlePlan = useCallback(async () => {
    const concept = resolveInput("prompt").trim();
    if (!concept) {
      setPlanState({ status: "error", message: "Connect a prompt input first" });
      return;
    }

    // Count reference assets so the planner can write correct inline refs
    const referenceRaw = resolveInput("references");
    const referenceUrlsRaw = resolveInput("referenceUrls");
    const referenceImageCount =
      (referenceRaw ? referenceRaw.split("\n").filter(Boolean).length : 0) +
      (referenceUrlsRaw ? referenceUrlsRaw.split("\n").filter(Boolean).length : 0);
    const hasFirstFrame = !!resolveInput("image").trim();

    const modelCaps = findVideoModel(d.form.model)?.caps;
    const validDurations = modelCaps?.durations ?? [5, 10];
    const durationEach = validDurations.includes(d.form.durationEach)
      ? d.form.durationEach
      : validDurations[validDurations.length - 1];

    setPlanState({ status: "loading" });
    try {
      const res = await fetch("/api/story/generate-shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept,
          shotCount: d.form.shotCount,
          durationEach,
          referenceImageCount,
          hasFirstFrame,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "planning failed");
      const shots: string[] = json.shots;
      if (!Array.isArray(shots) || shots.length === 0) throw new Error("No shots returned");
      const titles: string[] | undefined = Array.isArray(json.titles) ? json.titles : undefined;
      update({ plannedShots: shots, plannedShotTitles: titles, completedClipUrls: undefined });
      setPlanState({ status: "idle" });
    } catch (err) {
      setPlanState({
        status: "error",
        message: err instanceof Error ? err.message : "planning failed",
      });
    }
  }, [resolveInput, d.form, update]);

  const caps = findVideoModel(d.form.model)?.caps;
  const totalSeconds = d.form.shotCount * d.form.durationEach;
  const url = d.outputs.url as string | undefined;
  const plannedShots = d.form.plannedShots;
  const plannedShotTitles = d.form.plannedShotTitles;
  const hasPlan = Array.isArray(plannedShots) && plannedShots.length > 0;

  return (
    <NodeShell id={id} spec={longVideoSpec} data={d} selected={selected ?? false} width={440}>
      <Field label="Model">
        <select
          value={d.form.model}
          onChange={(e) => {
            const next = e.target.value;
            const cap = findVideoModel(next)?.caps;
            update({
              model: next,
              plannedShots: undefined,
              plannedShotTitles: undefined,
              completedClipUrls: undefined,
              resolution: cap?.resolutions.includes(
                d.form.resolution as "480p" | "720p" | "768p" | "1080p",
              )
                ? d.form.resolution
                : (cap?.resolutions[0] ?? "720p"),
              durationEach: cap?.durations.includes(d.form.durationEach)
                ? d.form.durationEach
                : (cap?.durations[cap.durations.length - 1] ?? 10),
              audio: cap?.audio ? d.form.audio : false,
            });
          }}
          className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
        >
          {VIDEO_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.hint}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Shots">
          <select
            value={String(d.form.shotCount)}
            onChange={(e) => update({ shotCount: Number(e.target.value), plannedShots: undefined, plannedShotTitles: undefined, completedClipUrls: undefined })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {[2, 3, 4, 5, 6, 8, 9, 10, 12].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="Each">
          <select
            value={String(d.form.durationEach)}
            onChange={(e) => update({ durationEach: Number(e.target.value), plannedShots: undefined, plannedShotTitles: undefined, completedClipUrls: undefined })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {(caps?.durations ?? [5, 10]).map((dur) => (
              <option key={dur} value={dur}>{dur}s</option>
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
      </div>

      <div className="grid grid-cols-2 gap-2">
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
        <div className="flex flex-col justify-end pb-1">
          <label className="nodrag flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim">
            <input
              type="checkbox"
              checked={d.form.audio}
              onChange={(e) => update({ audio: e.target.checked })}
              className="size-3 cursor-pointer accent-[var(--accent)]"
            />
            Native audio
          </label>
        </div>
      </div>

      {/* ── Summary + Plan button ─────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-[8px] border border-border bg-panel px-2.5 py-2 font-mono text-[10px] text-ink-dim">
          {d.form.shotCount} shots × {d.form.durationEach}s ={" "}
          <span className="text-ink">{totalSeconds}s total</span>
        </div>
        <button
          type="button"
          onClick={() => void handlePlan()}
          disabled={planState.status === "loading"}
          className="nodrag shrink-0 rounded-[8px] border border-border bg-panel px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {planState.status === "loading" ? "Planning…" : hasPlan ? "Re-plan" : "Plan"}
        </button>
      </div>

      {/* ── Plan error ───────────────────────────────────────────── */}
      {planState.status === "error" && (
        <div className="rounded-[8px] border border-[oklch(0.65_0.22_25)]/40 bg-panel px-2 py-1.5 font-mono text-[10px] text-[oklch(0.65_0.22_25)]">
          {planState.message}
        </div>
      )}

      {/* ── Shot plan editor ─────────────────────────────────────── */}
      {hasPlan && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
              Shot plan · edit before running
            </span>
            <button
              type="button"
              onClick={() => update({ plannedShots: undefined, plannedShotTitles: undefined, completedClipUrls: undefined })}
              className="nodrag font-mono text-[9px] text-ink-dim hover:text-[oklch(0.65_0.22_25)]"
            >
              Clear
            </button>
          </div>
          {plannedShots!.map((shot, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="font-mono text-[9px] text-ink-dim">
                {plannedShotTitles?.[i] ? `Clip ${i + 1} — ${plannedShotTitles[i]}` : `Shot ${i + 1}`}
              </span>
              <textarea
                rows={10}
                value={shot}
                onChange={(e) => updateShot(i, e.target.value)}
                className="nodrag nowheel w-full resize-y rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[10px] leading-[1.5] text-ink transition-colors focus:border-accent focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Output video ─────────────────────────────────────────── */}
      {url && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={url} controls playsInline className="block h-auto w-full" />
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

export const longVideoSpec: NodeTypeSpec<LongVideoForm> = {
  type: "longVideo",
  label: "Long Video",
  description:
    "Plan N shots with Seed 2.0 Pro, generate each via Seedance with reference-chaining, then stitch into one video.",
  inputs: [
    { id: "prompt", label: "Prompt" },
    { id: "image", label: "First Frame" },
    { id: "lastFrame", label: "Last Frame" },
    { id: "referenceUrls", label: "Reference URLs" },
    { id: "references", label: "AssetId's" },
  ],
  outputs: [{ id: "url", label: "url" }],
  defaults: {
    model: DEFAULT_VIDEO_MODEL_ID,
    resolution: "720p",
    durationEach: 10,
    ratio: "16:9",
    shotCount: 6,
    audio: true,
    plannedShots: undefined,
    plannedShotTitles: undefined,
    completedClipUrls: undefined,
  },
  hashInputs: (form, inputs) => {
    // When shots are pre-planned, hash on their content (not the concept) so
    // edits to prompts invalidate the cache and force a re-run.
    if (form.plannedShots && form.plannedShots.length > 0) {
      return [
        "lv2-planned",
        form.model,
        form.resolution,
        form.durationEach,
        form.ratio,
        form.audio ? 1 : 0,
        inputs.image ?? "",
        inputs.lastFrame ?? "",
        inputs.referenceUrls ?? "",
        inputs.references ?? "",
        form.plannedShots.join("||"),
      ].join("|");
    }
    return [
      "lv2",
      form.model,
      form.resolution,
      form.durationEach,
      form.ratio,
      form.shotCount,
      form.audio ? 1 : 0,
      inputs.prompt ?? "",
      inputs.image ?? "",
      inputs.lastFrame ?? "",
      inputs.referenceUrls ?? "",
      inputs.references ?? "",
    ].join("|");
  },
  execute: async ({ form, inputs, signal, onProgress, onFormUpdate, projectId }) => {
    const concept = inputs.prompt?.trim();
    if (!concept && !form.plannedShots?.length) {
      throw new Error("Concept / story prompt is required");
    }

    const isV2 = form.model.startsWith("dreamina-seedance-2-");

    const modelCaps = findVideoModel(form.model)?.caps;
    const validDurations = modelCaps?.durations ?? [5, 10];
    const durationEach = validDurations.includes(form.durationEach)
      ? form.durationEach
      : validDurations[validDurations.length - 1];

    // ── Step 1: Shot prompts — use pre-planned if available, otherwise plan ──
    let shots: string[];

    if (form.plannedShots && form.plannedShots.length > 0) {
      onProgress?.(`Using ${form.plannedShots.length} pre-planned shots…`);
      shots = form.plannedShots;
    } else {
      const referenceRaw = inputs.references ?? "";
      const referenceImageCount = referenceRaw
        ? referenceRaw.split("\n").filter(Boolean).length
        : 0;
      const hasFirstFrame = !!(inputs.image?.trim());

      const isLongConcept = (concept ?? "").length > 400;
      onProgress?.(isLongConcept ? "Distilling concept…" : `Planning ${form.shotCount} shots…`);

      const planRes = await fetch("/api/story/generate-shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept,
          shotCount: form.shotCount,
          durationEach,
          referenceImageCount,
          hasFirstFrame,
        }),
        signal,
      });
      const planData = await planRes.json();
      if (!planRes.ok) throw new Error(planData?.error ?? "shot planning failed");
      if (planData.brief) onProgress?.(`Planning ${form.shotCount} shots…`);
      shots = planData.shots;
      if (!Array.isArray(shots) || shots.length === 0) {
        throw new Error("No shots returned by planner");
      }
    }

    // ── Step 2: Generate clips sequentially ──────────────────────────────────
    // Resume from any clips already completed in a prior failed run.
    const resumeUrls = form.completedClipUrls ?? [];
    const resumeIdx = Math.min(resumeUrls.length, shots.length);
    const clipUrls: string[] = resumeUrls.slice(0, resumeIdx);
    let previousClipUrl: string | undefined = clipUrls[clipUrls.length - 1];

    if (resumeIdx > 0) {
      onProgress?.(`Resuming from shot ${resumeIdx + 1}/${shots.length} (${resumeIdx} clips already done)…`);
    }

    for (let i = 0; i < shots.length; i++) {
      // Skip shots already completed before the failure.
      if (i < resumeIdx) continue;
      const shotPrompt = shots[i];
      onProgress?.(`Generating shot ${i + 1}/${shots.length}…`);

      const body: Record<string, unknown> = {
        prompt: shotPrompt,
        model: form.model,
        resolution: form.resolution,
        duration: durationEach,
        ratio: form.ratio,
        camerafixed: false,
      };
      if (isV2) body.audio = form.audio;

      // Asset ID references → body.references
      if (isV2 && inputs.references) {
        const assetRefs = inputs.references
          .split("\n")
          .map((r) => r.trim())
          .filter(Boolean)
          .map(parseAssetRef)
          .filter((r): r is Extract<AssetRef, { kind: "asset" }> => r.kind === "asset")
          .map(({ asset_id, type }) => ({ role: "subject" as const, asset_id, type }));
        if (assetRefs.length > 0) body.references = assetRefs;
      }

      // Reference URLs → body.images as reference_image
      if (isV2 && inputs.referenceUrls) {
        const urlRefs = inputs.referenceUrls
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean);
        if (urlRefs.length > 0) {
          const existing = (body.images as Array<{ url: string; role?: string }>) ?? [];
          body.images = [
            ...existing,
            ...urlRefs.map((url) => ({ url, role: "reference_image" })),
          ];
        }
      }

      const refUrl = previousClipUrl ?? inputs.image;
      if (refUrl) {
        const isPublicUrl =
          (refUrl.startsWith("https://") || refUrl.startsWith("http://")) &&
          !refUrl.startsWith("data:") &&
          !/localhost|127\.0\.0\.1/.test(refUrl);
        if (isPublicUrl) {
          const isVideo = previousClipUrl !== undefined;
          if (isVideo) {
            body.videos = [{ url: refUrl, role: "reference_video" }];
          } else {
            const imgs = (body.images as Array<{ url: string; role?: string }>) ?? [];
            body.images = [...imgs, { url: refUrl, role: "first_frame" }];
          }
        }
      }

      // Last frame — only on the first shot (before reference-chaining begins), V2 only
      if (isV2 && i === 0 && !previousClipUrl && inputs.lastFrame) {
        const lastFrameUrl = (inputs.lastFrame as string).trim();
        const isPublicUrl =
          (lastFrameUrl.startsWith("https://") || lastFrameUrl.startsWith("http://")) &&
          !lastFrameUrl.startsWith("data:") &&
          !/localhost|127\.0\.0\.1/.test(lastFrameUrl);
        if (isPublicUrl) {
          const imgs = (body.images as Array<{ url: string; role?: string }>) ?? [];
          body.images = [...imgs, { url: lastFrameUrl, role: "last_frame" }];
        }
      }

      const submitRes = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData?.error ?? `shot ${i + 1} task creation failed`);
      const taskId: string | undefined = submitData?.id;
      if (!taskId) throw new Error(`No task id for shot ${i + 1}`);

      let clipUrl: string | undefined;
      for (let tries = 1; tries <= POLL_MAX_TRIES; tries++) {
        await sleepCancellable(POLL_INTERVAL_MS, signal);
        onProgress?.(`Shot ${i + 1}/${shots.length} — polling · try ${tries}`);
        const pollRes = await fetch(
          `/api/video/${taskId}?model=${encodeURIComponent(form.model)}`,
          { signal },
        );
        const pollData = await pollRes.json();
        if (!pollRes.ok) throw new Error(pollData?.error ?? "poll failed");
        const status = pollData?.status as string | undefined;
        if (status === "succeeded") {
          clipUrl = pollData?.content?.video_url as string | undefined;
          if (!clipUrl) throw new Error(`Shot ${i + 1} succeeded but no video url`);
          break;
        }
        if (status === "failed") throw new Error(pollData?.error?.message ?? `shot ${i + 1} failed`);
        if (status === "cancelled") throw new Error(`Shot ${i + 1} cancelled upstream`);
      }
      if (!clipUrl) throw new Error(`Shot ${i + 1} timed out`);

      stageGeneratedVideo({
        taskId,
        videoUrl: clipUrl,
        prompt: shotPrompt,
        model: form.model,
        ratio: form.ratio,
        duration: durationEach,
        resolution: form.resolution,
        mode: (previousClipUrl ?? inputs.image) ? "i2v" : "t2v",
        projectId,
      });

      clipUrls.push(clipUrl);
      previousClipUrl = clipUrl;
      // Checkpoint so a future retry can skip this clip.
      onFormUpdate?.({ completedClipUrls: [...clipUrls] });
    }

    // ── Step 3: Stitch ───────────────────────────────────────────────────────
    onProgress?.(`Stitching ${clipUrls.length} clips…`);
    const stitchRes = await fetch("/api/video/stitch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrls: clipUrls }),
      signal,
    });
    const stitchData = await stitchRes.json();
    if (!stitchRes.ok) throw new Error(stitchData?.error ?? "stitching failed");
    const url: string | undefined = stitchData?.url;
    if (!url) throw new Error("Stitch returned no url");

    // All clips stitched — clear the checkpoint so a re-run starts fresh.
    onFormUpdate?.({ completedClipUrls: undefined });

    return { url };
  },
};
