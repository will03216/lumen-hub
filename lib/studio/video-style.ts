import { jsonrepair } from "jsonrepair";

// ---------------------------------------------------------------------------
// Types — the structured analysis a vision model returns for a reference video.
// Modeled on the cinematic-prompt-lab (S project) AnalysisResult shape, which
// gives us scenes + prompt DNA + confidence instead of a flat brief.
// ---------------------------------------------------------------------------

export type VideoStyleMetadata = {
  title?: string;
  description?: string;
  uploader?: string;
  duration?: number;
};

export type SceneBreakdown = {
  id: string;
  range: string;
  title: string;
  subject: string;
  action: string;
  camera: string;
  lighting: string;
  composition: string;
  motion: string;
  sound: string;
  confidence: number;
  evidence: { frame: string; note: string }[];
};

export type PromptDna = {
  axis: string;
  finding: string;
  reusablePrompt: string;
  confidence: number;
};

export type VideoAnalysisResult = {
  sourceLabel: string;
  summary: string;
  scenes: SceneBreakdown[];
  promptDna: PromptDna[];
  confidence: {
    overall: number;
    visual: number;
    motion: number;
    prompt: number;
  };
  caveats: string[];
};

/** Legacy flat shape that the node previously rendered. Kept for the analyze
 *  route's response contract while the UI migrates. */
export type VideoStyleVisionAnalysis = {
  styleBrief: string;
  frameObservations: string[];
  analysis?: VideoAnalysisResult;
};

// ---------------------------------------------------------------------------
// JSON parsing — three-tier fallback so SeedPro JSON wrapped in prose/markdown
// or with trailing commas no longer falls back to frame captions.
// (Ported from S project's analyzer/analyze.ts.)
// ---------------------------------------------------------------------------

