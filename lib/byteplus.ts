const BASE_URL =
  process.env.BYTEPLUS_BASE_URL ??
  "https://ark.ap-southeast.bytepluses.com/api/v3";

export const IMAGE_MODEL =
  process.env.BYTEPLUS_IMAGE_MODEL ?? "seedream-5-0-lite-260128";

export const VIDEO_MODEL =
  process.env.BYTEPLUS_VIDEO_MODEL ?? "seedance-1-5-pro-251215";

/**
 * Logical-id → BytePlus inference endpoint mapping.
 *
 * BytePlus distinguishes two ways of calling a model:
 *   1. By raw model ID  (e.g. `seedream-5-0-lite-260128`) — works only when
 *      that exact model is enabled on the account.
 *   2. By inference endpoint ID (`ep-YYYYMMDD…`) — required for some accounts
 *      that bind models via console-side endpoint provisioning.
 *
 * The UI dropdowns are stable on the logical IDs so the labels and capability
 * matrices in `lib/studio/models.ts` stay in sync. We translate to endpoint
 * IDs at the network boundary via this map, so the UI never needs to know
 * which form the account actually accepts.
 *
 * Format (env): `BYTEPLUS_MODEL_ALIASES=logical1=ep-...,logical2=ep-...`
 * Whitespace around `,` and `=` is tolerated. Empty entries are ignored.
 *
 * IMPORTANT: callers must branch on the *original* (pre-alias) model id —
 * `isSeedance2()` cannot infer family from an opaque `ep-…` string.
 */
