"use client";

/**
 * Turntable Video Node — the *deterministic* 360° path.
 *
 * Takes the `glb` mesh from an Image → 3D node, renders a dense evenly-spaced
 * frame sequence in the browser (three.js), and ffmpeg-stitches them into an
 * mp4 server-side. Because every frame is the SAME mesh from a rotating
 * camera, the orbit is pixel-perfect and perfectly consistent — no generative
 * model, no drift. Use this (instead of the R2V path) when consistency matters
 * more than photoreal lighting.
 *
 * Rendering runs entirely in the browser; only the finished JPEG frames are
 * uploaded, then ffmpeg assembles + the clip lands in the user's TOS bucket.
 */

import { memo, useCallback } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { renderTurntable } from "@/lib/studio/turntable";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type TurntableVideoForm = {
  fps: number;
  duration: number;
  size: number;
  background: string;
  direction: "cw" | "ccw";
};

const SIZES = [512, 768, 1024] as const;
const MAX_FRAMES = 240;

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export const TurntableVideoNode = memo(function TurntableVideoNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<TurntableVideoForm>;

  const update = useCallback(
    (patch: Partial<TurntableVideoForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<TurntableVideoForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  const url = d.outputs.url;
  const totalFrames = Math.min(MAX_FRAMES, Math.round(d.form.fps * d.form.duration));

  return (
    <NodeShell id={id} spec={turntableVideoSpec} data={d} selected={selected ?? false} width={300}>
      <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-snug text-ink-dim">
        Wire the <span className="text-ink">glb</span> output of Image → 3D.
        Renders {totalFrames} frames → exact 360° mp4 (no AI drift).
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="FPS">
          <input
            type="number"
            min={1}
            max={60}
            value={d.form.fps}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) update({ fps: Math.min(60, Math.max(1, Math.round(n))) });
            }}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          />
        </Field>
        <Field label="Duration (s)">
          <input
            type="number"
            min={1}
            max={10}
            step={0.5}
            value={d.form.duration}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) update({ duration: Math.min(10, Math.max(1, n)) });
            }}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          />
        </Field>
        <Field label="Size">
          <select
            value={String(d.form.size)}
            onChange={(e) => update({ size: Number(e.target.value) })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </Field>
        <Field label="Direction">
          <select
            value={d.form.direction}
            onChange={(e) => update({ direction: e.target.value as TurntableVideoForm["direction"] })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            <option value="cw">Clockwise</option>
            <option value="ccw">Counter-cw</option>
          </select>
        </Field>
      </div>

      <Field label="Background">
        <input
          type="color"
          value={d.form.background}
          onChange={(e) => update({ background: e.target.value })}
          className="nodrag h-[30px] w-full cursor-pointer rounded-[8px] border border-border bg-panel"
        />
      </Field>

      {url && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={url} controls playsInline loop className="block h-auto w-full" />
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

export const turntableVideoSpec: NodeTypeSpec<TurntableVideoForm> = {
  type: "turntableVideo",
  label: "Turntable Video",
  description:
    "Deterministic 360° orbit: render the Image → 3D mesh from every angle and ffmpeg-stitch into an exact, perfectly consistent mp4. No generative drift.",
  inputs: [{ id: "mesh", label: "glb" }],
  outputs: [{ id: "url", label: "url" }],
  defaults: { fps: 24, duration: 3, size: 768, background: "#ffffff", direction: "cw" },
  hashInputs: (form, inputs) =>
    [
      "ttv",
      form.fps,
      form.duration,
      form.size,
      form.background,
      form.direction,
      inputs.mesh ?? "",
    ].join("|"),
  execute: async ({ form, inputs, signal, onProgress }) => {
    const meshUrl = inputs.mesh?.trim();
    if (!meshUrl) throw new Error("Wire the 'glb' output of an Image → 3D node");

    const totalFrames = Math.min(MAX_FRAMES, Math.max(2, Math.round(form.fps * form.duration)));

    // Render the dense turntable sequence (covers [0°, 360°) → seamless loop).
    const dataUris = await renderTurntable(meshUrl, {
      frames: totalFrames,
      size: form.size,
      background: form.background,
      signal,
      onProgress,
    });
    if (form.direction === "ccw") dataUris.reverse();

    // Ship the frames to ffmpeg as multipart (binary, ordered) and get an mp4.
    onProgress?.("Encoding video…");
    const body = new FormData();
    body.append("fps", String(form.fps));
    for (let i = 0; i < dataUris.length; i++) {
      const blob = await dataUrlToBlob(dataUris[i]);
      body.append("frames", blob, `frame_${String(i).padStart(4, "0")}.jpg`);
    }

    const res = await fetch("/api/model3d/turntable-video", {
      method: "POST",
      body,
      signal,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "turntable video encode failed");
    if (!json.url) throw new Error("encode succeeded but no url returned");

    return { url: json.url as string };
  },
};
