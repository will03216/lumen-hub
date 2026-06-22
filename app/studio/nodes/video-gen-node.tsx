"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useEdges, useReactFlow, type NodeProps } from "@xyflow/react";
import { Terminal } from "lucide-react";
import {
  VIDEO_MODELS,
  VIDEO_RATIOS,
  DEFAULT_VIDEO_MODEL_ID,
  findVideoModel,
} from "@/lib/studio/models";
import { stageGeneratedVideo } from "@/lib/library/auto-save";
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
import { sleepCancellable } from "../util";
import type { NodeOutputs, NodeTypeSpec, StudioNodeData } from "../types";

export type VideoGenForm = {
  model: string;
  resolution: string;
  duration: number;
  ratio: string;
  seed: string;
  cameraFixed: boolean;
  /** Native audio — only honoured by Seedance 2.0 family. */
  audio: boolean;
} & QAFields;

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

/** A first/last-frame input BytePlus can consume directly: either a public
 *  https URL or an inline image data URI. BytePlus accepts a base64 data URI in
 *  `image_url.url` (same as the image-gen path), so an extracted frame from the
 *  Frame Extract node — e.g. a frame-chained clip-to-clip anchor — works without
 *  a hosting round-trip. (Portraits may still hit BytePlus's privacy filter; use
 *  an Asset ref for those.) */
