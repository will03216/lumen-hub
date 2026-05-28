/**
 * Showcase — curated case studies surfacing real work made on Lumen.
 *
 * Hand-authored data layer (no DB) so the surface ships before
 * studio-side editing arrives. Each case ties a brief to a concrete
 * deliverable in /public/reels/* and a recommended workflow path the
 * reader can clone.
 *
 * Schema split into two tiers:
 *   - Grid card (showcase-shell.tsx) reads `brief` / `receipt` / hero
 *   - Detail page (/showcase/[caseId]) additionally reads `briefLong`
 *     and the `workflow` step list
 *
 * Asset paths reference files committed in §35 (landing + reels asset
 * fill); referenced templates live in `lib/reels/templates.ts`.
 */

import type { Industry } from "@/lib/reels/templates";

export type WorkflowStep = {
  /** Imperative one-liner — "Pull the brief into Studio", "Lock identity
   *  with multi-ref Seedream", … */
  action: string;
  /** Optional second-line hint — typically the engine + mode used. */
  detail?: string;
};

export type ShowcaseCase = {
  id: string;
  industry: Industry;
  title: string;
  client: string;
  /** One-line brief surfaced on the showcase grid card. */
  brief: string;
  /** Long-form brief surfaced on the case detail page. Two-to-three
   *  paragraphs of context on the goal, constraints, and outcome. */
  briefLong: string;
  /** Step-by-step workflow narration for the detail page. Numbered in
   *  the UI; each entry is one tactical move. */
  workflow: WorkflowStep[];
  /** Outcome receipt — turnaround, asset count, comparison to traditional. */
  receipt: string;
  /** Hero asset path under /public — image or video file. */
  hero: string;
  heroKind: "image" | "video";
  /** A few supporting stills to texture the case card. */
  supports?: { src: string; kind: "image" | "video" }[];
  /** Engines used in this case — surfaced as chips. */
  engines: string[];
  /** Templates from /reels that anchor the workflow. Clicking the case
   *  filters the templates page to these, ready to clone. */
  templateIds?: string[];
};

