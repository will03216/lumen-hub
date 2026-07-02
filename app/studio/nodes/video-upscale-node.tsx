"use client";

import { memo, useCallback } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import { sleepCancellable } from "../util";
import type { NodeTypeSpec, StudioNodeData } from "../types";

/**
 * Upscale & Enhance — BytePlus AI MediaKit "enhance-video" tool.
 *
 * Takes a public video URL (as emitted by Video Gen / Stitch / Narration /
 * URL Input), submits an enhancement task, and polls until it completes.
 * Output is a 24h-valid URL — good for immediate chaining into Preview /
 * Music Overlay, not for permanent storage.
 */

export type VideoUpscaleForm = {
  tool_version: "standard" | "professional";
  scene: "common" | "ugc" | "short_series" | "aigc" | "old_film";
  resolution: string;
  /** Empty string = keep source fps. */
  fps: string;
  bitrate_level: "low" | "medium" | "high";
};

const TOOL_VERSIONS = ["standard", "professional"] as const;
const SCENES = ["common", "ugc", "short_series", "aigc", "old_film"] as const;
const RESOLUTIONS = ["240p", "360p", "480p", "720p", "1080p", "2k", "4k"] as const;
const BITRATE_LEVELS = ["low", "medium", "high"] as const;

// Enhancement is RTF-based and can run for minutes on 4K / professional.
// Poll patiently: 5s × 240 ≈ 20 min ceiling.
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_TRIES = 240;

function isPublicUrl(s: string): boolean {
  return (
    (s.startsWith("https://") || s.startsWith("http://")) &&
    !s.startsWith("data:") &&
    !s.startsWith("blob:") &&
    !/localhost|127\.0\.0\.1/.test(s)
  );
}

export const VideoUpscaleNode = memo(function VideoUpscaleNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<VideoUpscaleForm>;
  const url = d.outputs.url as string | undefined;
  const isPro = d.form.tool_version === "professional";

  const update = useCallback(
    (patch: Partial<VideoUpscaleForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<VideoUpscaleForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  return (
    <NodeShell id={id} spec={videoUpscaleSpec} data={d} selected={selected ?? false} width={300}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tool">
          <select
            value={d.form.tool_version}
            onChange={(e) => update({ tool_version: e.target.value as VideoUpscaleForm["tool_version"] })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {TOOL_VERSIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Scene">
          <select
            value={d.form.scene}
            disabled={isPro}
            onChange={(e) => update({ scene: e.target.value as VideoUpscaleForm["scene"] })}
            title={isPro ? "Scene only applies to the standard tool version" : undefined}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {SCENES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Res">
          <select
            value={d.form.resolution}
            onChange={(e) => update({ resolution: e.target.value })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="FPS">
          <input
            type="text"
            inputMode="numeric"
            value={d.form.fps}
            onChange={(e) => update({ fps: e.target.value })}
            placeholder="source"
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
        </Field>
        <Field label="Bitrate">
          <select
            value={d.form.bitrate_level}
            onChange={(e) => update({ bitrate_level: e.target.value as VideoUpscaleForm["bitrate_level"] })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {BITRATE_LEVELS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </Field>
      </div>

      {d.form.fps.trim() && (
        <p className="font-mono text-[9px] leading-[1.5] text-ink-mute">
          ⚠ FPS overrides the bitrate level.
        </p>
      )}

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

export const videoUpscaleSpec: NodeTypeSpec<VideoUpscaleForm> = {
  type: "videoUpscale",
  label: "Upscale & Enhance",
  description:
    "Upscale and enhance a video via BytePlus AI MediaKit. Wire a public video URL (Video Gen / Stitch / Narration / URL Input) to the video port. Output URL is valid 24h.",
  inputs: [{ id: "video", label: "video" }],
  outputs: [{ id: "url", label: "url" }],
  defaults: {
    tool_version: "standard",
    scene: "aigc",
    resolution: "1080p",
    fps: "",
    bitrate_level: "medium",
  },
  hashInputs: (form, inputs) =>
    [
      "vu1",
      form.tool_version,
      // scene only affects standard runs
      form.tool_version === "standard" ? form.scene : "-",
      form.resolution,
      form.fps.trim(),
      form.bitrate_level,
      inputs.video ?? "",
    ].join("|"),
  execute: async ({ form, inputs, signal, onProgress }) => {
    const video = inputs.video?.trim();
    if (!video) throw new Error("Wire a video URL to the 'video' port.");
    if (!isPublicUrl(video)) {
      throw new Error(
        "The video URL must be a publicly reachable https:// URL — MediaKit " +
          "downloads it server-side. (A private TOS bucket fails with 403 UrlDownloadFail.)",
      );
    }

    const body: Record<string, unknown> = {
      url: video,
      tool_version: form.tool_version,
      resolution: form.resolution,
      bitrate_level: form.bitrate_level,
      // client_token makes submit idempotent so a retried run doesn't double-queue.
      client_token: crypto.randomUUID(),
    };
    if (form.tool_version === "standard") body.scene = form.scene;
    const fpsNum = form.fps.trim() ? Number(form.fps) : NaN;
    if (Number.isFinite(fpsNum)) body.fps = fpsNum;

    onProgress?.("Submitting enhancement task…");
    const res = await fetch("/api/video/enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const responseData = await res.json();
    if (!res.ok) {
      const parts: string[] = [responseData?.error ?? "enhance task creation failed"];
      if (responseData?.code) parts.push(`[${responseData.code}]`);
      if (responseData?.request_id) parts.push(`(req ${responseData.request_id})`);
      throw new Error(parts.join(" "));
    }
    const taskId: string | undefined = responseData?.task_id;
    if (!taskId) throw new Error("No task_id returned by /api/video/enhance");

    for (let tries = 1; tries <= POLL_MAX_TRIES; tries++) {
      await sleepCancellable(POLL_INTERVAL_MS, signal);
      onProgress?.(`Enhancing · poll ${tries}/${POLL_MAX_TRIES}`);
      const pollRes = await fetch(`/api/video/enhance/${encodeURIComponent(taskId)}`, { signal });
      const pollData = await pollRes.json();
      if (!pollRes.ok) throw new Error(pollData?.error ?? "poll failed");

      const status = String(pollData?.status ?? "").toLowerCase();
      if (status === "completed" || status === "success" || status === "succeeded") {
        const out: string | undefined = pollData?.url;
        if (!out) throw new Error("Task completed but no output URL was returned.");
        return { url: out };
      }
      if (status === "failed" || status === "error") {
        throw new Error(pollData?.error ?? "enhancement task failed");
      }
      // pending / processing / running → keep polling
    }
    throw new Error(`Timed out after ${POLL_MAX_TRIES} polls`);
  },
};
