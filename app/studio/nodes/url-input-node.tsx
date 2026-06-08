"use client";

import { memo, useCallback } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type UrlInputForm = {
  urls: string;
};

function parseUrls(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("http://") || s.startsWith("https://"));
}

export const UrlInputNode = memo(function UrlInputNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<UrlInputForm>;

  const update = useCallback(
    (patch: Partial<UrlInputForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<UrlInputForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  const valid = parseUrls(d.form.urls);

  return (
    <NodeShell id={id} spec={urlInputSpec} data={d} selected={selected ?? false}>
      <textarea
        rows={4}
        value={d.form.urls}
        onChange={(e) => update({ urls: e.target.value })}
        placeholder={"https://example.com/image.jpg\nhttps://…"}
        className="nodrag nowheel w-full resize-none rounded-[8px] border border-border bg-panel px-2 py-1.5 font-mono text-[11px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
      />
      {d.form.urls.trim() && (
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.10em] text-ink-mute">
          {valid.length} valid URL{valid.length !== 1 ? "s" : ""} · wire{" "}
          <span className="text-ink-dim">url</span> for single,{" "}
          <span className="text-ink-dim">urls</span> for batch
        </div>
      )}
    </NodeShell>
  );
});

export const urlInputSpec: NodeTypeSpec<UrlInputForm> = {
  type: "urlInput",
  label: "URL Input",
  description: "Paste one or more URLs (one per line) to wire directly into generators.",
  inputs: [],
  outputs: [
    { id: "url", label: "url (first)" },
    { id: "urls", label: "urls (all)" },
  ],
  defaults: { urls: "" },
  hashInputs: (form) => `u:${form.urls}`,
  execute: async ({ form }) => {
    const valid = parseUrls(form.urls);
    return {
      url: valid[0],
      urls: valid.length > 0 ? valid.join("\n") : undefined,
    };
  },
};
