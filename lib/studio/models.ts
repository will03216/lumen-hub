/**
 * Studio constants shared across Studio (/generate) and Compare (/compare).
 *
 * Hoisted out of components/image-generator.tsx when Compare shipped, so the
 * two surfaces can't drift on model lists or size catalogs.
 */

// ─────────────────────────── Image ──────────────────────────────────────

/**
 * Seedream 5.0 Lite requires ≥ 3,686,400 px and ≤ 4096×4096. Sizes below all
 * satisfy that range and cover square + 16:9 + 9:16.
 */
export const IMAGE_SIZES = [
  "2048x2048", // 1:1  · 4.2 MP (default)
  "3072x3072", // 1:1  · 9.4 MP (3K)
  "4096x4096", // 1:1  · 16.7 MP (4K, max)
  "2560x1440", // 16:9 · 3.7 MP (2.5K)
  "3840x2160", // 16:9 · 8.3 MP (4K)
  "2160x3840", // 9:16 · 8.3 MP (4K vertical)
] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number] | string;

/** Where the model runs. The /api/image route dispatches on this so the
 *  UI can mix BytePlus-hosted Seedream and fal-hosted gpt-image-2 in
 *  one dropdown without the surfaces caring which one ran. */
export type ImageProvider = "byteplus" | "fal";

export type ImageModel = {
  id: string;
  label: string;
  hint: string;
  /** Defaults to "byteplus" when absent — keeps the existing entries
   *  untouched and lets new ones opt into a different upstream. */
  provider?: ImageProvider;
};

export const IMAGE_MODELS: readonly ImageModel[] = [
  {
    id: "seedream-5-0-lite-260128",
    label: "Seedream 5.0 Lite",
    hint: "Fast · balanced",
  },
  {
    id: "seedream-4-5-251128",
    label: "Seedream 4.5",
    hint: "Highest fidelity",
  },
  {
    // fal model id — passed through verbatim to https://queue.fal.run/<id>.
    // High-quality renders take 1–3 minutes; the hint says so up-front
    // so users don't think the panel is broken while it polls.
    id: "openai/gpt-image-2",
    label: "GPT Image 2",
    hint: "OpenAI · via fal · ~2–3 min",
    provider: "fal",
  },
] as const;

// ─────────────────────────── Suggestions ────────────────────────────────

/** Prompts shared between Studio and Compare. Generic enough to be fair to
 *  any engine; specific enough to produce interesting frames. */
export const IMAGE_SUGGESTIONS = [
  "A lone astronaut sitting on the rim of a red-dust canyon at golden hour, reflective visor, cinematic wide shot",
  "Hyperreal macro of a translucent beetle on wet moss, dewdrops, shallow depth of field, studio light",
  "Neon-drenched Tokyo alleyway after rain, puddle reflections, anamorphic lens flare, film still",
] as const;

// ─────────────────────────── Helpers ────────────────────────────────────

export function findImageModel(id: string): ImageModel | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}

export const DEFAULT_IMAGE_MODEL_ID = IMAGE_MODELS[0].id;
export const DEFAULT_IMAGE_SIZE: ImageSize = "2048x2048";

// ─────────────────────────── Aspect × Quality (§66) ─────────────────────
//
// §66 collapsed the four-row §04 FORMAT panel ("Size dropdown / Seed /
// Count / Variants") into a compact toolbar — count stepper + aspect
// picker + quality picker — closer to the Freepik / Midjourney pattern.
// Size is no longer chosen directly; it's derived from (aspect, quality)
// at render time. Seedream's lower bound (≥3.7M px) means "1K = 1024"
// would always fail, so 1K here means a long-side of 2048 — the lightest
// size that actually renders.

export type ImageOrientation = "square" | "landscape" | "portrait" | "auto";

export type ImageAspect = {
  /** Display string, e.g. "1:1", "16:9", or the special "auto". */
  ratio: string;
  /** Human label shown in the dropdown — "Square", "Widescreen", etc. */
  label: string;
  /** Ratio numerator and denominator. Both 1 for the "auto" sentinel —
   *  pickImageSize short-circuits that case. */
  w: number;
  h: number;
  /** Drives the small icon in the picker (square / landscape / portrait). */
  orientation: ImageOrientation;
};

