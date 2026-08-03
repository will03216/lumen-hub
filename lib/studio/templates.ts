/**
 * Studio Spaces — starter templates.
 *
 * Each template's `build()` returns a fresh canvas with brand-new node
 * ids on every call. Templates are NOT live references — once a project
 * is created from a template the canvas is wholly owned by that project.
 * Editing a template's source code only affects projects created *after*
 * the change.
 */

import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_VIDEO_MODEL_ID,
} from "./models";
import type { CanvasShape } from "./projects";

export type StudioTemplate = {
  id: string;
  name: string;
  description: string;
  /** Short label shown on the template card (e.g. "T2I", "T2V", "I2V"). */
  badge: string;
  /** Roughly orders the templates in the picker; lower = first. */
  order: number;
  build: () => CanvasShape;
};

const POS = (x: number, y: number) => ({ x, y });
const newId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

// ─────────────────────────── Defaults per node type ────────────────────

const textForm = (text = "") => ({ text });

const imageForm = () => ({
  model: DEFAULT_IMAGE_MODEL_ID,
  size: DEFAULT_IMAGE_SIZE,
  seed: "",
});

const videoForm = () => ({
  model: DEFAULT_VIDEO_MODEL_ID,
  resolution: "720p",
  duration: 5,
  ratio: "16:9",
  seed: "",
  cameraFixed: false,
  audio: true,
});

// ─────────────────────────── Templates ─────────────────────────────────

const blank: StudioTemplate = {
  id: "blank",
  name: "Blank canvas",
  description: "Start with nothing. Drag your own nodes from the palette.",
  badge: "—",
  order: 0,
  build: () => ({ nodes: [], edges: [] }),
};

const cinematicStill: StudioTemplate = {
  id: "cinematic-still",
  name: "Cinematic still",
  description:
    "Text Prompt → Image Gen → Preview. The shortest path to a publishable frame.",
  badge: "T2I",
  order: 1,
  build: (): CanvasShape => {
    const tp = newId("tp");
    const ig = newId("ig");
    const pv = newId("pv");
    return {
      nodes: [
        {
          id: tp,
          type: "textPrompt",
          position: POS(0, 80),
          data: {
            form: textForm(
              "A lone astronaut on the rim of a red-dust canyon at golden hour, reflective visor, cinematic wide shot",
            ),
          },
        },
        {
          id: ig,
          type: "imageGen",
          position: POS(360, 0),
          data: { form: imageForm() },
        },
        {
          id: pv,
          type: "preview",
          position: POS(740, 0),
          data: { form: {} },
        },
      ],
      edges: [
        {
          id: `${tp}-${ig}`,
          source: tp,
          sourceHandle: "prompt",
          target: ig,
          targetHandle: "prompt",
        },
        {
          id: `${ig}-${pv}`,
          source: ig,
          sourceHandle: "url",
          target: pv,
          targetHandle: "url",
        },
      ],
    };
  },
};

const quickClip: StudioTemplate = {
  id: "quick-clip",
  name: "Quick clip",
  description:
    "Text Prompt → Video Gen → Preview. Pure text-to-video, ~60–90 s round-trip.",
  badge: "T2V",
  order: 2,
  build: (): CanvasShape => {
    const tp = newId("tp");
    const vg = newId("vg");
    const pv = newId("pv");
    return {
      nodes: [
        {
          id: tp,
          type: "textPrompt",
          position: POS(0, 80),
          data: {
            form: textForm(
              "Tracking shot of a woman walking along a windswept cliff, flowing red dress, ocean mist",
            ),
          },
        },
        {
          id: vg,
          type: "videoGen",
          position: POS(360, 0),
          data: { form: videoForm() },
        },
        {
          id: pv,
          type: "preview",
          position: POS(760, 0),
          data: { form: {} },
        },
      ],
      edges: [
        {
          id: `${tp}-${vg}`,
          source: tp,
          sourceHandle: "prompt",
          target: vg,
          targetHandle: "prompt",
        },
        {
          id: `${vg}-${pv}`,
          source: vg,
          sourceHandle: "url",
          target: pv,
          targetHandle: "url",
        },
      ],
    };
  },
};