export const SHOWCASE_CASES: ShowcaseCase[] = [
  // ── E-commerce ──────────────────────────────────────────────────────
  {
    id: "skincare-seasonal-launch",
    industry: "ecommerce",
    title: "Heritage skincare — autumn launch, two days flat",
    client: "Maison Atelier",
    brief:
      "Refresh hero KV, pack-shot variants, and a 360° turntable for nine SKUs ahead of an autumn drop. Brand mandated identity-locked talent across every frame.",
    briefLong:
      "Maison Atelier was launching a nine-SKU autumn refresh of their flagship moisturiser line and needed every PDP, paid-social cut, and hero KV ready before a hard October retail drop. The legacy workflow — flying their booked talent in for a two-day pack-shot session — wouldn't fit the calendar, and a stand-in model would break the identity continuity their brand book is built around.\n\nThe goal was to keep the original talent's likeness locked across 27 stills and nine turntable clips, while letting the art director iterate on backgrounds, lighting, and composition without a re-shoot. Multi-ref Seedream made the talent identity portable; Seedance 2.0 Fast handled the turntables in vertical and horizontal aspects without manually re-staging each.",
    workflow: [
      {
        action: "Upload one cleared talent reference + one product macro per SKU",
        detail: "References fed via the Studio canvas reference panel",
      },
      {
        action: "Lock identity with multi-ref Seedream 4.5",
        detail: "Six character-consistency runs to nail the core hero pose",
      },
      {
        action: "Batch the size variants in one Generator session",
        detail: "Sequential mode generated the 27-tile pack at one prompt",
      },
      {
        action: "Spin the SKUs as Seedance 2.0 Fast turntables",
        detail: "9-second clips, both 16:9 hero and 9:16 social cuts",
      },
      {
        action: "Export the kit through Compare for the art director's sign-off",
      },
    ],
    receipt:
      "27 production-ready stills + 9 turntables · 2 days · ~1/8 the cost of a traditional pack-shot day",
    hero: "/reels/ecommerce/ecom-hero-kv-banner.jpg",
    heroKind: "image",
    supports: [
      { src: "/reels/ecommerce/ecom-pack-shot-floating.png", kind: "image" },
      { src: "/reels/ecommerce/ecom-turntable-360.mp4", kind: "video" },
      { src: "/reels/ecommerce/ecom-lifestyle-composite.jpg", kind: "image" },
    ],
    engines: ["Seedream 4.5", "Seedance 2.0 Fast"],
    templateIds: [
      "ecom-hero-kv-banner",
      "ecom-pack-shot-floating",
      "ecom-turntable-360",
    ],
  },

  // ── Advertising ─────────────────────────────────────────────────────
  {
    id: "boutique-fitness-sizzle",
    industry: "advertising",
    title: "Boutique studio — print-grade KV + paid-social cut",
    client: "Form / Function",
    brief:
      "One brand-film concept, three deliverables: print-grade hero, vertical paid-social loop, three-panel storyboard for a Q3 push.",
    briefLong:
      "Form / Function is a 14-location boutique fitness chain whose Q3 acquisition push had been costed out at agency rates: a director's day, a 10-person crew, two studio days, and post. Their CMO wanted to test whether a single in-house art director could carry the same campaign through Lumen and reroute the difference into paid media spend.\n\nThe campaign needed three coherent deliverables sharing one visual identity: a print-grade hero ready for OOH, a 9-second vertical loop for paid-social, and a three-panel storyboard for the brand book. The trickiest constraint was tonal continuity — the hero and the social cut had to read as the same campaign even though they ran in totally different aspect ratios and time scales.",
    workflow: [
      {
        action: "Author one master prompt covering motion + lighting + tone",
        detail: "Anchored on Seedream 4.5 to set the look spec",
      },
      {
        action: "Render the print-grade hero at 4K",
        detail: "Seedream 4.5 multi-ref with the brand's existing campaign style",
      },
      {
        action: "Branch to vertical paid-social cut",
        detail: "Seedance 2.0 Fast at 9:16 with camera-fixed dolly",
      },
      {
        action: "Compose the three-panel storyboard from key frames",
        detail: "Reused the hero reference for tonal continuity",
      },
      {
        action: "Round-trip through Compare for an A/B against last quarter's spend",
      },
    ],
    receipt:
      "Concept → final cut in 36 hours · agency desk replaced by 1 art director + Lumen",
    hero: "/reels/advertising/ad-social-cut-vertical-flash.mp4",
    heroKind: "video",
    supports: [
      { src: "/reels/advertising/ad-print-kv-hero.jpg", kind: "image" },
      { src: "/reels/advertising/ad-storyboard-3panel.jpg", kind: "image" },
      { src: "/reels/advertising/ad-product-integration-logo.mp4", kind: "video" },
    ],
    engines: ["Seedream 4.5", "Seedance 2.0"],
    templateIds: [
      "ad-print-kv-hero",
      "ad-social-cut-vertical-flash",
      "ad-storyboard-3panel",
    ],
  },

  // ── Film & TV ──────────────────────────────────────────────────────
  {
    id: "indie-previz-reel",
    industry: "film-tv",
    title: "Indie director — pitch-ready pre-viz from a 6-page treatment",
    client: "Vault & Vine",
    brief:
      "First-look reel for festival financing. Mood, look-dev for two principals, and an aerial establishing for an isolated coastal town.",
    briefLong:
      "Vault & Vine had a six-page treatment for a coastal-noir feature and a financing pitch lined up for a regional film festival. The standard route — hire a concept artist, build a mood deck, optionally book a location scout — would have eaten the modest dev budget the producer had to work with. They wanted to show financiers a moving reel, not stills, but couldn't justify a full pre-viz vendor for an unfunded project.\n\nThe ask was a sub-three-minute reel that established the world: two principal characters in look-dev portraits, an aerial of the isolated coastal town the story is set in, and a couple of mood-driven environment plates that gave the cinematographer something concrete to build on. Stylistic continuity across all of it was what would earn financier trust — disjointed concept art reads as 'we don't know what this looks like yet'.",
    workflow: [
      {
        action: "Lock the look in a single Seedream 4.5 character study",
        detail: "Two principals plus a costume reference upload",
      },
      {
        action: "Build the establishing aerial with Seedance 2.0",
        detail: "Long-take camera pull, 8 seconds, 16:9 cinematic crop",
      },
      {
        action: "Stage the environment plates in i2v mode",
        detail: "Each plate seeded from a Seedream still for tonal continuity",
      },
      {
        action: "Cut the reel in the producer's NLE of choice",
        detail: "All Lumen exports drop straight into Premiere / DaVinci",
      },
      {
        action: "Pin the reel-quality version to the Library for the pitch deck",
      },
    ],
    receipt:
      "12-scene reel + look-dev portraits + aerial establishing · 4 days · location scouts deferred to greenlight",
    hero: "/reels/film-tv/film-establishing-aerial.mp4",
    heroKind: "video",
    supports: [
      { src: "/reels/film-tv/film-look-dev-character.jpg", kind: "image" },
      { src: "/reels/film-tv/film-vfx-plate-1080p.mp4", kind: "video" },
    ],
    engines: ["Seedance 2.0", "Seedream 4.5"],
    templateIds: ["film-establishing-aerial", "film-look-dev-character"],
  },

  // ── Social / Creator ────────────────────────────────────────────────
  {
    id: "beauty-content-sprint",
    industry: "social",
    title: "Beauty creator — 7-day content sprint, one prompt, six hooks",
    client: "@nara.studies",
    brief:
      "Talking-head explainers, trend-style whip-pans, and a three-still IG carousel to push a routine launch across one week without a shoot day.",
    briefLong:
      "@nara.studies is a beauty creator with 180k followers across IG and TikTok. She was launching a routine product collab that needed a full week of native-feeling content — talking-head explainers, trend-format whip-pans, a static carousel — but the launch window opened on a Monday and the brand drop landed on the previous Thursday. There was no time to book a studio day, let alone post-produce six clips.\n\nShe self-served the entire sprint from a kitchen-table laptop. Seedance 2.0's native-audio talking-head mode handled the explainers without a separate VO pass. The trend-format whip-pans were generated at 9:16 with Seedance 2.0 Fast, ready to drop into TikTok's editor with no transcoding. The IG carousel ran through Seedream 5.0 Lite to keep cost-per-post negligible — a creator-economics constraint a brand-shop wouldn't think about.",
    workflow: [
      {
        action: "Open Generator → Video → t2v with audio enabled",
        detail: "Seedance 2.0, 8-second clip, native audio for the explainer",
      },
      {
        action: "Pivot to trend-format whip-pans",
        detail: "Seedance 2.0 Fast at 9:16, three variants for A/B in TikTok",
      },
      {
        action: "Render the carousel triplet with Seedream 5.0 Lite",
        detail: "Sequential mode, three frames at 1024×1024",
      },
      {
        action: "Auto-pin the keepers to the Library",
        detail: "Pinned tag floats them to the top for the next launch",
      },
      {
        action: "Drop directly into IG / TikTok native editors",
      },
    ],
    receipt:
      "21 vertical clips + 9 carousel stills · creator self-served · zero production crew",
    hero: "/reels/social/social-talking-head-dialogue.mp4",
    heroKind: "video",
    supports: [
      { src: "/reels/social/social-trend-whip-pan.mp4", kind: "video" },
      { src: "/reels/social/social-carousel-still-3pack-1.jpg", kind: "image" },
      { src: "/reels/social/social-carousel-still-3pack-2.jpg", kind: "image" },
    ],
    engines: ["Seedance 2.0 Fast", "Seedream 5.0 Lite"],
    templateIds: [
      "social-talking-head-dialogue",
      "social-trend-whip-pan",
      "social-carousel-still-3pack",
    ],
  },

  // ── Editorial ───────────────────────────────────────────────────────
  {
    id: "bauhaus-lookbook",
    industry: "editorial",
    title: "Independent magazine — Bauhaus lookbook for the autumn issue",
    client: "Margin Press",
    brief:
      "A 12-page lookbook spread inspired by primary-colour Bauhaus design and rigid grid composition. Cover portrait + flat-lays + side-track runway.",
    briefLong:
      "Margin Press is an independent print magazine with a six-person editorial team and zero in-house photographers. Their autumn issue's centerpiece was a 12-page lookbook inspired by primary-colour Bauhaus design — a brief that traditionally would have meant a stylist, a studio booking, a rented location for the runway side-track, and at minimum two shoot days.\n\nThe creative director was firm on two things: the cover portrait had to feel like a cover portrait (not a renderfarm output), and the spread had to feel like one continuous look across stills and motion. Seedream 4.5 carried the cover and the lookbook spread variations through sequential mode; Seedance 2.0 took the runway side-track at a contemplative 8-second pacing that fit the issue's typographic restraint.",
    workflow: [
      {
        action: "Build the look-board in Studio canvas",
        detail: "Three reference images: Klee, Bauhaus poster, Helvetica grid",
      },
      {
        action: "Render the cover portrait at 4K",
        detail: "Seedream 4.5 with explicit primary-colour palette directive",
      },
      {
        action: "Generate the spread variations sequentially",
        detail: "Sequential mode, six frames at 2048×2048, same talent ref",
      },
      {
        action: "Stage the runway side-track in Seedance 2.0",
        detail: "Camera-fixed dolly, 8 seconds, 16:9 cinematic crop",
      },
      {
        action: "Hand the kit to the print designer for layout",
      },
    ],
    receipt:
      "12-page spread + cover · single weekend · stylist + creative director only",
    hero: "/reels/editorial/editorial-portrait-cover.jpg",
    heroKind: "image",
    supports: [
      { src: "/reels/editorial/editorial-lookbook-bauhaus-1.jpg", kind: "image" },
      { src: "/reels/editorial/editorial-lookbook-bauhaus-2.jpg", kind: "image" },
      { src: "/reels/editorial/editorial-runway-paris-side-track.mp4", kind: "video" },
    ],
    engines: ["Seedream 4.5", "Seedance 2.0"],
    templateIds: ["editorial-portrait-cover", "editorial-lookbook-bauhaus"],
  },

  // ── Arch-viz ────────────────────────────────────────────────────────
  {
    id: "spec-home-staging",
    industry: "arch-viz",
    title: "Spec home — empty-vs-furnished variants for a single listing",
    client: "Northpoint Realty",
    brief:
      "Listing photos stuck on a vacant unit. Goal: stage three room variants without booking a stylist or movers.",
    briefLong:
      "Northpoint Realty had a vacant spec home that had been sitting on the market for two months. Their listing photos showed an empty unit, and buyer feedback consistently came back as 'I can't picture myself in it'. Booking a virtual staging service would have run ~$500 per room and taken five business days; booking a physical stylist would have eaten into the agent's commission.\n\nThe solution was to render staged variants in three stylistic directions — Scandinavian, mid-century, and warm-traditional — for the three main living spaces, plus a drone exterior the original photographer hadn't captured. Seedream 4.5's multi-ref mode kept the architectural plates dimensionally accurate while only the furniture and styling shifted between renders. Each variant rendered in under two minutes; the full set landed in the listing the same evening.",
    workflow: [
      {
        action: "Upload one architectural plate per room",
        detail: "Wide-angle stills shot by the listing agent on an iPhone",
      },
      {
        action: "Stage three style variants per room",
        detail: "Seedream 4.5 multi-ref with style-board reference images",
      },
      {
        action: "Generate time-of-day pack",
        detail: "Same room, four lighting passes (morning / golden / dusk / blue)",
      },
      {
        action: "Render the drone exterior from a single elevation photo",
        detail: "Seedance 2.0 i2v with a slow camera arc",
      },
      {
        action: "Push the full kit straight into the MLS upload",
      },
    ],
    receipt:
      "8 staged variants + drone exterior + time-of-day pack · 1 evening · ~1/10 the cost of virtual staging vendors",
    hero: "/reels/arch-viz/arch-exterior-villa-drone.mp4",
    heroKind: "video",
    supports: [
      { src: "/reels/arch-viz/arch-staged-furnished-empty-1.jpg", kind: "image" },
      { src: "/reels/arch-viz/arch-staged-furnished-empty-2.jpg", kind: "image" },
      { src: "/reels/arch-viz/arch-time-of-day-library-1.jpg", kind: "image" },
    ],
    engines: ["Seedream 4.5", "Seedance 2.0"],
    templateIds: ["arch-staged-furnished-empty", "arch-exterior-villa-drone"],
  },

  // ── Game / IP ──────────────────────────────────────────────────────
  {
    id: "indie-game-keyart",
    industry: "game-ip",
    title: "Indie studio — Steam page reveal pack from concept doc",
    client: "Drift North Studios",
    brief:
      "Hero key art, character turnaround, environment splash, and a cinematic reveal for a Steam Next Fest launch — all from existing concept sketches.",
    briefLong:
      "Drift North Studios is a four-person indie studio prepping a Steam Next Fest launch with one (1) concept artist on staff. Steam's storefront expects a polished reveal pack: hero key art, a character turnaround, an environment splash, optional cinematic reveal, plus UI integration mocks. Hiring out the missing pieces would have run into low-five-figure territory and pushed the launch past the festival window.\n\nThe team fed their existing concept sketches in as multi-reference inputs, locking the protagonist's silhouette and the environment's colour palette across every output. Seedream 4.5 handled the stills; Seedance 2.0 took the cinematic reveal at a 6-second cut that doubled as the autoplay clip on the storefront. The character turnaround used Seedance 2.0 Fast in turntable mode so the storefront's 360° preview had clean angles to draw from.",
    workflow: [
      {
        action: "Upload the existing character + environment concept sketches",
        detail: "Three references each, fed into multi-ref mode",
      },
      {
        action: "Render the hero key art at 4K",
        detail: "Seedream 4.5 with character-consistency lock",
      },
      {
        action: "Generate the character turnaround",
        detail: "Seedance 2.0 Fast turntable, 6-second clip, no audio",
      },
      {
        action: "Compose the environment splash for the storefront",
        detail: "Seedream 4.5, 21:9 ultrawide for Steam capsule layouts",
      },
      {
        action: "Cut the cinematic reveal trailer",
        detail: "Seedance 2.0, 6 seconds, native audio, ends on the title card",
      },
    ],
    receipt:
      "Reveal trailer + 4 stills + UI integration mocks · 3 days · in-house art team of one",
    hero: "/reels/game-ip/game-cinematic-reveal.mp4",
    heroKind: "video",
    supports: [
      { src: "/reels/game-ip/game-env-splash-keyart.jpg", kind: "image" },
      { src: "/reels/game-ip/game-turnaround-hero-character.mp4", kind: "video" },
      { src: "/reels/game-ip/game-ui-integration-hud.jpg", kind: "image" },
    ],
    engines: ["Seedream 4.5", "Seedance 2.0"],
    templateIds: [
      "game-cinematic-reveal",
      "game-turnaround-hero-character",
      "game-env-splash-keyart",
    ],
  },
];

export function casesByIndustry(industry: Industry): ShowcaseCase[] {
  return SHOWCASE_CASES.filter((c) => c.industry === industry);
}

export function findCase(id: string): ShowcaseCase | null {
  return SHOWCASE_CASES.find((c) => c.id === id) ?? null;
}