/** Eleven options matching the §66 design (the user's spec). Order
 *  intentionally matches the picker screenshot: auto first, then square,
 *  then descending landscape ratios, portrait equivalents, common
 *  standards last. */
export const IMAGE_ASPECTS: readonly ImageAspect[] = [
  { ratio: "auto",  label: "Auto",               w: 1,  h: 1,  orientation: "auto" },
  { ratio: "1:1",   label: "Square",             w: 1,  h: 1,  orientation: "square" },
  { ratio: "21:9",  label: "Ultrawide",          w: 21, h: 9,  orientation: "landscape" },
  { ratio: "8:1",   label: "Panoramic",          w: 8,  h: 1,  orientation: "landscape" },
  { ratio: "4:1",   label: "Banner",             w: 4,  h: 1,  orientation: "landscape" },
  { ratio: "16:9",  label: "Widescreen",         w: 16, h: 9,  orientation: "landscape" },
  { ratio: "9:16",  label: "Social story",       w: 9,  h: 16, orientation: "portrait" },
  { ratio: "1:4",   label: "Vertical banner",    w: 1,  h: 4,  orientation: "portrait" },
  { ratio: "1:8",   label: "Vertical panoramic", w: 1,  h: 8,  orientation: "portrait" },
  { ratio: "4:3",   label: "Classic",            w: 4,  h: 3,  orientation: "landscape" },
  { ratio: "4:5",   label: "Social post",        w: 4,  h: 5,  orientation: "portrait" },
] as const;

export const DEFAULT_IMAGE_ASPECT_RATIO = "1:1";

export type ImageQualityId = "1k" | "2k" | "4k";

export type ImageQuality = {
  id: ImageQualityId;
  label: string;     // "1K" / "2K" / "4K"
  /** Long side in pixels. Short side is computed from the aspect ratio. */
  longSide: number;
  /** Static estimate in the picker dropdown — useful as expectations-
   *  setting before the user fires a 4K render. Tweak if real timings
   *  drift; we deliberately don't wire telemetry here. */
  estimate: string;
};

export const IMAGE_QUALITIES: readonly ImageQuality[] = [
  { id: "1k", label: "1K", longSide: 2048, estimate: "~20s" },
  { id: "2k", label: "2K", longSide: 3072, estimate: "~33s" },
  { id: "4k", label: "4K", longSide: 4096, estimate: "~1m 3s" },
] as const;

export const DEFAULT_IMAGE_QUALITY_ID: ImageQualityId = "1k";

export function findImageAspect(ratio: string): ImageAspect | undefined {
  return IMAGE_ASPECTS.find((a) => a.ratio === ratio);
}

export function findImageQuality(id: string): ImageQuality | undefined {
  return IMAGE_QUALITIES.find((q) => q.id === id);
}

/** Map (aspect, quality) → "WxH" string accepted by Seedream. "auto"
 *  short-circuits to "adaptive" — Seedream's own auto-sizer. For other
 *  aspects we put `quality.longSide` on whichever dimension is longer
 *  and scale the shorter dimension proportionally, rounded to the
 *  nearest pixel. Engine may still reject extreme ratios (1:8 at 1K
 *  drops below the 3.7M-px floor on its short side) — those land in
 *  the route's existing error surface, no client-side clamp. */
export function pickImageSize(
  aspect: ImageAspect,
  quality: ImageQuality,
): string {
  if (aspect.ratio === "auto") return "adaptive";
  const long = quality.longSide;
  const ratio =
    Math.min(aspect.w, aspect.h) / Math.max(aspect.w, aspect.h);
  const short = Math.max(1, Math.round(long * ratio));
  const isWide = aspect.w >= aspect.h;
  const w = isWide ? long : short;
  const h = isWide ? short : long;
  return `${w}x${h}`;
}

/** Back-map a "WxH" preset / hydration size to the closest aspect +
 *  quality. Used so the existing Reels presets and Compare hand-offs —
 *  which still ship `size` strings — can populate the new toolbar
 *  without breaking. Picks the option whose ratio difference is
 *  smallest; ties broken by closest long-side. */
