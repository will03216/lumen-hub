/**
 * Reels — industry-vertical template library (v2 architecture).
 *
 * Two-axis taxonomy: Industry × Sub-category. Each template carries an
 * explicit lifecycle status, a featured flag for the industry Hero strip,
 * and a `preset` payload that pre-fills Studio when the user clicks
 * "Use template".
 *
 * Source for prompt patterns:
 *   - Seedance 2.0:  BytePlus prompt guide (ModelArk doc 2222480, Apr 2026)
 *   - Seedream 4.5 / 5.0 Lite: BytePlus tutorial (ModelArk doc 1824121)
 *
 * To render the stubs, run `pnpm reels:render` (see scripts/reels-render.mjs).
 */

// ────────────────────────────────── Industries ──────────────────────────────

export type Industry =
  | "ecommerce"
  | "advertising"
  | "film-tv"
  | "social"
  | "editorial"
  | "arch-viz"
  | "game-ip";

export const INDUSTRIES: { id: Industry; label: string; blurb: string }[] = [
  { id: "ecommerce",   label: "E-commerce",      blurb: "Pack shots, lifestyle, hero key visuals" },
  { id: "advertising", label: "Advertising",     blurb: "Brand films, social cuts, print-grade KVs" },
  { id: "film-tv",     label: "Film & TV",       blurb: "Pre-viz, concept boards, mood reels" },
  { id: "social",      label: "Social / Creator", blurb: "Vertical hooks, IG-ready loops" },
  { id: "editorial",   label: "Editorial",       blurb: "Lookbooks, runway-style stills" },
  { id: "arch-viz",    label: "Arch-viz",        blurb: "Walkthroughs, exterior beauty shots" },
  { id: "game-ip",     label: "Game / IP",       blurb: "Character look-dev, environment splash" },
];

// ────────────────────────────────── Industry Hero (v2) ─────────────────────

export type IndustryHeroMeta = {
  tagline: string;
  brief: string;
  directors_priorities: string[];
  recommended_engines: ModelId[];
  /** Featured template id surfaced in the hero strip when this industry is selected. */
  featured_id: string;
};

export const INDUSTRY_HERO: Record<Industry, IndustryHeroMeta> = {
  ecommerce: {
    tagline: "From PDP to OOH in one prompt.",
    brief:
      "Hero stills for product pages, social cuts for paid acquisition, lifestyle composites that lock the model's identity across a campaign. Built for the brand team that ships SKUs faster than cameras.",
    directors_priorities: ["Material truth", "Lighting consistency", "Identity lock"],
    recommended_engines: [
      "seedream-5-0-lite-260128",
      "seedream-4-5-251128",
      "dreamina-seedance-2-0-fast-260128",
    ],
    featured_id: "ecom-turntable-360",
  },
  advertising: {
    tagline: "Brand films at the speed of a brief.",
    brief:
      "Concept films, hero spots, social cuts, OOH key visuals. Native audio in 2.0 means the spot lands with the music already inside it. Logo and product references survive across the cut.",
    directors_priorities: ["Tone of voice", "Camera language", "Brand consistency"],
    recommended_engines: [
      "dreamina-seedance-2-0-260128",
      "seedream-4-5-251128",
    ],
    featured_id: "ad-brand-spot-neon",
  },
  "film-tv": {
    tagline: "A pre-viz suite, not a presentation deck.",
    brief:
      "Concept boards, mood reels, VFX plates, look-dev stills. Set up an establishing shot in the morning, hand it to your DP by lunch.",
    directors_priorities: ["Camera intent", "Atmosphere", "Continuity"],
    recommended_engines: [
      "dreamina-seedance-2-0-260128",
      "seedance-1-5-pro-251215",
      "seedream-4-5-251128",
    ],
    featured_id: "film-concept-descend",
  },
  social: {
    tagline: "Hooks that hold thumbs.",
    brief:
      "Vertical 9:16 by default, native audio for talking-head with synced subtitles, character-consistent carousels for IG storytelling. Optimised for first-three-seconds.",
    directors_priorities: ["First-frame impact", "Audio sync", "Character consistency"],
    recommended_engines: [
      "dreamina-seedance-2-0-260128",
      "seedream-4-5-251128",
    ],
    featured_id: "social-vertical-hook-desert",
  },
  editorial: {
    tagline: "Magazine-grade portraiture.",
    brief:
      "Cover stories, runway-style stills, lookbooks. Seedream 4.5 at 4K covers a print double-spread without grain.",
    directors_priorities: ["Lighting drama", "Material specificity", "Composition"],
    recommended_engines: [
      "seedream-4-5-251128",
      "seedream-5-0-lite-260128",
    ],
    featured_id: "editorial-portrait-cover",
  },
  "arch-viz": {
    tagline: "Walk through it before it's built.",
    brief:
      "Exterior beauty shots, interior walkthroughs, time-of-day variations. Seedance 2.0 holds the architecture together while the camera moves.",
    directors_priorities: ["Spatial coherence", "Light at hour", "Material PBR"],
    recommended_engines: [
      "dreamina-seedance-2-0-260128",
      "seedream-4-5-251128",
    ],
    featured_id: "arch-walkthrough-dawn-loft",
  },
  "game-ip": {
    tagline: "From concept to splash, on-IP.",
    brief:
      "Character turnarounds with locked identity, environment splash art, in-engine cinematic mockups. Seedream 4.5's reference editing keeps the IP coherent across a deck.",
    directors_priorities: ["IP fidelity", "Stylised consistency", "Splash impact"],
    recommended_engines: [
      "seedream-4-5-251128",
      "dreamina-seedance-2-0-260128",
    ],
    featured_id: "game-env-splash-keyart",
  },
};

// ────────────────────────────────── Sub-categories ─────────────────────────

export type SubCategory =
  // ecommerce
  | "hero-banner" | "lifestyle" | "multi-angle" | "pack-shot" | "turntable" | "unboxing"
  // advertising
  | "brand-spot" | "social-cut" | "print-kv" | "storyboard" | "product-integration"
  // film-tv
  | "previz" | "concept" | "vfx-plate" | "look-dev" | "establishing"
  // social
  | "vertical-hook" | "talking-head" | "carousel-still" | "reaction" | "trend"
  // editorial
  | "runway" | "lookbook" | "portrait" | "flat-lay"
  // arch-viz
  | "walkthrough" | "exterior" | "detail" | "time-of-day" | "staged"
  // game-ip
  | "turnaround" | "env-splash" | "cinematic-game" | "ui-integration";

export const SUB_CATEGORIES: Record<
  Industry,
  { id: SubCategory; label: string; blurb: string }[]
> = {
  // Order roughly tracks the funnel from awareness (hero/lifestyle) to purchase
  // (pack-shot/turntable) to retention (unboxing).
  ecommerce: [
    { id: "hero-banner", label: "Hero banner", blurb: "Brand-level banner, OOH-grade composition" },
    { id: "lifestyle",   label: "Lifestyle",   blurb: "Product in context, identity-locked model" },
    { id: "multi-angle", label: "Multi-angle", blurb: "Multi-angle and multi-variant product galleries" },
    { id: "pack-shot",   label: "Pack shot",   blurb: "Hero still on seamless gradient — PDP banner workhorse" },
    { id: "turntable",   label: "Turntable",   blurb: "Seamless 360° rotation, perfect loop start/end" },
    { id: "unboxing",    label: "Unboxing",    blurb: "First-touch reveal, hand entering frame" },
  ],
  advertising: [
    { id: "brand-spot",          label: "Brand spot",   blurb: "15-30s hero film with cinematography intent" },
    { id: "social-cut",          label: "Social cut",   blurb: "Vertical 9:16 paid-social variant" },
    { id: "print-kv",            label: "Print KV",     blurb: "4K still for OOH and editorial spreads" },
    { id: "storyboard",          label: "Storyboard",   blurb: "Multi-panel concept board for client review" },
    { id: "product-integration", label: "Product spot", blurb: "Logo + product reference embedded in scene" },
  ],
  "film-tv": [
    { id: "previz",        label: "Pre-viz",      blurb: "Rough motion for opening / establishing shots" },
    { id: "concept",       label: "Concept",      blurb: "Atmospheric reveal, second-act transition" },
    { id: "vfx-plate",     label: "VFX plate",    blurb: "1080p reference for compositing" },
    { id: "look-dev",      label: "Look-dev",     blurb: "Character / wardrobe / lighting test" },
    { id: "establishing",  label: "Establishing", blurb: "Hero environment splash" },
  ],
  social: [
    { id: "vertical-hook",  label: "Vertical hook", blurb: "5-8s loop, first-frame impact" },
    { id: "talking-head",   label: "Talking head",  blurb: "Lip-synced dialogue with subtitles" },
    { id: "carousel-still", label: "Carousel",      blurb: "3-pack stills, character consistency locked" },
    { id: "reaction",       label: "Reaction",      blurb: "Authentic UGC-style cut" },
    { id: "trend",          label: "Trend",         blurb: "Template-based, swap subject only" },
  ],
  editorial: [
    { id: "runway",   label: "Runway",   blurb: "Fashion week walk, side-tracking" },
    { id: "lookbook", label: "Lookbook", blurb: "Multi-outfit hero series" },
    { id: "portrait", label: "Portrait", blurb: "Magazine-cover composition, dramatic light" },
    { id: "flat-lay", label: "Flat lay", blurb: "Top-down product editorial" },
  ],
  "arch-viz": [
    { id: "walkthrough",  label: "Walkthrough", blurb: "Interior camera, slow dolly through space" },
    { id: "exterior",     label: "Exterior",    blurb: "Establishing aerial / drone-style" },
    { id: "detail",       label: "Detail",      blurb: "Material close-up, PBR-grade specificity" },
    { id: "time-of-day",  label: "Time of day", blurb: "Same scene, lighting shift" },
    { id: "staged",       label: "Staged",      blurb: "Furnished vs empty interior" },
  ],
  "game-ip": [
    { id: "turnaround",      label: "Turnaround", blurb: "Character 360° at locked identity" },
    { id: "env-splash",      label: "Env splash", blurb: "Hero environment key art" },
    { id: "cinematic-game",  label: "Cinematic",  blurb: "In-engine style trailer cut" },
    { id: "ui-integration",  label: "UI mock",    blurb: "Game UI + character composite" },
  ],
};

// ────────────────────────────────── Engine taxonomy ────────────────────────

/**
 * Model IDs — confirmed against BytePlus official docs (Apr 2026).
 *
 *  - Seedance 2.0 family is namespaced `dreamina-seedance-2-…`
 *  - Seedance 1.5 Pro keeps the legacy `seedance-…` namespace
 *  - Seedream 5.0 Lite has two valid IDs (we use the `-lite-` form for clarity)
 *  - Seedream 4.5 has the date-suffixed canonical ID
 *
 * Keep this union strictly in-sync with `lib/studio/models.ts`: a
 * template that hydrates via `preset-bridge.hydrateFromQuery` against
 * a model id the Studio registry doesn't know will silently return
 * null and the click-through from Reels will no-op. If BytePlus ships
 * a new model, add it to the Studio registry first, then here.
 */
export type ModelId =
  | "dreamina-seedance-2-0-260128"
  | "dreamina-seedance-2-0-fast-260128"
  | "seedance-1-5-pro-251215"
  | "seedream-5-0-lite-260128"
  | "seedream-4-5-251128";

/** Canonical short label for any ModelId. Used in card badges and filters. */
export const MODEL_LABELS: Record<ModelId, string> = {
  "dreamina-seedance-2-0-260128":      "Seedance 2.0",
  "dreamina-seedance-2-0-fast-260128": "Seedance 2.0 Fast",
  "seedance-1-5-pro-251215":           "Seedance 1.5 Pro",
  "seedream-5-0-lite-260128":          "Seedream 5.0 Lite",
  "seedream-4-5-251128":               "Seedream 4.5",
};

export type ModelMeta = {
  id: ModelId;
  family:
    | "seedance-2"
    | "seedance-1-5"
    | "seedream-5-lite"
    | "seedream-4-5";
  short: string;
  label: string;
  tagline: string;
  blurb: string;
  capabilities: string[];
  kind: "video" | "image";
  /** Looped sample on the capability card. */
  sample?: { src: string; ratio: string; kind: "image" | "video" };
};

/** Engines surfaced as headline cards in §01. Other engines (Fast / 1.5 Pro)
 *  remain valid `ModelId` values for templates but don't get their own
 *  capability card to keep the layout from sprawling. */
export const MODELS: ModelMeta[] = [
  {
    id: "dreamina-seedance-2-0-260128",
    family: "seedance-2",
    short: "Seedance 2.0",
    label: "Seedance 2.0",
    tagline: "Direct, with sound.",
    blurb:
      "Native audio, 4–15s timing, multi-reference fusion, video editing. The new flagship for director-grade control.",
    capabilities: ["Native audio", "4–15s", "Multi-ref", "Video edit"],
    kind: "video",
    sample: { src: "/landing/fig-01-canyon.mp4", ratio: "3/4", kind: "video" },
  },
  {
    id: "seedream-4-5-251128",
    family: "seedream-4-5",
    short: "Seedream 4.5",
    label: "Seedream 4.5",
    tagline: "Print-grade, 4K, identity-locked.",
    blurb:
      "Up to 4K stills, reference-driven editing, character consistency across a campaign. Default for editorial and brand work.",
    capabilities: ["4K", "Char consistency", "Multi-ref", "Edit"],
    kind: "image",
    sample: {
      src: "/reels/editorial/editorial-portrait-cover.jpg",
      ratio: "4/5",
      kind: "image",
    },
  },
  {
    id: "seedream-5-0-lite-260128",
    family: "seedream-5-lite",
    short: "Seedream 5.0",
    label: "Seedream 5.0 Lite",
    tagline: "Photo-real, fast, six ratios.",
    blurb:
      "Up to 3K stills with razor-sharp product detail, six aspect ratios, PNG/JPEG output. The daily-driver for product pages and key visuals.",
    capabilities: ["3K", "6 ratios", "Photo-real", "PNG/JPEG"],
    kind: "image",
    sample: {
      src: "/reels/ecommerce/ecom-pack-shot-floating.png",
      ratio: "1/1",
      kind: "image",
    },
  },
];

// ────────────────────────────────── Capabilities ───────────────────────────

export type Capability =
  | "audio"             // native audio (Seedance 2.0)
  | "multi-ref"         // multiple reference images
  | "long-take"         // long continuous shot
  | "camera-control"    // explicit camera-move directives
  | "4k"                // 4K-grade still
  | "char-consistency"  // character identity or product geometry locked across frames
  | "fast"              // fast-tier engine
  | "video-edit"        // add/remove/modify (Seedance 2.0 only)
  | "logo-ref"          // logo reference fusion
  | "subtitles";        // synced subtitles

