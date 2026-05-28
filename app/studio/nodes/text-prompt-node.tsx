"use client";

import { memo, useCallback } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type TextPromptForm = {
  text: string;
};

/** Generic enough to fairly demonstrate every engine, specific enough to
 *  produce an interesting frame. Mirrors `lib/studio/models.ts`
 *  `IMAGE_SUGGESTIONS` so users see consistent prompts across surfaces. */
const SUGGESTIONS = [
  "A lone astronaut sitting on the rim of a red-dust canyon at golden hour, reflective visor, cinematic wide shot",
  "Hyperreal macro of a translucent beetle on wet moss, dewdrops, shallow depth of field, studio light",
  "Neon-drenched Tokyo alleyway after rain, puddle reflections, anamorphic lens flare, film still",
];

export const TextPromptNode = memo(function TextPromptNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<TextPromptForm>;

  const update = useCallback(
    (patch: Partial<TextPromptForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<TextPromptForm>;
          return {
            ...n,
            data: { ...prev, form: { ...prev.form, ...patch } },
          };
        }),
      );
    },
    [id, setNodes],
  );

  return (
    <NodeShell
      id={id}
      spec={textPromptSpec}
      data={d}
      selected={selected ?? false}
    >
      <textarea
        rows={4}
        value={d.form.text}
        onChange={(e) => update({ text: e.target.value })}
        placeholder="Describe the frame…"
        className="nodrag nowheel w-full resize-none rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[12px] leading-[1.45] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
      />
      <div className="flex flex-wrap gap-1">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => update({ text: s })}
            className="nodrag rounded-full border border-border bg-panel px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-ink-dim transition-colors hover:border-accent hover:text-accent"
            title={s}
          >
            try #{i + 1}
          </button>
        ))}
      </div>
    </NodeShell>
  );
});

export const textPromptSpec: NodeTypeSpec<TextPromptForm> = {
  type: "textPrompt",
  label: "Text Prompt",
  description: "Free-text prompt that feeds downstream generators.",
  inputs: [],
  outputs: [{ id: "prompt", label: "prompt" }],
  defaults: { text: "" },
  hashInputs: (form) => `t:${form.text}`,
  execute: async ({ form }) => ({ prompt: form.text }),
};