export function parseVideoStyleVisionAnalysis(raw: string): VideoStyleVisionAnalysis | null {
  const candidate = extractJsonObject(raw);
  if (!candidate) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    try {
      parsed = JSON.parse(jsonrepair(candidate));
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  // Accept either the new structured AnalysisResult or the legacy flat shape.
  const styleBrief = typeof obj.styleBrief === "string" ? obj.styleBrief.trim() : "";
  const enhancedPrompt = typeof obj.enhancedPrompt === "string" ? obj.enhancedPrompt.trim() : "";

  const frameObservations = Array.isArray(obj.frameObservations)
    ? obj.frameObservations
        .filter((item): item is string => typeof item === "string")
        .map(compact)
        .filter(Boolean)
    : [];

  const analysis = normalizeAnalysisResult(obj);

  // Need at least a style brief to be useful. The legacy contract required an
  // enhancedPrompt too, but the new flow generates that separately from the
  // target product — so a bare style brief is a valid result here.
  if (!styleBrief && !analysis) return null;

  return {
    styleBrief,
    frameObservations,
    analysis: analysis ?? undefined,
  };
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return extractJsonObject(fenced[1]);

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function normalizeAnalysisResult(obj: Record<string, unknown>): VideoAnalysisResult | null {
  const scenes = Array.isArray(obj.scenes) ? obj.scenes.filter(isSceneObject) : [];
  const promptDna = Array.isArray(obj.promptDna) ? obj.promptDna.filter(isPromptDnaObject) : [];
  if (scenes.length === 0 && promptDna.length === 0 && !obj.summary) return null;

  const confidence = obj.confidence;
  return {
    sourceLabel: typeof obj.sourceLabel === "string" ? obj.sourceLabel : "",
    summary: typeof obj.summary === "string" ? obj.summary : "",
    scenes,
    promptDna,
    confidence: {
      overall: confidenceField(confidence, "overall"),
      visual: confidenceField(confidence, "visual"),
      motion: confidenceField(confidence, "motion"),
      prompt: confidenceField(confidence, "prompt"),
    },
    caveats: Array.isArray(obj.caveats)
      ? obj.caveats.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function isSceneObject(value: unknown): value is SceneBreakdown {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === "string" || typeof v.subject === "string";
}

function isPromptDnaObject(value: unknown): value is PromptDna {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.axis === "string" || typeof v.reusablePrompt === "string";
}

function confidenceField(confidence: unknown, key: string): number {
  if (!confidence || typeof confidence !== "object") return 0;
  const v = (confidence as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// ---------------------------------------------------------------------------
// Reference-frame selection — kept from the previous implementation.
// ---------------------------------------------------------------------------

export type ReferenceFrame = {
  imageUrl: string;
  frameIndex: number;
  label: string;
  reason: string;
};

export function selectSeedanceReferenceFrame(frames: string[]): ReferenceFrame | undefined {
  if (frames.length === 0) return undefined;
  const start = frames.length > 4 ? Math.floor(frames.length * 0.08) : 0;
  const end = frames.length > 4 ? Math.max(start, Math.ceil(frames.length * 0.98) - 1) : frames.length - 1;
  const midpoint = (start + end) / 2;
  let bestIndex = start;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = start; index <= end; index += 1) {
    const frame = frames[index];
    const detail = frame.startsWith("data:image/") ? frame.length - frame.indexOf(",") - 1 : frame.length;
    const score = detail - Math.abs(index - midpoint) * 36;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return {
    imageUrl: frames[bestIndex],
    frameIndex: bestIndex,
    label: "Seedance reference frame",
    reason: "Selected from the main body of the sampled sequence because it carries the strongest visual detail for the dominant subject.",
  };
}

export function selectSeedanceAnalysisFrames(frames: string[], reference?: ReferenceFrame, maxFrames = 8): string[] {
  const selected = reference ? [reference.imageUrl] : [];
  const remainingSlots = Math.max(maxFrames - selected.length, 0);
  const sampled = sampleEvenly(frames, remainingSlots);
  for (const frame of sampled) pushUnique(selected, frame, maxFrames);
  for (const frame of frames) pushUnique(selected, frame, maxFrames);
  return selected;
}

function sampleEvenly(frames: string[], count: number): string[] {
  if (count <= 0) return [];
  if (frames.length <= count) return frames;
  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 0.5 : index / (count - 1);
    return frames[Math.round(progress * (frames.length - 1))];
  });
}

function pushUnique(items: string[], item: string, maxItems: number) {
  if (items.length < maxItems && !items.includes(item)) items.push(item);
}

// ---------------------------------------------------------------------------
// Brief construction
//
// The reference video's analysis is turned into a PRODUCT-AGNOSTIC style brief:
// motion grammar, camera, lighting, pacing, composition — never the source
// brand, product name, packaging colors, or exact scene. The enhanced prompt
// is built separately by /api/video/enhance-prompt once the user supplies a
// target product, so the brief can be edited and reused across products.
// ---------------------------------------------------------------------------

export type StyleBriefInput = {
  metadata: VideoStyleMetadata;
  analysis?: VideoAnalysisResult;
  frameObservations?: string[];
};

export type StyleBriefOutput = {
  styleBrief: string;
  summary: string;
  scenes: SceneBreakdown[];
  promptDna: PromptDna[];
  caveats: string[];
};

export function buildProductAgnosticStyleBrief(input: StyleBriefInput): StyleBriefOutput {
  const scenes = input.analysis?.scenes ?? [];
  const promptDna = input.analysis?.promptDna ?? [];
  const summary = compact(input.analysis?.summary) || briefFallbackSummary(input.metadata);

  const sceneLines = scenes.length
    ? scenes
        .map(
          (scene, index) =>
            `- Beat ${index + 1}${scene.range ? ` (${scene.range})` : ""}: ${compact(scene.title)}. ` +
            `Subject: ${compact(scene.subject) || "a generic beauty product"}. ` +
            `Action: ${compact(scene.action)}. Camera: ${compact(scene.camera)}. ` +
            `Lighting: ${compact(scene.lighting)}. Motion: ${compact(scene.motion)}.`,
        )
        .join("\n")
    : "";

  const dnaLines = promptDna.length
    ? promptDna
        .map((dna) => `- ${compact(dna.axis)}: ${compact(dna.finding)}. Reusable: ${compact(dna.reusablePrompt)}.`)
        .join("\n")
    : "";

  const frameLines = (input.frameObservations ?? [])
    .map(compact)
    .filter(Boolean)
    .slice(0, 5)
    .map((caption, index) => `- Frame ${index + 1}: ${caption}`)
    .join("\n");

  const styleBrief = [
    summary,
    "",
    "Motion grammar (product-agnostic):",
    sceneLines || "- Polished short-form beauty-ad pacing; slow controlled push-in; refined product reveal; macro texture emphasis; gentle highlight shimmer; clean cuts between hero product and texture detail.",
    "",
    "Reusable prompt DNA:",
    dnaLines || "- Shot scale, camera movement, edit pacing, lighting behavior, depth of field, texture emphasis, highlight movement, composition rhythm, and product-reveal logic.",
    frameLines ? `\nFrame observations (source, for reference only):\n${frameLines}` : "",
    "",
    "Transfer rule: borrow camera rhythm, edit pacing, lighting behaviour, gloss movement, and product-reveal logic only. Replace ALL source-specific visual matter (brand, product, packaging shape/color/material, logo, people, exact scene, typography, CTA, price) with the target product's own identity.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    styleBrief,
    summary,
    scenes,
    promptDna,
    caveats: input.analysis?.caveats ?? [],
  };
}

function briefFallbackSummary(metadata: VideoStyleMetadata): string {
  const title = compact(metadata.title);
  const uploader = compact(metadata.uploader);
  if (title && uploader) return `Reference creative system (source: ${uploader}). Style and motion grammar extracted below, stripped of source product identity.`;
  if (title) return `Reference creative system. Style and motion grammar extracted below, stripped of source product identity.`;
  return `Reference creative system. Style and motion grammar extracted below, stripped of source product identity.`;
}

// ---------------------------------------------------------------------------
// Enhanced prompt — combines the (editable, product-agnostic) style brief with
// the user's target product into a Seedance-ready prompt. Called by the node's
// "Generate Enhanced Prompt" button, NOT by the runner, so user edits survive.
// ---------------------------------------------------------------------------

export type EnhancedPromptInput = {
  styleBrief: string;
  productContext: string;
  basePrompt?: string;
};

export type EnhancedPromptFidelity = "faithful" | "balanced" | "rewrite";

export const ENHANCED_PROMPT_FIDELITIES: ReadonlyArray<{
  id: EnhancedPromptFidelity;
  label: string;
  hint: string;
}> = [
  { id: "faithful", label: "Faithful", hint: "Keep brief idea & phrasing; only adapt to target product" },
  { id: "balanced", label: "Balanced", hint: "Reuse grammar & beats; lightly polish phrasing" },
  { id: "rewrite", label: "Rewrite", hint: "Re-infer the ad arc; restructure into Shot blocks" },
];

export function buildEnhancedPromptPlan(input: EnhancedPromptInput): string {
  const product = compact(input.productContext) || "the target product";
  const base = compact(input.basePrompt) || `Create a premium product video for ${product}.`;
  const brief = compact(input.styleBrief);

  return [
    `${base} Reuse the reference video's creative system — motion grammar, camera, lighting, pacing, composition, and product-reveal logic — applied to ${product}'s own identity.`,
    brief ? `\nAnalyzed style brief (product-agnostic, reuse grammar only):\n${brief}` : "",
    `\nTarget product: ${product}. Every source-specific visual element must be replaced by ${product}'s own packaging identity, texture, color, and environment. No source brand, logo, packaging, people, typography, CTA, price, or exact scene.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The "rewrite strength" handed to the composer model as extraInstruction.
 * fidelity controls how far the output drifts from the style brief's own idea
 * and phrasing:
 *  - faithful: stay as close to the brief as possible; only retarget to the
 *    product, keep the brief's beat order and wording.
 *  - balanced: reuse the grammar and beat arc, lightly polish phrasing.
 *  - rewrite: the old behaviour — re-infer the advertising arc and restructure
 *    into 3-4 Shot N blocks.
 */
export function buildEnhancedPromptInstruction(
  product: string,
  fidelity: EnhancedPromptFidelity,
): string {
  const p = compact(product) || "the target product";
  const strip = `Replace ALL source-specific visual matter with ${p}'s own packaging identity, texture, color, and environment. ` +
    `No source brand, logo, packaging, people, typography, CTA, price, or exact scene. ` +
    `Use positive phrasing: clean product-only frame, source-free composition, packaging text only. ` +
    `Output one polished English Seedance prompt only — no analysis, no markdown, no copied metadata.`;

  if (fidelity === "faithful") {
    return [
      `Retarget the analyzed style brief to ${p} while PRESERVING its creative idea and wording as faithfully as possible.`,
      `Do NOT re-invent the advertising arc, do NOT restructure into new beats. Take the brief's existing motion grammar, camera, lighting, pacing, composition, and product-reveal beats verbatim where you can, and only adapt the subject to ${p}.`,
      `Keep the brief's own structure — if it lists beats in an order, keep that order; if it reads as prose, keep it as prose. Trim only what is clearly source-specific.`,
      strip,
    ].join(" ");
  }

  if (fidelity === "balanced") {
    return [
      `Reuse the analyzed style brief's creative system — motion grammar, camera, lighting, pacing, composition, and product-reveal logic — applied to ${p}'s own identity.`,
      `Keep the brief's creative beat arc and its core idea. Lightly polish phrasing for Seedance and fill in product identity, but do not restructure the arc or invent new beats.`,
      `Output one compact technical preamble, one identity sentence for ${p}, then a short sequence of shots mirroring the brief's beat order (3-4, only if the brief clearly has them). Each shot: one primary action verb, one primary camera move, one creative purpose.`,
      strip,
    ].join(" ");
  }

  // rewrite — the original deep-restructure behaviour.
  return (
    `Retarget the reference creative system to ${p}. First infer the advertising idea ` +
    `(opening hook, desire-building sensory beat, product proof/reveal, final brand payoff). Then ` +
    `transfer the reusable video grammar: shot scale, camera movement, edit pacing, lighting behavior, ` +
    `depth of field, surface texture, highlight movement, composition rhythm, product-reveal rhythm, and ` +
    `payoff structure. Output one compact technical preamble, one identity sentence for ${p}, then 3 ` +
    `concise Shot N blocks (use 4 only if the reference clearly has a fourth creative beat). Each shot: one ` +
    `primary action verb, one primary camera move, one creative purpose. ` + strip
  );
}

/** Lower temperature for faithful (stay on brief), higher for rewrite (explore). */
export function fidelityTemperature(fidelity: EnhancedPromptFidelity): number {
  if (fidelity === "faithful") return 0.2;
  if (fidelity === "balanced") return 0.4;
  return 0.5;
}

// ---------------------------------------------------------------------------
// Vision instruction — asks the model for a structured, PRODUCT-AGNOSTIC
// analysis of the reference video. The brand/product stripping happens here,
// at the instruction level, per the agreed approach.
// ---------------------------------------------------------------------------

export function buildVisionAnalysisInstruction({
  metadata,
  referenceFrameIndex,
}: {
  metadata: VideoStyleMetadata;
  referenceFrameIndex?: number;
}) {
  return `
You are an expert AI-video creative-system analyst for Seedance.

Analyze the sampled frames from start to finish. The first image is the selected Seedance reference frame and should be treated as the primary visual anchor${referenceFrameIndex === undefined ? "." : ` from sampled frame ${referenceFrameIndex + 1}.`}

CRITICAL — PRODUCT-AGNOSTIC EXTRACTION:
You are extracting a reusable CREATIVE SYSTEM, not describing the source product. The style brief you produce must NEVER contain the source brand name, source product name, source packaging shape/color/material, source logo, or any source-identifying visual. Replace every source-specific object with a GENERIC, product-neutral description. Examples of what to strip and how:
- "rhode's white lipstick tube" → "a cylindrical beauty product"
- "Chanel ROUGE COCO gold bullet" → "a premium cosmetic product"
- "the source brand's pink packaging" → "the target product's own packaging"
Translate the source video into reusable video grammar ONLY: shot scale, camera movement, edit pacing, lighting behavior, depth of field, texture emphasis, highlight movement, composition rhythm, and product-reveal logic.

Return only valid JSON with this exact shape:
{
  "sourceLabel": string,
  "summary": string,
  "scenes": Array<{
    "id": string,
    "range": string,
    "title": string,
    "subject": string,
    "action": string,
    "camera": string,
    "lighting": string,
    "composition": string,
    "motion": string,
    "sound": string,
    "confidence": number,
    "evidence": Array<{ "frame": string, "note": string }>
  }>,
  "promptDna": Array<{
    "axis": string,
    "finding": string,
    "reusablePrompt": string,
    "confidence": number
  }>,
  "styleBrief": string,
  "frameObservations": string[],
  "confidence": { "overall": number, "visual": number, "motion": number, "prompt": number },
  "caveats": string[]
}

Rules:
- summary: one-sentence description of the reference's creative system (product-agnostic).
- scenes: the reference's creative beats, each with product-neutral subject/action. Range is the estimated time window.
- promptDna: transferable axes (e.g. "camera movement", "lighting behavior") with a reusable prompt fragment each.
- styleBrief: a product-agnostic creative-system brief — motion grammar, camera, lighting, pacing, composition, product-reveal logic. Must NOT name the source brand or product.
- frameObservations: short product-neutral notes per analyzed frame.
- Do NOT write ad copy, CTA, price, discount, or added typography anywhere.
- Do NOT claim to recover the original hidden prompt.
- Return raw JSON only. No markdown fences, no commentary outside the JSON object.

Reference metadata (context only — do not copy into the brief):
Title: ${metadata.title ?? ""}
Description: ${metadata.description ?? ""}
Source account: ${metadata.uploader ?? ""}
Reference duration: ${metadata.duration ? `${Math.round(metadata.duration)}s` : "unknown"}
`;
}

function compact(value?: string): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