export function findClosestAspectQuality(
  size: string,
): { aspect: ImageAspect; quality: ImageQuality } {
  const m = size?.match(/^(\d+)x(\d+)$/i);
  const fallback = {
    aspect:
      findImageAspect(DEFAULT_IMAGE_ASPECT_RATIO) ?? IMAGE_ASPECTS[1],
    quality: IMAGE_QUALITIES[0],
  };
  if (!m) return fallback;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return fallback;

  const longSide = Math.max(w, h);
  const quality = [...IMAGE_QUALITIES].sort(
    (a, b) =>
      Math.abs(a.longSide - longSide) - Math.abs(b.longSide - longSide),
  )[0];

  const targetRatio = w / h;
  const aspect = [...IMAGE_ASPECTS]
    .filter((a) => a.ratio !== "auto")
    .sort(
      (a, b) =>
        Math.abs(a.w / a.h - targetRatio) -
        Math.abs(b.w / b.h - targetRatio),
    )[0];

  return { aspect, quality };
}

// ─────────────────────────── Mode derivation ────────────────────────────

/** Max reference images we allow in the UI. BytePlus advertises 10 for 4.5
 *  and up to 14 for 5.0 Lite; 10 is the safe universal cap. */
export const MAX_REF_IMAGES = 10;

/** Max sequential frames. Seedream accepts 1–15 with the hard rule:
 *  `refs.length + max_images ≤ 15`. Callers enforce that together. */
export const MAX_SEQ_IMAGES = 6;

export type ImageMode =
  | "T2I"
  | "I2I"
  | "I2I_MULTI"
  | "SEQUENTIAL"
  | "COMPOSE_SEQ";

/** Pure string-deriver used by the UI hint line and the API branching. */
export function deriveImageMode(refCount: number, maxImages: number): ImageMode {
  const seq = maxImages > 1;
  if (refCount === 0 && !seq) return "T2I";
  if (refCount === 0 && seq) return "SEQUENTIAL";
  if (refCount === 1 && !seq) return "I2I";
  if (refCount > 1 && !seq) return "I2I_MULTI";
  return "COMPOSE_SEQ";
}

/** Human-readable label for the mode strip. Count-aware so the UI can say
 *  "I2I · 3 refs" instead of just "I2I_MULTI". */
export function imageModeLabel(refCount: number, maxImages: number): string {
  const mode = deriveImageMode(refCount, maxImages);
  switch (mode) {
    case "T2I":
      return "T2I · text-only";
    case "I2I":
      return "I2I · 1 ref";
    case "I2I_MULTI":
      return `I2I · ${refCount} refs`;
    case "SEQUENTIAL":
      return `Sequential · ${maxImages} frames`;
    case "COMPOSE_SEQ":
      return `Compose + Seq · ${refCount} refs × ${maxImages} frames`;
  }
}

// ─────────────────────────── Video ──────────────────────────────────────

/**
 * Per-engine capability matrix for Seedance.
 *   - Seedance 2.0 / 2.0 Fast: 480p / 720p, 4–15 s integers, native audio
 *   - Seedance 1.5 Pro: 480p / 720p / 1080p, 5 s or 10 s only, no audio
 *
 * Compare needs the **intersection** of two engines so shared controls
 * can't pick a value one side rejects. See `intersectVideoCaps` below.
 */
// 768p was added when Minimax's Hailuo line came in (§62) — Hailuo 2.3
// accepts 768P / 1080P only. BytePlus models still cap at 1080p; the
// extra value is harmless on dropdowns they don't gate to.
// "4k" is Seedance 2.0 (standard) only — verified against the live API:
// 2.0-standard accepts 480p/720p/1080p/4k, while 2.0-Fast and 1.5-Pro reject
// 4k, and every Seedance model rejects "2k". See CAPS_V20_STD below.
export type VideoResolution = "480p" | "720p" | "768p" | "1080p" | "4k";
export type VideoRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";

export type VideoCaps = {
  resolutions: readonly VideoResolution[];
  durations: readonly number[];
  audio: boolean;
  /** Multi-reference mode (R2V). Only 2.0 family; ignored in Phase 2 Compare. */
  referenceMode: boolean;
};

