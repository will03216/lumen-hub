/**
 * Forge — Pipeline Template registry (the verticals).
 *
 * Each entry is a fully-configured production line for one business vertical.
 * Adding a new vertical is one object here — no engine changes. The planner
 * reads `plannerGuidance` + the locked policy; the compiler reads `toolScope`
 * + `models`; the freeze gate reads `gates` + `budget`.
 *
 * v1 ships three opinionated verticals: Advertisement, Filming & Gaming, and
 * Ecommerce.
 */

import type { PipelineTemplate } from "./types";

const SEEDANCE = "dreamina-seedance-2-0-260128";
const SEEDANCE_FAST = "dreamina-seedance-2-0-fast-260128";
const SEEDREAM = "seedream-5-0-lite-260128";

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  // ──────────────────────────── Advertisement ──────────────────────────
  {
    id: "advertisement.v1",
    vertical: "advertisement",
    label: "Advertisement",
    tagline: "Brand-locked hook→body→CTA ad units for paid social, at A/B scale.",
    description:
      "High-volume, brand- and avatar-locked 9:16 ad units (UGC-style and polished brand spots). The agent writes hooks and scripts freely but every output is clamped to the brand kit and the hook-in-first-2s rule. Built for variation at scale.",
    icon: "Megaphone",
    accent: "#ff5d8f",
    output: { kind: "video", aspect: "9:16", durationS: 20, fps: 30, resolution: "1080p", structure: ["hook", "body", "cta"] },
    models: { video: SEEDANCE_FAST, upscale: "composite-4k" },
    toolScope: ["asset", "textPrompt", "promptOptimizer", "videoGen", "frameExtract", "musicOverlay", "videoStitch", "preview"],
    references: { mustLock: ["brand_avatar", "brand_colors", "logo"], identityRefs: { min: 1, recommended: 3 } },
    consistency: { frameChaining: true, batchBySolveType: true, bible: true, seedLock: true },
    qa: { must: ["hook_in_first_2s", "brand_color_present", "logo_placement", "caption_readable", "aspect_duration_ok"], minScore: 0.85 },
    variations: { count: 5, batch: true },
    gates: { freeze: "required", publish: "auto" },
    budget: { projectCapUsd: 120, perShotCapUsd: 4, regenCap: 3 },
    agency: { script: "high", hooks: "high", style: "locked", cinematography: "low" },
    defaultShotCount: 3,
    shotRoles: ["hook", "body", "cta"],
    plannerGuidance:
      "You are planning a high-performing video ad. Structure: a scroll-stopping HOOK whose payoff lands in the first 2 seconds, a BODY that demonstrates the product benefit, and a punchy CTA. Keep the same brand avatar/spokesperson across all shots (frame-chain identity). Voice is native-to-feed and benefit-led, never corporate filler. Each shot is 4–7s, 9:16. The brand colours, logo, and avatar are LOCKED — describe motion, performance, and emotion, not new identities.",
  },

  // ─────────────────────────── Filming & Gaming ────────────────────────
  {
    id: "filming.v1",
    vertical: "filming",
    label: "Filming & Gaming",
    tagline: "Cinematic scenes & game trailers with character/world continuity.",
    description:
      "High-fidelity narrative and game-cinematic production at 2.39:1 with a Production Bible enforcing character, wardrobe, world, and lighting continuity across shots. Covers film scenes, trailers, and game cinematics/teasers. Human gates before expensive renders; critic-gated 4K/8K finish.",
    icon: "Gamepad2",
    accent: "#7c9cff",
    output: { kind: "video", aspect: "21:9", durationS: 8, fps: 30, resolution: "1080p", structure: ["establishing", "develop", "payoff"] },
    models: { video: SEEDANCE, upscale: "composite-8k" },
    toolScope: ["asset", "textPrompt", "promptOptimizer", "videoGen", "frameExtract", "videoStitch", "musicOverlay", "preview"],
    references: { mustLock: ["character_sheets", "world_set", "style_lut"], identityRefs: { min: 3, recommended: 8 } },
    consistency: { frameChaining: true, batchBySolveType: true, bible: true, seedLock: true },
    qa: { must: ["character_consistency_cross_shot", "continuity_check", "shot_composition", "aspect_duration_ok"], minScore: 0.88 },
    gates: { freeze: "required", publish: "human" },
    budget: { projectCapUsd: 600, perShotCapUsd: 18, regenCap: 4 },
    agency: { shot_planning: "high", cinematography: "high", creative: "medium", style: "locked" },
    defaultShotCount: 4,
    shotRoles: ["establishing", "develop", "turn", "payoff"],
    plannerGuidance:
      "You are a director/cinematographer planning a cinematic sequence — a film scene, a trailer, or a game cinematic/teaser. Decompose the brief into shots that read as one continuous world: maintain hero character identity, wardrobe, props, environment, lighting, and time-of-day across every shot (consult and write the Production Bible). For game cinematics, treat heroes, factions, and environments like locked character/world sheets and lean into dynamic camera and atmosphere. Batch shots by solve-type — group close-ups together, then mediums, then wides — so visual conditions stay tight. Specify camera language (lens, movement, framing) per shot. Aspect 2.39:1-feel (21:9). Each shot 5–8s. Identity, world, and LUT are LOCKED.",
  },

  // ──────────────────────────── Ecommerce ──────────────────────────────
  {
    id: "ecommerce.v1",
    vertical: "ecommerce",
    label: "Ecommerce",
    tagline: "Product-locked stills: hero + lifestyle + detail, batch SKUs.",
    description:
      "Product-accurate hero imagery and lifestyle stills. The product reference is locked on every call; the agent varies scene, lighting, and context but never the product itself. Built for batch SKU runs.",
    icon: "ShoppingBag",
    accent: "#3ddc97",
    output: { kind: "image", aspect: "1:1", imageSize: "2048x2048", structure: ["hero", "lifestyle", "detail"] },
    models: { image: SEEDREAM },
    toolScope: ["asset", "textPrompt", "promptComposer", "imageGen", "styleTransfer", "preview"],
    references: { mustLock: ["product", "brand_colors"], identityRefs: { min: 1, recommended: 4 } },
    consistency: { frameChaining: false, batchBySolveType: true, bible: true, seedLock: true },
    qa: { must: ["product_fidelity", "brand_color_present", "background_clean_or_onbrief", "aspect_ok"], minScore: 0.85 },
    variations: { count: 4, batch: true },
    gates: { freeze: "required", publish: "auto" },
    budget: { projectCapUsd: 80, perShotCapUsd: 1.5, regenCap: 3 },
    agency: { scene: "high", lighting: "high", product: "locked", style: "medium" },
    defaultShotCount: 3,
    shotRoles: ["hero", "lifestyle", "detail"],
    plannerGuidance:
      "You are an e-commerce art director. Produce a HERO on a clean background, a LIFESTYLE shot placing the product in a believable in-use context, and a DETAIL close-up. The product geometry, material, colour, and logo are LOCKED — never restyle the product, only the scene, lighting, and composition around it. Keep brand colours present. Square (1:1) unless the brief says otherwise.",
  },
];

const BY_ID = new Map(PIPELINE_TEMPLATES.map((t) => [t.id, t]));

export function getTemplate(id: string | undefined): PipelineTemplate | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

export function listTemplates(): PipelineTemplate[] {
  return PIPELINE_TEMPLATES;
}