// ────────────────────────────────── Aspect / grid ──────────────────────────

export type AspectRatio = "1/1" | "4/5" | "16/9" | "9/16" | "3/4" | "4/3" | "21/9";
export type GridSpan = 4 | 5 | 6 | 7 | 8 | 12;

// ────────────────────────────────── Studio preset ──────────────────────────

export type StudioPreset = {
  prompt: string;
  // Video-only fields
  resolution?: "480p" | "720p" | "1080p";
  duration?: number;
  ratio?: string;
  seed?: number;
  camerafixed?: boolean;
  generate_audio?: boolean;
  // Image-only (Seedream)
  size?: string; // "2K" | "3K" | "4K" | "2048x2048"
  output_format?: "png" | "jpeg";
  sequential?: boolean; // batch-image output
  max_images?: number;
};

// ────────────────────────────────── Template ───────────────────────────────

export type TemplateStatus = "live" | "stub" | "draft";

export type ReelTemplate = {
  /** ID convention: <industry>-<sub>-<variant>. URL-safe. */
  id: string;
  industry: Industry;
  subCategory: SubCategory;
  model: ModelId;
  kind: "image" | "video";

  /** Hero slot for the industry — at most one per industry. */
  featured?: boolean;
  /** Default sort weight in the grid; higher floats first. */
  priority?: number;
  /** Render lifecycle. `live` = src ready, `stub` = prompt ready awaiting render,
   *  `draft` = needs prompt authoring. */
  status: TemplateStatus;

  title: string;
  director_note: string;
  /** Long-form note used in the industry Hero strip. Optional. */
  brief_note?: string;

  /** Path under /public. Empty/undefined when status !== "live". */
  src?: string;
  poster?: string;
  ratio: AspectRatio;
  span?: GridSpan;

  capabilities: Capability[];
  preset: StudioPreset;

  /** Multi-variant outputs (same prompt, different ratios/sizes). v2 ready,
   *  not yet rendered. */
  variants?: { ratio: AspectRatio; src: string; duration?: number; size?: string }[];

  /** Provenance for audit trail. */
  source: "byteplus-official" | "internal" | "community-pr";
  /** Rough K-token cost used by the render script's budget guard. */
  token_cost_estimate?: number;
};

// ────────────────────────────────── Templates (v2) ─────────────────────────

/**
 * v2 seed library — 85 entries across 7 industries (35 live, 47 stub, 3 draft).
 *
 * Output convention: `public/reels/<industry>/<id>.<ext>`.
 * (Existing landing-mosaic clips stay at `/landing/` — they're shared with
 * the homepage and we don't want to break that surface.)
 *
 * ── Model selection rubric ────────────────────────────────────────────────
 * Every entry picks exactly one engine. These are the axes that drive it:
 *
 *  · dreamina-seedance-2-0-260128 — flagship T2V/R2V. Long-take coherence
 *    across 6–8s (crane, orbit, dolly), multi-reference fusion (R2V),
 *    native audio, camera-motion control. Use when geometry must hold for
 *    seconds or references must co-exist (logo + product, locked identity
 *    across a move).
 *
 *  · dreamina-seedance-2-0-fast-260128 — same engine family, ~25% cheaper
 *    per second. Use when the brief is 5s, vertical, and will be A/B-tested
 *    or repeated across many SKUs. Trades a little long-take polish for
 *    fleet economics.
 *
 *  · seedance-1-5-pro-251215 — currently the ONLY engine shipping 1080p
 *    video. Reserved for VFX plates and finished pre-viz that need to cut
 *    with conventional 1080p footage.
 *
 *  · seedream-4-5-251128 — 4K image king. Multi-ref fusion, locked-identity
 *    character consistency, sequential generation (`max_images` 2–4) in a
 *    single call. Default for print-grade stills, lookbooks, before/after
 *    staging, anything that must hold a face or a scene across frames.
 *
 *  · seedream-5-0-lite-260128 — 2K–3K image daily driver, cheaper than 4.5
 *    but without char-consistency or sequential gen. Use for single-frame
 *    PDP stills, flat-lays, and web-delivered assets where 4.5's premium
 *    features would be wasted spend.
 *
 * Per-template `// why <model>: …` one-liners below name the specific axis
 * that drove each choice — quickly scannable when authoring new entries,
 * and a starting point when the engine matrix shifts.
 */