function parseAliases(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

const MODEL_ALIASES = parseAliases(process.env.BYTEPLUS_MODEL_ALIASES);

/** Resolve a UI-visible model id to whatever BytePlus actually expects on the
 *  wire. Identity when no alias is configured. */
export function resolveModel(id: string): string {
  return MODEL_ALIASES[id] ?? id;
}

function apiKey() {
  const key = process.env.BYTEPLUS_API_KEY ?? process.env.ARK_API_KEY;
  if (!key) {
    throw new Error(
      "Missing BYTEPLUS_API_KEY. Set it in .env.local (see .env.local.example).",
    );
  }
  return key;
}

/**
 * Typed wrapper over a non-2xx BytePlus response.
 *
 * Carries the upstream HTTP status so the route layer can forward it to the
 * browser instead of collapsing everything into 500. The classifier
 * (`lib/compare/error-class.ts`) dispatches on that status — 429 maps to
 * rate-limit, 4xx to invalid-input, 5xx to server — so losing the status
 * here makes auto-retry decisions guess-work.
 */
export class BytePlusError extends Error {
  status: number;
  statusText: string;
  /** First ~500 chars of the response body. Often contains BytePlus's own
   *  error code (`SafetyViolation`, `InvalidParameter`, …) which the
   *  classifier's message-match branch can recognise. */
  body: string;
  constructor(status: number, statusText: string, body: string) {
    super(`BytePlus ${status} ${statusText}: ${body.slice(0, 500)}`);
    this.name = "BytePlusError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new BytePlusError(res.status, res.statusText, text);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ---------- Image ----------
/**
 * Seedream 4.5 / 5.0 Lite shared request shape. Both models use the same
 * OpenAI-compatible endpoint; mode is inferred from the inputs:
 *
 *   T2I                     no `image`, no `sequential`
 *   I2I (single)            `image` is a single URL / base64 / data URI
 *   I2I (multi-ref / Muse)  `image` is a string[] (cap ≤ 10 to stay under the
 *                           15-ish limit BytePlus enforces)
 *   Sequential              `sequential: true` + `max_images: N` (1–15)
 *   Compose + Sequential    refs[] + sequential; hard rule: refs.length +
 *                           max_images ≤ 15. Enforced server-side by BytePlus;
 *                           callers get a 400 `InvalidParameter` if violated.
 *
 * Per BytePlus docs: input image ≤ 10 MB, total pixels ≤ 6000×6000, aspect
 * ratio between 1/16 and 16.
 */
export type ImageGenParams = {
  prompt: string;
  model?: string; // override the default IMAGE_MODEL
  size?: string; // e.g. "1024x1024" | "2048x2048" | "adaptive"
  seed?: number;
  watermark?: boolean;
  image?: string | string[]; // URL, base64, or data URI — single or multi-ref
  sequential?: boolean; // turn on sequential_image_generation: "auto"
  max_images?: number; // sequential_image_generation_options.max_images (1–15)
};

export type ImageGenResponse = {
  created: number;
  data: Array<{ url?: string; b64_json?: string; size?: string }>;
  usage?: Record<string, unknown>;
};

export async function generateImage(params: ImageGenParams) {
  const body: Record<string, unknown> = {
    model: resolveModel(params.model ?? IMAGE_MODEL),
    response_format: "url",
    size: params.size ?? "2048x2048",
    seed: params.seed,
    watermark: params.watermark ?? false,
    prompt: params.prompt,
  };
  if (params.image) body.image = params.image;
  if (params.sequential) {
    body.sequential_image_generation = "auto";
    // max_images is only meaningful when sequential is on.
    if (params.max_images && params.max_images > 1) {
      body.sequential_image_generation_options = {
        max_images: params.max_images,
      };
    }
  }
  return request<ImageGenResponse>("/images/generations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------- Caption (§65) ----------
//
// Seed 2.0 Lite is a vision-capable chat model on the same /v3 host, so
// we get image-to-prompt for free on the existing BYTEPLUS_API_KEY —
// no new adapter file needed. The instruction template is what shapes
// the output into our Generator's voice ("lens, light, stock, era");
// tweak it before tweaking the call shape.

export type CaptionParams = {
  /** Either a "data:image/...;base64,..." data URL or a publicly fetchable
   *  https URL. Seed 2.0 Lite accepts both per the OpenAI vision spec. */
  imageDataUrl: string;
  /** Override the cinematographer-brief instruction below. */
  instruction?: string;
};

export type CaptionResponse = { caption: string };

const CAPTION_MODEL =
  process.env.BYTEPLUS_CAPTION_MODEL ?? "seed-2-0-lite-260228";

/** Default brief — mirrors the placeholder copy on §01 Prompt
 *  ("Describe the frame. Be specific about lens, light, stock, era.")
 *  so a dropped image lands a prompt indistinguishable from one the
 *  user might have typed. */
const DEFAULT_INSTRUCTION = `You are writing a single-line prompt for a
text-to-image model. Describe this image as if briefing a cinematographer:
subject and action, lens and framing, light and mood, film stock or era,
color palette. One sentence, present tense, no preamble, no quotes, no
"this image shows". Aim for 25-40 words.`;

export async function captionImage(p: CaptionParams): Promise<CaptionResponse> {
  const body = {
    model: resolveModel(CAPTION_MODEL),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: p.instruction ?? DEFAULT_INSTRUCTION },
          { type: "image_url", image_url: { url: p.imageDataUrl } },
        ],
      },
    ],
    // Cap output so a chatty model can't run away on tokens.
    max_tokens: 200,
  };
  const out = await request<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/chat/completions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const raw = out.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    throw new BytePlusError(502, "Bad Gateway", "no caption in response");
  }
  // Some models wrap output in markdown fences or trailing quotes —
  // strip lightly. The instruction tells the model not to do this, but
  // belt-and-suspenders.
  const caption = raw.replace(/^["'`]+|["'`]+$/g, "").trim();
  return { caption };
}

// ---------- Story prompt generation ----------
//
// Uses the same /chat/completions endpoint as caption but with a
// text-only system+user turn. Model defaults to BYTEPLUS_PROMPT_MODEL
// (set it to your Seed 2.0 Pro model ID in .env.local; falls back to
// the Lite model that's already enabled on most accounts).

const PROMPT_MODEL =
  process.env.BYTEPLUS_PROMPT_MODEL ?? process.env.BYTEPLUS_CAPTION_MODEL ?? "seed-2-0-pro-260228";

export type ScenePromptInput = {
  index: number;
  script: string;
  duration: number;
};

export type ScenePromptOutput = {
  index: number;
  prompt: string;
};

const SCENE_PROMPT_SYSTEM = `You are a professional film director writing prompts for an AI video generation model (Seedance).

Given a story and its scene breakdown, rewrite each scene's script into a tight, cinematic video-generation prompt.

Rules:
- Each prompt must be 20–45 words — specific enough to direct the shot, short enough for the model.
- Lead with the key visual action or subject. Follow with camera angle, lighting, and mood.
- Do NOT include dialogue, sound effects, or audio descriptions.
- Preserve the story's tone across all scenes for visual consistency.
- Output ONLY valid JSON — no markdown fences, no commentary:
  {"scenes":[{"index":0,"prompt":"..."},{"index":1,"prompt":"..."}]}`;

export async function generateScenePrompts(
  storyPrompt: string,
  scenes: ScenePromptInput[],
): Promise<ScenePromptOutput[]> {
  const userMessage = `STORY:\n${storyPrompt.trim()}\n\nSCENES:\n${scenes
    .map((s) => `[${s.index}] (${s.duration}s) ${s.script.trim() || "(no script yet)"}`)
    .join("\n")}`;

  const body = {
    model: resolveModel(PROMPT_MODEL),
    messages: [
      { role: "system", content: SCENE_PROMPT_SYSTEM },
      { role: "user", content: userMessage },
    ],
    max_tokens: 1200,
    temperature: 0.7,
  };

  const out = await request<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/chat/completions", { method: "POST", body: JSON.stringify(body) });

  const raw = out.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new BytePlusError(502, "Bad Gateway", "no content in response");

  // Strip markdown fences the model sometimes adds despite instructions.
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(json) as { scenes: ScenePromptOutput[] };
  if (!Array.isArray(parsed.scenes)) throw new Error("Unexpected response shape");
  return parsed.scenes;
}

// ---------- Long-video shot planning ----------
//
// Given a freeform concept, generates N ready-to-use Seedance prompts that
// form a visually cohesive sequence. Each prompt is self-contained (model
// needs no cross-shot context) but the system prompt instructs the LLM to
// preserve character, palette, and scene continuity across all shots.

// Distil long-form text (article, recipe, web extract) into a concise video brief.
// Only called when concept length > DISTILL_THRESHOLD to avoid unnecessary latency.
const DISTILL_THRESHOLD = 400;

const DISTILL_SYSTEM = `You are a video director's assistant. The user will paste raw text from a web article, recipe, or document. Your job: distil it into a concise video brief that a shot-planning AI can turn into compelling visual shots.

Output format — write ONLY this block, no preamble:
TITLE: <2–5 word title>
FORMAT: <e.g. "step-by-step recipe", "travel documentary", "product showcase", "how-to tutorial">
CORE NARRATIVE: <1–2 sentences — what the video should convey>
KEY MOMENTS: <numbered list of 3–10 specific, visual, filmable moments in narrative order>
VISUAL STYLE: <lighting, palette, setting — e.g. "warm kitchen, natural morning light, neutral tones">
REFERENCE SUBJECTS: <any specific people, objects, or places that must appear consistently>`;

async function distilConcept(rawText: string): Promise<string> {
  const body = {
    model: resolveModel(PROMPT_MODEL),
    messages: [
      { role: "system", content: DISTILL_SYSTEM },
      { role: "user", content: rawText.slice(0, 6000) },
    ],
    max_tokens: 600,
    temperature: 0.4,
  };
  const out = await request<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/chat/completions", { method: "POST", body: JSON.stringify(body) });
  const raw = out.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new BytePlusError(502, "Bad Gateway", "no distilled concept");
  return raw;
}

const SHOT_PLAN_SYSTEM = `You are a Seedance 2.0 expert cinematographer and prompt engineer. Your task: expand a concept into a numbered sequence of Seedance 2.0 video prompts that form a visually cohesive film sequence.

═══ SEEDANCE 2.0 CORE FORMULA ═══
Every prompt MUST follow this exact four-section structure (use the bold labels):
  **Style & Mood:** <cinematic style, specific lighting source and direction, colour palette, camera/lens character, overall tone>
  **Dynamic Description:** <shot-by-beat breakdown — see BEAT FORMAT below>
  **Static Description:** <fixed background elements, set dressing, props, surfaces — things that don't move>
  **Audio:** <spoken dialogue in double quotes, ambient sounds, music cue — 1–2 sentences>

═══ BEAT FORMAT (required for all clips) ═══
Structure **Dynamic Description** as named beats, each on its own line:
  Opening beat (camera mode + shot size) — <what happens, who does what>
  Mid-beat (camera mode + shot size) — <development, camera moves>     [omit for clips < 8 s]
  Closing beat (camera mode + shot size) — <resolution + transition statement>

Camera mode must appear in parentheses after each beat label.
Camera modes: handheld | static | stabilized tracking | crane | aerial
Shot sizes: extreme wide | wide | medium | MCU | close-up | ECU
Example:
  Opening beat (static medium shot) — chef lifts a whole egg to camera and says: "Room-temperature eggs whip up far lighter."
  Mid-beat (slowly dollying close-up) — chef cracks and separates each egg, yolks into one glass bowl, whites into another.
  Closing beat (stabilized MCU) — both bowls side by side fill the frame → hard cut into Shot 2

═══ SHOT TITLE ═══
Each shot object must include a short descriptive title: 2–5 words, e.g. "Intro & Ingredients", "Egg Separation", "Final Reveal".

═══ REFERENCE ASSETS ═══
Each shot's video API call will receive reference assets — address them inline in the prompt prose:
- Reference images: "Image 1", "Image 2", … (1-based, in order provided)
  Example: "Refer to the subject from Image 1" / "Match the palette of Image 2"
- Previous clip (shots 2 onward): prior generated clip is passed as "Video 1"
  Example: "Continuing from Video 1, …" / "Matching the environment established in Video 1, …"
Only reference assets that actually exist for that shot (shot 1 has no Video 1).

═══ SHOT TRANSITIONS ═══
Every shot EXCEPT the final one must end its Closing beat with a named transition.
Allowed transitions ONLY — pick one per cut, never invent new names:
  hard cut | match cut | smash cut | whip pan | dolly transition | dissolve | fade to black | jump cut | J-cut | L-cut
Format: "→ [transition] into Shot [N+1]"

═══ PROMPT RULES ═══
- Length: 150–300 words per prompt (section labels included).
- Dialogue: when the concept involves a presenter or narrator, include one concrete spoken line per shot in double quotes inside Dynamic Description or Audio. Write the actual words, not a placeholder.
- Double-contrast cuts: every transition changes BOTH shot size AND camera mode.
  Sizes: extreme wide → wide → medium → MCU → close-up → ECU
- Character continuity: freeze every character's appearance on first mention and repeat verbatim in every subsequent shot. Never write "young", "old", "elderly", "boy", "girl", "child" — use role/clothing/action descriptors instead.
- Colour & light: keep the same palette and time-of-day unless the story changes them.
- Anti-slop: NEVER use — gorgeous, stunning, beautiful, serene, ethereal, cinematic (as a lone adjective), epic, breathtaking, magical, vibrant, crisp, perfect, seamlessly, flawlessly.
- No absolute timecodes ("00:03", "@ 4s") — the model renders those as on-screen text.

═══ ENGINE CONSTRAINTS ═══
- Max 3 tracked characters per shot.
- No mirror/glass reflections as the main subject (causes artefacts).
- Water/fire/smoke should be secondary elements, not the primary subject.
- Avoid pure white or pure black backgrounds.
- Off-screen = nonexistent. State changes must happen on camera.

═══ OUTPUT FORMAT ═══
Output ONLY valid JSON — no markdown fences, no commentary:
{"shots":[{"index":0,"title":"Clip Title","prompt":"**Style & Mood:** ... **Dynamic Description:** Opening beat (...) — ... Closing beat (...) — ... **Static Description:** ... **Audio:** ..."},{"index":1,"title":"Clip Title","prompt":"..."}]}`;

export type ShotPlanInput = {
  concept: string;
  shotCount: number;
  durationEach: number;
  /** Number of reference images wired into the node (used to generate correct "Image N" inline refs). */
  referenceImageCount?: number;
  /** Whether a first-frame image is wired in (shot 1 will have Image 1 available). */
  hasFirstFrame?: boolean;
};

export type ShotPlanOutput = {
  shots: string[];
  /** Parallel to shots — descriptive title for each clip (e.g. "Intro & Ingredients"). */
  titles?: string[];
  /** The distilled brief passed to the shot planner — useful for debugging / display. */
  brief?: string;
};

export async function generateShots(p: ShotPlanInput): Promise<ShotPlanOutput> {
  const inputConcept = p.concept.trim();

  // Long-form text (article, recipe, web extract) needs distillation first so the
  // shot planner gets a structured brief rather than a wall of prose.
  const concept = inputConcept.length > DISTILL_THRESHOLD
    ? await distilConcept(inputConcept)
    : inputConcept;

  const refImageCount = p.referenceImageCount ?? 0;
  const hasFirstFrame = p.hasFirstFrame ?? false;

  // Build reference asset context so the planner can write correct inline refs.
  const refLines: string[] = [];
  if (hasFirstFrame) refLines.push(`- Shot 1: user-supplied first-frame image available as "Image 1"`);
  if (refImageCount > 0) {
    const startIndex = hasFirstFrame ? 2 : 1;
    const endIndex = startIndex + refImageCount - 1;
    const range = startIndex === endIndex ? `Image ${startIndex}` : `Image ${startIndex}–Image ${endIndex}`;
    refLines.push(`- All shots: ${refImageCount} reference image(s) available as ${range} — address them inline`);
  }
  refLines.push(`- Shots 2–${p.shotCount}: previous generated clip available as "Video 1" — use for visual continuity`);

  const userMessage =
    `CONCEPT:\n${concept}\n\n` +
    `Generate ${p.shotCount} sequential shots. Each clip is ${p.durationEach}s long (${p.durationEach >= 8 ? "use the full shot-beat arc with beat-relative markers" : "tight single-action shots"}).` +
    ` Total runtime: ${p.shotCount * p.durationEach}s.\n\n` +
    `REFERENCE ASSETS CONTEXT:\n${refLines.join("\n")}`;

  const body = {
    model: resolveModel(PROMPT_MODEL),
    messages: [
      { role: "system", content: SHOT_PLAN_SYSTEM },
      { role: "user", content: userMessage },
    ],
    max_tokens: 8000,
    temperature: 0.75,
  };

  const out = await request<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/chat/completions", { method: "POST", body: JSON.stringify(body) });

  const responseText = out.choices?.[0]?.message?.content?.trim();
  if (!responseText) throw new BytePlusError(502, "Bad Gateway", "no content in response");

  const json = responseText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(json) as { shots: Array<{ index: number; title?: string; prompt: string }> };
  if (!Array.isArray(parsed.shots)) throw new Error("Unexpected response shape");

  return {
    shots: parsed.shots.map((s) => s.prompt),
    titles: parsed.shots.map((s) => s.title ?? `Clip ${s.index + 1}`),
    ...(inputConcept.length > DISTILL_THRESHOLD && { brief: concept }),
  };
}

// ---------- Prompt Composer ----------

export type ComposePromptParams = {
  goal?: string;
  targetModel: "seedream" | "seedance" | "generic";
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  /** Sampling temperature (0–2). Higher = more creative. Default 0.8. */
  temperature?: number;
  /** Max tokens for the response. Default 500. */
  maxTokens?: number;
  /** Extra instructions appended to the system prompt. */
  extraInstruction?: string;
};

export type ComposePromptResponse = { prompt: string };

const COMPOSE_SYSTEM: Record<"seedream" | "seedance" | "generic", string> = {
  seedream: `You are an expert prompt engineer for Seedream, a text-to-image model.
Write a rich, detailed image-generation prompt based on the user's goal and provided context (text, images, or video references).
- Use as many words as the scene requires — multiple sentences are encouraged for complex subjects.
- Cover: main subject and action, composition and framing, lighting style, color palette, mood and atmosphere, art or photography style.
- Use concrete, specific adjectives. Avoid vague filler words like "beautiful" or "stunning".
- Output ONLY the prompt text — no preamble, no labels, no markdown.`,
  seedance: `You are an expert prompt engineer for Seedance, a text-to-video model.
Write a rich, detailed video-generation prompt based on the user's goal and provided context.
- Use as many words as the scene requires — multiple sentences are encouraged for complex sequences.
- Lead with the primary motion/action and subject.
- Cover: camera movement (pan, dolly, orbit, handheld, static push), shot type, lighting, mood, and pacing.
- Describe motion explicitly and temporally — the model needs clear directional and timing cues.
- Output ONLY the prompt text — no preamble, no labels, no markdown.`,
  generic: `You are an expert prompt engineer for AI media generation.
Write a clear, detailed generation prompt based on the user's goal and provided context.
- Use as many words as needed — multiple sentences are fine for complex subjects.
- Be specific, visual, and concrete.
- Output ONLY the prompt text — no preamble, no labels, no markdown.`,
};

export async function composePrompt(
  p: ComposePromptParams,
): Promise<ComposePromptResponse> {
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

  const content: ContentBlock[] = [];

  const goal = p.goal?.trim();
  if (goal) content.push({ type: "text", text: `Goal: ${goal}` });

  const text = p.text?.trim();
  if (text) content.push({ type: "text", text: `Context:\n${text.slice(0, 2000)}` });

  const imageUrl = p.imageUrl?.trim();
  if (imageUrl) content.push({ type: "image_url", image_url: { url: imageUrl } });

  const videoUrl = p.videoUrl?.trim();
  if (videoUrl) content.push({ type: "text", text: `Video reference: ${videoUrl}` });

  if (content.length === 0) {
    throw new Error(
      "Provide at least one input — goal, text, image, or video — to compose a prompt.",
    );
  }

  content.push({
    type: "text",
    text: `Write the optimized ${p.targetModel === "seedream" ? "image" : p.targetModel === "seedance" ? "video" : "media"} generation prompt now.`,
  });

  const systemContent = p.extraInstruction?.trim()
    ? `${COMPOSE_SYSTEM[p.targetModel]}\n\nAdditional instructions: ${p.extraInstruction.trim()}`
    : COMPOSE_SYSTEM[p.targetModel];

  const temperature = Math.min(2, Math.max(0, p.temperature ?? 0.8));
  const maxTokens = Math.min(8192, Math.max(50, p.maxTokens ?? 500));

  const body = {
    model: resolveModel(PROMPT_MODEL),
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content },
    ],
    max_tokens: maxTokens,
    temperature,
  };

  const out = await request<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/chat/completions", { method: "POST", body: JSON.stringify(body) });

  const raw = out.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new BytePlusError(502, "Bad Gateway", "no content in response");
  const prompt = raw.replace(/^["'`]+|["'`]+$/g, "").trim();
  return { prompt };
}

/** Returns a copy-paste ready curl command that reproduces the exact BytePlus
 *  /chat/completions request for prompt composition. Intended for debugging only. */
export function buildComposeCurl(p: ComposePromptParams): string {
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

  const content: ContentBlock[] = [];
  const goal = p.goal?.trim();
  if (goal) content.push({ type: "text", text: `Goal: ${goal}` });
  const text = p.text?.trim();
  if (text) content.push({ type: "text", text: `Context:\n${text.slice(0, 2000)}` });
  const imageUrl = p.imageUrl?.trim();
  if (imageUrl) content.push({ type: "image_url", image_url: { url: imageUrl } });
  const videoUrl = p.videoUrl?.trim();
  if (videoUrl) content.push({ type: "text", text: `Video reference: ${videoUrl}` });
  content.push({
    type: "text",
    text: `Write the optimized ${p.targetModel === "seedream" ? "image" : p.targetModel === "seedance" ? "video" : "media"} generation prompt now.`,
  });

  const systemContent = p.extraInstruction?.trim()
    ? `${COMPOSE_SYSTEM[p.targetModel]}\n\nAdditional instructions: ${p.extraInstruction.trim()}`
    : COMPOSE_SYSTEM[p.targetModel];

  const body = {
    model: resolveModel(PROMPT_MODEL),
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content },
    ],
    max_tokens: Math.min(8192, Math.max(50, p.maxTokens ?? 500)),
    temperature: Math.min(2, Math.max(0, p.temperature ?? 0.8)),
  };

  const endpoint = `${BASE_URL}/chat/completions`;
  const key = process.env.BYTEPLUS_API_KEY ?? process.env.ARK_API_KEY ?? "<BYTEPLUS_API_KEY>";
  const json = JSON.stringify(body, null, 2).replace(/'/g, "'\\''");
  return [
    `curl -X POST '${endpoint}' \\`,
    `  -H 'Authorization: Bearer ${key}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${json}'`,
  ].join("\n");
}

// ---------- Video ----------
export type VideoMode = "t2v" | "i2v" | "first_last" | "multi_shot";

export type VideoContentItem =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string };
      role?: "first_frame" | "last_frame" | "reference_image";
    }
  | {
      type: "video_url";
      video_url: { url: string };
      role?: "reference_video";
    };

