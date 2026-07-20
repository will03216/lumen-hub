"use client";

/**
 * Image → 3D Node (Seed3D 2.0).
 *
 * Pipeline: a public image URL → Seed3D image-to-3D task → a .glb mesh →
 * client-side turntable render (three.js) → N frames uploaded to TOS →
 * `first frame` / `last frame` public URLs that wire straight into Video
 * Gen's keyframe inputs, turning a still into an orbiting product video.
 *
 * Optional node: it only works when the user has added a Seed3D key in
 * Settings (or SEED3D_API_KEY is set for local dev). Without it, /api/model3d
 * returns the standard 402 → Settings prompt.
 *
 * Rendering runs entirely in the browser — see lib/studio/turntable.ts.
 */

import { memo, useCallback } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { renderTurntable } from "@/lib/studio/turntable";
import { NodeShell } from "./node-shell";
import { sleepCancellable } from "../util";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type ImageTo3DForm = {
  subdivision: "low" | "medium" | "high";
  /** Turntable frames rendered around the full 360° orbit. */
  frames: number;
  /** Square render resolution. */
  size: number;
  /** Background behind the mesh in rendered frames. */
  background: string;
};

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_TRIES = 120; // ~10 min; Seed3D runs ~4 min.

function isPublicUrl(s: string): boolean {
  return (
    (s.startsWith("https://") || s.startsWith("http://")) &&
    !s.startsWith("data:") &&
    !s.startsWith("blob:") &&
    !/localhost|127\.0\.0\.1/.test(s)
  );
}

/**
 * Seed3D fetches the source image server-side, so it must be a *publicly
 * reachable* https URL — it rejects same-origin `/library-cache/...` paths,
 * `blob:`, and `data:` URIs. Asset / URL-Input outputs are those forms, so
 * when the wired `image` isn't public we lift it to TOS first: read the
 * bytes in the browser, re-encode to JPEG via a canvas (Seed3D only accepts
 * jpeg/png/webp/bmp/tiff/gif — HEIC/AVIF would otherwise 400), then POST the
 * data URI to /api/model3d/upload-frame which uploads it to the user's TOS
 * bucket and returns a public https URL. Mirrors the stash'd upload flow
 * but runs transparently on the wired input, with no UI upload button.
 *
 * A pre-existing public https URL is passed through untouched.
 *
 * The canvas is capped at MAX_CANVAS px on the long edge. Source images
 * can be 4096×4096 (16.7Mpx) — at that size canvas.toDataURL blocks the
 * main thread for many seconds (looks like an infinite spinner) and the
 * resulting base64 is multi-MB. Capping to 2048² also keeps the output
 * under BytePlus's per-image 4.62Mpx area ceiling, so the same image won't
 * 400 downstream at Seed3D / Seedream.
 */
const MAX_CANVAS = 2048;

async function ensurePublicImage(
  imageUrl: string,
  signal: AbortSignal | undefined,
  onProgress?: (msg: string) => void,
): Promise<string> {
  if (isPublicUrl(imageUrl)) return imageUrl;

  // Read arbitrary same-origin / blob / data URLs into a canvas-decodable
  // image, then re-encode as JPEG. Seed3D's accepted set is exactly the set
  // the browser canvas can decode + emit, so this both normalizes format
  // (HEIC → JPEG) and produces a data URI for the TOS hop. A 20s ceiling
  // so a stuck decode surfaces instead of spinning forever.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      reject(new Error("timed out loading the wired image — pick a different source"));
    }, 20000);
    const done = (fn: () => void) => { clearTimeout(timer); fn(); };
    img.crossOrigin = "anonymous";
    img.onload = () => done(() => {
      // Scale the long edge down to MAX_CANVAS so a 4096² source doesn't
      // stall toDataURL and doesn't exceed the downstream area limit.
      const scale = Math.min(1, MAX_CANVAS / Math.max(img.naturalWidth, img.naturalHeight || 1));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("could not get canvas 2d context"));
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch (e) {
        reject(new Error("could not encode image — try saving as jpg/png first"));
      }
    });
    img.onerror = () => done(() =>
      reject(new Error("could not load the wired image — pick a different source")));
    img.src = imageUrl;
  });

  onProgress?.("Publishing source image to TOS…");
  const up = await fetch("/api/model3d/upload-frame", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
    signal,
  });
  const j = await up.json();
  if (!up.ok) throw new Error(j?.error ?? "source image upload failed");
  if (!j.url) throw new Error("source image upload returned no url");
  return j.url as string;
}

const SIZES = [512, 768, 1024] as const;

