"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useEdges, useReactFlow, type NodeProps } from "@xyflow/react";
import { Terminal } from "lucide-react";
import {
  VIDEO_MODELS,
  VIDEO_RATIOS,
  DEFAULT_VIDEO_MODEL_ID,
  findVideoModel,
  type VideoResolution,
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

function isPublicUrl(s: string): boolean {
  return (
    (s.startsWith("https://") || s.startsWith("http://")) &&
    !s.startsWith("data:") &&
    !s.startsWith("blob:") &&
    !/localhost|127\.0\.0\.1/.test(s)
  );
}

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

/** Derive a compact mode label from the set of wired input handles. */
function modeLabel(handles: Set<string>): string {
  const hasFirst = handles.has("image");
  const hasLast = handles.has("lastFrame");
  const hasRefImgs = handles.has("refImages");
  const hasRefAssets = handles.has("references");
  const hasRefVideo = handles.has("refVideo");
  const hasRefs = hasRefImgs || hasRefAssets || hasRefVideo;

  if (!hasFirst && !hasLast && !hasRefs) return "T2V";
  const parts: string[] = [];
  if (hasFirst && hasLast) parts.push("first+last");
  else if (hasFirst) parts.push("first frame");
  else if (hasLast) parts.push("last frame only");
  if (hasRefVideo) parts.push("ref video");
  if (hasRefImgs && hasRefAssets) parts.push("URL refs + assets");
  else if (hasRefImgs) parts.push("URL refs");
  else if (hasRefAssets) parts.push("asset refs");
  return parts.join(" · ") || "I2V";
}

export const VideoGenNode = memo(function VideoGenNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const allEdges = useEdges();
  const d = data as StudioNodeData<VideoGenForm>;
  const [curlState, setCurlState] = useState<"idle" | "copying" | "copied">("idle");

  // Reactive mode indicator — updates whenever edges change.
  const mode = useMemo(() => {
    const handles = new Set(
      allEdges
        .filter((e) => e.target === id && e.targetHandle)
        .map((e) => e.targetHandle as string),
    );
    return modeLabel(handles);
  }, [allEdges, id]);

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
    const lastFrame = portInputs.lastFrame;
    const refImagesRaw = portInputs.refImages;
    const referencesRaw = portInputs.references;
    const refVideoRaw = portInputs.refVideo;

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

    const images: Array<{ url: string; role: string }> = [];
    if (image && isPublicUrl(image)) images.push({ url: image, role: "first_frame" });
    if (lastFrame && isPublicUrl(lastFrame)) images.push({ url: lastFrame, role: "last_frame" });
    if (refImagesRaw) {
      refImagesRaw
        .split("\n")
        .map((u) => u.trim())
        .filter(isPublicUrl)
        .forEach((url) => images.push({ url, role: "reference_image" }));
    }
    if (images.length > 0) params.images = images;

    const isV2 = d.form.model.startsWith("dreamina-seedance-2-");
    if (isV2 && referencesRaw) {
      const refs = referencesRaw
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => ({ role: "subject", ...parseAssetRef(r) }));
      if (refs.length > 0) params.references = refs;
    }
    if (isV2 && refVideoRaw && isPublicUrl(refVideoRaw.trim())) {
      params.videos = [{ url: refVideoRaw.trim(), role: "reference_video" }];
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
      {/* ── Mode indicator ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-ink-mute">
          Mode
        </span>
        <span className="rounded-full border border-border bg-panel px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-ink-dim">
          {mode}
        </span>
        {mode !== "T2V" && !isV2 && (mode.includes("refs") || mode.includes("URL")) && (
          <span className="font-mono text-[9px] text-amber-400/80" title="Ref images require Seedance 2.0">
            ⚠ V2 only
          </span>
        )}
      </div>

      <Field label="Model">
        <select
          value={d.form.model}
          onChange={(e) => {
            const next = e.target.value;
            const cap = findVideoModel(next)?.caps;
            update({
              model: next,
              resolution: cap?.resolutions.includes(
                d.form.resolution as VideoResolution,
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

      {d.form.resolution === "4k" && (
        <p className="font-mono text-[9px] leading-[1.5] text-amber-400/80">
          ⚠ 4K is much slower and uses far more tokens than 1080p.
        </p>
      )}

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
  description:
    "Generate a clip via Seedance. Wire 'first frame' for I2V, add 'last frame' for bookend mode, or wire 'ref images' (URLs) / 'ref assets' (asset_ids) for R2V.",
  inputs: [
    { id: "prompt", label: "prompt" },
    { id: "image", label: "first frame" },
    { id: "lastFrame", label: "last frame" },
    { id: "refImages", label: "ref images (URLs)" },
    { id: "references", label: "ref assets (asset_ids)" },
    { id: "refVideo", label: "ref video (URL)" },
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
      "v2",
      form.model,
      form.resolution,
      form.duration,
      form.ratio,
      form.seed,
      form.cameraFixed ? 1 : 0,
      form.audio ? 1 : 0,
      inputs.prompt ?? "",
      inputs.image ?? "",
      inputs.lastFrame ?? "",
      inputs.refImages ?? "",
      inputs.references ?? "",
      inputs.refVideo ?? "",
    ].join("|"),
  execute: async ({ form, inputs, signal, onProgress, projectId }) => {
    const prompt = inputs.prompt?.trim();
    if (!prompt) throw new Error("Prompt input is required");

    const isV2 = form.model.startsWith("dreamina-seedance-2-");

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

    // Build images array: first frame + last frame + URL-based reference images.
    // URL references use role "reference_image" inside the content array —
    // the `references` top-level field only accepts BytePlus asset_ids, not URLs.
    const imageEntries: Array<{ url: string; role: string }> = [];
    if (inputs.image) {
      if (isPublicUrl(inputs.image)) {
        imageEntries.push({ url: inputs.image, role: "first_frame" });
      } else if (!inputs.refImages && !inputs.references) {
        throw new Error(
          "The first-frame URL is not publicly accessible. " +
          "Wire an Asset node's assetId to 'ref assets' instead, or use a public URL.",
        );
      }
    }
    if (inputs.lastFrame) {
      if (isPublicUrl(inputs.lastFrame)) {
        imageEntries.push({ url: inputs.lastFrame, role: "last_frame" });
      } else {
        throw new Error("The last-frame URL must be a publicly accessible https:// URL.");
      }
    }
    if (inputs.refImages) {
      inputs.refImages
        .split("\n")
        .map((u) => u.trim())
        .filter(isPublicUrl)
        .forEach((url) => imageEntries.push({ url, role: "reference_image" }));
    }
    if (imageEntries.length > 0) body.images = imageEntries;

    // Build references array: asset-id refs only (V2 only).
    // URL-based refs go via images[] above, not here.
    if (isV2 && inputs.references) {
      const refs = inputs.references
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => ({ role: "subject", ...parseAssetRef(r) }));
      if (refs.length > 0) body.references = refs;
    }

    // Reference video (Seedance 2.0 video-to-video). Feeds a clip — e.g. a
    // deterministic 3D turntable — as a `reference_video` so Seedance renders
    // a final polished pass guided by it.
    if (isV2 && inputs.refVideo) {
      const v = inputs.refVideo.trim();
      if (!isPublicUrl(v)) {
        throw new Error("The ref video must be a publicly accessible https:// URL.");
      }
      body.videos = [{ url: v, role: "reference_video" }];
    }

    // Derive mode for the draft record.
    const hasFirst = !!inputs.image;
    const hasLast = !!inputs.lastFrame;
    const hasRefs = !!(inputs.refImages || inputs.references);
    const mode = hasFirst && hasLast ? "i2v-fl" : hasFirst ? "i2v" : hasRefs ? "r2v" : "t2v";

    onProgress?.("Submitting task…");
    const res = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const responseData = await res.json();
    if (!res.ok) throw new Error(responseData?.error ?? "video task creation failed");
    const taskId: string | undefined = responseData?.id;
    if (!taskId) throw new Error("No task id returned by /api/video");

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
        stageGeneratedVideo({
          taskId,
          videoUrl: url,
          prompt,
          model: form.model,
          ratio: form.ratio,
          duration: form.duration,
          resolution: form.resolution,
          mode,
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