export type ReferenceRole = "subject" | "environment" | "motion" | "audio";
export type ReferenceItem = {
  type: "image" | "video" | "audio";
  role: ReferenceRole;
  /** Either a public URL or a BytePlus asset_id (preferred — stable across CDN expiry). */
  url?: string;
  asset_id?: string;
};

export type VideoParams = {
  prompt: string;
  model?: string; // override the default VIDEO_MODEL
  // Includes 768p so the Minimax Hailuo path can ride the same
  // VideoParams envelope without a separate type. BytePlus models don't
  // accept 768p — the byteplus.ts adapter ignores it; the minimax.ts
  // adapter rewrites to "768P".
  resolution?: "480p" | "720p" | "768p" | "1080p";
  // 1.5 Pro: 5 | 10. Seedance 2.0: any integer 4-15. -1 = auto (2.0 only).
  duration?: number;
  ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9" | "adaptive";
  seed?: number;
  camerafixed?: boolean;
  watermark?: boolean;
  audio?: boolean; // 2.0: native audio generation
  images?: Array<{ url: string; role?: "first_frame" | "last_frame" | "reference_image" }>;
  /** Video URL inputs for Seedance 2.0 — emitted as type:"video_url" in content. Role must be "reference_video". */
  videos?: Array<{ url: string; role?: "reference_video" }>;
  references?: ReferenceItem[]; // 2.0: multi-reference inputs
};