/** Where the video model runs. Matches `ImageProvider`'s shape: the
 *  /api/video route dispatches on this so BytePlus-hosted Seedance and
 *  Minimax-hosted Hailuo can coexist in one dropdown. Absent → byteplus. */
export type VideoProvider = "byteplus" | "minimax";

export type VideoModel = {
  id: string;
  label: string;
  hint: string;
  caps: VideoCaps;
  /** Defaults to "byteplus" when absent — keeps existing Seedance entries
   *  untouched and lets new ones opt into a different upstream. */
  provider?: VideoProvider;
};

// Seedance 2.0 Fast — caps at 720p. Verified against the live API: 480p and
// 720p are accepted, 1080p is rejected in BOTH t2v and i2v ("resolution not
// valid for model dreamina-seedance-2-0-fast"). The standard 2.0 model does
// accept 1080p (and 4k), so this is a genuine Fast-only ceiling, not a bug.
const CAPS_V20_FAST: VideoCaps = {
  resolutions: ["480p", "720p"],
  durations: [4, 5, 6, 8, 10, 12, 15],
  audio: true,
  referenceMode: true,
};

// Seedance 2.0 standard — same as Fast plus 4k output (verified: submits and
// renders a real 4k video). 4k is far slower and uses vastly more tokens, so
// it's opt-in per render, not a default.
const CAPS_V20_STD: VideoCaps = {
  resolutions: ["480p", "720p", "1080p", "4k"],
  durations: [4, 5, 6, 8, 10, 12, 15],
  audio: true,
  referenceMode: true,
};

const CAPS_V15: VideoCaps = {
  resolutions: ["480p", "720p", "1080p"],
  durations: [5, 10],
  audio: false,
  referenceMode: false,
};

// Minimax overseas — Hailuo 2.3 takes 768P / 1080P @ 6 or 10s; T2V-01
// Director is 768P @ 6s only with camera-control prompt syntax. (We
// confirmed the 768P-not-720P thing against the live API — Minimax's
// docs lag the running endpoint.)
const CAPS_MX_HAILUO: VideoCaps = {
  resolutions: ["768p", "1080p"],
  durations: [6, 10],
  audio: false,
  referenceMode: false,
};

const CAPS_MX_T2V_DIRECTOR: VideoCaps = {
  resolutions: ["768p"],
  durations: [6],
  audio: false,
  referenceMode: false,
};

export const VIDEO_MODELS: readonly VideoModel[] = [
  {
    id: "dreamina-seedance-2-0-260128",
    label: "Seedance 2.0",
    hint: "Native audio · up to 4K · 4–15s",
    caps: CAPS_V20_STD,
  },
  {
    id: "dreamina-seedance-2-0-fast-260128",
    label: "Seedance 2.0 Fast",
    hint: "~25% cheaper · faster queue · up to 720p",
    caps: CAPS_V20_FAST,
  },
  {
    id: "seedance-1-5-pro-251215",
    label: "Seedance 1.5 Pro",
    hint: "Up to 1080p · 5/10s",
    caps: CAPS_V15,
  },
  // Minimax overseas — provider:"minimax" trips the /api/video dispatch
  // to lib/minimax.ts. Submitted to /v1/video_generation; poll resolves
  // a file_id we then exchange for a download URL.
  {
    id: "MiniMax-Hailuo-2.3",
    label: "MiniMax Hailuo 2.3",
    hint: "T2V / I2V · 6 or 10s · 1080P",
    caps: CAPS_MX_HAILUO,
    provider: "minimax",
  },
  {
    id: "T2V-01-Director",
    label: "MiniMax T2V Director",
    hint: "Camera-control prompts · 720P · 6s",
    caps: CAPS_MX_T2V_DIRECTOR,
    provider: "minimax",
  },
] as const;

export const DEFAULT_VIDEO_MODEL_ID = VIDEO_MODELS[0].id;

export function findVideoModel(id: string): VideoModel | undefined {
  return VIDEO_MODELS.find((m) => m.id === id);
}

/** Video mode enum for Compare. T2V / I2V only in Phase 2. */
export type VideoMode = "t2v" | "i2v";