const imageToVideo: StudioTemplate = {
  id: "image-to-video",
  name: "Image → Video",
  description:
    "Generate a still, then animate it. The prompt drives both Image Gen and Video Gen; the still feeds Video Gen's first frame.",
  badge: "I2V",
  order: 3,
  build: (): CanvasShape => {
    const tp = newId("tp");
    const ig = newId("ig");
    const vg = newId("vg");
    const pv = newId("pv");
    return {
      nodes: [
        {
          id: tp,
          type: "textPrompt",
          position: POS(0, 160),
          data: {
            form: textForm(
              "Hummingbird hovering over a blooming desert cactus, ultra slow motion, macro lens, golden hour",
            ),
          },
        },
        {
          id: ig,
          type: "imageGen",
          position: POS(360, 0),
          data: { form: imageForm() },
        },
        {
          id: vg,
          type: "videoGen",
          position: POS(760, 200),
          data: { form: videoForm() },
        },
        {
          id: pv,
          type: "preview",
          position: POS(1180, 200),
          data: { form: {} },
        },
      ],
      edges: [
        {
          id: `${tp}-${ig}`,
          source: tp,
          sourceHandle: "prompt",
          target: ig,
          targetHandle: "prompt",
        },
        {
          id: `${tp}-${vg}`,
          source: tp,
          sourceHandle: "prompt",
          target: vg,
          targetHandle: "prompt",
        },
        {
          id: `${ig}-${vg}`,
          source: ig,
          sourceHandle: "url",
          target: vg,
          targetHandle: "image",
        },
        {
          id: `${vg}-${pv}`,
          source: vg,
          sourceHandle: "url",
          target: pv,
          targetHandle: "url",
        },
      ],
    };
  },
};

const articleNarration: StudioTemplate = {
  id: "article-narration",
  name: "Article Narration",
  description:
    "Web Extract → Article Ingester (Claude) → Article Narration (Seedance 2.0). Paste a URL, get a narrated 1-minute video.",
  badge: "ART",
  order: 4,
  build: (): CanvasShape => {
    const we = newId("we");
    const ai = newId("ai");
    const an = newId("an");
    return {
      nodes: [
        {
          id: we,
          type: "webExtract",
          position: POS(0, 120),
          data: { form: {} },
        },
        {
          id: ai,
          type: "articleIngester",
          position: POS(400, 0),
          data: { form: {} },
        },
        {
          id: an,
          type: "articleNarration",
          position: POS(900, 60),
          data: { form: {} },
        },
      ],
      edges: [
        {
          id: `${we}-${ai}-text`,
          source: we,
          sourceHandle: "text",
          target: ai,
          targetHandle: "text",
        },
        {
          id: `${ai}-${an}-prompt`,
          source: ai,
          sourceHandle: "prompt",
          target: an,
          targetHandle: "prompt",
        },
        {
          id: `${ai}-${an}-narration`,
          source: ai,
          sourceHandle: "narration",
          target: an,
          targetHandle: "narration",
        },
      ],
    };
  },
};