/** Seedance 2.0 family takes parameters as top-level JSON fields rather than
 *  CLI-style --flag tokens appended to the prompt. The model ID is the only
 *  reliable signal we have for which schema to emit. */
export function isSeedance2(model?: string) {
  return (model ?? VIDEO_MODEL).startsWith("dreamina-seedance-2-");
}

export type VideoTaskResponse = {
  id: string;
  model: string;
  status?: string;
};

export type VideoTaskStatus = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  content?: { video_url?: string };
  error?: { code?: string; message?: string };
  created_at?: number;
  updated_at?: number;
};

/** Seedance 1.5 Pro reads parameters from `--flag value` tokens appended to
 *  the prompt text. */
function buildPromptWithFlags(p: VideoParams) {
  const parts = [p.prompt.trim()];
  if (p.resolution) parts.push(`--resolution ${p.resolution}`);
  if (p.duration !== undefined) parts.push(`--duration ${p.duration}`);
  if (p.ratio) parts.push(`--ratio ${p.ratio}`);
  if (p.seed !== undefined) parts.push(`--seed ${p.seed}`);
  if (p.camerafixed !== undefined)
    parts.push(`--camerafixed ${p.camerafixed}`);
  if (p.watermark !== undefined) parts.push(`--watermark ${p.watermark}`);
  if (p.audio !== undefined) parts.push(`--audio ${p.audio}`);
  return parts.join(" ");
}

