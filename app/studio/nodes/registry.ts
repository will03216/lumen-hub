/**
 * Registry of every node type the canvas knows about.
 *
 * Single source of truth for:
 *   - the runner (executes by `node.type` lookup → `spec.execute`)
 *   - the palette (lists every entry of `ALL_NODE_SPECS`)
 *   - default form values when instantiating a fresh node from the palette
 *
 * The four spec exports are intentionally collected here (not in their
 * respective node files) so adding a fifth node type is one import + one
 * map entry.
 */

import type { NodeTypeId, NodeTypeSpec } from "../types";
import { textPromptSpec } from "./text-prompt-node";
import { assetSpec } from "./asset-node";
import { imageGenSpec } from "./image-gen-node";
import { styleTransferSpec } from "./style-transfer-node";
import { compareSpec } from "./compare-node";
import { frameExtractSpec } from "./frame-extract-node";
import { videoGenSpec } from "./video-gen-node";
import { previewSpec } from "./preview-node";
import { webExtractSpec } from "./web-extract-node";
import { promptComposerSpec } from "./prompt-composer-node";
import { promptOptimizerSpec } from "./prompt-optimizer-node";
import { longVideoSpec } from "./long-video-node";
import { articleIngesterSpec } from "./article-ingester-node";
import { articleNarrationSpec } from "./article-narration-node";
import { musicOverlaySpec } from "./music-overlay-node";
import { videoStitchSpec } from "./video-stitch-node";
import { urlInputSpec } from "./url-input-node";

/**
 * The registry is the type-erasure boundary.
 *
 * Each node file owns the strict types for its own form (`TextPromptForm`,
 * `VideoGenForm`, …). The runner only ever consults a spec via this map
 * and feeds values gathered from upstream nodes. We can't keep the form
 * type narrow here because TS function parameters are contravariant —
 * `(form: TextPromptForm) => string` is not assignable to
 * `(form: Record<string, unknown>) => string`. Using `any` for the form
 * generic preserves the runner's call-site ergonomics; safety is restored
 * at the per-node spec definition where the body actually reads the form.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNodeSpec = NodeTypeSpec<any>;

const REGISTRY: Record<NodeTypeId, AnyNodeSpec> = {
  textPrompt: textPromptSpec,
  asset: assetSpec,
  imageGen: imageGenSpec,
  styleTransfer: styleTransferSpec,
  compare: compareSpec,
  frameExtract: frameExtractSpec,
  videoGen: videoGenSpec,
  preview: previewSpec,
  webExtract: webExtractSpec,
  promptComposer: promptComposerSpec,
  promptOptimizer: promptOptimizerSpec,
  longVideo: longVideoSpec,
  articleIngester: articleIngesterSpec,
  articleNarration: articleNarrationSpec,
  musicOverlay: musicOverlaySpec,
  videoStitch: videoStitchSpec,
  urlInput: urlInputSpec,
};

export function getNodeSpec(type: string | undefined): AnyNodeSpec | undefined {
  if (!type) return undefined;
  return REGISTRY[type as NodeTypeId];
}

export const ALL_NODE_SPECS: AnyNodeSpec[] = Object.values(REGISTRY);
