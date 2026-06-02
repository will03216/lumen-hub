"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type VideoStitchForm = Record<string, never>;

export const VideoStitchNode = memo(function VideoStitchNode({
  id,
  data,
  selected,
}: NodeProps) {
  const d = data as StudioNodeData<VideoStitchForm>;
  const url = d.outputs.url as string | undefined;

  return (
    <NodeShell id={id} spec={videoStitchSpec} data={d} selected={selected ?? false} width={320}>
      {/* ── Hint ──────────────────────────────────────────────────── */}
      {!url && d.status === "idle" && (
        <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-[1.6] text-ink-dim">
          Wire two or more{" "}
          <span className="text-ink">Video Gen</span> →{" "}
          <span className="text-ink">videos</span> port, then{" "}
          <span className="text-ink">Run</span> to concatenate into one clip.
        </div>
      )}

      {/* ── Output video ──────────────────────────────────────────── */}
      {url && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={url} controls playsInline className="block h-auto w-full" />
        </div>
      )}
    </NodeShell>
  );
});

export const videoStitchSpec: NodeTypeSpec<VideoStitchForm> = {
  type: "videoStitch",
  label: "Video Stitch",
  description:
    "Concatenate multiple Video Gen clips into one video. Wire two or more video outputs to the videos port.",
  inputs: [{ id: "videos", label: "videos (multi-wire)" }],
  outputs: [{ id: "url", label: "url" }],
  defaults: {},
  hashInputs: (_form, inputs) => `vs1|${inputs.videos ?? ""}`,
  execute: async ({ inputs, signal, onProgress }) => {
    const raw = inputs.videos?.trim();
    if (!raw) throw new Error("Connect at least two Video Gen outputs to the videos port.");

    const urls = raw
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length < 2) {
      throw new Error(
        `At least 2 video inputs are required to stitch; got ${urls.length}. Wire more Video Gen nodes to the videos port.`,
      );
    }

    onProgress?.(`Stitching ${urls.length} clips…`);
    const res = await fetch("/api/video/stitch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrls: urls }),
      signal,
    });
    const json = (await res.json()) as { url?: string; error?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    if (!json.url) throw new Error("No URL returned from stitch.");
    return { url: json.url };
  },
};