export const ImageTo3DNode = memo(function ImageTo3DNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<ImageTo3DForm>;

  const update = useCallback(
    (patch: Partial<ImageTo3DForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<ImageTo3DForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  const preview = d.outputs.firstFrame;

  return (
    <NodeShell id={id} spec={imageTo3DSpec} data={d} selected={selected ?? false} width={300}>
      <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-snug text-ink-dim">
        Wire any <span className="text-ink">image</span> (Image Gen, Asset, or
        URL). Generates a 3D mesh, renders a turntable, and emits{" "}
        <span className="text-ink">first / last frame</span> for Video Gen.
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Detail">
          <select
            value={d.form.subdivision}
            onChange={(e) => update({ subdivision: e.target.value as ImageTo3DForm["subdivision"] })}
            className="nodrag w-full rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink focus:border-accent focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="Frames">
          <input
            type="number"
            min={2}
            max={24}
            value={d.form.frames}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) update({ frames: Math.min(24, Math.max(2, Math.round(n))) });
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
        <Field label="Background">
          <input
            type="color"
            value={d.form.background}
            onChange={(e) => update({ background: e.target.value })}
            className="nodrag h-[30px] w-full cursor-pointer rounded-[8px] border border-border bg-panel"
          />
        </Field>
      </div>

      {preview && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="turntable frame" className="block h-auto w-full" draggable={false} />
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

export const imageTo3DSpec: NodeTypeSpec<ImageTo3DForm> = {
  type: "imageTo3D",
  label: "Image → 3D",
  description:
    "Seed3D 2.0: turn a product image into a 3D mesh, render a turntable, and emit first/last frames for Video Gen. Accepts Image Gen, Asset, or URL inputs — non-public sources are lifted to TOS first. Needs a Seed3D key in Settings.",
  inputs: [{ id: "image", label: "image" }],
  outputs: [
    { id: "firstFrame", label: "first frame" },
    { id: "lastFrame", label: "last frame" },
    { id: "frames", label: "frames (URLs)" },
    { id: "mesh", label: "glb" },
  ],
  defaults: { subdivision: "high", frames: 8, size: 768, background: "#ffffff" },
  hashInputs: (form, inputs) =>
    [
      "i3d",
      form.subdivision,
      form.frames,
      form.size,
      form.background,
      inputs.image ?? "",
    ].join("|"),
  execute: async ({ form, inputs, signal, onProgress }) => {
    const wired = inputs.image?.trim();
    if (!wired) throw new Error("Wire an image to convert to 3D");

    // Asset / URL-Input outputs are same-origin `/library-cache/...` paths or
    // data/blob URIs — not publicly fetchable. Lift to TOS first so Seed3D,
    // which fetches the image server-side, can reach it. Public https URLs
    // (e.g. an Image Gen TOS output) pass straight through.
    const imageUrl = await ensurePublicImage(wired, signal, onProgress);

    // 1) Submit the image→3D task.
    onProgress?.("Submitting 3D task…");
    const res = await fetch("/api/model3d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl,
        fileformat: "glb",
        subdivisionlevel: form.subdivision,
      }),
      signal,
    });
    const created = await res.json();
    if (!res.ok) throw new Error(created?.error ?? "3D task creation failed");
    const taskId: string | undefined = created?.id;
    if (!taskId) throw new Error("No task id returned by /api/model3d");

    // 2) Poll until the mesh is ready.
    let fileUrl: string | undefined;
    for (let tries = 1; tries <= POLL_MAX_TRIES; tries++) {
      await sleepCancellable(POLL_INTERVAL_MS, signal);
      onProgress?.(`Building mesh · try ${tries}/${POLL_MAX_TRIES}`);
      const pollRes = await fetch(`/api/model3d/${taskId}`, { signal });
      const poll = await pollRes.json();
      if (!pollRes.ok) throw new Error(poll?.error ?? "poll failed");
      const status = poll?.status as string | undefined;
      if (status === "succeeded") {
        fileUrl = poll?.content?.file_url;
        if (!fileUrl) throw new Error("Succeeded but no mesh file_url");
        break;
      }
      if (status === "failed") throw new Error(poll?.error?.message ?? "3D task failed");
      if (status === "cancelled") throw new Error("3D task cancelled upstream");
    }
    if (!fileUrl) throw new Error(`Timed out after ${POLL_MAX_TRIES} polls`);

    // 3) Same-origin GLB stream (server unzips the archive).
    const meshUrl = `/api/model3d/mesh?u=${encodeURIComponent(fileUrl)}`;

    // 4) Render the turntable in the browser.
    const dataUris = await renderTurntable(meshUrl, {
      frames: form.frames,
      size: form.size,
      background: form.background,
      signal,
      onProgress,
    });

    // 5) Publish frames to TOS so Seedance can ingest them as keyframes.
    onProgress?.("Uploading frames…");
    const urls = await Promise.all(
      dataUris.map(async (dataUrl) => {
        const up = await fetch("/api/model3d/upload-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
          signal,
        });
        const j = await up.json();
        if (!up.ok) throw new Error(j?.error ?? "frame upload failed");
        return j.url as string;
      }),
    );

    // first frame = 0°, last frame ≈ 180° so a first+last bookend reads as a
    // half-orbit tween in Seedance (a near-full turn would tween backwards).
    const mid = Math.floor(urls.length / 2);
    return {
      firstFrame: urls[0],
      lastFrame: urls[mid] ?? urls[urls.length - 1],
      frames: urls.join("\n"),
      mesh: meshUrl,
    };
  },
};
