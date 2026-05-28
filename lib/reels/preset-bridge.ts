/**
 * Preset bridge — converts a `ReelTemplate.preset` payload into the shape
 * each Studio generator (Image / Video) expects to hydrate its initial state.
 *
 * Why a bridge: the Reels data model is design-time (taxonomy, lifecycle,
 * provenance) while the Studio state is runtime (concrete enums the UI
 * dropdowns understand). The two shapes diverge in three ways:
 *
 *   1. Image size: Reels uses shorthand ("2K"/"4K") + a separate ratio,
 *      Studio uses concrete dimensions ("2048x2048"). Map via lookup.
 *   2. Video mode: Reels prompts carry a `T2V:` / `R2V:` prefix encoding
 *      the BytePlus mode. Studio has an explicit `mode` enum. Parse it out.
 *   3. Some Reels capabilities (multi-ref, i2v) require runtime artifacts
 *      (uploaded frames, reference URLs) we can't pre-fill. Surface a hint
 *      via `requiresUserInput` so the generator can show a banner.
 *
 * Pure functions only — easy to unit-test, no React dependencies.
 */

import { TEMPLATES, type ReelTemplate, type StudioPreset } from "./templates";
import { modelKind } from "@/lib/compare/pairs";

// ─────────────────────────── Concrete output types ──────────────────────────

export type ImagePresetState = {
  prompt: string;
  model: string;
  size: string;
  /** True when the requested (size, ratio) didn't match the Studio dropdown
   *  exactly — UI can show a "size adjusted" hint. */
  sizeFallback: boolean;
};

export type VideoMode = "t2v" | "i2v" | "first_last" | "reference";

export type VideoPresetState = {
  prompt: string;
  model: string;
  mode: VideoMode;
  resolution: "480p" | "720p" | "1080p";
  duration: number;
  ratio: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";
  cameraFixed: boolean;
  generateAudio: boolean;
  /** Reference / image-to-video modes need user uploads — surface a hint. */
  requiresUserInput: null | "reference" | "starting-frame" | "first-last-frames";
  /** Pre-seeded starting frame — set when the Creations feed's
   *  "Create Video" button hands an existing image off to the Video
   *  tab. URL is a same-origin /api/media-proxy / mirror path or a
   *  data: URI; VideoGenerator drops it straight into `firstFrame`
   *  and switches mode to i2v. */
  firstFrame?: string;
};

/** Hydrated Studio state from any source.
 *
 *  `template` is optional: it's set when the hydration came from a Reels
 *  template (drives the breadcrumb), and absent for ad-hoc URL hydration
 *  (Compare → Studio handoff). The breadcrumb component guards on
 *  `template` presence and skips itself when there isn't one. */
export type PresetHydration =
  | { kind: "image"; template?: ReelTemplate; state: ImagePresetState }
  | { kind: "video"; template?: ReelTemplate; state: VideoPresetState };

// ─────────────────────────── Lookup helpers ─────────────────────────────────

