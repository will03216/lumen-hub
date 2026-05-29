"use client";

import { memo, useCallback, useRef, useState } from "react";
import { useReactFlow, useNodes, useEdges, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type MusicOverlayForm = {
  /** Music track URL — overridden by the `audio` input port at run time. */
  audioUrl: string;
  /** Display name of the locally-uploaded file (for UI only). */
  uploadedFileName?: string;
};

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; progress: string }
  | { status: "error"; message: string };

export const MusicOverlayNode = memo(function MusicOverlayNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const allNodes = useNodes();
  const allEdges = useEdges();
  const d = data as StudioNodeData<MusicOverlayForm>;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  const update = useCallback(
    (patch: Partial<MusicOverlayForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<MusicOverlayForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  const resolveInput = useCallback(
    (handle: string): string => {
      for (const edge of allEdges) {
        if (edge.target !== id || edge.targetHandle !== handle) continue;
        const src = allNodes.find((n) => n.id === edge.source);
        if (!src) continue;
        const val = (src.data as StudioNodeData<unknown>).outputs?.[edge.sourceHandle ?? "default"];
        if (val) return val as string;
      }
      return "";
    },
    [id, allNodes, allEdges],
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadState({ status: "uploading", progress: "Uploading…" });
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/audio/upload", { method: "POST", body: formData });
        const json = await res.json() as { url?: string; error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!json.url) throw new Error("No URL returned from upload.");
        update({ audioUrl: json.url, uploadedFileName: file.name });
        setUploadState({ status: "idle" });
      } catch (err) {
        setUploadState({
          status: "error",
          message: err instanceof Error ? err.message : "upload failed",
        });
      }
      // Reset input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [update],
  );

  const url = d.outputs.url as string | undefined;
  const liveAudio = resolveInput("audio") || d.form.audioUrl;
  const isUploading = uploadState.status === "uploading";

  return (
    <NodeShell id={id} spec={musicOverlaySpec} data={d} selected={selected ?? false} width={380}>
      {/* ── Music source ───────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          Music Track
        </span>

        {/* Uploaded file badge */}
        {d.form.uploadedFileName && (
          <div className="flex items-center gap-1.5 rounded-[8px] border border-border bg-panel px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink">
              {d.form.uploadedFileName}
            </span>
            <button
              type="button"
              onClick={() => {
                update({ audioUrl: "", uploadedFileName: undefined });
                setUploadState({ status: "idle" });
              }}
              className="nodrag shrink-0 font-mono text-[9px] text-ink-mute hover:text-[oklch(0.65_0.22_25)]"
            >
              remove
            </button>
          </div>
        )}

        {/* URL input (shown when no uploaded file) */}
        {!d.form.uploadedFileName && (
          <input
            type="url"
            value={d.form.audioUrl}
            onChange={(e) => update({ audioUrl: e.target.value, uploadedFileName: undefined })}
            placeholder="https://… (mp3, aac, wav)"
            className="nodrag nowheel w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[11px] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
          />
        )}

        {/* Upload button row */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.aac,.wav,.ogg,.flac,.m4a"
            className="sr-only"
            onChange={(e) => void handleFileChange(e)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="nodrag flex-1 rounded-[8px] border border-border bg-panel px-2 py-1.5 font-mono text-[10px] text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {isUploading ? uploadState.progress : d.form.uploadedFileName ? "Replace file…" : "Upload local file…"}
          </button>
          <span className="shrink-0 font-mono text-[9px] text-ink-mute">or connect ← audio port</span>
        </div>

        {uploadState.status === "error" && (
          <div className="rounded-[8px] border border-[oklch(0.65_0.22_25)]/40 bg-panel px-2 py-1.5 font-mono text-[10px] text-[oklch(0.65_0.22_25)]">
            {uploadState.message}
          </div>
        )}
      </div>

      {/* ── Status hint ───────────────────────────────────────────── */}
      {!url && d.status === "idle" && (
        <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-[1.6] text-ink-dim">
          Connect <span className="text-ink">video</span> from Long Video or Article Narration →
          upload or paste a music URL → <span className="text-ink">Run</span>.
          {" "}Audio is trimmed to the video length.
          {!liveAudio && (
            <span className="mt-1 block text-[oklch(0.65_0.22_25)]">
              No audio source connected or entered.
            </span>
          )}
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

export const musicOverlaySpec: NodeTypeSpec<MusicOverlayForm> = {
  type: "musicOverlay",
  label: "Music Overlay",
  description:
    "Mix a background music track onto a stitched video. Strips existing audio and overlays the supplied track, trimmed to video length.",
  inputs: [
    { id: "video", label: "video" },
    { id: "audio", label: "audio URL" },
  ],
  outputs: [{ id: "url", label: "url" }],
  defaults: {
    audioUrl: "",
    uploadedFileName: undefined,
  },
  hashInputs: (form, inputs) =>
    `mo1|${inputs.video ?? ""}|${inputs.audio ?? form.audioUrl}`,
  execute: async ({ form, inputs, signal, onProgress }) => {
    const videoUrl = (inputs.video as string | undefined)?.trim();
    if (!videoUrl) throw new Error("Connect a video output to the video input port.");

    const audioUrl = ((inputs.audio as string | undefined)?.trim()) || form.audioUrl.trim();
    if (!audioUrl) throw new Error("Enter a music URL, upload a local file, or connect an audio source.");

    onProgress?.("Mixing music track…");
    const res = await fetch("/api/video/stitch-with-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrls: [videoUrl], audioUrl }),
      signal,
    });
    const json = await res.json() as { url?: string; error?: string };
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    if (!json.url) throw new Error("No URL returned from stitch-with-audio.");
    return { url: json.url };
  },
};