function isUsableFrameInput(s: string): boolean {
  return isPublicUrl(s) || s.startsWith("data:image/");
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
  const hasRefs = hasRefImgs || hasRefAssets;

  if (!hasFirst && !hasLast && !hasRefs) return "T2V";
  const parts: string[] = [];
  if (hasFirst && hasLast) parts.push("first+last");
  else if (hasFirst) parts.push("first frame");
  else if (hasLast) parts.push("last frame only");
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

      <QABadge outputs={d.outputs} />

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
    qaChecks: [],
    qaMinScore: 0.85,
    regenCap: 0,
  },
  hashInputs: (form, inputs) =>
    [
      "v3",
      form.model,
      form.resolution,
      form.duration,
      form.ratio,
      form.seed,
      form.cameraFixed ? 1 : 0,
      form.audio ? 1 : 0,
      // QA config affects the run (regen loop), so it's part of the fingerprint.
      (form.qaChecks ?? []).join(","),
      form.qaMinScore ?? "",
      form.regenCap ?? 0,
      inputs.prompt ?? "",
      inputs.image ?? "",
      inputs.lastFrame ?? "",
      inputs.refImages ?? "",
      inputs.references ?? "",
    ].join("|"),
  execute: async ({ form, inputs, signal, onProgress, projectId }) => {
    const basePrompt = inputs.prompt?.trim();
    if (!basePrompt) throw new Error("Prompt input is required");

    const isV2 = form.model.startsWith("dreamina-seedance-2-");

    const modelCaps = findVideoModel(form.model)?.caps;
    const validDurations = modelCaps?.durations ?? [5];
    const duration = validDurations.includes(form.duration)
      ? form.duration
      : validDurations.reduce((best, d) =>
          Math.abs(d - form.duration) < Math.abs(best - form.duration) ? d : best,
        );

    // Assets (first/last frame, ref images, ref assets) depend only on the
    // wired inputs, not on the prompt/seed, so build them once up front.
    const imageEntries: Array<{ url: string; role: string }> = [];
    if (inputs.image) {
      if (isUsableFrameInput(inputs.image)) {
        imageEntries.push({ url: inputs.image, role: "first_frame" });
      } else if (!inputs.refImages && !inputs.references) {
        throw new Error(
          "The first-frame must be a public https URL or an extracted frame (data URI). " +
          "Wire an Asset node's assetId to 'ref assets' instead, or use a public URL.",
        );
      }
    }
    if (inputs.lastFrame) {
      if (isUsableFrameInput(inputs.lastFrame)) {
        imageEntries.push({ url: inputs.lastFrame, role: "last_frame" });
      } else {
        throw new Error("The last-frame must be a public https URL or an extracted frame (data URI).");
      }
    }
    if (inputs.refImages) {
      inputs.refImages
        .split("\n")
        .map((u) => u.trim())
        .filter(isPublicUrl)
        .forEach((url) => imageEntries.push({ url, role: "reference_image" }));
    }

    const referencePayload =
      isV2 && inputs.references
        ? inputs.references
            .split("\n")
            .map((r) => r.trim())
            .filter(Boolean)
            .map((r) => ({ role: "subject", ...parseAssetRef(r) }))
        : [];

    const hasFirst = !!inputs.image;
    const hasLast = !!inputs.lastFrame;
    const hasRefs = !!(inputs.refImages || inputs.references);
    const mode = hasFirst && hasLast ? "i2v-fl" : hasFirst ? "i2v" : hasRefs ? "r2v" : "t2v";

    const baseSeedNum = form.seed.trim() ? Number(form.seed) : NaN;
    const baseSeed = Number.isFinite(baseSeedNum) ? baseSeedNum : undefined;

    // One generation attempt. Captured closures record the last task/seed so we
    // stage only the final (accepted) clip into the Library, not every retry.
    let lastTaskId = "";
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
        resolution: form.resolution,
        duration: (overrides?.duration as number) ?? duration,
        ratio: (overrides?.ratio as string) ?? form.ratio,
        // Lever mapping (#3): the critic loop can request camera stabilization.
        camerafixed: (overrides?.cameraFixed as boolean) ?? form.cameraFixed,
      };
      if (seedValue !== undefined) body.seed = seedValue;
      if (isV2) body.audio = (overrides?.audio as boolean) ?? form.audio;
      if (imageEntries.length > 0) body.images = imageEntries;
      if (referencePayload.length > 0) body.references = referencePayload;

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
      lastTaskId = taskId;

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
          const u: string | undefined = pollData?.content?.video_url;
          if (!u) throw new Error("Succeeded but no video url");
          return u;
        }
        if (status === "failed") throw new Error(pollData?.error?.message ?? "video task failed");
        if (status === "cancelled") throw new Error("video task cancelled upstream");
      }
      throw new Error(`Timed out after ${POLL_MAX_TRIES} polls`);
    }

    let url: string;
    let qaOutputs: QAOutputs = {};
    if (isGuarded(form)) {
      // Critic→regen loop (Forge inner loop). The reviser uses the Forge Claude
      // key (read here, never persisted into the graph payload).
      let claudeKey: string | undefined;
      try {
        claudeKey = localStorage.getItem(userKey("lumen.forge.claudeKey.v1")) ?? undefined;
      } catch {
        claudeKey = undefined;
      }
      const reviseMode: "t2v" | "i2v" | "r2v" =
        mode === "i2v" || mode === "i2v-fl" ? "i2v" : mode === "r2v" ? "r2v" : "t2v";
      const guarded = await runCriticLoopGuard({
        kind: "video",
        basePrompt,
        qa: form,
        signal,
        onProgress,
        baseSeed,
        mode: reviseMode,
        aspect: form.ratio,
        label: basePrompt.slice(0, 48),
        projectId,
        claudeKey,
        generate: generateOnce,
      });
      url = guarded.url;
      qaOutputs = guarded.outputs;
    } else {
      onProgress?.("Submitting task…");
      url = await generateOnce(basePrompt, baseSeed);
    }

    stageGeneratedVideo({
      taskId: lastTaskId,
      videoUrl: url,
      prompt: basePrompt,
      model: form.model,
      ratio: form.ratio,
      duration: form.duration,
      resolution: form.resolution,
      mode,
      seed: lastSeed,
      projectId,
    });

    const out: NodeOutputs = { url, ...qaOutputs };
    return out;
  },
};