/** Builds the JSON body that BytePlus expects for a video task.
 *  Shared between `createVideoTask` (sends it) and `buildVideoCurl` (formats it). */
function buildVideoRequestBody(params: VideoParams): Record<string, unknown> {
  const logicalModel = params.model ?? VIDEO_MODEL;
  const v2 = isSeedance2(logicalModel);
  const wireModel = resolveModel(logicalModel);

  const content: VideoContentItem[] = [
    { type: "text", text: v2 ? params.prompt.trim() : buildPromptWithFlags(params) },
  ];
  for (const img of params.images ?? []) {
    content.push({
      type: "image_url",
      image_url: { url: img.url },
      ...(img.role && { role: img.role }),
    });
  }
  for (const vid of params.videos ?? []) {
    content.push({
      type: "video_url",
      video_url: { url: vid.url },
      ...(vid.role && { role: vid.role }),
    });
  }

  const body: Record<string, unknown> = { model: wireModel, content };

  if (v2) {
    if (params.resolution) body.resolution = params.resolution;
    if (params.duration !== undefined) body.duration = params.duration;
    if (params.ratio) body.ratio = params.ratio;
    if (params.seed !== undefined) body.seed = params.seed;
    if (params.camerafixed !== undefined) body.camerafixed = params.camerafixed;
    if (params.watermark !== undefined) body.watermark = params.watermark;
    if (params.audio !== undefined) body.generate_audio = params.audio;
  }

  if (params.references && params.references.length > 0) {
    body.references = params.references;
  }

  return body;
}

export async function createVideoTask(params: VideoParams) {
  return request<VideoTaskResponse>("/contents/generations/tasks", {
    method: "POST",
    body: JSON.stringify(buildVideoRequestBody(params)),
  });
}

/** Returns a copy-paste ready curl command that reproduces the exact BytePlus
 *  request, including the live API key from env. Intended for debugging only —
 *  never log or store the returned string. */
export function buildVideoCurl(params: VideoParams): string {
  const body = buildVideoRequestBody(params);
  const endpoint = `${BASE_URL}/contents/generations/tasks`;
  const key =
    process.env.BYTEPLUS_API_KEY ?? process.env.ARK_API_KEY ?? "<BYTEPLUS_API_KEY>";
  // Pretty-print then escape single quotes for bash (the only char that can't
  // appear inside a single-quoted string unescaped).
  const json = JSON.stringify(body, null, 2).replace(/'/g, "'\\''");
  return [
    `curl -X POST '${endpoint}' \\`,
    `  -H 'Authorization: Bearer ${key}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${json}'`,
  ].join("\n");
}

export async function getVideoTask(id: string) {
  return request<VideoTaskStatus>(`/contents/generations/tasks/${id}`, {
    method: "GET",
  });
}