const referenceCreativePackage: StudioTemplate = {
  id: "reference-creative-package",
  name: "Reference Creative Package",
  description:
    "Extract a reference beauty URL, apply its creative direction to your product image, then expand the hero into static and short-video variants.",
  badge: "REF→PKG",
  order: 6,
  build: (): CanvasShape => {
    const heroPrompt = newId("tp-hero");
    const squarePrompt = newId("tp-square");
    const verticalPrompt = newId("tp-vertical");
    const we = newId("we");
    const ap = newId("ap");
    const videoStyle = newId("vse");
    const st = newId("st");
    const heroPv = newId("pv-hero");
    const square = newId("square");
    const vertical = newId("vertical");
    const video = newId("video");
    const squarePv = newId("pv-square");
    const verticalPv = newId("pv-vertical");
    const videoPv = newId("pv-video");

    const heroPosterPrompt =
      "Create a clean premium beauty hero poster for the product shown in the content image. Use the style image only as creative direction: glossy lip texture, soft studio lighting, minimal white background, refined skincare-beauty aesthetic, and elegant product composition. Keep the content product recognizable. Do not copy reference logos, packaging text, exact layout, or brand identity. No CTA, no button, no extra typography, no price, no discount. Only preserve text naturally printed on the product packaging.";
    const squarePosterPrompt =
      "Create a square poster variant from the hero poster reference. Keep the same product, glossy beauty mood, white studio background, and refined premium composition, but make a fresh balanced 1:1 layout with slight product repositioning, clean negative space, and polished cosmetic campaign styling. No CTA, no button, no extra typography, no price, no discount. Only preserve text naturally printed on the product packaging.";
    const verticalPosterPrompt =
      "Create a vertical story poster from the hero poster reference. Keep the same product and premium beauty aesthetic, but redesign it for a 9:16 mobile story composition with taller framing, elegant product reveal, glossy pink texture detail, soft light shimmer, and clean white space. No CTA, no button, no extra typography, no price, no discount. Only preserve text naturally printed on the product packaging.";
    return {
      nodes: [
        {
          id: heroPrompt,
          type: "textPrompt",
          position: POS(0, 0),
          data: { form: textForm(heroPosterPrompt) },
        },
        {
          id: squarePrompt,
          type: "textPrompt",
          position: POS(520, -220),
          data: { form: textForm(squarePosterPrompt) },
        },
        {
          id: verticalPrompt,
          type: "textPrompt",
          position: POS(520, 620),
          data: { form: textForm(verticalPosterPrompt) },
        },
        {
          id: videoStyle,
          type: "videoStyleExtract",
          position: POS(520, 1220),
          data: {
            form: {
              videoUrl: "",
              productContext: "N°7 glossy pink lipstick",
            },
          },
        },
        {
          id: we,
          type: "webExtract",
          position: POS(0, 280),
          data: { form: {} },
        },
        {
          id: ap,
          type: "asset",
          position: POS(0, 880),
          data: { form: {} },
        },
        {
          id: st,
          type: "styleTransfer",
          position: POS(520, 320),
          data: {
            form: {
              model: "seedream-4-5-251128",
              size: "2048x2048",
              seed: "",
            },
          },
        },
        {
          id: heroPv,
          type: "preview",
          position: POS(920, 220),
          data: { form: {} },
        },
        {
          id: square,
          type: "imageGen",
          position: POS(920, -220),
          data: {
            form: {
              ...imageForm(),
              size: "2048x2048",
            },
          },
        },
        {
          id: vertical,
          type: "imageGen",
          position: POS(920, 560),
          data: {
            form: {
              ...imageForm(),
              size: "2160x3840",
            },
          },
        },
        {
          id: video,
          type: "videoGen",
          position: POS(920, 900),
          data: {
            form: {
              ...videoForm(),
              duration: 5,
              ratio: "9:16",
            },
          },
        },
        {
          id: squarePv,
          type: "preview",
          position: POS(1320, -220),
          data: { form: {} },
        },
        {
          id: verticalPv,
          type: "preview",
          position: POS(1320, 560),
          data: { form: {} },
        },
        {
          id: videoPv,
          type: "preview",
          position: POS(1320, 900),
          data: { form: {} },
        },
      ],
      edges: [
        {
          id: `${heroPrompt}-${st}-prompt`,
          source: heroPrompt,
          sourceHandle: "prompt",
          target: st,
          targetHandle: "prompt",
        },
        {
          id: `${we}-${st}-style`,
          source: we,
          sourceHandle: "images",
          target: st,
          targetHandle: "style",
        },
        {
          id: `${ap}-${st}-content`,
          source: ap,
          sourceHandle: "url",
          target: st,
          targetHandle: "content",
        },
        {
          id: `${st}-${heroPv}-url`,
          source: st,
          sourceHandle: "url",
          target: heroPv,
          targetHandle: "url",
        },
        {
          id: `${squarePrompt}-${square}-prompt`,
          source: squarePrompt,
          sourceHandle: "prompt",
          target: square,
          targetHandle: "prompt",
        },
        {
          id: `${st}-${square}-image`,
          source: st,
          sourceHandle: "url",
          target: square,
          targetHandle: "image",
        },
        {
          id: `${verticalPrompt}-${vertical}-prompt`,
          source: verticalPrompt,
          sourceHandle: "prompt",
          target: vertical,
          targetHandle: "prompt",
        },
        {
          id: `${st}-${vertical}-image`,
          source: st,
          sourceHandle: "url",
          target: vertical,
          targetHandle: "image",
        },
        {
          id: `${videoStyle}-${video}-prompt`,
          source: videoStyle,
          sourceHandle: "prompt",
          target: video,
          targetHandle: "prompt",
        },
        {
          id: `${st}-${video}-image`,
          source: st,
          sourceHandle: "url",
          target: video,
          targetHandle: "image",
        },
        {
          id: `${square}-${squarePv}`,
          source: square,
          sourceHandle: "url",
          target: squarePv,
          targetHandle: "url",
        },
        {
          id: `${vertical}-${verticalPv}`,
          source: vertical,
          sourceHandle: "url",
          target: verticalPv,
          targetHandle: "url",
        },
        {
          id: `${video}-${videoPv}`,
          source: video,
          sourceHandle: "url",
          target: videoPv,
          targetHandle: "url",
        },
      ],
    };
  },
};

