/**
 * Forge — Capability Registry + cost metadata.
 *
 * The registry declares, per Studio node type, what the agent may call and
 * what it costs. Cost metadata is what powers the pre-commit budget estimate
 * shown at the freeze gate — the single most load-bearing cost guardrail. The
 * agent can only emit nodes that a template's `toolScope` allows; the compiler
 * enforces that.
 *
 * Pure, client-safe. Costs are rough public-pricing-order estimates in USD and
 * are explicitly labelled as estimates in the UI — they bound spend decisions,
 * they are not billing truth.
 */

import type { NodeTypeId } from "@/app/studio/types";

export type CapabilityKind = "input" | "generate" | "process" | "output";

export type Capability = {
  type: NodeTypeId;
  label: string;
  kind: CapabilityKind;
  /** Fixed cost per invocation (USD), e.g. an LLM prompt-optimizer call. */
  flatUsd?: number;
  /** Variable cost per second of generated video (USD/s). */
  perSecondUsd?: number;
  /** Variable cost per generated image (USD). */
  perImageUsd?: number;
};

/** Order-of-magnitude estimates. Tunable per deployment; the freeze gate
 *  surfaces them as "estimated spend", never as a charge. */
export const CAPABILITIES: Record<string, Capability> = {
  // inputs — free
  asset: { type: "asset", label: "Reference Asset", kind: "input" },
  textPrompt: { type: "textPrompt", label: "Text Prompt", kind: "input" },
  urlInput: { type: "urlInput", label: "URL Input", kind: "input" },
  webExtract: { type: "webExtract", label: "Web Extract", kind: "input", flatUsd: 0.002 },

  // reasoning / prompt synthesis — LLM calls
  promptOptimizer: { type: "promptOptimizer", label: "Prompt Engineer", kind: "process", flatUsd: 0.04 },
  promptComposer: { type: "promptComposer", label: "Prompt Composer", kind: "process", flatUsd: 0.01 },
  articleIngester: { type: "articleIngester", label: "Article Ingester", kind: "process", flatUsd: 0.03 },

  // generation — the dominant cost
  imageGen: { type: "imageGen", label: "Image Gen", kind: "generate", perImageUsd: 0.04 },
  videoGen: { type: "videoGen", label: "Video Gen", kind: "generate", perSecondUsd: 0.18 },
  longVideo: { type: "longVideo", label: "Long Video", kind: "generate", perSecondUsd: 0.18 },
  styleTransfer: { type: "styleTransfer", label: "Style Transfer", kind: "generate", perImageUsd: 0.04 },

  // post — cheap local/compute
  frameExtract: { type: "frameExtract", label: "Frame Extract", kind: "process", flatUsd: 0 },
  videoStitch: { type: "videoStitch", label: "Video Stitch", kind: "process", flatUsd: 0 },
  musicOverlay: { type: "musicOverlay", label: "Music Overlay", kind: "process", flatUsd: 0 },
  articleNarration: { type: "articleNarration", label: "Narration (TTS)", kind: "process", flatUsd: 0.02 },
  compare: { type: "compare", label: "Compare", kind: "generate", perSecondUsd: 0.18 },

  // output — free
  preview: { type: "preview", label: "Preview", kind: "output" },
};

export function getCapability(type: string): Capability | undefined {
  return CAPABILITIES[type];
}

/** True when `type` is within the template's scoped capability set. The
 *  compiler refuses to emit out-of-scope nodes; this is the enforcement point. */
export function isInScope(type: NodeTypeId, toolScope: NodeTypeId[]): boolean {
  return toolScope.includes(type);
}