/** Suggested prompts for video Compare — generic enough to be fair to all
 *  three engines and specific enough to surface motion/lighting differences. */
export const VIDEO_SUGGESTIONS = [
  "Motorcycle rider carving through a neon-soaked Tokyo tunnel at night, anamorphic flare, cinematic dolly",
  "Tracking shot of a woman walking along a windswept cliff, flowing red dress, ocean mist",
  "Hummingbird hovering over a blooming desert cactus, ultra slow motion, macro lens, golden hour",
] as const;

export const VIDEO_RATIOS: readonly VideoRatio[] = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
] as const;

/**
 * Intersect two video engines' capabilities. Used by Compare to scope the
 * shared controls — pick a pair, the dropdowns collapse to the values both
 * sides accept. Never returns empty arrays for resolutions/durations; both
 * engines trivially share 480p and 720p and at least 5s.
 */
export function intersectVideoCaps(
  aId: string,
  bId: string,
): VideoCaps {
  const a = findVideoModel(aId)?.caps ?? CAPS_V20_STD;
  const b = findVideoModel(bId)?.caps ?? CAPS_V20_STD;
  return {
    resolutions: a.resolutions.filter((r) => b.resolutions.includes(r)),
    durations: a.durations.filter((d) => b.durations.includes(d)),
    audio: a.audio && b.audio,
    referenceMode: a.referenceMode && b.referenceMode,
  };
}

// ─────────────────────────── Audio (§63) ────────────────────────────────
//
// TTS-only for §63 — Minimax `/v1/t2a_v2` returns the audio bytes inline
// (hex-encoded), so it's a synchronous request from the route's view.
// No polling lifecycle, no in-flight queue at module scope. Music gen
// + voice clone are punted to follow-ups.

export type AudioProvider = "minimax";

export type AudioModel = {
  id: string;
  label: string;
  hint: string;
  provider: AudioProvider;
};

export const AUDIO_MODELS: readonly AudioModel[] = [
  {
    id: "speech-2.8-hd",
    label: "Minimax Speech 2.8 HD",
    hint: "Studio quality · 24kHz · synchronous",
    provider: "minimax",
  },
] as const;

export const DEFAULT_AUDIO_MODEL_ID = AUDIO_MODELS[0].id;

export function findAudioModel(id: string): AudioModel | undefined {
  return AUDIO_MODELS.find((m) => m.id === id);
}

/** Curated voice list — Minimax has dozens; eight is enough to cover the
 *  common storytelling registers without bloating the picker. Voice ids
 *  match Minimax's documented Engfish-language pool. */
export type AudioVoice = {
  id: string;
  label: string;
  hint: string;
};

export const AUDIO_VOICES: readonly AudioVoice[] = [
  { id: "Wise_Woman",        label: "Wise Woman",       hint: "Mature · narrator" },
  { id: "Calm_Woman",        label: "Calm Woman",       hint: "Soft · reflective" },
  { id: "Friendly_Person",   label: "Friendly Person",  hint: "Warm · conversational" },
  { id: "Inspirational_girl", label: "Inspirational",   hint: "Bright · energetic" },
  { id: "Deep_Voice_Man",    label: "Deep Man",         hint: "Authority · trailer" },
  { id: "Casual_Guy",        label: "Casual Guy",       hint: "Relaxed · podcast" },
  { id: "Lyrical_Voice",     label: "Lyrical",          hint: "Melodic · poetic" },
  { id: "Patient_Man",       label: "Patient Man",      hint: "Calm · explainer" },
] as const;

export const DEFAULT_AUDIO_VOICE_ID = AUDIO_VOICES[0].id;

/** Minimax t2a_v2 emotion enum. Optional on the request; defaults to
 *  "neutral" upstream if omitted. */
export const AUDIO_EMOTIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "calm",
  "fearful",
  "disgusted",
  "surprised",
] as const;
export type AudioEmotion = (typeof AUDIO_EMOTIONS)[number];

/** Long enough for a 60-second voiceover at normal pace. Minimax accepts
 *  up to 10000 chars but anything past ~3000 should stream — for §63 we
 *  stick to non-streaming and document the soft cap. */
export const MAX_AUDIO_TEXT_LEN = 3000;