// ─────────────────────────── Adtech ────────────────────────────────────

const adtechUploadToVideo: StudioTemplate = {
  id: "adtech-upload-to-video",
  name: "Adtech · Upload → Video",
  description:
    "Upload a product image, describe the motion, animate it. Asset + Text Prompt → Video Gen (Seedance 2.0, 720p) → Preview.",
  badge: "IMG→V",
  order: 7,
  build: (): CanvasShape => {
    const ap = newId("ap");
    const tp = newId("tp");
    const vg = newId("vg");
    const pv = newId("pv");
    return {
      nodes: [
        {
          id: ap,
          type: "asset",
          position: POS(0, 0),
          data: { form: {} },
        },
        {
          id: tp,
          type: "textPrompt",
          position: POS(0, 360),
          data: {
            form: textForm(
              "Slow push-in on the product, soft studio light sweeping across the surface, subtle rotation, premium commercial look",
            ),
          },
        },
        {
          id: vg,
          type: "videoGen",
          position: POS(440, 120),
          data: { form: videoForm() },
        },
        {
          id: pv,
          type: "preview",
          position: POS(860, 120),
          data: { form: {} },
        },
      ],
      edges: [
        {
          id: `${ap}-${vg}-image`,
          source: ap,
          sourceHandle: "url",
          target: vg,
          targetHandle: "image",
        },
        {
          id: `${tp}-${vg}-prompt`,
          source: tp,
          sourceHandle: "prompt",
          target: vg,
          targetHandle: "prompt",
        },
        {
          id: `${vg}-${pv}-url`,
          source: vg,
          sourceHandle: "url",
          target: pv,
          targetHandle: "url",
        },
      ],
    };
  },
};

const adtechProductModelToVideo: StudioTemplate = {
  id: "adtech-product-model-to-video",
  name: "Adtech · Product + Model → Video",
  description:
    "Generate a product-and-model still with Seedream 5.0 Pro, then animate it. Image Prompt → Image Gen (Seedream 5.0 Pro) → Video Gen (Seedance 2.0, 720p) → Preview.",
  badge: "T2I→V",
  order: 8,
  build: (): CanvasShape => {
    const ip = newId("tp-image");
    const vp = newId("tp-video");
    const ig = newId("ig");
    const vg = newId("vg");
    const pv = newId("pv");
    return {
      nodes: [
        {
          id: ip,
          type: "textPrompt",
          position: POS(0, 0),
          data: {
            form: textForm(
              "A model holding the product in a bright studio, clean seamless background, natural pose, soft commercial lighting, editorial fashion campaign, sharp product detail",
            ),
          },
        },
        {
          id: vp,
          type: "textPrompt",
          position: POS(0, 400),
          data: {
            form: textForm(
              "The model gently turns toward camera and presents the product, subtle hair and fabric movement, slow cinematic push-in, premium commercial look",
            ),
          },
        },
        {
          id: ig,
          type: "imageGen",
          position: POS(440, -40),
          data: { form: imageForm() },
        },
        {
          id: vg,
          type: "videoGen",
          position: POS(880, 200),
          data: { form: videoForm() },
        },
        {
          id: pv,
          type: "preview",
          position: POS(1300, 200),
          data: { form: {} },
        },
      ],
      edges: [
        {
          id: `${ip}-${ig}-prompt`,
          source: ip,
          sourceHandle: "prompt",
          target: ig,
          targetHandle: "prompt",
        },
        {
          id: `${ig}-${vg}-image`,
          source: ig,
          sourceHandle: "url",
          target: vg,
          targetHandle: "image",
        },
        {
          id: `${vp}-${vg}-prompt`,
          source: vp,
          sourceHandle: "prompt",
          target: vg,
          targetHandle: "prompt",
        },
        {
          id: `${vg}-${pv}-url`,
          source: vg,
          sourceHandle: "url",
          target: pv,
          targetHandle: "url",
        },
      ],
    };
  },
};

export const TEMPLATES: readonly StudioTemplate[] = [
  blank,
  cinematicStill,
  quickClip,
  imageToVideo,
  articleNarration,
  referenceCreativePackage,
  adtechUploadToVideo,
  adtechProductModelToVideo,
] as const;

export function findTemplate(id: string): StudioTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