/** Find a template by id, or null. Pure read — safe in server components. */
export function findTemplate(id: string | undefined | null): ReelTemplate | null {
  if (!id) return null;
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Resolve a preset id to a fully-hydrated Studio state, or null if not found. */
export function hydratePreset(id: string | undefined | null): PresetHydration | null {
  const tpl = findTemplate(id);
  if (!tpl) return null;
  if (tpl.kind === "image") {
    return { kind: "image", template: tpl, state: toImageState(tpl) };
  }
  return { kind: "video", template: tpl, state: toVideoState(tpl) };
}

/**
 * Resolve raw URL search params (e.g. `?prompt=...&model=...&size=...`)
 * into a Studio hydration. Returns null when the minimum (prompt + model)
 * is missing or the model id can't be classified.
 *
 * Used by the Compare → Studio handoff: each history-strip thumbnail's "↗"
 * link encodes a frame's snapshot into these params, and `/generate`
 * unpacks them here when no `?preset=` is supplied. The returned shape
 * has no `template` field, so Studio's PresetBreadcrumb won't render.
 *
 * Image: snapshots `prompt`, `model`, `size`.
 * Video: snapshots `prompt`, `model`, plus `mode`, `resolution`, `duration`,
 *        `ratio`. cameraFixed + generateAudio fall back to defaults — they're
 *        toggles, not fundamental shape, and Studio re-defaults are fine.
 */
export function hydrateFromQuery(params: {
  prompt?: string;
  model?: string;
  size?: string;
  ratio?: string;
  resolution?: string;
  duration?: string | number;
  mode?: string;
  /** Image URL pre-seeded into the i2v starting-frame slot. Only honoured
   *  for video kind; ignored for image / audio hydration paths. */
  firstFrame?: string;
}): PresetHydration | null {
  const prompt = params.prompt?.trim();
  const model = params.model?.trim();
  if (!prompt || !model) return null;
  const kind = modelKind(model);
  if (kind === "image") {
    // size already concrete (e.g. "2048x2048") — no shortcut translation
    // needed since Compare always emits dropdown-valid sizes.
    return {
      kind: "image",
      state: {
        prompt,
        model,
        size: params.size ?? "2048x2048",
        sizeFallback: false,
      },
    };
  }
  if (kind === "video") {
    const mode = coerceMode(params.mode);
    const firstFrame = params.firstFrame?.trim() || undefined;
    return {
      kind: "video",
      state: {
        prompt,
        model,
        mode,
        resolution: coerceResolution(params.resolution, model),
        duration: coerceDuration(params.duration),
        ratio: coerceRatio(params.ratio),
        cameraFixed: false,
        generateAudio: true,
        firstFrame,
        // i2v / reference modes need user-supplied frames the URL doesn't
        // carry — surface a banner so the user knows they have to upload.
        // If `firstFrame` is already pre-seeded (Creations → Create Video
        // handoff), the i2v requirement is satisfied — no banner.
        requiresUserInput:
          mode === "i2v"
            ? firstFrame
              ? null
              : "starting-frame"
            : mode === "reference"
              ? "reference"
              : mode === "first_last"
                ? "first-last-frames"
                : null,
      },
    };
  }
  return null;
}

function coerceMode(v: string | undefined): VideoMode {
  if (v === "i2v" || v === "first_last" || v === "reference") return v;
  return "t2v";
}

function coerceDuration(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

// ─────────────────────────── Image hydration ────────────────────────────────

/** Studio dropdown sizes — must stay in sync with components/image-generator.tsx */
const STUDIO_IMAGE_SIZES = new Set([
  "2048x2048", // 1:1 · 4MP
  "3072x3072", // 1:1 · 9MP
  "4096x4096", // 1:1 · 16MP
  "2560x1440", // 16:9 · 2.5K
  "3840x2160", // 16:9 · 4K
  "2160x3840", // 9:16 · 4K vertical
]);

/**
 * Map (sizeShortcut, ratio) → concrete dropdown value.
 * If the requested combo isn't in the dropdown, fall back to the closest
 * 1:1 at the requested tier and flag `sizeFallback: true`.
 */
function resolveImageSize(
  sizeShortcut: string | undefined,
  ratio: string | undefined,
): { size: string; fallback: boolean } {
  // Already concrete (e.g. "2048x2048")?
  if (sizeShortcut && sizeShortcut.includes("x")) {
    return {
      size: sizeShortcut,
      fallback: !STUDIO_IMAGE_SIZES.has(sizeShortcut),
    };
  }

  const tier = (sizeShortcut ?? "2K").toUpperCase();
  const r = (ratio ?? "1:1").replace("/", ":");

  // (tier, ratio) → concrete dimensions, restricted to STUDIO_IMAGE_SIZES.
  const matrix: Record<string, Record<string, string>> = {
    "2K": {
      "1:1": "2048x2048",
      "16:9": "2560x1440",
      "9:16": "2160x3840", // 4K vert (no 2K vert in dropdown — closest)
      "4:5": "2048x2048",
      "4:3": "2048x2048",
      "3:4": "2048x2048",
      "21:9": "2560x1440",
    },
    "3K": {
      "1:1": "3072x3072",
      "16:9": "3840x2160",
      "9:16": "2160x3840",
      "4:5": "3072x3072",
    },
    "4K": {
      "1:1": "4096x4096",
      "16:9": "3840x2160",
      "9:16": "2160x3840",
      "4:5": "4096x4096",
      "4:3": "4096x4096",
      "3:4": "4096x4096",
    },
  };

  const exact = matrix[tier]?.[r];
  if (exact) {
    // "Fallback" if we had to swap a vertical 2K for a 4K vert, etc.
    const idealForRatio: Record<string, string> = {
      "1:1": tier === "2K" ? "2048x2048" : tier === "3K" ? "3072x3072" : "4096x4096",
      "16:9": tier === "2K" ? "2560x1440" : "3840x2160",
      "9:16": "2160x3840",
    };
    const fallback = !!idealForRatio[r] && idealForRatio[r] !== exact;
    return { size: exact, fallback };
  }

  // Unknown combo — drop to a 1:1 at the requested tier.
  const tierFallback: Record<string, string> = {
    "2K": "2048x2048",
    "3K": "3072x3072",
    "4K": "4096x4096",
  };
  return { size: tierFallback[tier] ?? "2048x2048", fallback: true };
}

function toImageState(tpl: ReelTemplate): ImagePresetState {
  const p: StudioPreset = tpl.preset;
  // Image preset's `ratio` lives in either preset.ratio or template.ratio.
  const ratio = p.ratio ?? tpl.ratio;
  const { size, fallback } = resolveImageSize(p.size, ratio);
  return {
    prompt: p.prompt,
    model: tpl.model,
    size,
    sizeFallback: fallback,
  };
}

// ─────────────────────────── Video hydration ────────────────────────────────

/** BytePlus mode prefix → Studio mode enum + display prompt with prefix stripped. */
function parseVideoMode(rawPrompt: string): {
  mode: VideoMode;
  prompt: string;
  requiresUserInput: VideoPresetState["requiresUserInput"];
} {
  // Match T2V:, I2V:, R2V:, V2V: (case-insensitive) at the very start, with
  // optional whitespace after the colon.
  const m = rawPrompt.match(/^(T2V|I2V|R2V|V2V)\s*:\s*/i);
  if (!m) return { mode: "t2v", prompt: rawPrompt, requiresUserInput: null };

  const stripped = rawPrompt.slice(m[0].length);
  const tag = m[1].toUpperCase();
  switch (tag) {
    case "I2V":
      return { mode: "i2v", prompt: stripped, requiresUserInput: "starting-frame" };
    case "R2V":
      return { mode: "reference", prompt: stripped, requiresUserInput: "reference" };
    case "V2V":
      // Studio doesn't have a v2v mode yet — fall back to t2v.
      return { mode: "t2v", prompt: stripped, requiresUserInput: null };
    case "T2V":
    default:
      return { mode: "t2v", prompt: stripped, requiresUserInput: null };
  }
}

/** Coerce arbitrary string → Studio's ratio union. Falls back to "16:9". */
function coerceRatio(r: string | undefined): VideoPresetState["ratio"] {
  if (!r) return "16:9";
  const norm = r.replace("/", ":") as VideoPresetState["ratio"];
  const allowed: VideoPresetState["ratio"][] = [
    "16:9", "9:16", "1:1", "4:3", "3:4", "21:9",
  ];
  return allowed.includes(norm) ? norm : "16:9";
}

/** Validate resolution against the model. Seedance 2.0 caps at 720p. */
function coerceResolution(
  r: string | undefined,
  modelId: string,
): VideoPresetState["resolution"] {
  const allowed: VideoPresetState["resolution"][] = ["480p", "720p", "1080p"];
  const candidate = (r as VideoPresetState["resolution"]) ?? "720p";
  const v = allowed.includes(candidate) ? candidate : "720p";
  // Seedance 2.0 family doesn't ship 1080p — drop to 720p if asked.
  const isV2 =
    modelId === "dreamina-seedance-2-0-260128" ||
    modelId === "dreamina-seedance-2-0-fast-260128";
  if (isV2 && v === "1080p") return "720p";
  return v;
}

function toVideoState(tpl: ReelTemplate): VideoPresetState {
  const p: StudioPreset = tpl.preset;
  const { mode, prompt, requiresUserInput } = parseVideoMode(p.prompt);
  return {
    prompt,
    model: tpl.model,
    mode,
    resolution: coerceResolution(p.resolution, tpl.model),
    duration: typeof p.duration === "number" && p.duration > 0 ? p.duration : 5,
    ratio: coerceRatio(p.ratio ?? tpl.ratio),
    cameraFixed: p.camerafixed ?? false,
    generateAudio: p.generate_audio ?? true,
    requiresUserInput,
  };
}
