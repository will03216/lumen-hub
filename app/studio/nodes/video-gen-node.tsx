"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { Terminal } from "lucide-react";
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

export type VideoGenForm = {
  model: string;
  resolution: string;
  duration: number;
  ratio: string;
  seed: string;
  cameraFixed: boolean;
  /** Native audio — only honoured by Seedance 2.0 family. */
  audio: boolean;
};

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200;

/** Parse a wire value emitted by the Asset node's assetId output.
 *  Format: "<assetId>|video" for videos, plain "<assetId>" for images. */
function parseAssetRef(raw: string): { asset_id: string; type: "image" | "video" } {
  const pipe = raw.indexOf("|");
  if (pipe !== -1) {
    const suffix = raw.slice(pipe + 1);
    return { asset_id: raw.slice(0, pipe), type: suffix === "video" ? "video" : "image" };
  }
  return { asset_id: raw, type: "image" };
}

export const VideoGenNode = memo(function VideoGenNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const d = data as StudioNodeData<VideoGenForm>;
  const [curlState, setCurlState] = useState<"idle" | "copying" | "copied">("idle");

  const update = useCallback(
    (patch: Partial<VideoGenForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<VideoGenForm>;
          return {
            ...n,
            data: { ...prev, form: { ...prev.form, ...patch } },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const resolvePortInputs = useCallback((): Record<string, string> => {
    const edges = getEdges().filter((e) => e.target === id);
    const nodes = getNodes();
    const collected: Record<string, string[]> = {};
    for (const edge of edges) {
      if (!edge.targetHandle || !edge.sourceHandle) continue;
      const src = nodes.find((n) => n.id === edge.source);
      if (!src) continue;
      const val = (src.data as StudioNodeData<unknown>).outputs?.[edge.sourceHandle];
      if (!val) continue;
      (collected[edge.targetHandle] ??= []).push(val as string);
    }
    const result: Record<string, string> = {};
    for (const [port, vals] of Object.entries(collected)) {
      result[port] = vals.join("\n");
    }
    return result;
  }, [id, getNodes, getEdges]);

  const handleCopyCurl = useCallback(async () => {
    const portInputs = resolvePortInputs();
    const prompt = portInputs.prompt ?? "(connect a prompt port)";
    const image = portInputs.image;
    const referencesRaw = portInputs.references;

    const modelCaps = findVideoModel(d.form.model)?.caps;
    const validDurations = modelCaps?.durations ?? [5];
    const duration = validDurations.includes(d.form.duration)
      ? d.form.duration
      : validDurations.reduce((best, v) =>
          Math.abs(v - d.form.duration) < Math.abs(best - d.form.duration) ? v : best,
        );

    const params: Record<string, unknown> = {
      prompt,
      model: d.form.model,
      resolution: d.form.resolution,
      duration,
      ratio: d.form.ratio,
      camerafixed: d.form.cameraFixed,
    };
    const seedNum = d.form.seed.trim() ? Number(d.form.seed) : NaN;
    if (Number.isFinite(seedNum)) params.seed = seedNum;
    if (d.form.model.startsWith("dreamina-seedance-2-")) params.audio = d.form.audio;
    if (image) {
      const isPublicUrl =
        (image.startsWith("https://") || image.startsWith("http://")) &&
        !image.startsWith("data:") &&
        !image.startsWith("blob:") &&
        !/localhost|127\.0\.0\.1/.test(image);
      if (isPublicUrl) params.images = [{ url: image, role: "first_frame" }];
    }
    if (d.form.model.startsWith("dreamina-seedance-2-") && referencesRaw) {
      params.references = referencesRaw
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => ({ role: "subject", ...parseAssetRef(r) }));
    }

    setCurlState("copying");
    try {
      const res = await fetch("/api/video/curl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const json = (await res.json()) as { curl?: string; error?: string };
      if (!res.ok || !json.curl) throw new Error(json.error ?? "failed");
      await navigator.clipboard.writeText(json.curl);
      setCurlState("copied");
      setTimeout(() => setCurlState("idle"), 2500);
    } catch {
      setCurlState("idle");
    }
  }, [d.form, resolvePortInputs]);

  // Caps depend on the chosen engine; restrict the dropdowns so the user
  // can't pick a value the upstream API will reject (e.g. 1080p on 2.0).
  const caps = useMemo(
    () => findVideoModel(d.form.model)?.caps,
    [d.form.model],
  );
  const url = d.outputs.url;
  const isV2 = d.form.model.startsWith("dreamina-seedance-2-");

  return (
    <NodeShell
      id={id}
      spec={videoGenSpec}
      data={d}
      selected={selected ?? false}
      width={320}
    >
      <Field label="Model">
        <select
          value={d.form.model}
          onChange={(e) => {
            const next = e.target.value;
            const cap = findVideoModel(next)?.caps;
            // Snap dependent fields back into the new engine's allowed range
            update({
              model: next,
              resolution: cap?.resolutions.includes(
                d.form.resolution as "480p" | "720p" | "768p" | "1080p",
              )
                ? d.form.resolution
                : (cap?.resolutions[0] ?? "720p"),
              duration: cap?.durations.includes(d.form.duration)
                ? d.form.duration
                : (cap?.durations[0] ?? 5),
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
        <Field label="Res">
          <select
            value={d.form.resolution}
            onChange={(e) => update({ resolution: e.target.value })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {(caps?.resolutions ?? ["720p"]).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dur">
          <select
            value={String(d.form.duration)}
            onChange={(e) => update({ duration: Number(e.target.value) })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {(caps?.durations ?? [5, 10]).map((dur) => (
              <option key={dur} value={dur}>
                {dur}s
              </option>
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
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
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
        <div className="flex flex-col justify-end gap-1.5 pb-0.5">
          <ToggleRow
            label="Camera fixed"
            checked={d.form.cameraFixed}
            onChange={(v) => update({ cameraFixed: v })}
          />
          {isV2 && (
            <ToggleRow
              label="Native audio"
              checked={d.form.audio}
              onChange={(v) => update({ audio: v })}
            />
          )}
        </div>
      </div>

      {/* ── Copy cURL ──────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleCopyCurl()}
          disabled={curlState === "copying"}
          title="Copy the exact BytePlus curl command to clipboard (includes API key)"
          className={[
            "nodrag inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.10em] transition-colors disabled:opacity-40",
            curlState === "copied"
              ? "border-ok/60 bg-panel text-ok"
              : "border-border bg-panel text-ink-dim hover:border-accent/60 hover:text-ink",
          ].join(" ")}
        >
          <Terminal className="size-3" />
          {curlState === "copied" ? "Copied!" : "Copy cURL"}
        </button>
      </div>

      {url && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={url}
            controls
            playsInline
            className="block h-auto w-full"
          />
        </div>
      )}
    </NodeShell>
  );
});

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="nodrag flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3 cursor-pointer accent-[var(--accent)]"
      />
      {label}
    </label>
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

export const videoGenSpec: NodeTypeSpec<VideoGenForm> = {
  type: "videoGen",
  label: "Video Gen",
  description: "Generate a clip via Seedance — t2v, i2v, or R2V if 'reference' (BytePlus asset_id) is wired.",
  inputs: [
    { id: "prompt", label: "prompt" },
    { id: "image", label: "image" },
    { id: "references", label: "references (asset_ids, multi-wire)" },
  ],
  outputs: [{ id: "url", label: "url" }],
  defaults: {
    model: DEFAULT_VIDEO_MODEL_ID,
    resolution: "720p",
    duration: 5,
    ratio: "16:9",
    seed: "",
    cameraFixed: false,
    audio: true,
  },
  hashInputs: (form, inputs) =>
    [
      "v",
      form.model,
      form.resolution,
      form.duration,
      form.ratio,
      form.seed,
      form.cameraFixed ? 1 : 0,
      form.audio ? 1 : 0,
      inputs.prompt ?? "",
      inputs.image ?? "",
      inputs.references ?? "",
    ].join("|"),
  execute: async ({ form, inputs, signal, onProgress, projectId }) => {
    const prompt = inputs.prompt?.trim();
    if (!prompt) throw new Error("Prompt input is required");

    const isV2 = form.model.startsWith("dreamina-seedance-2-");

    // Clamp duration to the nearest value the chosen model accepts.
    // The model picker snaps when the user changes model via UI, but a
    // canvas loaded from an older save may still have a stale value.
    const modelCaps = findVideoModel(form.model)?.caps;
    const validDurations = modelCaps?.durations ?? [5];
    const duration = validDurations.includes(form.duration)
      ? form.duration
      : validDurations.reduce((best, d) =>
          Math.abs(d - form.duration) < Math.abs(best - form.duration) ? d : best,
        );

    const body: Record<string, unknown> = {
      prompt,
      model: form.model,
      resolution: form.resolution,
      duration,
      ratio: form.ratio,
      camerafixed: form.cameraFixed,
    };
    const seedNum = form.seed.trim() ? Number(form.seed) : NaN;
    if (Number.isFinite(seedNum)) body.seed = seedNum;
    if (isV2) body.audio = form.audio;
    if (inputs.image) {
      const isPublicUrl =
        (inputs.image.startsWith("https://") || inputs.image.startsWith("http://")) &&
        !inputs.image.startsWith("data:") &&
        !inputs.image.startsWith("blob:") &&
        !/localhost|127\.0\.0\.1/.test(inputs.image);
      if (isPublicUrl) {
        body.images = [{ url: inputs.image, role: "first_frame" }];
      } else if (!inputs.references) {
        throw new Error(
          "The image URL is not publicly accessible (it's a local or blob URL). " +
          "Wire the Asset node's assetId output to the 'references' port instead, or upload the image via the BytePlus Asset Library first.",
        );
      }
      // else: non-public URL but references port is also wired → skip image, use references only
    }
    // Seedance 2.0 R2V: BytePlus asset_id wired from an Asset node's
    // assetId port is passed as a reference subject — stable across CDN
    // expiry because BytePlus resolves it internally.
    if (isV2 && inputs.references) {
      const refs = inputs.references
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => ({ role: "subject", ...parseAssetRef(r) }));
      if (refs.length > 0) body.references = refs;
    }

    onProgress?.("Submitting task…");
    const res = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "video task creation failed");
    const taskId: string | undefined = data?.id;
    if (!taskId) throw new Error("No task id returned by /api/video");

    // Poll loop: same cadence and ceiling as components/video-generator.tsx
    // (3s × 200 ≈ 10 minutes wall-clock max). Cancellation lands either
    // mid-fetch (signal hits the abort handler) or mid-sleep (sleepCancellable
    // rejects on abort).
    // Pass ?model= so the poll route dispatches to the correct provider
    // (BytePlus vs Minimax — without it, Minimax task IDs go to BytePlus).
    for (let tries = 1; tries <= POLL_MAX_TRIES; tries++) {
      await sleepCancellable(POLL_INTERVAL_MS, signal);
      onProgress?.(`Polling · try ${tries}/${POLL_MAX_TRIES}`);
      const pollRes = await fetch(
        `/api/video/${taskId}?model=${encodeURIComponent(form.model)}`,
        { signal },
      );
      const pollData = await pollRes.json();
      if (!pollRes.ok) throw new Error(pollData?.error ?? "poll failed");
      const status = pollData?.status as string | undefined;
      if (status === "succeeded") {
        const url: string | undefined = pollData?.content?.video_url;
        if (!url) throw new Error("Succeeded but no video url");
        // Stage as a draft — keyed on BytePlus task id so a re-execute
        // with the same inputs (cache hit at runner level) never reaches
        // here, and accidental double-fires upsert. The user commits to
        // Library via the Drafts band.
        stageGeneratedVideo({
          taskId,
          videoUrl: url,
          prompt,
          model: form.model,
          ratio: form.ratio,
          duration: form.duration,
          resolution: form.resolution,
          mode: inputs.image ? "i2v" : "t2v",
          seed: Number.isFinite(seedNum) ? seedNum : undefined,
          projectId,
        });
        return { url };
      }
      if (status === "failed") {
        throw new Error(pollData?.error?.message ?? "video task failed");
      }
      if (status === "cancelled") {
        throw new Error("video task cancelled upstream");
      }
    }
    throw new Error(`Timed out after ${POLL_MAX_TRIES} polls`);
  },
};
