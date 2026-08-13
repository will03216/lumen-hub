"use client";

/**
 * Frame Extract Node — capture a frame from a video URL and emit it
 * as an image data URI suitable for downstream i2v / i2i / style
 * transfer. The MVP path to "video to video": extract a frame, restyle
 * the still, regenerate a clip from the new starting frame.
 *
 * Why client-side
 * ---------------
 * Server-side ffmpeg would be the textbook answer, but bundling a
 * 30MB+ binary into a Next.js route for a feature most users won't
 * touch on day one isn't worth it. The browser's `<video>` + canvas
 * pipeline does this in ~20 lines, no extra dep, and works for any
 * BytePlus-CDN URL once routed through `/api/media` (same-origin).
 *
 * Output shape
 * ------------
 * Returns a JPEG data URI. JPEG at quality 0.9 keeps a 1080p frame
 * under ~700KB; PNG at native resolution would push past BytePlus's
 * 10MB image-input ceiling. Downstream nodes read `inputs.frame` and
 * pass it to /api/image or /api/video — both routes accept data URIs
 * verbatim.
 */

import { memo, useCallback } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { mediaProxyUrl } from "@/lib/compare/media-proxy";
import { VIDEO_EDIT_ENABLED } from "@/lib/video-edit/flag";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type FrameExtractForm = {
  /** Time offset in seconds. 0 = first frame; matches the typical
   *  i2v workflow (regenerate from the start). */
  at: number;
};

export const FrameExtractNode = memo(function FrameExtractNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<FrameExtractForm>;

  const update = useCallback(
    (patch: Partial<FrameExtractForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<FrameExtractForm>;
          return {
            ...n,
            data: { ...prev, form: { ...prev.form, ...patch } },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const frame = d.outputs.frame;
  /** The clip this node was pointed at, if any — the handoff to Video Edit
   *  needs the VIDEO, not the extracted still. */
  const inputs = d.inputs as Record<string, string | undefined>;
  const sourceVideoUrl =
    typeof inputs?.video === "string" ? inputs.video.trim() : "";

  return (
    <NodeShell
      id={id}
      spec={frameExtractSpec}
      data={d}
      selected={selected ?? false}
    >
      <Field label="At (seconds)">
        <input
          type="number"
          min={0}
          step={0.1}
          value={d.form.at}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) update({ at: Math.max(0, n) });
          }}
          className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
        />
      </Field>

      <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-snug text-ink-dim">
        Wire a video URL, run, then feed{" "}
        <span className="text-ink">frame</span> into Image Gen, Style
        Transfer, or Video Gen&rsquo;s image input.
      </div>

      {/*
        PRD §6, entry point 4. This node extracts a frame and stops — no
        editor, no timestamp ledger, no way back into video. Rather than grow
        it into a second editor, it points at the one that exists.

        The VIDEO url is handed over, not the extracted frame: Video Edit
        starts from a clip and does its own capture, because it needs the
        decoder's real timestamp and this node does not record one.
      */}
      {VIDEO_EDIT_ENABLED && sourceVideoUrl && (
        <a
          href={`/video-edit?src=${encodeURIComponent(sourceVideoUrl)}`}
          onClick={(e) => e.stopPropagation()}
          className="nodrag block rounded-[8px] border border-border px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-border-strong hover:text-ink"
        >
          Open in Video Edit →
        </a>
      )}

      {frame && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-panel">
          {/* Data URI thumbnail — large in DOM but fine for one preview. */}
          <img
            src={frame}
            alt="extracted frame"
            className="block h-auto w-full"
            draggable={false}
          />
        </div>
      )}
    </NodeShell>
  );
});

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

// ─────────────────────────── Frame extraction ────────────────────────

/** Capture one frame at the requested time from `videoUrl`. Returns a
 *  JPEG data URI sized to the video's native (videoWidth × videoHeight).
 *
 *  Routes through `mediaProxyUrl` so BytePlus CDN videos load
 *  same-origin — that's the same trick the Compare and Library views
 *  use. Without it the canvas is tainted and `toDataURL` throws a
 *  SecurityError. */
async function captureFrame(
  videoUrl: string,
  atSec: number,
  signal: AbortSignal,
): Promise<string> {
  const proxiedUrl = mediaProxyUrl(videoUrl);
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = proxiedUrl;

  // loadedmetadata fires when duration + dimensions are known.
  await waitForEvent(video, "loadedmetadata", signal);
  if (signal.aborted) throw new DOMException("aborted", "AbortError");

  const targetTime = Math.min(
    Math.max(0, atSec),
    Math.max(0, video.duration - 0.05),
  );
  // Seek then wait for `seeked` so the rendered frame matches the time.
  video.currentTime = targetTime;
  await waitForEvent(video, "seeked", signal);
  if (signal.aborted) throw new DOMException("aborted", "AbortError");

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2D unavailable");
  ctx.drawImage(video, 0, 0);

  // JPEG @ 0.9 keeps even a 1080p capture under BytePlus's 10MB image
  // ceiling. PNG would balloon past it.
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Promise wrapper around a one-shot DOM event with abort support.
 *  Rejects on the matching `error` event so a broken URL doesn't hang
 *  the whole graph run. */
function waitForEvent(
  el: HTMLMediaElement,
  type: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      el.removeEventListener(type, onEvent);
      el.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`video ${type} failed: load error`));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("aborted", "AbortError"));
    };
    el.addEventListener(type, onEvent, { once: true });
    el.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ─────────────────────────── Spec ────────────────────────────────────

export const frameExtractSpec: NodeTypeSpec<FrameExtractForm> = {
  type: "frameExtract",
  label: "Frame Extract",
  description:
    "Grab a frame from a video URL — feeds Image Gen, Style Transfer, or i2v.",
  inputs: [{ id: "video", label: "video" }],
  outputs: [{ id: "frame", label: "frame" }],
  defaults: { at: 0 },
  hashInputs: (form, inputs) => `fx:${form.at}|${inputs.video ?? ""}`,
  execute: async ({ form, inputs, signal }) => {
    const videoUrl = inputs.video?.trim();
    if (!videoUrl) {
      throw new Error("Wire a video URL to extract a frame from");
    }
    const frame = await captureFrame(videoUrl, form.at, signal);
    return { frame };
  },
};
