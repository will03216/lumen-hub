"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Download, ExternalLink } from "lucide-react";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type PreviewForm = Record<string, never>;

/** Heuristic: BytePlus image URLs end in image extensions, video URLs end
 *  in .mp4. We can't read the upstream node's type from inside this
 *  component, but the extension is a reliable signal. */
function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export const PreviewNode = memo(function PreviewNode({
  id,
  data,
  selected,
}: NodeProps) {
  const d = data as StudioNodeData<PreviewForm>;
  // Preview's only job is to mirror upstream output. Nothing of its own
  // executes server-side, so the "url" lives on `inputs` semantically —
  // but our runner stores upstream values into `outputs` of the source node
  // and writes them to this node's outputs after `execute()` returns. So
  // we read from `inputs.url` first (set by execute), fall back to outputs.
  const url = d.outputs.url;
  const kind = url ? (isVideoUrl(url) ? "video" : "image") : null;

  return (
    <NodeShell
      id={id}
      spec={previewSpec}
      data={d}
      selected={selected ?? false}
      width={340}
    >
      {!url && (
        <div className="flex h-32 items-center justify-center rounded-[8px] border border-dashed border-border bg-panel font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
          Awaiting upstream …
        </div>
      )}
      {url && kind === "image" && (
        <div className="overflow-hidden rounded-[8px] border border-border bg-panel">
          <img
            src={url}
            alt="preview"
            className="block h-auto w-full"
            draggable={false}
          />
        </div>
      )}
      {url && kind === "video" && (
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
      {url && (
        <div className="flex items-center gap-2">
          <a
            href={url}
            download
            className="nodrag inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-accent hover:text-accent"
          >
            <Download className="size-3" /> Save
          </a>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="nodrag inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-accent hover:text-accent"
          >
            <ExternalLink className="size-3" /> Open
          </a>
        </div>
      )}
    </NodeShell>
  );
});

export const previewSpec: NodeTypeSpec<PreviewForm> = {
  type: "preview",
  label: "Preview",
  description: "Inline render of an image or video URL.",
  inputs: [{ id: "url", label: "url" }],
  outputs: [],
  defaults: {} as PreviewForm,
  hashInputs: (_form, inputs) => `p:${inputs.url ?? ""}`,
  // Preview "executes" by simply forwarding its input into outputs so the
  // node body can read it from a single source (`d.outputs.url`).
  execute: async ({ inputs }) => ({ url: inputs.url }),
};