export const TEMPLATES: ReelTemplate[] = [
  // ───────── Advertising ───────────────────────────────────────────────────
  {
    // why Seedance 2.0: 6s anamorphic dolly push, hero cinematic — needs flagship long-take coherence.
    id: "ad-brand-spot-neon",
    industry: "advertising",
    subCategory: "brand-spot",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    featured: true,
    priority: 10,
    status: "live",
    title: "Neon Brand Spot",
    director_note:
      "Slow dolly push-in through a neon alley — the canonical hero for nighttime / lifestyle campaigns.",
    brief_note:
      "Sets the tone for any noir-flavoured spot. Anamorphic flare, deep puddle reflections, single hero figure. Drop product or talent on the back wall and the whole frame composes itself.",
    src: "/landing/fig-03-neon.mp4",
    ratio: "16/9",
    span: 6,
    capabilities: ["camera-control"],
    source: "byteplus-official",
    preset: {
      // BytePlus formula: Subject + Motion + Environment + Aesthetics + Camera + Audio
      prompt:
        "T2V: A lone figure in a translucent rain jacket walks slowly toward camera. Neon-drenched cyberpunk Tokyo alleyway after heavy rain, holographic kanji signs flickering, deep puddle reflections everywhere. Cinematic dolly push-in, anamorphic lens flare, color graded cyan and magenta, Blade Runner 2049 aesthetic. Ambient rainfall and distant city hum.",
      resolution: "720p",
      duration: 6,
      ratio: "16:9",
      camerafixed: false,
    },
    token_cost_estimate: 4.3,
  },
  {
    // why Seedance 2.0: 8s vertical crane with planet reveal — only flagship holds the geometry across the ascent.
    id: "ad-social-cut-observatory",
    industry: "advertising",
    subCategory: "social-cut",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 8,
    status: "live",
    title: "Vertical Brand Cut",
    director_note:
      "Vertical crane-up with hero reveal at the top — drop a logo plate over the final frame for OOH or DOOH delivery.",
    src: "/landing/fig-05-observatory.mp4",
    ratio: "9/16",
    span: 4,
    capabilities: ["camera-control", "long-take"],
    source: "byteplus-official",
    preset: {
      prompt:
        "T2V: Vertical crane-up climbing the facade of a futuristic crystalline observatory tower on an icy alien glacier. Camera ascends slowly from the glacier base to the tower peak; as it reaches the top, a giant ringed gas giant planet rises majestically into frame behind the spire. Twilight color palette with soft aurora in cyan and magenta, anamorphic lens flare, IMAX cinematography. Ambient glacier wind and a low orchestral swell.",
      resolution: "720p",
      duration: 8,
      ratio: "9:16",
    },
    token_cost_estimate: 5.7,
  },
  {
    // why Seedream 4.5: 4K print-grade OOH / magazine spreads — 4.5 owns the 4K image crown.
    id: "ad-print-kv-hero",
    industry: "advertising",
    subCategory: "print-kv",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 6,
    status: "live",
    title: "Print Key Visual",
    director_note:
      "4K vertical hero still — print-grade resolution for OOH, magazine spreads, brand-book covers. Seedream 4.5 owns the 4K crown.",
    src: "/reels/advertising/ad-print-kv-hero.jpg",
    ratio: "9/16",
    span: 4,
    capabilities: ["4k"],
    source: "byteplus-official",
    preset: {
      prompt:
        "Vibrant editorial fashion key visual: a model in a sculptural couture gown stands centered against a deep crimson backdrop, dramatic single-source rim lighting from camera left, sharp focus on the eyes, shallow depth of field, Vogue magazine cover composition, shot in medium format, hyperreal skin texture, color graded with rich saturation and deep shadows.",
      size: "4K",
      ratio: "9:16",
    },
  },
  {
    // why Seedance 2.0: R2V multi-image fusion (product + logo refs) — flagship keeps both references coherent across the cut.
    id: "ad-product-integration-logo",
    industry: "advertising",
    subCategory: "product-integration",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 9,
    status: "live",
    title: "Logo Reveal Spot",
    director_note:
      "R2V multi-image fusion — product floats through a sci-fi corridor while ambient holograms converge into the brand logo. Seedance 2.0 holds both references coherent across the cut.",
    src: "/reels/advertising/ad-product-integration-logo.mp4",
    ratio: "16/9",
    span: 6,
    capabilities: ["multi-ref", "logo-ref", "audio", "camera-control"],
    source: "byteplus-official",
    preset: {
      // Mirrors BytePlus official Logo-reference example almost verbatim;
      // swap [Reference Image 1] for the user's logo and [Reference Image 2]
      // for the product when wiring `/generate?preset=…`.
      prompt:
        "R2V: The scene is set on an aerial corridor in a neon-drenched futuristic metropolis, where flying vehicles and holographic ads intertwine. Featuring the product from Reference Image 2, the sequence opens with a medium shot of the product floating mid-air. The camera then pulls back to reveal floating holographic billboards flooding the sky, which gradually converge at the center of the frame to form the logo from Reference Image 1. The entire piece adopts a 3D cyberpunk sci-fi cinematic style. Ambient electronic synth and a subtle city hum.",
      resolution: "720p",
      duration: 8,
      ratio: "16:9",
      generate_audio: true,
    },
  },

  {
    // why Seedance 2.0 Fast: 5s vertical paid-social, 20× A/B variants — Fast variant keeps fleet cost affordable.
    id: "ad-social-cut-vertical-flash",
    industry: "advertising",
    subCategory: "social-cut",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 7,
    status: "live",
    title: "Paid Social Flash",
    director_note:
      "5-second vertical reveal — product emerges from black into warm key light, single synth downbeat lands on the reveal. Seedance 2.0 Fast keeps the cost low enough to A/B test 20 variants.",
    src: "/reels/advertising/ad-social-cut-vertical-flash.mp4",
    ratio: "9/16",
    span: 4,
    capabilities: ["fast", "audio", "camera-control"],
    source: "byteplus-official",
    preset: {
      prompt:
        "T2V: Vertical paid-social hero shot. A sleek minimalist product (style TBD) emerges from pitch black into a pool of warm golden practical light at center-frame. The camera performs a fast 180-degree arc-orbit from below, revealing the product silhouette-to-reveal in one continuous motion, ending on a clean hero lockup with negative space above for paid copy. Anamorphic lens flare on reveal, hyperreal surface sheen, slow-motion dust motes. A sharp synth downbeat on the lighting reveal, followed by a warm ambient pad.",
      resolution: "720p",
      duration: 5,
      ratio: "9:16",
      generate_audio: true,
    },
  },
  {
    // why Seedream 4.5: 4K multi-panel single frame — needs 4.5's resolution ceiling and composition latitude.
    id: "ad-storyboard-3panel",
    industry: "advertising",
    subCategory: "storyboard",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 5,
    status: "live",
    title: "3-Panel Concept Board",
    director_note:
      "Single 4K frame with three cinematographic panels embedded — the brief-to-client-review shortcut. Ships the camera language in one asset.",
    src: "/reels/advertising/ad-storyboard-3panel.jpg",
    ratio: "16/9",
    span: 12,
    capabilities: ["4k"],
    source: "internal",
    preset: {
      prompt:
        "Generate a 3-panel horizontal storyboard concept frame for a brand film: three equal vertical panels separated by thin white borders on a dark charcoal background. Panel 1 (left) — wide establishing shot of a young woman at a rain-soaked city crosswalk, neon signage reflected in the wet pavement. Panel 2 (center) — medium close-up on her hands pulling a small elegant product from her coat pocket, warm interior light from a nearby cafe. Panel 3 (right) — hero lockup: the product centered on a clean black background with ample negative space for logo and tagline. Each panel shares a cohesive cinematic color grade — teal shadows, amber highlights, Roger Deakins cinematography reference. Pencil-annotated margin marks outside panels add storyboard authenticity.",
      size: "4K",
      ratio: "16:9",
    },
  },

  // ───────── Film & TV ─────────────────────────────────────────────────────
  {
    // why Seedance 2.0: 8s aggressive pull-back crane — long-take stability is the flagship's territory.
    id: "film-previz-pullback",
    industry: "film-tv",
    subCategory: "previz",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 8,
    status: "live",
    title: "Pre-Viz Pull-Back",
    director_note:
      "8-second crane-out from a hero figure to landscape scale — the workhorse pre-viz for opening / establishing shots.",
    src: "/landing/fig-01-canyon.mp4",
    ratio: "3/4",
    span: 4,
    capabilities: ["long-take", "camera-control"],
    source: "byteplus-official",
    preset: {
      prompt:
        "T2V: A lone astronaut in a sleek silver pressure suit stands silhouetted on a Martian canyon ridge. Aggressive aerial pull-back reveal: camera starts tight on the astronaut, then rapidly cranes upward and backward, exposing vast layered orange and rust mesa walls falling away thousands of meters below, twin pale moons rising on the horizon. Dust particles catch volumetric side-light, cinematic 70mm film grain, Denis Villeneuve cinematography, A24 sci-fi aesthetic. Ambient wind and a low atmospheric drone.",
      resolution: "720p",
      duration: 8,
      ratio: "3:4",
    },
    token_cost_estimate: 5.7,
  },
  {
    // why Seedance 2.0: slow descending crane through layered environment — flagship is the only engine that doesn't drift mid-move.
    id: "film-concept-descend",
    industry: "film-tv",
    subCategory: "concept",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    featured: true,
    priority: 10,
    status: "live",
    title: "Concept Descend",
    director_note:
      "Slow descending crane through a layered environment — useful for atmospheric reveals and second-act transitions.",
    brief_note:
      "Built for the 'we need a mood reel by Friday' brief. Drops the audience inside an environment without exposition. Pair with a short voiceover line in 2.0 and you have an opening title sequence.",
    src: "/landing/fig-04-underwater.mp4",
    ratio: "16/9",
    span: 8,
    capabilities: ["long-take", "camera-control"],
    source: "byteplus-official",
    preset: {
      prompt:
        "T2V: A vast underwater bioluminescent kelp forest in deep abyssal water. Slow majestic descending crane through the kelp canopy: camera glides downward past glowing kelp blades and swirling cyan and emerald plankton trails, gradually revealing an ancient submerged crystalline monument far below as the kelp parts and reforms. Godrays piercing the dark, IMAX underwater cinematography, color graded teal and amber, 70mm film grain. Ambient subaquatic hum and faint distant whale song.",
      resolution: "720p",
      duration: 6,
      ratio: "16:9",
    },
    token_cost_estimate: 4.3,
  },
  {
    // why Seedance 1.5 Pro: VFX integration needs 1080p — 1.5 Pro is currently the only engine that ships it.
    id: "film-vfx-plate-1080p",
    industry: "film-tv",
    subCategory: "vfx-plate",
    model: "seedance-1-5-pro-251215",
    kind: "video",
    priority: 4,
    status: "live",
    title: "1080p Reference Plate",
    director_note:
      "Seedance 1.5 Pro is currently the only engine that ships 1080p — keep it around for VFX plates and finished pre-viz.",
    src: "/reels/film-tv/film-vfx-plate-1080p.mp4",
    ratio: "16/9",
    span: 12,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "[your scene description], cinematic 70mm film grain, hyperreal lighting, locked tripod composition for VFX integration",
      resolution: "1080p",
      duration: 10,
      ratio: "16:9",
    },
  },

  {
    // why Seedream 4.5: 4K pore-level casting reference — 4.5's print ceiling carries the DP/costume signoff.
    id: "film-look-dev-character",
    industry: "film-tv",
    subCategory: "look-dev",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 9,
    status: "live",
    title: "Character Look-Dev",
    director_note:
      "4K portrait-grade casting reference — costume, grooming, skin texture all held at pore level. Print-ready for DP and costume department signoff.",
    src: "/reels/film-tv/film-look-dev-character.jpg",
    ratio: "4/5",
    span: 4,
    capabilities: ["4k", "char-consistency"],
    source: "internal",
    preset: {
      prompt:
        "Character look-dev portrait for a mid-budget sci-fi feature: a woman in her early 30s with cropped auburn hair, freckled skin, and sharp grey-green eyes, wearing a weathered olive-drab field jacket over a high-collar technical base layer. Three-quarter turn, chin slightly down, eyes direct to camera. Rembrandt key-light from camera left, soft negative fill, deep charcoal seamless backdrop. Skin texture preserved at pore-level, practical stray hairs catching rim light, subtle grain. Shot on Arri Alexa 35 with a 65mm prime, shallow depth of field. Editorial and casting-reference aesthetic — Annie Leibovitz meets Greig Fraser.",
      size: "4K",
      ratio: "4:5",
    },
  },
  {
    // why Seedance 2.0: 8s drone with native ambient audio — flagship owns both the long-take and the audio path.
    id: "film-establishing-aerial",
    industry: "film-tv",
    subCategory: "establishing",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 7,
    status: "live",
    title: "Aerial Establishing",
    director_note:
      "Opening-title-sequence workhorse — slow drone forward-reveal over a stylised landscape, native ambient already inside the file.",
    src: "/reels/film-tv/film-establishing-aerial.mp4",
    ratio: "16/9",
    span: 8,
    capabilities: ["audio", "camera-control", "long-take"],
    source: "byteplus-official",
    preset: {
      prompt:
        "T2V: Hero establishing aerial shot opening a feature film. A snow-dusted cedar forest on a mountain plateau at dawn, a single narrow road cutting diagonally through the pines. Slow majestic forward-dolly drone move: camera begins tight on the road at treetop height, then climbs and pushes forward, revealing the vast unbroken forest stretching to distant fog-wreathed peaks as a pale amber sun breaks the horizon. Volumetric godrays through the fog, 70mm film grain, cinematic color grade with cold cyan shadows and warm amber highlights, inspired by The Revenant and 1917. Quiet wind through the trees and a sense of stillness.",
      resolution: "720p",
      duration: 8,
      ratio: "16:9",
      generate_audio: true,
    },
  },

  // ───────── Social / Creator ──────────────────────────────────────────────
  {
    // why Seedance 2.0 Fast: 5s paid-social hook, thumbnail-first — Fast variant is ~25% cheaper, right for A/B fleets.
    id: "social-vertical-hook-desert",
    industry: "social",
    subCategory: "vertical-hook",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    featured: true,
    priority: 10,
    status: "live",
    title: "5-Second Hook",
    director_note:
      "Lateral track at sunset — built on Seedance 2.0 Fast for ~25% lower token cost. Ideal for paid-social A/B variants.",
    brief_note:
      "First-frame impact: hooded silhouette + crimson dune fills the thumbnail. 5s loop for paid social, swap the subject and brand keeps reading.",
    src: "/landing/fig-02-desert.mp4",
    ratio: "16/9",
    span: 8,
    capabilities: ["fast"],
    source: "byteplus-official",
    preset: {
      prompt:
        "T2V: A lone hooded traveler in flowing cloak strides across a windswept rust-colored sand dune at sunset, twin moons hanging in the violet sky. Slow lateral tracking dolly from the side, ultra-wide cinematic framing, anamorphic lens flare, golden-hour rim light, fine sand particles kicked up by each step. Ambient wind and a sparse rhythmic synth pulse.",
      resolution: "720p",
      duration: 5,
      ratio: "16:9",
    },
    token_cost_estimate: 2.5,
  },
  {
    // why Seedance 2.0: native lip-sync + subtitle integration in one pass — flagship audio path carries it end-to-end.
    id: "social-talking-head-dialogue",
    industry: "social",
    subCategory: "talking-head",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 8,
    status: "live",
    title: "Talking-Head w/ Dialogue",
    director_note:
      "Native lip-synced dialogue with auto-rendered subtitles in a single pass. Uses BytePlus's `> Text Integration` syntax for caption placement.",
    src: "/reels/social/social-talking-head-dialogue.mp4",
    ratio: "9/16",
    span: 4,
    capabilities: ["audio", "subtitles"],
    source: "byteplus-official",
    preset: {
      // Lifted from BytePlus dialogue + subtitle pattern.
      prompt:
        'T2V: A close-up cinematic shot of a young creator sitting at a warm-lit wooden desk in a softly out-of-focus home studio. She speaks first with a playful tone: "Okay so here\'s the thing about waking up at five." Then she leans in and adds: "Nobody actually wants to. We just want to be the person who does." Shallow depth of field, slight handheld energy, golden practical lighting. > Text Integration: Render the dialogue as subtitles at the bottom-center of the screen. Subtitles should appear sequentially as each line is spoken, perfectly synchronized with the audio.',
      resolution: "720p",
      duration: 8,
      ratio: "9:16",
      generate_audio: true,
    },
  },
  {
    // why Seedream 4.5: sequential 3-pack with locked facial identity across scenes — 4.5's signature trick.
    id: "social-carousel-still-3pack",
    industry: "social",
    subCategory: "carousel-still",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 9,
    status: "live",
    title: "IG Carousel · 3-Pack",
    director_note:
      "Same character, three scenes, locked identity — uses Seedream 4.5 sequential generation (max_images: 3) to ship a coherent IG carousel in one call.",
    src: "/reels/social/social-carousel-still-3pack-1.jpg",
    ratio: "1/1",
    span: 4,
    capabilities: ["char-consistency", "multi-ref"],
    variants: [
      { ratio: "1/1", src: "/reels/social/social-carousel-still-3pack-2.jpg" },
      { ratio: "1/1", src: "/reels/social/social-carousel-still-3pack-3.jpg" },
    ],
    source: "byteplus-official",
    preset: {
      prompt:
        "Generate 3 IG-ready square stills with the same character: a young woman with auburn hair in a linen blazer. Maintain identical face, hair, and wardrobe across all three. Scene 1: she sips espresso at a Parisian café terrace, soft morning light. Scene 2: she walks a cobblestone street with a tan tote bag, midday shadow play. Scene 3: she leans against a vintage motorcycle at sunset, golden rim light. Editorial fashion photography, consistent color grade across all three, 1:1 IG composition, shot on 50mm.",
      size: "2K",
      sequential: true,
      max_images: 3,
    },
  },

  {
    // why Seedance 2.0 Fast: 5s UGC punch-in, high-iteration format — Fast variant trims cost per try.
    id: "social-reaction-punch-in",
    industry: "social",
    subCategory: "reaction",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 7,
    status: "live",
    title: "Punch-In Reaction",
    director_note:
      "Authentic UGC-style punch-in on a creator's face — the reaction cut that trending shorts live on. Native audio carries the micro-expression.",
    src: "/reels/social/social-reaction-punch-in.mp4",
    ratio: "9/16",
    span: 4,
    capabilities: ["fast", "audio", "camera-control"],
    source: "byteplus-official",
    preset: {
      prompt:
        "T2V: Authentic UGC-style reaction shot. A young man sitting at his kitchen table in a sunlit apartment, phone in hand, looking off-camera. Starts relaxed, then his eyes widen and he slowly leans closer to the phone screen. The camera performs a subtle but rapid punch-in zoom from medium-shot to tight close-up on his face over 3 seconds, intensifying with his expression. Vertical 9:16 framing, shallow depth of field, natural window light, slightly grainy smartphone aesthetic. His breath catching audibly, a faint ambient room tone, then a single soft 'oh my god' in his voice synchronized to the punch-in apex.",
      resolution: "720p",
      duration: 5,
      ratio: "9:16",
      generate_audio: true,
    },
  },
  {
    // why Seedance 2.0 Fast: 6s vertical trend cut, authored in batches — Fast variant amortizes across variant families.
    id: "social-trend-whip-pan",
    industry: "social",
    subCategory: "trend",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 6,
    status: "live",
    title: "Whip-Pan Outfit Swap",
    director_note:
      "Swap the subject and the brand keeps reading — classic outfit-change trend template with motion-blurred whip-pan and snap-sync audio.",
    src: "/reels/social/social-trend-whip-pan.mp4",
    ratio: "9/16",
    span: 4,
    capabilities: ["fast", "audio", "camera-control"],
    source: "byteplus-official",
    preset: {
      prompt:
        "T2V: Vertical social-trend transition template. A young woman stands against a pastel pink wall in casual streetwear — oversized denim jacket and white tee. She snaps her fingers toward camera; on the snap the camera whip-pans violently 180 degrees with motion blur, and on the whip's settle she is now in a completely different elegant cocktail dress against the exact same pink wall, same pose, same lighting angle. Perfect for outfit-change trends. Motion-blurred whip-pan at the transition, crisp settle on the reveal. A subtle ambient room tone throughout.",
      resolution: "720p",
      duration: 6,
      ratio: "9:16",
      generate_audio: true,
    },
  },

  // ───────── E-commerce ────────────────────────────────────────────────────
  {
    // why Seedream 5.0 Lite: 2K square PDP at volume — Lite is cheaper than 4.5 with no char/sequential requirement wasted.
    id: "ecom-pack-shot-floating",
    industry: "ecommerce",
    subCategory: "pack-shot",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 9,
    status: "live",
    title: "Floating Pack Shot",
    director_note:
      "2K square hero still on seamless gradient — the daily-driver for PDP banners and category covers. Seedream 5.0 Lite hits 3K max but 2K is the sweet spot for web delivery.",
    src: "/reels/ecommerce/ecom-pack-shot-floating.png",
    ratio: "1/1",
    span: 4,
    capabilities: [],
    source: "byteplus-official",
    preset: {
      prompt:
        "Hero product key visual: [your product] floating against a soft cream-to-pearl gradient seamless backdrop, studio softbox light from camera left at 45 degrees, subtle long contact shadow grounding the product, hyperreal sharpness on every material edge, 1:1 commercial composition, Apple-store aesthetic.",
      size: "2K",
      output_format: "png",
    },
  },
  {
    // why Seedance 2.0 Fast: 5s loop across hundreds of SKUs — Fast variant is the only way the fleet-cost math works.
    id: "ecom-turntable-360",
    industry: "ecommerce",
    subCategory: "turntable",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    featured: true,
    priority: 10,
    status: "live",
    title: "360° Turntable Loop",
    director_note:
      "Seamless rotation loop — keep duration short (5s) and run on Fast variant to amortize across SKU catalogs. Lifted from the BytePlus official 360° product example.",
    brief_note:
      "The closest thing to a packshot turntable rig you can run from a prompt. Hands-free SKU ingestion: drop the product reference in, get a clean 5s loop on a white seamless. Swap to Fast variant when you're rendering 200 SKUs.",
    src: "/reels/ecommerce/ecom-turntable-360.mp4",
    ratio: "1/1",
    span: 4,
    capabilities: ["fast", "camera-control", "multi-ref"],
    source: "byteplus-official",
    preset: {
      prompt:
        "R2V: Use the product featured in Reference Image 1. Replace the original background with a clean seamless white surface, and place the product centered on a white table. The shooting lens first focuses on the product in close-up, then slowly rotates 360 degrees with the product as the main subject, clearly displaying the front, sides and back. Studio softbox light from above, subtle contact shadow, hyperreal product photography, perfect loop start and end.",
      resolution: "720p",
      duration: 5,
      ratio: "1:1",
      camerafixed: false,
    },
  },
  {
    // why Seedream 4.5: multi-ref fusion (model + outfit + product) with locked identity — 4.5's core capability.
    id: "ecom-lifestyle-composite",
    industry: "ecommerce",
    subCategory: "lifestyle",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 6,
    status: "live",
    title: "Lifestyle Composite",
    director_note:
      "Lock the model's identity, then drop them into multiple lifestyle scenes — same person, different environments. Multi-image fusion is Seedream 4.5's core trick.",
    src: "/reels/ecommerce/ecom-lifestyle-composite.jpg",
    ratio: "4/5",
    span: 8,
    capabilities: ["char-consistency", "multi-ref"],
    source: "byteplus-official",
    preset: {
      prompt:
        "Lifestyle scene: refer to the model in image 1 wearing the outfit from image 2, holding [your product] in a sun-drenched Mediterranean kitchen at golden hour. Warm side-light through linen curtains, candid editorial energy, shallow depth of field, shot on 50mm. Maintain the model's facial identity from image 1 exactly.",
      size: "2K",
    },
  },
  {
    // why Seedance 2.0: 8s premium reveal + native audio (paper rustle) — flagship carries both the motion and the SFX.
    id: "ecom-unboxing-first-touch",
    industry: "ecommerce",
    subCategory: "unboxing",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 5,
    status: "live",
    title: "Unboxing First-Touch",
    director_note:
      "Hand-enters-frame reveal on a matte-black gift box — the premium unboxing cut without a camera crew. Native audio picks up the paper rustle.",
    src: "/reels/ecommerce/ecom-unboxing-first-touch.mp4",
    ratio: "9/16",
    span: 6,
    capabilities: ["audio", "camera-control"],
    source: "byteplus-official",
    preset: {
      prompt:
        "T2V: Premium vertical unboxing first-touch reveal. A minimalist matte-black square gift box sits centered on a pale oak tabletop in warm top-down key light. A woman's hand with a single thin gold ring enters frame from the lower right and slowly lifts the lid straight up, revealing a product (style TBD) nestled in charcoal foam insert with a folded card of tissue paper. The camera is locked in a slight top-down three-quarter angle, subtle push-in from 100% to 110% across the reveal. Cinematic product photography aesthetic, slow-motion 60fps feel, shallow depth of field, hero product kept in sharp focus throughout. Quiet ambient room tone.",
      resolution: "720p",
      duration: 8,
      ratio: "9:16",
      generate_audio: true,
    },
  },
  {
    // why Seedream 4.5: sequential 4-angle gallery with locked product form — 4.5's sequential gen ships the set in one call.
    id: "ecom-carousel-product-angles",
    industry: "ecommerce",
    subCategory: "multi-angle",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 8,
    status: "live",
    title: "Product Carousel · 4-Angle",
    director_note:
      "Four coherent IG stills — same product, four angles, lighting locked. Seedream 4.5 sequential generation (max_images: 4) ships the gallery in a single call.",
    src: "/reels/ecommerce/ecom-carousel-product-angles.jpg",
    ratio: "1/1",
    span: 4,
    capabilities: ["char-consistency"],
    source: "byteplus-official",
    preset: {
      prompt:
        "Generate 4 square IG-ready product gallery stills, same product and lighting, different camera angles. Scene 1: front three-quarter hero shot, warm key light from camera left, subtle contact shadow. Scene 2: straight-on profile side view, hard top light raking across surface textures. Scene 3: top-down flat-lay with the product centered on seamless cream paper and two matching prop accessories symmetrically placed. Scene 4: detail macro focused on a single material junction (stitching, edge, seam) with extreme sharpness. Maintain identical product form, finish, and color grade across all four frames. Apple-store aesthetic, hyperreal material truth, 1:1 composition.",
      size: "2K",
      sequential: true,
      max_images: 4,
    },
  },
  {
    // why Seedream 4.5: 4K 16:9 OOH banner with print-grade material fidelity — 4.5's resolution ceiling.
    id: "ecom-hero-kv-banner",
    industry: "ecommerce",
    subCategory: "hero-banner",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 7,
    status: "live",
    title: "Hero KV Banner",
    director_note:
      "OOH-grade 4K banner with brand-copy negative space pre-composed — drop the logo into the left third and ship. Seedream 4.5 holds print at 16:9.",
    src: "/reels/ecommerce/ecom-hero-kv-banner.jpg",
    ratio: "16/9",
    span: 12,
    capabilities: ["4k"],
    source: "byteplus-official",
    preset: {
      prompt:
        "Hero brand banner key visual for OOH and web banner use. A minimalist editorial composition: a single striking product (style TBD) placed slightly right-of-center on a seamless gradient backdrop transitioning from deep aubergine to warm ochre. Dramatic single-source rim light from the far right carves the product silhouette, long contact shadow falling to the left grounding the frame. Generous negative space on the left two-thirds of the frame for brand logo and tagline copy. 16:9 landscape composition, 4K print-grade, hyperreal material fidelity, zero compression artifacts. Shot on medium format with a 120mm macro equivalent. Brand-book-cover aesthetic.",
      size: "4K",
      ratio: "16:9",
    },
  },
  {
    // why Seedance 2.0 Fast: 4s subtle parallax on 16:9 — Fast keeps the hero-row swap cheap when you A/B 5 banners a week.
    id: "ecom-hero-banner-animated",
    industry: "ecommerce",
    subCategory: "hero-banner",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 6,
    status: "stub",
    title: "Animated Hero Banner",
    director_note:
      "Subtle 4s parallax push on a brand banner — the motion-banner upgrade for homepage takeovers without the spec-film budget.",
    ratio: "16/9",
    span: 12,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: Hero brand banner with subtle parallax. A premium product (style TBD) sits slightly right-of-center on a seamless gradient backdrop transitioning from deep aubergine to warm ochre. Dramatic single-source rim light from the far right carves the silhouette, long contact shadow falling to the left. The camera performs a slow 4-second push-in from 100% to 108% scale, holding the product locked in frame while the background atmosphere subtly drifts. Generous negative space on the left two-thirds reserved for brand logo overlay. 16:9 cinematic composition, hyperreal material fidelity, brand-book-cover aesthetic.",
      resolution: "720p",
      duration: 4,
      ratio: "16:9",
      camerafixed: false,
    },
  },
  {
    // why Seedream 5.0 Lite: mobile homepage takeover at 9:16 — Lite hits 3K, more than enough for phone screens and ~half the cost of 4.5.
    id: "ecom-hero-banner-vertical",
    industry: "ecommerce",
    subCategory: "hero-banner",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 5,
    status: "stub",
    title: "Vertical Hero Banner",
    director_note:
      "Mobile-first 9:16 brand banner — for App splash and PDP-page hero sections. Composed with copy space at the top so the brand message sits over the upper third while the product anchors the bottom.",
    ratio: "9/16",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "Mobile hero banner: a single premium product (style TBD) anchored low-center against a soft pearl-to-cream gradient backdrop. Single-source warm key light from camera right, long contact shadow falling left grounding the product. Generous negative space across the top two-thirds for brand wordmark and tagline. 9:16 vertical composition, 3K resolution, hyperreal product photography, Apple-store launch-screen aesthetic.",
      size: "3K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedance 2.0: 8s 9:16 narrative clip with model+outfit refs — multi-ref + char-consistency live in 2.0's video stack.
    id: "ecom-lifestyle-motion",
    industry: "ecommerce",
    subCategory: "lifestyle",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 5,
    status: "stub",
    title: "Lifestyle Motion",
    director_note:
      "8-second 9:16 narrative clip — model enters frame, picks up the product, brings it close. The paid-social workhorse: looks expensive, runs as a TikTok / Reels first-asset.",
    ratio: "9/16",
    span: 4,
    capabilities: ["camera-control", "char-consistency", "multi-ref"],
    source: "internal",
    preset: {
      prompt:
        "R2V: Use the model from Reference Image 1 wearing the outfit from Reference Image 2. Vertical 9:16 lifestyle clip in a sun-drenched modern kitchen at golden hour. The model enters frame from the right, walks two steps toward the camera, picks up [your product] from a marble countertop, and holds it close to the lens for the final beat. Warm side-light through linen curtains, candid editorial energy, shallow depth of field, shot on 35mm. Maintain the model's facial identity exactly across the 8 seconds.",
      resolution: "720p",
      duration: 8,
      ratio: "9:16",
      camerafixed: false,
    },
  },
  {
    // why Seedream 4.5: sequential 2-frame pair with locked model identity across two settings — char-consistency is 4.5's exclusive trick.
    id: "ecom-lifestyle-scene-swap",
    industry: "ecommerce",
    subCategory: "lifestyle",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 4,
    status: "stub",
    title: "Scene Swap Pair",
    director_note:
      "Same model, two settings — 2 stills delivered as a pair via Seedream 4.5 sequential. IG carousel slot 1 + 2: morning kitchen → evening commute, identity locked across both frames.",
    ratio: "4/5",
    span: 4,
    capabilities: ["char-consistency", "multi-ref"],
    source: "internal",
    preset: {
      prompt:
        "Generate a 2-frame editorial lifestyle pair, same model identity locked across both. Frame 1: model in a sun-drenched modern kitchen at golden hour, holding [your product], warm side-light through linen curtains, candid energy, shallow depth of field on 35mm. Frame 2: same model on an evening city sidewalk, soft blue-hour light, [your product] visible, motion-blur background, shot on 50mm. Maintain identical facial features, makeup, and hair across both frames; only wardrobe and environment shift. 4:5 editorial composition.",
      size: "2K",
      sequential: true,
      max_images: 2,
    },
  },
  {
    // why Seedream 5.0 Lite: candid phone-snap aesthetic — Lite's fast iteration is right for the volume side of UGC creative.
    id: "ecom-lifestyle-ugc-snap",
    industry: "ecommerce",
    subCategory: "lifestyle",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 3,
    status: "stub",
    title: "UGC-style Snap",
    director_note:
      "Looks like the customer took it — handheld phone aesthetic, mixed available light, slight motion blur. The first-party-content stand-in for paid TikTok Shop ads where polished feels like an ad.",
    ratio: "4/5",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "Authentic UGC phone snapshot: a real-feeling mid-twenties subject holding [your product] in their bedroom or living room, mixed available light from a window and a warm overhead lamp, shot on a phone front camera at 26mm equivalent, mild handheld motion blur, slightly imperfect framing, no studio lighting. Casual styling, low-res look, unposed. 4:5 vertical composition, JPEG aesthetic with subtle phone-camera color shift.",
      size: "2K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedream 4.5: 6 sequential color variants with locked product form — sequential ships the SKU matrix in one call, no copy-paste.
    id: "ecom-multi-angle-color-variants",
    industry: "ecommerce",
    subCategory: "multi-angle",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 6,
    status: "stub",
    title: "Color Variants Carousel",
    director_note:
      "Same product, 6 colorways — Seedream 4.5 sequential ships the SKU-matrix gallery in a single API call. The fastest way to populate a footwear or apparel category page.",
    ratio: "1/1",
    span: 4,
    capabilities: ["char-consistency"],
    source: "internal",
    preset: {
      prompt:
        "Generate 6 square IG-ready product gallery stills, same product form and lighting, different colorways. Same hero product (style TBD) shot front three-quarter on a seamless cream backdrop, warm key light from camera left at 45 degrees, subtle contact shadow grounding the product, hyperreal material truth. Frame 1: classic black. Frame 2: ivory cream. Frame 3: forest green. Frame 4: deep burgundy. Frame 5: cobalt blue. Frame 6: blush pink. Maintain identical product geometry, finish, lighting, and composition across all 6 frames; only the colorway shifts.",
      size: "2K",
      sequential: true,
      max_images: 6,
    },
  },
  {
    // why Seedream 4.5: same model + same product across 3 angles — char-consistency holds the face across the carousel.
    id: "ecom-multi-angle-model-product",
    industry: "ecommerce",
    subCategory: "multi-angle",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 5,
    status: "stub",
    title: "Model + Product Carousel",
    director_note:
      "Same model holding/wearing [your product] across 3 angles — front, profile, three-quarter. The apparel and accessory PDP layout.",
    ratio: "4/5",
    span: 4,
    capabilities: ["char-consistency", "multi-ref"],
    source: "internal",
    preset: {
      prompt:
        "Generate 3 editorial product gallery stills, same model identity locked across all frames, same lighting, different camera angles. Use the model from Reference Image 1 wearing/holding [your product] in a soft daylight studio. Frame 1: front-facing hero portrait, gentle eye-line to camera. Frame 2: profile side view, looking off-frame, hand holding product visible. Frame 3: three-quarter back view, model glancing over shoulder. Soft north-window light, neutral grey seamless backdrop, shot on 50mm. Maintain identical facial features, hair, wardrobe, and skin tone across all 3 frames.",
      size: "2K",
      sequential: true,
      max_images: 3,
    },
  },
  {
    // why Seedream 5.0 Lite: 9:16 mobile PDP main image at volume — Lite's the cost-fit for the daily SKU stream.
    id: "ecom-pack-shot-vertical",
    industry: "ecommerce",
    subCategory: "pack-shot",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 7,
    status: "stub",
    title: "Vertical Pack Shot",
    director_note:
      "9:16 pack shot for mobile PDP main slot and TikTok Shop product card — same gradient-backdrop language as the square Floating Pack Shot, recomposed for vertical-first traffic.",
    ratio: "9/16",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "Vertical hero product key visual: [your product] floating against a soft cream-to-pearl gradient seamless backdrop, studio softbox light from camera left at 45 degrees, subtle long contact shadow grounding the product. Product anchored low-center with copy space across the top two-thirds. Hyperreal sharpness on every material edge, 9:16 mobile-first composition, Apple-store aesthetic.",
      size: "3K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedance 2.0 Fast: 5s slow zoom on the same packshot — Fast is right for the daily-driver micro-loop on a PDP banner.
    id: "ecom-pack-shot-slow-zoom",
    industry: "ecommerce",
    subCategory: "pack-shot",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 6,
    status: "stub",
    title: "Pack Shot · Slow Zoom",
    director_note:
      "5-second slow zoom on the floating pack shot — the still-to-motion upgrade. Pairs with the static Floating Pack Shot for hover-to-play behavior on category tiles.",
    ratio: "1/1",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: Square hero product key visual with subtle motion. [Your product] floating against a soft cream-to-pearl gradient seamless backdrop, studio softbox light from camera left at 45 degrees, subtle long contact shadow grounding the product. The camera performs a slow 5-second push-in from 100% to 112% scale; the product stays locked in frame while ambient gradient subtly shifts. Hyperreal sharpness on every material edge, 1:1 commercial composition, Apple-store launch-screen aesthetic. Perfect loop start and end.",
      resolution: "720p",
      duration: 5,
      ratio: "1:1",
      camerafixed: false,
    },
  },
  {
    // why Seedream 4.5: prop-styled pack shot needs multi-ref to lock product + season prop together — Lite can't fuse references.
    id: "ecom-pack-shot-prop-styled",
    industry: "ecommerce",
    subCategory: "pack-shot",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 5,
    status: "stub",
    title: "Pack Shot · Prop Styled",
    director_note:
      "The pack shot, with seasonal context — product (Reference 1) styled against seasonal props (Reference 2). Same hero composition as the Floating Pack Shot but production-ready for holiday and campaign moments.",
    ratio: "1/1",
    span: 4,
    capabilities: ["multi-ref"],
    source: "internal",
    preset: {
      prompt:
        "Hero product key visual with styled props: refer to the product in Reference Image 1 placed centered on a pale oak surface, surrounded by the seasonal props from Reference Image 2 (e.g. pine sprigs, dried citrus, candle) arranged with editorial restraint. Soft directional warm key light from camera left, golden-hour color grade, subtle long contact shadow. Hyperreal sharpness on all materials, 1:1 commercial composition, Kinfolk-magazine aesthetic.",
      size: "2K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedance 2.0 Fast: 9:16 5s loop for mobile PDP slot — Fast across vertical SKU catalogs is the only fleet-cost-friendly path.
    id: "ecom-turntable-vertical",
    industry: "ecommerce",
    subCategory: "turntable",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 7,
    status: "stub",
    title: "Vertical Turntable",
    director_note:
      "9:16 vertical 360° rotation — the mobile-PDP and TikTok Shop / Tmall vertical slot variant of the square turntable. Same Fast-variant cost profile, different framing.",
    ratio: "9/16",
    span: 4,
    capabilities: ["fast", "camera-control", "multi-ref"],
    source: "internal",
    preset: {
      prompt:
        "R2V: Use the product featured in Reference Image 1. Replace the original background with a clean seamless white surface, place the product centered. Vertical 9:16 framing. The lens first focuses on the product in close-up, then slowly rotates 360 degrees with the product as the main subject, clearly displaying front, sides, and back. Studio softbox light from above, subtle contact shadow, hyperreal product photography, perfect loop start and end.",
      resolution: "720p",
      duration: 5,
      ratio: "9:16",
      camerafixed: false,
    },
  },
  {
    // why Seedance 2.0 (flagship): 8s slow orbit for premium SKUs — flagship carries the long-take coherence the slower move demands.
    id: "ecom-turntable-slow-orbit-premium",
    industry: "ecommerce",
    subCategory: "turntable",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 6,
    status: "stub",
    title: "Slow Orbit · Premium",
    director_note:
      "8-second slow orbit for premium SKUs — watches, fragrance, jewelry. The slower pace reads as luxury where the 5s Fast loop reads as catalog.",
    ratio: "1/1",
    span: 4,
    capabilities: ["long-take", "camera-control", "multi-ref"],
    source: "internal",
    preset: {
      prompt:
        "R2V: Use the product featured in Reference Image 1. Replace the background with a deep matte-charcoal seamless surface. The product is centered on a brushed-stone plinth. The camera performs a slow 8-second 360-degree orbit around the product at a slight low angle, holding the product precisely centered in frame. Warm rim light from the upper right carves the silhouette, soft fill from the left preserves material detail, deep contact shadow anchors the product. Hyperreal material specificity, perfect loop start and end, luxury-product-film aesthetic.",
      resolution: "720p",
      duration: 8,
      ratio: "1:1",
      camerafixed: false,
    },
  },
  {
    // why Seedance 2.0: 6s top-down ceremonial cut with audio — flagship needed for locked overhead geometry + native paper-rustle SFX.
    id: "ecom-unboxing-top-down-ceremonial",
    industry: "ecommerce",
    subCategory: "unboxing",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 4,
    status: "stub",
    title: "Top-Down Ceremonial Unbox",
    director_note:
      "Locked overhead camera, ceremonial pace — companion shot to the First-Touch reveal. 6 seconds on a single static angle while two hands open the box symmetrically. Native audio carries the paper-pull rustle.",
    ratio: "9/16",
    span: 6,
    capabilities: ["audio", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: Premium vertical unboxing in top-down ceremonial style. A minimalist matte-black square gift box sits centered on a pale oak tabletop, locked overhead camera looking straight down. Two hands with thin gold rings enter from left and right edges and slowly lift the lid straight up symmetrically over 6 seconds, revealing a product (style TBD) nestled in charcoal foam insert with folded tissue paper. The camera does not move; only the lid and hands animate. Warm top-down key light, slow-motion 60fps feel, shallow depth of field on the box rim. Quiet ambient room tone with a soft paper-pull rustle as the lid clears.",
      resolution: "720p",
      duration: 6,
      ratio: "9:16",
      generate_audio: true,
    },
  },
  {
    // why Seedream 5.0 Lite: post-unbox flat lay is a single-frame still — no char/sequential needed, Lite at 3K is the cost-fit.
    id: "ecom-unboxing-post-arrangement",
    industry: "ecommerce",
    subCategory: "unboxing",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 7,
    status: "stub",
    title: "Post-Unbox Arrangement",
    director_note:
      "The 'completed state' still — product, packaging, tissue, card all laid flat after the reveal. Pairs with the unboxing video on PDP modules and email creative.",
    ratio: "16/9",
    span: 12,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "Flat-lay editorial arrangement: top-down view of a premium unboxing aftermath. Centered: [your product]. Around it: a matte-black square gift box (lid leaning beside it), folded charcoal tissue paper, a thank-you card with thin gold-foil typography, a single dried flower stem. Pale oak surface, soft warm overhead diffused light, no shadows. 16:9 horizontal editorial composition, Kinfolk-magazine aesthetic, hyperreal material truth.",
      size: "2K",
      output_format: "jpeg",
    },
  },

  // ───────── E-commerce expansion (§38) — fills each (sub-cat × kind) ────
  // bucket so per-page tiling resolves cleanly to 12-col rows.

  // —— hero-banner additions ───────
  {
    // why Seedream 4.5: editorial portrait with model + product needs char-consistency to lock identity across the campaign series.
    id: "ecom-hero-banner-editorial-portrait",
    industry: "ecommerce",
    subCategory: "hero-banner",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 6,
    status: "stub",
    title: "Editorial Portrait Banner",
    director_note:
      "4:5 fashion-portrait banner with model holding [your product] — magazine-cover treatment for brand storytelling moments.",
    ratio: "4/5",
    span: 4,
    capabilities: ["char-consistency"],
    source: "internal",
    preset: {
      prompt:
        "Editorial fashion portrait: a striking model in seasonal styling holding [your product], shot at golden hour against a textured plaster wall, soft directional rim light, shallow depth of field on 85mm lens, hyperreal skin and fabric detail. Cropped 4:5 with copy space top-left for headline text. Magazine-cover composition, Vogue-editorial aesthetic.",
      size: "4K",
    },
  },
  {
    // why Seedream 5.0 Lite: IG-feed square hero is a single frame at modest res — Lite at 3K is the cost-fit for high-volume social rotations.
    id: "ecom-hero-banner-square-ig",
    industry: "ecommerce",
    subCategory: "hero-banner",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 4,
    status: "stub",
    title: "Square IG Hero",
    director_note:
      "1:1 IG-feed hero — single product on bold gradient, sized for the algorithm's preferred aspect.",
    ratio: "1/1",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "Bold 1:1 brand hero: [your product] anchored center-frame against a saturated gradient (your brand colors transitioning corner-to-corner), single-source key light from camera left at 30 degrees, dramatic long shadow falling right. Negative space top-right reserved for logo lockup. Hyperreal product fidelity, Apple-store launch-screen aesthetic.",
      size: "3K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedance 2.0: 8s cinematic spec with multi-ref product + brand environment — flagship 2.0 carries the long-take coherence and native audio.
    id: "ecom-hero-banner-cinematic-spec",
    industry: "ecommerce",
    subCategory: "hero-banner",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 5,
    status: "stub",
    title: "Cinematic Spec Banner",
    director_note:
      "8s cinematic spec film — slow crane reveal of [your product] in a mood-lit hero environment. The brand-storytelling tier above the daily motion banner.",
    ratio: "16/9",
    span: 8,
    capabilities: ["long-take", "multi-ref", "camera-control", "audio"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 8-second cinematic banner. Open on a tight macro of [your product] surface texture, then a slow 8-second crane-out reveals the product staged in a mood-lit hero environment (your brand world: studio loft, warehouse atrium, garden conservatory). Single-source key light carves the product silhouette, ambient haze in the background, anamorphic-style flare on the reveal. 16:9 cinema aspect, hyperreal material truth, brand spec-film aesthetic. Native ambient room tone with a soft tonal swell at the reveal.",
      resolution: "720p",
      duration: 8,
      ratio: "16:9",
      camerafixed: false,
      generate_audio: true,
    },
  },
  {
    // why Seedance 2.0 Fast: 5s vertical motion banner for app/mobile-web — Fast keeps per-banner cost down for weekly takeover rotations.
    id: "ecom-hero-banner-vertical-motion",
    industry: "ecommerce",
    subCategory: "hero-banner",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 4,
    status: "stub",
    title: "Vertical Motion Banner",
    director_note:
      "5s 9:16 motion banner — subtle parallax for app splash screens and mobile-web hero takeovers.",
    ratio: "9/16",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second vertical hero with subtle parallax. [Your product] anchored low-center on a deep gradient backdrop transitioning from charcoal to warm amber. Slow 5-second push-in from 100% to 108% scale; the product holds position while the background atmosphere drifts. Generous negative space top half reserved for headline overlay. 9:16 mobile composition, hyperreal sharpness, app-splash-screen aesthetic.",
      resolution: "720p",
      duration: 5,
      ratio: "9:16",
      camerafixed: false,
    },
  },

  // —— lifestyle additions ─────────
  {
    // why Seedream 4.5: portrait series for a campaign needs char-consistency so the model reads as the same person across variations.
    id: "ecom-lifestyle-portrait-candid",
    industry: "ecommerce",
    subCategory: "lifestyle",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 2,
    status: "stub",
    title: "Candid Portrait",
    director_note:
      "Tight 4:5 candid of model + [your product] — face/hand interaction, the close-range editorial that anchors a campaign series.",
    ratio: "4/5",
    span: 4,
    capabilities: ["char-consistency"],
    source: "internal",
    preset: {
      prompt:
        "Tight candid editorial portrait: a relaxed late-twenties subject mid-laugh, [your product] visible in their hands or near their face, soft north-window light, neutral-warm wardrobe, shot on 85mm at f/2.0 with shallow depth of field. Background blurred to neutral grey-beige, subject sharp from collarbone to crown. 4:5 vertical crop, analog-film color science.",
      size: "2K",
    },
  },
  {
    // why Seedream 5.0 Lite: top-down styled flat lay is a single frame — no char/sequential needed, Lite at 3K is the cost-fit.
    id: "ecom-lifestyle-flat-lay-styled",
    industry: "ecommerce",
    subCategory: "lifestyle",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 1,
    status: "stub",
    title: "Lifestyle Flat Lay",
    director_note:
      "Top-down 1:1 styled flat lay of [your product] surrounded by lifestyle accessories. The Pinterest-board aesthetic for category headers.",
    ratio: "1/1",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "Top-down flat-lay editorial: [your product] centered on a pale linen surface, surrounded by a half-drunk ceramic mug of coffee, an open leather-bound notebook with a fountain pen resting across the page, a folded oatmeal-linen napkin, a small ceramic dish with two ripe figs. Soft warm overhead diffused light, no harsh shadows. 1:1 square composition, Kinfolk-magazine aesthetic, hyperreal material truth.",
      size: "2K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedance 2.0: 8s day-in-life with locked model identity across 3 vignettes needs long-take + char-consistency — only 2.0 holds it.
    id: "ecom-lifestyle-cinematic-day",
    industry: "ecommerce",
    subCategory: "lifestyle",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 7,
    status: "stub",
    title: "Cinematic Day-in-Life",
    director_note:
      "8s 16:9 day-in-life with [your product] — morning ritual to evening unwind compressed into one paced sequence. The brand-film tier of lifestyle.",
    ratio: "16/9",
    span: 12,
    capabilities: ["long-take", "multi-ref", "char-consistency", "audio"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 8-second cinematic day-in-life. Open on warm bedroom morning light, model (locked identity) reaching for [your product] on the nightstand, slow 2-second push-in. Cut to kitchen mid-morning, model using [your product] at the counter while coffee brews. Cut to evening living room, model at rest holding [your product] in low golden light. Three coherent vignettes, locked color grade across all three (warm midtones, soft contrast). Camera moves are slow and deliberate. 16:9 cinema aspect, brand-film aesthetic. Native ambient audio: morning birds, coffee machine, evening room tone.",
      resolution: "720p",
      duration: 8,
      ratio: "16:9",
      camerafixed: false,
      generate_audio: true,
    },
  },
  {
    // why Seedance 2.0 Fast: 5s handheld POV vlog moment — Fast nails the casual handheld aesthetic without burning a flagship credit.
    id: "ecom-lifestyle-handheld-vlog",
    industry: "ecommerce",
    subCategory: "lifestyle",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 4,
    status: "stub",
    title: "Handheld Vlog Moment",
    director_note:
      "5s 9:16 first-person POV — hand reaches for [your product] in a candid moment. The TikTok/Reels-native lifestyle clip.",
    ratio: "9/16",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second handheld POV vlog. First-person hand enters frame from bottom-right and picks up [your product] from a sunny kitchen counter, mild handheld camera shake throughout, mixed available light through a window. Camera follows the product as it lifts toward camera. Casual home environment in soft focus background. 9:16 vertical composition, phone-camera color science, TikTok-native aesthetic.",
      resolution: "720p",
      duration: 5,
      ratio: "9:16",
      camerafixed: false,
    },
  },
  {
    // why Seedance 2.0 Fast: 5s 1:1 lifestyle loop for IG feed — Fast is the daily-driver for paid social creative volume.
    id: "ecom-lifestyle-square-loop",
    industry: "ecommerce",
    subCategory: "lifestyle",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 3,
    status: "stub",
    title: "Lifestyle Square Loop",
    director_note:
      "5s 1:1 micro-loop — perfect-loop start and end for IG feed and paid social. The category tile that hovers-to-play.",
    ratio: "1/1",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second 1:1 lifestyle micro-loop. [Your product] sits on a styled wooden tray with a steaming ceramic cup; subtle steam wisps drift across the frame in a slow loopable pattern. Camera locked, no movement. Soft warm window light from camera left, shallow depth of field. Perfect loop start and end (the steam pattern resolves to its starting state). 1:1 square composition, Kinfolk-magazine aesthetic.",
      resolution: "720p",
      duration: 5,
      ratio: "1:1",
      camerafixed: true,
    },
  },

  // —— multi-angle additions ───────
  {
    // why Seedream 4.5: 4 sequential macro details with locked product geometry — sequential ships the detail set in one call.
    id: "ecom-multi-angle-detail-macro",
    industry: "ecommerce",
    subCategory: "multi-angle",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 4,
    status: "stub",
    title: "Detail Macro Set",
    director_note:
      "4 sequential macro stills of [your product] — stitching, hardware, material weave, finish edge. The PDP detail-zoom carousel in one call.",
    ratio: "1/1",
    span: 4,
    capabilities: ["char-consistency"],
    source: "internal",
    preset: {
      prompt:
        "Generate 4 sequential 1:1 macro detail stills of the same product, locked product geometry, identical lighting and finish. Frame 1: tight macro on stitching/seam detail. Frame 2: hardware close-up (zipper, button, clasp, or branded detail). Frame 3: material weave/grain texture extreme close-up. Frame 4: finished edge or sole/base detail. Soft top-down studio light, neutral grey backdrop, shot at f/4 on 100mm macro lens. Maintain identical color science and depth-of-field across all 4 frames.",
      size: "2K",
      sequential: true,
      max_images: 4,
    },
  },
  {
    // why Seedream 5.0 Lite: exploded-view product still is a single composed frame — no sequential needed, Lite at 3K is the cost-fit.
    id: "ecom-multi-angle-exploded-view",
    industry: "ecommerce",
    subCategory: "multi-angle",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 3,
    status: "stub",
    title: "Exploded View",
    director_note:
      "1:1 exploded view of [your product] — components hover-separated showing layers and construction. The technical-romance shot for spec pages.",
    ratio: "1/1",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "Technical exploded-view 1:1 product still: [your product] disassembled into its constituent layers/components, hover-stacked vertically with thin shadow gaps separating each piece, locked perfect axis. Components visible: outer shell, mid-layer, inner mechanism, base plate (adapt to product type). Pure white seamless backdrop, soft top-down key light, faint ground shadow under the bottom-most piece. Hyperreal material truth on every component. Apple-spec-page aesthetic.",
      size: "3K",
      output_format: "png",
    },
  },
  {
    // why Seedream 5.0 Lite: scale comparison is a single composite frame — no char/sequential needed, Lite is the cost-fit.
    id: "ecom-multi-angle-scale-comparison",
    industry: "ecommerce",
    subCategory: "multi-angle",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 2,
    status: "stub",
    title: "Scale Reference",
    director_note:
      "4:5 still of [your product] alongside a familiar reference (hand, coin, smartphone) for size context. The 'how big is it actually' shot for marketplace listings.",
    ratio: "4/5",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "Editorial 4:5 product still with scale reference: [your product] photographed beside a familiar reference object (a hand at rest, a smartphone, a coin) on a pale grey seamless surface, soft directional studio light from camera left, subtle contact shadows grounding both objects. Both objects sharp from edge to edge, no depth-of-field separation. Composition leaves clear negative space for an annotated scale callout overlay.",
      size: "2K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedance 2.0: 6s with hard cuts between 4 angles needs frame-coherent transitions — flagship 2.0 holds the geometry across cuts.
    id: "ecom-multi-angle-cut-sequence",
    industry: "ecommerce",
    subCategory: "multi-angle",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 5,
    status: "stub",
    title: "Multi-Angle Cut Sequence",
    director_note:
      "6s 1:1 with hard cuts between 4 angles of [your product] — front, side, back, top. The animated PDP gallery that compresses 4 stills into one motion asset.",
    ratio: "1/1",
    span: 4,
    capabilities: ["long-take", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 6-second 1:1 product showcase with 4 hard cuts. Frame 1 (0-1.5s): front-on hero shot, [your product] centered, soft top-down key light. Cut. Frame 2 (1.5-3s): profile side view, same lighting. Cut. Frame 3 (3-4.5s): back view, same lighting. Cut. Frame 4 (4.5-6s): top-down view, same lighting. Locked camera per frame, no movement within shots — only the angle changes between cuts. Consistent product geometry, lighting, and seamless cream backdrop across all 4 frames. 1:1 commercial composition.",
      resolution: "720p",
      duration: 6,
      ratio: "1:1",
      camerafixed: true,
    },
  },
  {
    // why Seedance 2.0 Fast: 5s slow pan across product details — Fast handles the camera-move workhorse at SKU scale.
    id: "ecom-multi-angle-detail-pan",
    industry: "ecommerce",
    subCategory: "multi-angle",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 4,
    status: "stub",
    title: "Detail Pan",
    director_note:
      "5s 1:1 slow horizontal pan revealing [your product] details edge-to-edge. The motion equivalent of the macro detail set.",
    ratio: "1/1",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second 1:1 detail pan. Camera performs a slow lateral dolly left-to-right across [your product] surface, traveling from one signature detail to another (stitching → hardware → material edge). Soft raking key light from above-camera. Background pure white seamless. Product fills 70% of frame height throughout. Locked focus, no zoom. 1:1 square composition, hyperreal macro fidelity.",
      resolution: "720p",
      duration: 5,
      ratio: "1:1",
      camerafixed: false,
    },
  },
  {
    // why Seedance 2.0 Fast: 5s stylized reveal via fabric drop — Fast is right for the stylized-but-not-flagship reveal.
    id: "ecom-multi-angle-stylized-reveal",
    industry: "ecommerce",
    subCategory: "multi-angle",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 3,
    status: "stub",
    title: "Stylized Reveal",
    director_note:
      "5s 4:5 stylized reveal — a fabric drop uncovers [your product]. The campaign-launch trailer for product drops.",
    ratio: "4/5",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second 4:5 stylized product reveal. Open on a draped silk-charcoal fabric covering an unseen object on a pale stone pedestal. Hands enter frame from above and slowly lift the fabric straight up over 4 seconds, revealing [your product] beneath. Camera holds locked center-frame. Single-source dramatic key light from camera-right at 30 degrees casts a soft long shadow. Final frame: product fully revealed, fabric exiting top of frame. 4:5 editorial composition, brand-launch-trailer aesthetic.",
      resolution: "720p",
      duration: 5,
      ratio: "4:5",
      camerafixed: true,
    },
  },

  // —— pack-shot additions ─────────
  {
    // why Seedream 5.0 Lite: long-shadow pack shot is a single-frame graphic — no sequential needed, Lite at 3K is the cost-fit.
    id: "ecom-pack-shot-shadow-graphic",
    industry: "ecommerce",
    subCategory: "pack-shot",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 4,
    status: "stub",
    title: "Long-Shadow Pack Shot",
    director_note:
      "1:1 hard-light pack shot with sculptural long shadow — the editorial graphic version of the workhorse pack shot.",
    ratio: "1/1",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "1:1 editorial pack shot with sculptural long shadow: [your product] anchored low-center on a flat sandstone-cream surface, single hard-light key from camera left at 20 degrees casting a dramatic 4x-product-length shadow extending to the right edge of frame. Solid pale-cream backdrop above the surface. No softening, no fill. Hyperreal product fidelity, MoMA-poster aesthetic.",
      size: "3K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedream 5.0 Lite: pure-white knockout for marketplace listings is the volume play — Lite is half the cost of 4.5 at the same quality bar.
    id: "ecom-pack-shot-knockout-white",
    industry: "ecommerce",
    subCategory: "pack-shot",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 3,
    status: "stub",
    title: "Knockout White Pack Shot",
    director_note:
      "1:1 pure-white knockout — Amazon/Tmall main-image spec, every SKU, every variant. The most-shipped image format in e-commerce.",
    ratio: "1/1",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "Marketplace-spec 1:1 knockout pack shot: [your product] perfectly centered on a pure white #FFFFFF seamless backdrop, soft even diffused light from a 4-bank softbox above-camera, faint contact shadow only. Product fills 85% of frame, leaves 7.5% margin on each side per Amazon main-image spec. Crisp edges, hyperreal material truth, no atmosphere, no styling.",
      size: "2K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedream 4.5: chiaroscuro luxury pack shot benefits from 4K detail and multi-ref to lock product + lighting reference.
    id: "ecom-pack-shot-dark-mood",
    industry: "ecommerce",
    subCategory: "pack-shot",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 2,
    status: "stub",
    title: "Dark-Mood Pack Shot",
    director_note:
      "4:5 chiaroscuro pack shot — single-source rim light carving [your product] out of near-black. The luxury-tier hero for fragrance, watches, jewelry.",
    ratio: "4/5",
    span: 4,
    capabilities: ["multi-ref"],
    source: "internal",
    preset: {
      prompt:
        "4:5 chiaroscuro luxury pack shot: [your product] emerging from near-black background, single hard-light key from camera-right at 20 degrees grazing the product to carve highlight detail along its silhouette. Product surface details glow in the rim light; rest of frame falls to deep charcoal. No fill light. Subtle reflection beneath the product on a black-glass surface. Hyperreal material truth on every reflective detail. Hasselblad-medium-format aesthetic, perfume-campaign mood.",
      size: "4K",
    },
  },
  {
    // why Seedance 2.0: 8s cinematic pack-shot reveal with rim-light sweep — flagship 2.0 holds the geometry through the lighting move.
    id: "ecom-pack-shot-cinematic-reveal",
    industry: "ecommerce",
    subCategory: "pack-shot",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 7,
    status: "stub",
    title: "Cinematic Pack-Shot Reveal",
    director_note:
      "8s 16:9 reveal — rim light sweeps across [your product] over 8 seconds revealing every detail in turn. The hero-of-heroes for product launches.",
    ratio: "16/9",
    span: 12,
    capabilities: ["long-take", "camera-control", "audio"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 8-second cinematic pack-shot reveal. [Your product] sits center-frame on a black mirror-glass surface against a deep aubergine backdrop. A single hard rim light slowly travels from camera-right (0s) to camera-left (8s), sweeping across the product surface to reveal each highlight detail in turn — first edge, then face, then opposite edge. Camera holds locked. Subtle ambient haze in the background catches the light. 16:9 cinema aspect, hyperreal material fidelity, luxury-launch-spot aesthetic. Native ambient audio: deep room tone with a faint metallic shimmer at the rim-light apex.",
      resolution: "720p",
      duration: 8,
      ratio: "16:9",
      camerafixed: true,
      generate_audio: true,
    },
  },
  {
    // why Seedance 2.0 Fast: 5s rim-light rotate is the everyday motion-pack-shot — Fast is the daily-driver for category tiles at scale.
    id: "ecom-pack-shot-rim-light-rotate",
    industry: "ecommerce",
    subCategory: "pack-shot",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 5,
    status: "stub",
    title: "Rim-Light Rotate",
    director_note:
      "5s 1:1 subtle rotate showcasing the rim-lit edge — the workhorse motion pack shot for category-tile rotation.",
    ratio: "1/1",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second 1:1 rim-light rotate. [Your product] anchored center-frame on a soft cream gradient surface, single hard-light rim from camera-right at 30 degrees. Product performs a slow 5-second 30-degree rotation around its vertical axis, revealing the rim-lit silhouette in motion. Camera holds locked. Perfect loop start and end (rotation resolves smoothly). 1:1 commercial composition, hyperreal product fidelity.",
      resolution: "720p",
      duration: 5,
      ratio: "1:1",
      camerafixed: true,
    },
  },
  {
    // why Seedance 2.0 Fast: 5s 9:16 motion pack shot — Fast is the cost-fit for the mobile-PDP main-asset rotation.
    id: "ecom-pack-shot-vertical-loop",
    industry: "ecommerce",
    subCategory: "pack-shot",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 4,
    status: "stub",
    title: "Vertical Pack-Shot Loop",
    director_note:
      "5s 9:16 vertical pack shot with subtle motion — the looping mobile-PDP main asset that pairs with the static vertical pack shot.",
    ratio: "9/16",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second 9:16 vertical pack-shot loop. [Your product] anchored low-center on a soft cream-to-pearl gradient seamless backdrop, studio softbox light from camera-left at 45 degrees. Subtle 5-second push-in from 100% to 105% scale; ambient gradient subtly drifts. Product locked in frame. Perfect loop start and end. 9:16 mobile composition, hyperreal sharpness, Apple-store aesthetic.",
      resolution: "720p",
      duration: 5,
      ratio: "9:16",
      camerafixed: false,
    },
  },

  // —— turntable additions ─────────
  {
    // why Seedream 5.0 Lite: hero 3/4 angle still is a single frame — no char/sequential needed, Lite at 3K is the cost-fit for the rotation key frame.
    id: "ecom-turntable-hero-still",
    industry: "ecommerce",
    subCategory: "turntable",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 5,
    status: "stub",
    title: "Turntable Hero Still",
    director_note:
      "1:1 hero 3/4 angle still — the pre-rotation key frame, doubled as a poster/PDP cover when the video isn't loaded yet.",
    ratio: "1/1",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "1:1 hero product still at signature 3/4 angle: [your product] anchored center-frame on a soft cream gradient surface, soft top-down key light with subtle fill from camera-right, contact shadow grounding the product. Product fills 75% of frame. Hyperreal material truth, Apple-store launch-screen aesthetic. The keyframe pose for the 360 turntable rotation.",
      size: "3K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedream 4.5: 4-frame rotation grid in a single image needs sequential output and locked product geometry — only 4.5 ships this.
    id: "ecom-turntable-frame-grid",
    industry: "ecommerce",
    subCategory: "turntable",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 4,
    status: "stub",
    title: "Rotation Frame Grid",
    director_note:
      "1:1 storyboard-style 4-frame grid showing [your product] at 0°, 90°, 180°, 270° — the static reference for the turntable video.",
    ratio: "1/1",
    span: 4,
    capabilities: ["char-consistency"],
    source: "internal",
    preset: {
      prompt:
        "Generate 4 sequential 1:1 product stills, same product geometry locked across all frames, identical lighting and background. Frame 1: 0° front-facing view. Frame 2: 90° right-side view. Frame 3: 180° back view. Frame 4: 270° left-side view. Soft top-down key light, neutral cream seamless backdrop, contact shadow grounding the product. Maintain identical color science, lighting, and product positioning across all 4 frames — only the rotation angle changes.",
      size: "2K",
      sequential: true,
      max_images: 4,
    },
  },
  {
    // why Seedream 5.0 Lite: floating-hero still at signature angle — single frame, Lite is the cost-fit for the hover-state image.
    id: "ecom-turntable-floating-hero",
    industry: "ecommerce",
    subCategory: "turntable",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 3,
    status: "stub",
    title: "Floating Hero Still",
    director_note:
      "1:1 [your product] floating mid-air at signature angle — the dramatic hover-state still that loads before the rotation video plays.",
    ratio: "1/1",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "1:1 dramatic floating product still: [your product] hovering mid-air at signature 3/4 angle against a deep gradient backdrop transitioning from charcoal to dusk-blue. Single hard rim light from camera-right at 30 degrees carves the product silhouette. No surface, no shadow, product appears to defy gravity. Atmospheric haze in the background. Hyperreal material fidelity, sci-fi-product-launch aesthetic.",
      size: "3K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedance 2.0: 6s tilted orbit (camera arcs over and around) needs the long-take coherence — flagship 2.0 holds the geometry through the move.
    id: "ecom-turntable-tilt-orbit",
    industry: "ecommerce",
    subCategory: "turntable",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 5,
    status: "stub",
    title: "Tilt Orbit",
    director_note:
      "6s 1:1 tilted orbit — camera arcs over and around [your product] in a single take, revealing top + 360°. The cinematographer's-cut version of the standard turntable.",
    ratio: "1/1",
    span: 4,
    capabilities: ["long-take", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 6-second 1:1 tilted orbit. [Your product] sits center-frame on a soft cream gradient surface. Camera begins at eye-level front-on, then performs a continuous 6-second arc that tilts up to 30 degrees overhead while orbiting 270 degrees around the product, ending at a high-angle back-three-quarter view. Soft top-down key light follows the camera implicitly. Product locked in frame center throughout the move. 1:1 commercial composition, hyperreal product fidelity, premium-launch aesthetic.",
      resolution: "720p",
      duration: 6,
      ratio: "1:1",
      camerafixed: false,
    },
  },
  {
    // why Seedance 2.0 Fast: 5s 180° rotation focusing on a signature detail — Fast is the cost-fit for detail-focused turntables at SKU scale.
    id: "ecom-turntable-half-rotate-detail",
    industry: "ecommerce",
    subCategory: "turntable",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 4,
    status: "stub",
    title: "Half-Rotate Detail",
    director_note:
      "5s 1:1 180° rotation tightly framed on [your product]'s signature detail — the close-range turntable for accessories, watches, bottles.",
    ratio: "1/1",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second 1:1 half-rotation detail turntable. Tight macro framing on the signature detail of [your product] (a logo, a clasp, a label, a bezel). Product performs a smooth 5-second 180-degree rotation around its vertical axis, centered on the detail. Soft raking key light from above-camera. Pure cream seamless backdrop. Camera holds locked. Perfect loop start and end. 1:1 macro composition, hyperreal material fidelity.",
      resolution: "720p",
      duration: 5,
      ratio: "1:1",
      camerafixed: true,
    },
  },
  {
    // why Seedance 2.0 Fast: 4s 9:16 snappy spin with motion-blur + hero-pose stop — the swipe-stopper variant of the catalog Vertical Turntable.
    id: "ecom-turntable-vertical-fast",
    industry: "ecommerce",
    subCategory: "turntable",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 3,
    status: "stub",
    title: "Vertical Snap-Spin",
    director_note:
      "4s 9:16 snappy spin with motion blur, ends locked on a 3/4 hero pose — the swipe-stopper sibling to the smooth catalog Vertical Turntable. Brand-gradient backdrop, not seamless white.",
    ratio: "9/16",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 4-second 9:16 snap-spin turntable. [Your product] anchored low-center on a saturated brand-color gradient backdrop (deep teal to amber). Product performs a 540-degree rotation (1.5 turns) around its vertical axis over 4 seconds with subtle motion blur during the spin, then snaps to a hard stop on a 3/4 hero pose for the final 0.5 seconds. Camera holds locked center-frame. Single hard rim light from camera-right. Generous negative space top half reserved for caption overlay. NOT a perfect loop — ends on the hero pose so the TikTok feed thumbnail freezes on a clean product shot. 9:16 mobile composition.",
      resolution: "720p",
      duration: 4,
      ratio: "9:16",
      camerafixed: true,
    },
  },

  // —— unboxing additions ──────────
  {
    // why Seedream 5.0 Lite: exterior-pack hero still is single-frame — no char/sequential needed, Lite at 3K is the cost-fit.
    id: "ecom-unboxing-exterior-pack",
    industry: "ecommerce",
    subCategory: "unboxing",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 5,
    status: "stub",
    title: "Exterior Pack Hero",
    director_note:
      "4:5 hero still of the closed gift box exterior — branded ribbon, embossed logo, the 'before-the-reveal' anticipation moment.",
    ratio: "4/5",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "4:5 editorial hero still: a closed premium gift box for [your product], matte-charcoal exterior with thin gold-foil embossed logo and a folded grosgrain ribbon in deep burgundy tied off-center. Box sits on a pale oak surface, soft warm overhead diffused light, subtle long contact shadow. Hyperreal material truth on the box surface, ribbon weave, foil reflectivity. 4:5 composition with copy space top-third for headline.",
      size: "2K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedream 5.0 Lite: mid-reveal still is single-frame — no char/sequential needed, Lite is the cost-fit.
    id: "ecom-unboxing-mid-reveal",
    industry: "ecommerce",
    subCategory: "unboxing",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 4,
    status: "stub",
    title: "Mid-Reveal Still",
    director_note:
      "4:5 still capturing the mid-lift moment — hands lifting the lid, product just emerging from tissue paper. The peak-anticipation frame.",
    ratio: "4/5",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "4:5 editorial mid-reveal still: top-down view, two hands with thin gold rings lifting the lid of a matte-black gift box halfway, revealing [your product] partially nestled in folded charcoal tissue paper inside. Pale oak surface beneath the box. Warm top-down diffused light, soft shadows. Hands frozen mid-lift, lid hovering 4 inches above the box. Hyperreal material detail on the tissue creases, lid edge, hand skin. Kinfolk-magazine aesthetic.",
      size: "2K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedream 5.0 Lite: brand-card detail close-up is a single frame — no sequential needed, Lite at 3K is the cost-fit.
    id: "ecom-unboxing-detail-card",
    industry: "ecommerce",
    subCategory: "unboxing",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 3,
    status: "stub",
    title: "Brand Card Detail",
    director_note:
      "4:5 close-up of the thank-you card / brand insert — the 'first thing they read' touchpoint, often overlooked in product photography.",
    ratio: "4/5",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "4:5 editorial close-up: a folded thank-you card with thin gold-foil typography on heavyweight cream cardstock, resting on a pale oak surface beside folded charcoal tissue paper. Card slightly opened, revealing handwritten-style typography on the inside. Soft warm overhead diffused light, subtle shadow under the card edge. Card fills 60% of frame, tissue paper fills lower-left corner. Hyperreal paper-grain and foil-reflectivity detail. Brand-touchpoint aesthetic.",
      size: "2K",
      output_format: "jpeg",
    },
  },
  {
    // why Seedance 2.0: ASMR macro of seal break needs native audio — only 2.0 ships synced ambient sound on the unwrap moment.
    id: "ecom-unboxing-asmr-detail",
    industry: "ecommerce",
    subCategory: "unboxing",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 3,
    status: "stub",
    title: "ASMR Detail Unwrap",
    director_note:
      "5s 1:1 ASMR macro of seal break / wrapper crinkle on [your product] packaging — synced native audio on the texture moment. The TikTok ASMR play.",
    ratio: "1/1",
    span: 4,
    capabilities: ["camera-control", "audio"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second 1:1 ASMR-style macro unwrap. Tight macro on a fingertip slowly breaking the wax seal / peeling the wrapper / lifting the lid edge of premium [your product] packaging. Product partially visible beneath. Camera holds locked. Soft warm raking light from camera-left. Pure cream backdrop blurred to bokeh in background. 1:1 macro composition. Native synced audio: a clear, satisfying paper-crinkle / wax-crack / cardboard-pull sound, plus quiet ambient room tone.",
      resolution: "720p",
      duration: 5,
      ratio: "1:1",
      camerafixed: true,
      generate_audio: true,
    },
  },
  {
    // why Seedance 2.0 Fast: 5s product-spin reveal from box — Fast handles the standard reveal-spin at SKU-rotation cost.
    id: "ecom-unboxing-reveal-spin",
    industry: "ecommerce",
    subCategory: "unboxing",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 2,
    status: "stub",
    title: "Reveal Spin",
    director_note:
      "5s 1:1 hands lift [your product] out of the box and rotate it slowly — the catalog-pace unboxing reveal that pairs with PDP modules.",
    ratio: "1/1",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second 1:1 unboxing reveal-spin. Open on [your product] nestled in folded tissue paper inside an open gift box (lid set aside). Two hands enter from below frame and slowly lift the product out and up to camera-eye-level over 3 seconds, then rotate the product 90 degrees to show a second face over the final 2 seconds. Pale oak surface, warm overhead diffused light. Camera holds locked. 1:1 composition, hyperreal product fidelity.",
      resolution: "720p",
      duration: 5,
      ratio: "1:1",
      camerafixed: true,
    },
  },
  {
    // why Seedance 2.0 Fast: 5s hands arranging post-unbox flat lay — Fast is the cost-fit for the closing-shot motion variant.
    id: "ecom-unboxing-flatlay-arrange-motion",
    industry: "ecommerce",
    subCategory: "unboxing",
    model: "dreamina-seedance-2-0-fast-260128",
    kind: "video",
    priority: 1,
    status: "stub",
    title: "Flat-Lay Arrange (Motion)",
    director_note:
      "5s 1:1 top-down hands arranging the post-unbox flat lay — the motion variant of Post-Unbox Arrangement, used as the email-creative closer.",
    ratio: "1/1",
    span: 4,
    capabilities: ["fast", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: 5-second 1:1 top-down arrangement motion. Locked overhead camera. Two hands enter and exit the frame placing each element of an unboxing flat lay one by one over 5 seconds: first the gift box (lid leaning), then [your product] centered, then the folded tissue paper to the side, then the thank-you card top-right. Pale oak surface beneath. Soft warm diffused overhead light. Final frame settles into a styled flat-lay composition. 1:1 square, Kinfolk-magazine aesthetic.",
      resolution: "720p",
      duration: 5,
      ratio: "1:1",
      camerafixed: true,
    },
  },

  // ───────── Editorial ────────────────────────────────────────────────────
  {
    // why Seedance 2.0: 8s lateral dolly matched to pace + venue ambient — flagship for the paced long-take.
    id: "editorial-runway-paris-side-track",
    industry: "editorial",
    subCategory: "runway",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 8,
    status: "live",
    title: "Paris Runway Side-Track",
    director_note:
      "Lateral dolly matching the model's pace — the canonical runway shot. Ambient venue tone plays under without any directed SFX.",
    src: "/reels/editorial/editorial-runway-paris-side-track.mp4",
    ratio: "16/9",
    span: 8,
    capabilities: ["audio", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: A fashion model walks Paris fashion week runway in a sculptural matte-black gown with sharp architectural shoulder construction. Slow lateral side-tracking dolly matching her pace from stage-right at hip height. Crisp black runway flooring, single stark spotlight overhead carving shoulder-line highlights, photographers' flash bursts firing intermittently in the wings. High-contrast editorial cinematography, Nick Knight / SHOWstudio aesthetic, 35mm anamorphic, colour graded for deep blacks and crystalline highlights. A quiet ambient venue tone.",
      resolution: "720p",
      duration: 8,
      ratio: "16:9",
      generate_audio: true,
    },
    token_cost_estimate: 5.7,
  },
  {
    // why Seedream 4.5: sequential 3-pack with locked identity + 4K — stacks char-consistency, sequential gen, and print ceiling.
    id: "editorial-lookbook-bauhaus",
    industry: "editorial",
    subCategory: "lookbook",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 9,
    status: "live",
    title: "Bauhaus Lookbook · 3-Pack",
    director_note:
      "Same model, three outfits, three primary-colour walls — Seedream 4.5 sequential generation locks facial identity across the series.",
    src: "/reels/editorial/editorial-lookbook-bauhaus-1.jpg",
    ratio: "4/5",
    span: 6,
    capabilities: ["4k", "char-consistency", "multi-ref"],
    variants: [
      { ratio: "4/5", src: "/reels/editorial/editorial-lookbook-bauhaus-2.jpg" },
      { ratio: "4/5", src: "/reels/editorial/editorial-lookbook-bauhaus-3.jpg" },
    ],
    source: "internal",
    preset: {
      prompt:
        "Generate 3 editorial lookbook stills: same model — an androgynous figure in her late 20s with a platinum pixie cut and sharp cheekbones — against a primary-colour Bauhaus painted-plaster backdrop. Maintain identical face, hair, and studio lighting across all three frames. Scene 1: standing centred against a cadmium-red wall in an oversized mustard wool coat with a 1960s silhouette. Scene 2: against a cobalt-blue wall in a crimson silk slip dress with an asymmetric shoulder strap. Scene 3: against a yellow-ochre wall in a black tailored trouser suit with sharp shoulders. Single north-window softbox, minimal long shadow, 4:5 vertical editorial composition. Shot on Mamiya 7II with an 80mm prime. Juergen Teller restraint meets Vogue Italia polish.",
      size: "4K",
      ratio: "4:5",
      sequential: true,
      max_images: 3,
    },
  },
  {
    // why Seedream 4.5: 4K hero portrait, pore-level skin truth — 4.5 is the only engine that reaches this print grade.
    id: "editorial-portrait-cover",
    industry: "editorial",
    subCategory: "portrait",
    model: "seedream-4-5-251128",
    kind: "image",
    featured: true,
    priority: 10,
    status: "live",
    title: "Magazine Cover Portrait",
    director_note:
      "4K hero portrait with masthead negative space pre-composed — the defining editorial asset. Pore-level skin texture preserved, no retouching smoothing.",
    brief_note:
      "The one editorial template you should open first. Print-grade at 4K covers a double-spread. Negative space above the head is where the masthead lives — ship straight to the art director.",
    src: "/reels/editorial/editorial-portrait-cover.jpg",
    ratio: "4/5",
    span: 6,
    capabilities: ["4k"],
    source: "internal",
    preset: {
      prompt:
        "Magazine-cover portrait for a major fashion monthly: a woman in her late 30s with cropped silver-blonde hair, a strong brow, and deep violet-grey eyes, wearing an architectural black wool turtleneck sculpting her neckline. Shoulders turned 15 degrees from camera, gaze locked direct through lens. Single Profoto softbox camera-right at three-quarter height, deep graphite-to-black seamless backdrop. Pore-level skin texture preserved, stray hairs catching rim light, carefully crafted specular highlights on the irises, zero retouching smoothing. Ample negative space above the head for masthead typography. Shot on Phase One XF IQ4 with a 150mm prime. Annie Leibovitz composition, Peter Lindbergh tonal restraint.",
      size: "4K",
      ratio: "4:5",
    },
  },
  {
    // why Seedream 5.0 Lite: 2K still life, no identity to hold across frames — Lite is the right weight for the brief.
    id: "editorial-flat-lay-autumn",
    industry: "editorial",
    subCategory: "flat-lay",
    model: "seedream-5-0-lite-260128",
    kind: "image",
    priority: 5,
    status: "live",
    title: "Autumn Flat-Lay",
    director_note:
      "Top-down editorial still life on linen — the Kinfolk/Cereal aesthetic rendered at 3K with razor-sharp material detail. Seedream 5.0 Lite is the right engine for this weight.",
    src: "/reels/editorial/editorial-flat-lay-autumn.jpg",
    ratio: "1/1",
    span: 4,
    capabilities: [],
    source: "internal",
    preset: {
      prompt:
        "Top-down editorial flat-lay on a warm oatmeal-linen surface: one pair of tan suede loafers angled at 10 o'clock, a folded camel cashmere scarf at 2 o'clock, an open hardcover novel at 6 o'clock with brass-rim reading glasses resting on its pages, a small ceramic espresso cup with visible crema centred in the composition, a scatter of desiccated autumn oak leaves filling the negative space. Even diffused north-window daylight, soft long shadows raking from upper-left, hyperreal material fidelity — every linen fibre and book-page texture readable. 1:1 editorial composition. Kinfolk / Cereal magazine aesthetic.",
      size: "2K",
      output_format: "jpeg",
    },
  },

  // ───────── Arch-viz ─────────────────────────────────────────────────────
  {
    // why Seedance 2.0: 8s walkthrough that must hold architectural continuity — flagship's defining strength over 1.5 Pro.
    id: "arch-walkthrough-dawn-loft",
    industry: "arch-viz",
    subCategory: "walkthrough",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    featured: true,
    priority: 10,
    status: "live",
    title: "Dawn Loft Walkthrough",
    director_note:
      "Slow push-forward through a converted loft at dawn — Seedance 2.0 holds architectural continuity across the move where earlier engines drifted.",
    brief_note:
      "The defining arch-viz demo. Client sees the space before it's built, camera motion sells scale better than a static render, and the ambient room tone gives it pre-broadcast polish.",
    src: "/reels/arch-viz/arch-walkthrough-dawn-loft.mp4",
    ratio: "16/9",
    span: 8,
    capabilities: ["audio", "camera-control", "long-take"],
    source: "internal",
    preset: {
      prompt:
        "T2V: Slow cinematic walkthrough through a converted industrial loft apartment at dawn. Camera begins at the threshold of a wide entryway and pushes forward at steady waist-height through a living area — an exposed-brick accent wall, a low-slung bouclé sectional, a Noguchi coffee table — terminating on a wall of tall industrial steel-frame windows flooded with pale cold morning light. Hardwood herringbone floor catches soft reflections, dust motes drift in volumetric godrays. Wide-angle architectural cinematography, ARRI Alexa Mini feel, 24mm prime, architectural depth of field. Quiet ambient morning room tone.",
      resolution: "720p",
      duration: 8,
      ratio: "16:9",
      generate_audio: true,
    },
    token_cost_estimate: 5.7,
  },
  {
    // why Seedance 2.0: 8s 21:9 drone descent with golden-hour audio — flagship for long-take + native ambient.
    id: "arch-exterior-villa-drone",
    industry: "arch-viz",
    subCategory: "exterior",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 8,
    status: "live",
    title: "Villa Drone Reveal",
    director_note:
      "Descending drone push over a hillside villa at golden hour — the property-marketing hero shot, rendered without the pilot or the permit.",
    src: "/reels/arch-viz/arch-exterior-villa-drone.mp4",
    ratio: "21/9",
    span: 12,
    capabilities: ["audio", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: Hero exterior establishing shot of a modernist concrete-and-glass hillside villa overlooking a dark blue sea at golden hour. Slow forward drone push: camera begins at high altitude behind the villa, descends gradually while pushing forward, revealing the cantilevered pool deck and warm-lit floor-to-ceiling glass façade as the sun grazes the horizon. Architectural photography aesthetic, Iwan Baan / Fernando Guerra reference, warm amber highlights against cool deep-blue ocean shadows, 70mm cinematic grade. 21:9 ultrawide composition. A calm ambient evening tone.",
      resolution: "720p",
      duration: 8,
      ratio: "21:9",
      generate_audio: true,
    },
    token_cost_estimate: 5.7,
  },
  {
    // why Seedream 4.5: 4K material-junction macro — 4.5 holds PBR-grade surface fidelity at reference resolution.
    id: "arch-detail-material-macro",
    industry: "arch-viz",
    subCategory: "detail",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 9,
    status: "live",
    title: "Material Junction Macro",
    director_note:
      "Concrete / corten / white-oak meeting at a single seam. 4K macro for architectural material specification — spec sheets without the product photographer's day-rate.",
    src: "/reels/arch-viz/arch-detail-material-macro.jpg",
    ratio: "1/1",
    span: 4,
    capabilities: ["4k"],
    source: "internal",
    preset: {
      prompt:
        "Architectural material detail macro: a junction where raw fair-faced concrete wall meets matte-black weathering-steel column meets end-grain white-oak flooring, all three materials converging at a single clean vertical seam. Extreme close-up framing filling the frame edge-to-edge. Hyperreal PBR-grade surface fidelity — every aggregate grain in the concrete, every oxidation pattern in the corten steel, every grain-ring in the oak flooring readable at pore level. Single raking sidelight from camera-left at 45 degrees exaggerating surface texture. 1:1 composition. Shot on Phase One with a 120mm macro lens. Reference-grade for architectural material specification.",
      size: "4K",
      ratio: "1:1",
    },
  },
  {
    // why Seedream 4.5: sequential 3-state with locked camera + furniture — only 4.5 can hold the scene across lighting changes.
    id: "arch-time-of-day-library",
    industry: "arch-viz",
    subCategory: "time-of-day",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 7,
    status: "live",
    title: "Library · Morning / Noon / Evening",
    director_note:
      "Same architectural scene, three lighting states — locked camera, locked furniture, locked composition. Sequential generation owns this brief.",
    src: "/reels/arch-viz/arch-time-of-day-library-1.jpg",
    ratio: "16/9",
    span: 6,
    capabilities: ["4k", "multi-ref"],
    variants: [
      { ratio: "16/9", src: "/reels/arch-viz/arch-time-of-day-library-2.jpg" },
      { ratio: "16/9", src: "/reels/arch-viz/arch-time-of-day-library-3.jpg" },
    ],
    source: "internal",
    preset: {
      prompt:
        "Generate 3 images of the identical architectural scene — a large wood-clad private library with a central oak reading table surrounded by floor-to-ceiling bookshelves — under three different times of day. Maintain identical camera angle (eye-level centred one-point perspective toward a tall arched window at the far end), identical furniture placement, identical composition. Scene 1: early morning — pale blue-grey light raking through the arched window, cool shadows dominating, a warm tungsten reading lamp on the table the only warm accent. Scene 2: midday — bright neutral daylight flooding the space evenly, minimal shadow. Scene 3: evening — warm amber interior tungsten lighting dominant, arched window now cool indigo dusk. 16:9 architectural photography. Iwan Baan reference. 4K print-grade.",
      size: "4K",
      ratio: "16:9",
      sequential: true,
      max_images: 3,
    },
  },
  {
    // why Seedream 4.5: sequential before/after in the identical room — 4.5's sequential gen is the only path.
    id: "arch-staged-furnished-empty",
    industry: "arch-viz",
    subCategory: "staged",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 6,
    status: "live",
    title: "Staged vs Empty · Before/After",
    director_note:
      "Identical room, two states — furnished and bare. Real-estate listing marketing without the staging invoice.",
    src: "/reels/arch-viz/arch-staged-furnished-empty-1.jpg",
    ratio: "16/9",
    span: 6,
    capabilities: ["4k", "multi-ref"],
    variants: [
      { ratio: "16/9", src: "/reels/arch-viz/arch-staged-furnished-empty-2.jpg" },
    ],
    source: "internal",
    preset: {
      prompt:
        "Generate 2 images of the identical architectural interior — a mid-century Eichler-style open-plan living and dining room with exposed post-and-beam ceiling, a full wall of sliding glass doors opening onto a garden, and polished concrete floors. Maintain identical camera angle (three-quarter view from the entry hallway), identical window light, identical composition. Scene 1: fully staged — a walnut dining table with four Eames chairs, a cream bouclé sofa facing the glass wall, a Noguchi tripod lamp, a potted monstera in the corner, a vintage Persian runner anchoring the living area. Scene 2: completely empty — the exact same room with zero furniture and zero props, just bare concrete floors and empty white walls. 16:9 architectural photography, bright neutral midday daylight. 4K.",
      size: "4K",
      ratio: "16:9",
      sequential: true,
      max_images: 2,
    },
  },

  // ───────── Game / IP ────────────────────────────────────────────────────
  {
    // why Seedance 2.0: 360° orbit demanding locked facial / armour identity across the rotation — flagship for both.
    id: "game-turnaround-hero-character",
    industry: "game-ip",
    subCategory: "turnaround",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 9,
    status: "live",
    title: "Hero Turnaround · 360°",
    director_note:
      "Locked-identity character orbit on a neutral studio floor — Blizzard-cinematic aesthetic at a prompt. Neutral light held constant so material reads at every angle. Vertical 9:16 (Seedance 2.0 T2V doesn't accept 4:5).",
    src: "/reels/game-ip/game-turnaround-hero-character.mp4",
    ratio: "9/16",
    span: 4,
    capabilities: ["audio", "camera-control", "char-consistency"],
    source: "internal",
    preset: {
      prompt:
        "T2V: Locked-identity character turnaround for a AAA video-game hero: a young knight in weathered dark-blue plate armour with a tattered white surcoat bearing a fading silver wolf sigil, a longsword strapped across her back, short dark hair pulled back tight. She stands in a neutral at-ease pose on a featureless seamless grey studio floor. Camera orbits a full 360 degrees around her at a steady medium-shot framing, completing exactly one full revolution over the shot. Flat neutral three-point studio lighting — key, fill, and rim — held absolutely constant throughout the rotation to preserve material readability. 9:16 vertical character-sheet composition. Blizzard cinematics aesthetic, hyperreal PBR armour materials, fabric micro-detail. A quiet neutral ambient studio tone.",
      resolution: "720p",
      duration: 6,
      ratio: "9:16",
      generate_audio: true,
    },
    token_cost_estimate: 4.3,
  },
  {
    // why Seedream 4.5: 4K 21:9 ultrawide key-art — 4.5 for print-grade fidelity at wide aspect.
    id: "game-env-splash-keyart",
    industry: "game-ip",
    subCategory: "env-splash",
    model: "seedream-4-5-251128",
    kind: "image",
    featured: true,
    priority: 10,
    status: "live",
    title: "Obsidian Citadel Splash",
    director_note:
      "Hero key-art at 4K ultrawide — the deck-opener that sells the IP in one frame. Craig Mullins painterly meets photoreal PBR.",
    brief_note:
      "The asset a publisher sees first in a pitch deck. 21:9 ultrawide composition reads on every monitor, leading lines pull the eye to the spire, lone silhouette gives the player a point of identification. Swap the citadel and the formula travels.",
    src: "/reels/game-ip/game-env-splash-keyart.jpg",
    ratio: "21/9",
    span: 8,
    capabilities: ["4k"],
    source: "internal",
    preset: {
      prompt:
        "Hero game environment splash key-art: a colossal ruined obsidian citadel rising from a stormy coastal cliff, jagged black basalt sea-stacks churning below, an apocalyptic bruise-purple sky with twin fractured moons hanging low, a single lone cloaked figure silhouetted on a distant cliffside catwalk staring up at the citadel. Hyperreal fantasy illustration style blending painterly atmospheric depth with photoreal material fidelity. Volumetric storm light, driving rain sheets, distant lightning flashes. Deep teal-and-violet colour grade punctuated by warm amber torchlight glowing from citadel arrow-slits. 21:9 ultrawide hero composition with strong leading lines into the central spire. Key-art fidelity for a AAA dark-fantasy RPG. Craig Mullins / Anato Finnstark reference.",
      size: "4K",
      ratio: "21:9",
    },
  },
  {
    // why Seedance 2.0: 8s UE5-grade crane-out reveal — flagship long-take carries the E3-style cinematic.
    id: "game-cinematic-reveal",
    industry: "game-ip",
    subCategory: "cinematic-game",
    model: "dreamina-seedance-2-0-260128",
    kind: "video",
    priority: 8,
    status: "live",
    title: "Scout Mech Reveal",
    director_note:
      "Unreal-Engine-cinematic-quality pull-back from a mech optic to a wrecked colony ship — the E3 reveal cut, without the render farm.",
    src: "/reels/game-ip/game-cinematic-reveal.mp4",
    ratio: "16/9",
    span: 6,
    capabilities: ["audio", "camera-control"],
    source: "internal",
    preset: {
      prompt:
        "T2V: In-engine-style cinematic trailer reveal for a sci-fi RPG. An armoured scout-mech with glowing azure optic arrays crests a rocky alien ridge-line at dusk, steam venting from shoulder exhausts, a vast crystalline canyon opening below — toward the horizon floats a wrecked colony ship, tilted at 30 degrees, drifting clouds of ember ash swirling around it. Slow dramatic crane-out camera move starting tight on the mech's optic cluster and pulling back to expose the wreck in full. Unreal Engine 5 cinematic quality, Lumen global illumination, volumetric dust and floating ember motes, deep Mass Effect / Horizon colour grade — cyan shadows, amber rim light. 16:9 cinematic composition. Low atmospheric wind and a distant mechanical drone.",
      resolution: "720p",
      duration: 8,
      ratio: "16:9",
      generate_audio: true,
    },
    token_cost_estimate: 5.7,
  },
  {
    // why Seedream 4.5: 4K character + diegetic HUD composite at display-asset fidelity — 4.5's print ceiling earns it.
    id: "game-ui-integration-hud",
    industry: "game-ip",
    subCategory: "ui-integration",
    model: "seedream-4-5-251128",
    kind: "image",
    priority: 7,
    status: "live",
    title: "Cyber HUD Composite",
    director_note:
      "Character + diegetic HUD composite — UI at display-asset fidelity baked into a 4K promotional still. Useful for store-page screenshots before a build ships.",
    src: "/reels/game-ip/game-ui-integration-hud.jpg",
    ratio: "16/9",
    span: 6,
    capabilities: ["4k"],
    source: "internal",
    preset: {
      prompt:
        "Game UI mock-up composite: a three-quarter medium-shot of a cyberpunk netrunner character — a young woman in her mid-20s with a teal undercut hairstyle, mirrored chrome goggles, and a matte-black techwear jacket covered in small data-port decals — standing in a neon-drenched rain-wet market alley at night. Cleanly integrated diegetic in-world HUD overlay elements on top of the scene: a health-and-energy bar anchored lower-left with an angular cyber-glyph typeface, a minimap anchored upper-right showing a partial city grid with three red enemy pings, a weapon-reticle + ammo readout centred lower-right, faint scan-line and chromatic-aberration passed over all UI layers only. Hyperreal photo-real character rendering behind the UI, UI rendered at display-asset fidelity with crisp pixel-perfect edges and no aliasing. 16:9 landscape. Cyberpunk 2077 / Ghostrunner reference.",
      size: "4K",
      ratio: "16:9",
    },
  },
];

// ────────────────────────────────── Helpers ────────────────────────────────

/** Default sort: featured first, then priority desc, then live before stub. */
export function compareTemplates(a: ReelTemplate, b: ReelTemplate): number {
  if ((a.featured ? 1 : 0) !== (b.featured ? 1 : 0)) return a.featured ? -1 : 1;
  const pa = a.priority ?? 0;
  const pb = b.priority ?? 0;
  if (pa !== pb) return pb - pa;
  const sa = a.status === "live" ? 0 : 1;
  const sb = b.status === "live" ? 0 : 1;
  return sa - sb;
}

export function getFeaturedFor(industry: Industry): ReelTemplate | undefined {
  const heroId = INDUSTRY_HERO[industry]?.featured_id;
  if (heroId) {
    const byId = TEMPLATES.find((t) => t.id === heroId);
    if (byId) return byId;
  }
  return TEMPLATES.find((t) => t.industry === industry && t.featured);
}
