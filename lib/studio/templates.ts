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

export const TEMPLATES: readonly StudioTemplate[] = [
  blank,
  cinematicStill,
  quickClip,
  imageToVideo,
  articleNarration,
] as const;

export function findTemplate(id: string): StudioTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
