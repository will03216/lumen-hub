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
import { captureFrame } from "@/lib/studio/video-frame";
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
