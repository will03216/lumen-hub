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
              // 9:16 at 3.7 MP. Was 2160x3840 (8.3 MP), which the default
              // model — Seedream 5.0 Pro, capped at 4,624,220 px — rejects
              // outright, so this node 400'd on every run of the template.
              ...imageForm(),
              size: "1440x2560",
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

/**
 * The eight fan-out shots, mirroring temp/tshirt-2-workflow/step-2-fan-outs.
 * Each one re-renders the SAME hero garment from a new camera position — the
 * hero is wired into every Image Gen as the reference, so the product stays
 * consistent and only framing, pose and crop change.
 *
 * `size` is per-shot: full-body poses need vertical framing, detail crops are
 * square so the weave/print fills the frame.
 */
const TSHIRT_FAN_OUT_SHOTS: ReadonlyArray<{
  key: string;
  label: string;
  size: string;
  prompt: string;
}> = [
  {
    key: "threequarter",
    label: "Three-quarter",
    size: "1440x2560",
    prompt:
      "Same garment and same model as the reference image, turned to a three-quarter angle facing camera left. Full-body studio shot, even softbox lighting, seamless light-grey backdrop, relaxed natural stance. Keep the garment's cut, colour and print identical to the reference. Photographic e-commerce look, no text, no graphics, no watermark.",
  },
  {
    key: "walking",
    label: "Walking",
    size: "1440x2560",
    prompt:
      "Same garment and same model as the reference image, captured mid-stride walking toward camera. Full-body shot with natural fabric movement and a slight motion feel in the hem and sleeves. Seamless light-grey backdrop, soft key light. Keep the garment's cut, colour and print identical to the reference. No text, no graphics, no watermark.",
  },
  {
    key: "handsinpocket",
    label: "Hands in pockets",
    size: "1440x2560",
    prompt:
      "Same garment and same model as the reference image, standing square to camera with both hands in pockets and shoulders relaxed. Full-body editorial stance, soft directional key light with gentle falloff, seamless light-grey backdrop. Keep the garment's cut, colour and print identical to the reference. No text, no graphics, no watermark.",
  },
  {
    key: "lowangle",
    label: "Low angle",
    size: "1440x2560",
    prompt:
      "Same garment and same model as the reference image, shot from a low camera angle looking slightly upward for a confident hero perspective. Full-body framing, subtle wide-lens feel, seamless light-grey backdrop, crisp studio lighting. Keep the garment's cut, colour and print identical to the reference. No text, no graphics, no watermark.",
  },
  {
    key: "waistupcrop",
    label: "Waist-up crop",
    size: "2048x2048",
    prompt:
      "Same garment and same model as the reference image, cropped from the waist up. Chest and shoulder fit clearly visible, neckline and sleeve seams sharp, soft even studio lighting on a seamless light-grey backdrop. Keep the garment's cut, colour and print identical to the reference. No text, no graphics, no watermark.",
  },
  {
    key: "backview",
    label: "Back view",
    size: "1440x2560",
    prompt:
      "Same garment and same model as the reference image, photographed from directly behind to show the back panel. Full-body shot, shoulder seams and back hem clearly readable, seamless light-grey backdrop, even studio lighting. Keep the garment's cut, colour and any back print identical to the reference. No text, no graphics, no watermark.",
  },
  {
    key: "fabric-closeup",
    label: "Fabric close-up",
    size: "2048x2048",
    prompt:
      "Extreme close-up of the same garment from the reference image, filling the frame with fabric texture — visible weave, stitch density and a natural fold. Macro lens, raking side light to bring out surface relief, shallow depth of field. Keep the exact colour and material of the reference. No text, no graphics, no watermark.",
  },
  {
    key: "print-closeup",
    label: "Print close-up",
    size: "2048x2048",
    prompt:
      "Tight close-up on the printed graphic of the same garment from the reference image, filling the frame. Ink texture sitting on the weave, slight fabric curvature, soft even light with no glare. Reproduce the print artwork, colours and proportions exactly as they appear in the reference. No text or graphics beyond the print already on the garment, no watermark.",
  },
];

const garmentShotPackage: StudioTemplate = {
  id: "garment-shot-package",
  name: "Garment Shot Package",
  description:
    "Upload your own garment photos (front, back, detail) → one hero shot → eight camera-varied product shots fanned out from that hero.",
  badge: "BYO→8",
  order: 7,
  build: (): CanvasShape => {
    const front = newId("asset-front");
    const back = newId("asset-back");
    const detail = newId("asset-detail");
    const heroPrompt = newId("tp-hero");
    const hero = newId("ig-hero");
    const heroPv = newId("pv-hero");

    const heroBrief =
      "Studio product hero shot of the garment shown in the reference images. Use every reference together: they are the same single garment photographed front, back and in detail — match its exact cut, colour, fabric and print. Dress it on a neutral full-body model standing centred and facing camera, arms relaxed. Seamless light-grey backdrop, soft even softbox lighting, true-to-life colour, sharp fabric texture. Commercial e-commerce photography. No text, no graphics, no logos beyond what is already printed on the garment, no watermark.";

    // Left column: the three uploads the user swaps for their own photos.
    const nodes: CanvasShape["nodes"] = [
      { id: front, type: "asset", position: POS(0, 120), data: { form: {} } },
      { id: back, type: "asset", position: POS(0, 400), data: { form: {} } },
      { id: detail, type: "asset", position: POS(0, 680), data: { form: {} } },
      {
        id: heroPrompt,
        type: "textPrompt",
        position: POS(0, -200),
        data: { form: textForm(heroBrief) },
      },
      {
        id: hero,
        type: "imageGen",
        position: POS(440, 240),
        data: { form: { ...imageForm(), size: "1440x2560" } },
      },
      {
        id: heroPv,
        type: "preview",
        position: POS(840, 240),
        data: { form: {} },
      },
    ];

    // All three uploads land on the SAME `image` port. The runner joins them
    // with "\n" and Image Gen splits them back into a multi-ref array, so the
    // hero is generated from all three views of the garment at once.
    const edges: CanvasShape["edges"] = [
      {
        id: `${heroPrompt}-${hero}-prompt`,
        source: heroPrompt,
        sourceHandle: "prompt",
        target: hero,
        targetHandle: "prompt",
      },
      ...[front, back, detail].map((src) => ({
        id: `${src}-${hero}-image`,
        source: src,
        sourceHandle: "url",
        target: hero,
        targetHandle: "image",
      })),
      {
        id: `${hero}-${heroPv}-url`,
        source: hero,
        sourceHandle: "url",
        target: heroPv,
        targetHandle: "url",
      },
    ];

    // Fan out: one prompt → one Image Gen → one Preview per shot, stacked
    // down the right-hand side so the eight rows read top-to-bottom.
    TSHIRT_FAN_OUT_SHOTS.forEach((shot, i) => {
      const tp = newId(`tp-${shot.key}`);
      const ig = newId(`ig-${shot.key}`);
      const pv = newId(`pv-${shot.key}`);
      const y = i * 320 - 400;

      nodes.push(
        {
          id: tp,
          type: "textPrompt",
          position: POS(1240, y),
          data: { form: textForm(shot.prompt) },
        },
        {
          id: ig,
          type: "imageGen",
          position: POS(1700, y),
          data: { form: { ...imageForm(), size: shot.size } },
        },
        {
          id: pv,
          type: "preview",
          position: POS(2100, y),
          data: { form: {} },
        },
      );

      edges.push(
        {
          id: `${tp}-${ig}-prompt`,
          source: tp,
          sourceHandle: "prompt",
          target: ig,
          targetHandle: "prompt",
        },
        // The hero is the single source of truth for every fan-out, which is
        // what keeps the garment consistent across all eight shots.
        {
          id: `${hero}-${ig}-image`,
          source: hero,
          sourceHandle: "url",
          target: ig,
          targetHandle: "image",
        },
        {
          id: `${ig}-${pv}-url`,
          source: ig,
          sourceHandle: "url",
          target: pv,
          targetHandle: "url",
        },
      );
    });

    return { nodes, edges };
  },
};

const assetScenePackage: StudioTemplate = {
  id: "asset-scene-package",
  name: "Asset Scene Package",
  description:
    "Text + your own asset → a composed still, then that still fans out into a motion clip and a second still variant.",
  badge: "TA2I→V+I",
  order: 8,
  build: (): CanvasShape => {
    const scenePrompt = newId("tp-scene");
    const asset = newId("asset");
    const scene = newId("ig-scene");
    const scenePv = newId("pv-scene");
    const motionPrompt = newId("tp-motion");
    const variantPrompt = newId("tp-variant");
    const video = newId("vg");
    const variant = newId("ig-variant");
    const videoPv = newId("pv-video");
    const variantPv = newId("pv-variant");

    const sceneBrief =
      "Place the product from the reference image into a premium lifestyle scene: warm morning light raking across a matte stone surface, soft shadows, a few out-of-focus props for depth. Keep the product's shape, colour, material and any packaging text exactly as in the reference — it must stay recognisably the same object. Editorial commercial photography, shallow depth of field, true-to-life colour. No added text, no logos, no watermark.";
    const motionBrief =
      "Slow cinematic push-in on the product from the reference frame, ending on a tight hero framing. Light drifts gently across the surface, dust motes catch the beam, everything else stays still. Locked-off feel, no cuts, no text, no camera shake.";
    const variantBrief =
      "Second still from the same scene as the reference frame: same product, same lighting mood and palette, but a fresh top-down flat-lay composition with the product off-centre and generous negative space for later copy. Keep the product identical to the reference. No added text, no logos, no watermark.";

    return {
      nodes: [
        {
          id: scenePrompt,
          type: "textPrompt",
          position: POS(0, -120),
          data: { form: textForm(sceneBrief) },
        },
        { id: asset, type: "asset", position: POS(0, 240), data: { form: {} } },
        {
          id: scene,
          type: "imageGen",
          position: POS(440, 40),
          data: { form: { ...imageForm(), size: "2560x1440" } },
        },
        {
          id: scenePv,
          type: "preview",
          position: POS(840, 40),
          data: { form: {} },
        },
        {
          id: motionPrompt,
          type: "textPrompt",
          position: POS(840, 400),
          data: { form: textForm(motionBrief) },
        },
        {
          id: variantPrompt,
          type: "textPrompt",
          position: POS(840, -420),
          data: { form: textForm(variantBrief) },
        },
        {
          id: variant,
          type: "imageGen",
          position: POS(1300, -420),
          data: { form: { ...imageForm(), size: "2048x2048" } },
        },
        {
          id: video,
          type: "videoGen",
          position: POS(1300, 400),
          data: { form: { ...videoForm(), duration: 5, ratio: "16:9" } },
        },
        {
          id: variantPv,
          type: "preview",
          position: POS(1720, -420),
          data: { form: {} },
        },
        {
          id: videoPv,
          type: "preview",
          position: POS(1720, 400),
          data: { form: {} },
        },
      ],
      edges: [
        // Text + asset → the composed still.
        {
          id: `${scenePrompt}-${scene}-prompt`,
          source: scenePrompt,
          sourceHandle: "prompt",
          target: scene,
          targetHandle: "prompt",
        },
        {
          id: `${asset}-${scene}-image`,
          source: asset,
          sourceHandle: "url",
          target: scene,
          targetHandle: "image",
        },
        {
          id: `${scene}-${scenePv}-url`,
          source: scene,
          sourceHandle: "url",
          target: scenePv,
          targetHandle: "url",
        },
        // That still then drives both branches: motion and a second still.
        {
          id: `${motionPrompt}-${video}-prompt`,
          source: motionPrompt,
          sourceHandle: "prompt",
          target: video,
          targetHandle: "prompt",
        },
        {
          id: `${scene}-${video}-image`,
          source: scene,
          sourceHandle: "url",
          target: video,
          targetHandle: "image",
        },
        {
          id: `${variantPrompt}-${variant}-prompt`,
          source: variantPrompt,
          sourceHandle: "prompt",
          target: variant,
          targetHandle: "prompt",
        },
        {
          id: `${scene}-${variant}-image`,
          source: scene,
          sourceHandle: "url",
          target: variant,
          targetHandle: "image",
        },
        {
          id: `${video}-${videoPv}-url`,
          source: video,
          sourceHandle: "url",
          target: videoPv,
          targetHandle: "url",
        },
        {
          id: `${variant}-${variantPv}-url`,
          source: variant,
          sourceHandle: "url",
          target: variantPv,
          targetHandle: "url",
        },
      ],
    };
  },
};

/**
 * F1 · Vertical Feed Ad — the canvas form of `docs/plans-en/F1-Vertical-Feed-
 * Short-Video.md`.
 *
 * One 9:16 product photo in, three deliverables out: a vertical key visual,
 * a Branding clip (native UGC tone, no price, no CTA) and a Performing clip
 * (1-second hook → demo → explicit CTA). That split is the whole point of the
 * F1 plan — the two lanes are bought against different objectives, so a
 * template that only produced one of them would only be half the brief.
 *
 * Both video nodes pin Seedance 2.5 rather than inheriting the default. 2.5 is
 * the model the plan is costed against (native audio, multilingual captions),
 * and DEFAULT_VIDEO_MODEL_ID deliberately still points at 2.0 — see the note
 * in models.ts.
 *
 * Durations are the plan's own: B1's 20s for the Branding cut, P1's 12s for
 * the Performing one. The Branding lane was briefly cut to 15 when CAPS_V25
 * stopped there; 2.5 renders a 30s single take, so the plan's arithmetic —
 * four slice-of-life shots at ≈5s — is submittable as written.
 *
 * Brands are described generically ("unbranded frosted tube"), never named.
 * The plan's own ⚠️ note says naming a real brand gets its logo flagged by
 * moderation or rendered as garbled text; the documented fallback is a generic
 * description plus a real product photo on the Asset node, which is exactly
 * what the graph is wired for.
 */
const verticalFeedAd: StudioTemplate = {
  id: "vertical-feed-ad",
  name: "F1 · Vertical Feed Ad",
  description:
    "Your product photo → a 9:16 key visual, then two Seedance 2.5 clips off the same look: a native-feel Branding cut and a hook→demo→CTA Performing cut.",
  badge: "9:16 AD",
  order: 5,
  build: (): CanvasShape => {
    const asset = newId("asset");
    const kvPrompt = newId("tp-kv");
    const kv = newId("ig-kv");
    const kvPv = newId("pv-kv");
    const brandPrompt = newId("tp-brand");
    const perfPrompt = newId("tp-perf");
    const brandVideo = newId("vg-brand");
    const perfVideo = newId("vg-perf");
    const brandPv = newId("pv-brand");
    const perfPv = newId("pv-perf");

    // Key visual: vertical, native-feeling, and deliberately left with head
    // room at top and bottom so the platform safe zones (TikTok 150px top /
    // 440px bottom, Shorts 250/340) don't crop anything that matters.
    const kvBrief =
      "A 9:16 vertical key visual for a face-cream social ad: the product from the reference image resting on a matte ceramic bathroom shelf, early-morning side light raking in through a window, a soft shadow falling to the right, one out-of-focus green leaf at the edge for depth. Keep the product's shape, colour, material and any packaging text exactly as in the reference — it must stay recognisably the same object. Editorial commercial photography, true-to-life colour, shallow depth of field. Leave clean empty space in the top fifth and bottom third of the frame for platform safe zones. No added text, no logos, no watermark, no price.";

    // Branding lane — F1 §B1: native UGC tone, emotion over selling points.
    // Four ≈5s beats read as four shots to the model even though the clip is
    // one submission; the timings are the plan's own duration maths.
    const brandBrief =
      "Shot 1 (≈5s): A young woman with no makeup sits in front of a bathroom mirror, scooping a small dollop from an unbranded frosted tube of face cream with her fingertip, looking into the mirror and saying softly in English: \"This is my no-makeup go-to.\" Medium close-up handheld with slight shake, early-morning side light through the window, skin showing natural pores and a soft glow.\n" +
      "Shot 2 (≈5s): The same woman works the cream into her cheek in circles; the balm first mounds on the skin surface, then is pushed by her fingertips into a translucent film. She blinks naturally, corners of her mouth lifting, not looking at camera as if filming herself. Medium close-up follow shot, warm morning light, shallow depth of field. Soft rubbing sound of application.\n" +
      "Shot 3 (≈5s): She pulls on a jacket and tosses the frosted tube into her canvas bag, tidying up while smiling into the camera and saying in English: \"So easy to reapply on the go.\" Medium follow shot, indoor warm light turning to daylight at the doorway. Zipper sound, soft rustle of the bag.\n" +
      "Shot 4 (≈5s): She opens the door and walks toward the street, backlight turning her into a silhouette, strands of hair lifted by the wind; the frame settles on her relaxed profile with the frosted tube visible in her hand. Slow medium follow shot, warm golden backlight. Street ambience under a light lo-fi music bed.\n" +
      "English voiceover and English captions throughout, vertical native vlog texture, no over-smoothing of skin. No price, no discount, no buy button, no CTA, no watermarks from other platforms.";

    // Performing lane — F1 §P1: hook inside the first second, selling point
    // stated plainly, hard CTA on the tail, readable with the sound off.
    const perfBrief =
      "Shot 1 (≈3s): A hand slaps a large dollop of white face cream onto the back of a dry, flaking hand with visible texture (realistic skin, visible fine lines and flakes); large English on-screen text pops up at the top of frame: \"Dry-skin savior? Let's test it\". Extreme close-up, bright clear frontal light. A crisp light slapping sound.\n" +
      "Shot 2 (≈5s): Fingertips quickly spread the cream out; the balm first covers, then is worked in evenly, the dry lines filled and the skin turning hydrated and translucent — the before-and-after change on the same patch of skin clearly visible. English voiceover at a slightly fast clip: \"One swipe and the dry lines are gone.\" Extreme close-up, hard frontal light. Fast rubbing sound of application.\n" +
      "Shot 3 (≈4s): The unbranded white jar sits centred filling 60% of the frame, with a left/right split screen showing the same patch of skin rough before and hydrated after, and large English on-screen CTA text at the bottom: \"Shop now\", English voiceover: \"Grab yours before it's gone.\" Medium close-up with a slight push in, bright product lighting. Closing beat sound effect.\n" +
      "English voiceover and English captions throughout so it reads with sound off, vertical native texture, no over-smoothing of skin, no watermarks.";

    // 9:16 at 3.7 MP. 2160x3840 is the catalogue's 9:16 preset but it is
    // 8.3 MP, which the default model (Seedream 5.0 Pro, 4,624,220 px)
    // rejects outright — the same 400 that broke two earlier templates.
    const VERTICAL_SIZE = "1440x2560";
    const SEEDANCE_25 = "dreamina-seedance-2-5-260628";

    return {
      nodes: [
        {
          id: kvPrompt,
          type: "textPrompt",
          position: POS(0, -80),
          data: { form: textForm(kvBrief) },
        },
        { id: asset, type: "asset", position: POS(0, 420), data: { form: {} } },
        {
          id: kv,
          type: "imageGen",
          position: POS(460, 100),
          data: { form: { ...imageForm(), size: VERTICAL_SIZE } },
        },
        {
          id: kvPv,
          type: "preview",
          position: POS(880, 100),
          data: { form: {} },
        },
        {
          id: brandPrompt,
          type: "textPrompt",
          position: POS(880, 480),
          data: { form: textForm(brandBrief) },
        },
        {
          id: perfPrompt,
          type: "textPrompt",
          position: POS(880, 1080),
          data: { form: textForm(perfBrief) },
        },
        {
          id: brandVideo,
          type: "videoGen",
          position: POS(1340, 480),
          data: {
            form: {
              ...videoForm(),
              model: SEEDANCE_25,
              // F1 §B1's own figure: four slice-of-life shots at ≈5s.
              duration: 20,
              ratio: "9:16",
              audio: true,
            },
          },
        },
        {
          id: perfVideo,
          type: "videoGen",
          position: POS(1340, 1080),
          data: {
            form: {
              ...videoForm(),
              model: SEEDANCE_25,
              duration: 12,
              ratio: "9:16",
              audio: true,
            },
          },
        },
        {
          id: brandPv,
          type: "preview",
          position: POS(1760, 480),
          data: { form: {} },
        },
        {
          id: perfPv,
          type: "preview",
          position: POS(1760, 1080),
          data: { form: {} },
        },
      ],
      edges: [
        // Product photo + brief → the vertical key visual.
        {
          id: `${kvPrompt}-${kv}-prompt`,
          source: kvPrompt,
          sourceHandle: "prompt",
          target: kv,
          targetHandle: "prompt",
        },
        {
          id: `${asset}-${kv}-image`,
          source: asset,
          sourceHandle: "url",
          target: kv,
          targetHandle: "image",
        },
        {
          id: `${kv}-${kvPv}-url`,
          source: kv,
          sourceHandle: "url",
          target: kvPv,
          targetHandle: "url",
        },
        // Branding lane opens on the key visual — I2V, so the clip inherits
        // the still's product, palette and light rather than re-inventing it.
        {
          id: `${brandPrompt}-${brandVideo}-prompt`,
          source: brandPrompt,
          sourceHandle: "prompt",
          target: brandVideo,
          targetHandle: "prompt",
        },
        {
          id: `${kv}-${brandVideo}-image`,
          source: kv,
          sourceHandle: "url",
          target: brandVideo,
          targetHandle: "image",
        },
        {
          id: `${brandVideo}-${brandPv}-url`,
          source: brandVideo,
          sourceHandle: "url",
          target: brandPv,
          targetHandle: "url",
        },
        // Performing lane stays pure T2V: its hook is an extreme close-up of
        // a hand, so starting it on the key visual would fight the first
        // second — the one second the whole format is decided in.
        {
          id: `${perfPrompt}-${perfVideo}-prompt`,
          source: perfPrompt,
          sourceHandle: "prompt",
          target: perfVideo,
          targetHandle: "prompt",
        },
        {
          id: `${perfVideo}-${perfPv}-url`,
          source: perfVideo,
          sourceHandle: "url",
          target: perfPv,
          targetHandle: "url",
        },
      ],
    };
  },
};

// The two URL-reference templates below are both pre-filled with a real,
// working reference — a rhode skin product page and a rhode TikTok post — so
// the template runs end-to-end on first open instead of stalling on an empty
// URL field. Both are references, not sources: the Asset node carries your own
// product, and the prompts take creative direction (light, palette, pacing,
// composition) while explicitly refusing the reference's logos, packaging text
// and layout.
const REFERENCE_PAGE_URL =
  "https://www.rhodeskin.com/en-gb/products/peptide-lip-tint-macadamia-butter";
const REFERENCE_TIKTOK_URL =
  "https://www.tiktok.com/@rhode/video/7647292461894831390";
const OWN_PRODUCT = "N°7 glossy pink lipstick";

/**
 * Creative URL Pipeline — a static product page in, three usable stills out.
 *
 * Distinct from Reference Creative Package, which mixes a page, a video and a
 * clip into one graph: this one stays entirely on the image side, and fans the
 * hero into the three crops a campaign actually ships (1:1 feed, 9:16 story,
 * 16:9 banner) rather than two.
 *
 * Style Transfer is the hinge. The page's images land on its `style` port and
 * your own product photo on `content`, so the output wears the reference's
 * lighting and mood while staying your product — which is also why every
 * prompt spells out what must NOT be copied.
 */
const creativeUrlPipeline: StudioTemplate = {
  id: "creative-url-pipeline",
  name: "Creative URL Pipeline",
  description:
    "Scrape a reference product page, borrow its art direction for your own product photo, then fan the hero out into 1:1 feed, 9:16 story and 16:9 banner stills.",
  badge: "URL→3I",
  order: 9,
  build: (): CanvasShape => {
    const we = newId("we");
    const asset = newId("asset");
    const heroPrompt = newId("tp-hero");
    const hero = newId("st-hero");
    const heroPv = newId("pv-hero");
    const feedPrompt = newId("tp-feed");
    const storyPrompt = newId("tp-story");
    const bannerPrompt = newId("tp-banner");
    const feed = newId("ig-feed");
    const story = newId("ig-story");
    const banner = newId("ig-banner");
    const feedPv = newId("pv-feed");
    const storyPv = newId("pv-story");
    const bannerPv = newId("pv-banner");

    const heroBrief = `Create a clean premium beauty hero image for the ${OWN_PRODUCT} shown in the content image. Take creative direction from the style image only: its lighting quality, colour palette, surface finish, prop language and sense of negative space. Keep the content product exactly as it is — same shape, same cap, same colour, same packaging text. Do not copy the reference's logo, packaging text, brand identity or exact layout. Editorial commercial photography, soft studio light, true-to-life colour, glossy lip texture detail. No CTA, no button, no added typography, no price, no discount, no watermark. Only text naturally printed on the product's own packaging.`;
    const feedBrief = `Square 1:1 feed still from the hero reference. Same ${OWN_PRODUCT}, same lighting mood and palette, but a fresh balanced centre-weighted composition with the product slightly off-axis and clean negative space around it. Keep the product identical to the reference. No added typography, no CTA, no price, no watermark. Only text naturally printed on the product's own packaging.`;
    const storyBrief = `Vertical 9:16 story still from the hero reference. Same ${OWN_PRODUCT} and the same premium beauty aesthetic, redesigned for a tall mobile frame: the product low in the lower third, a soft light shimmer above it, generous empty space in the top fifth and bottom third so platform safe zones and later copy have room. Keep the product identical to the reference. No added typography, no CTA, no price, no watermark. Only text naturally printed on the product's own packaging.`;
    const bannerBrief = `Wide 16:9 banner still from the hero reference. Same ${OWN_PRODUCT} and the same palette and light, recomposed horizontally with the product on the right third and a long clean run of negative space to the left for a headline. Keep the product identical to the reference. No added typography, no CTA, no price, no watermark. Only text naturally printed on the product's own packaging.`;

    return {
      nodes: [
        {
          id: heroPrompt,
          type: "textPrompt",
          position: POS(0, -240),
          data: { form: textForm(heroBrief) },
        },
        {
          id: we,
          type: "webExtract",
          position: POS(0, 140),
          data: {
            form: { url: REFERENCE_PAGE_URL, editedText: "", selectedMedia: [] },
          },
        },
        {
          id: asset,
          type: "asset",
          position: POS(0, 700),
          data: { form: {} },
        },
        {
          id: hero,
          type: "styleTransfer",
          position: POS(500, 200),
          data: {
            form: {
              // 4.5 rather than the default: Style Transfer's own default
              // model, and the one Reference Creative Package settled on.
              model: "seedream-4-5-251128",
              size: "2048x2048",
              seed: "",
            },
          },
        },
        {
          id: heroPv,
          type: "preview",
          position: POS(920, 200),
          data: { form: {} },
        },
        {
          id: feedPrompt,
          type: "textPrompt",
          position: POS(920, -300),
          data: { form: textForm(feedBrief) },
        },
        {
          id: storyPrompt,
          type: "textPrompt",
          position: POS(920, 560),
          data: { form: textForm(storyBrief) },
        },
        {
          id: bannerPrompt,
          type: "textPrompt",
          position: POS(920, 1000),
          data: { form: textForm(bannerBrief) },
        },
        {
          id: feed,
          type: "imageGen",
          position: POS(1380, -300),
          data: { form: { ...imageForm(), size: "2048x2048" } },
        },
        {
          id: story,
          type: "imageGen",
          // 9:16 at 3.7 MP — the catalogue's 2160x3840 preset is 8.3 MP and
          // the default model rejects it outright.
          position: POS(1380, 560),
          data: { form: { ...imageForm(), size: "1440x2560" } },
        },
        {
          id: banner,
          type: "imageGen",
          position: POS(1380, 1000),
          data: { form: { ...imageForm(), size: "2560x1440" } },
        },
        {
          id: feedPv,
          type: "preview",
          position: POS(1800, -300),
          data: { form: {} },
        },
        {
          id: storyPv,
          type: "preview",
          position: POS(1800, 560),
          data: { form: {} },
        },
        {
          id: bannerPv,
          type: "preview",
          position: POS(1800, 1000),
          data: { form: {} },
        },
      ],
      edges: [
        // Reference page → style; your own product → content.
        {
          id: `${heroPrompt}-${hero}-prompt`,
          source: heroPrompt,
          sourceHandle: "prompt",
          target: hero,
          targetHandle: "prompt",
        },
        {
          id: `${we}-${hero}-style`,
          source: we,
          sourceHandle: "images",
          target: hero,
          targetHandle: "style",
        },
        {
          id: `${asset}-${hero}-content`,
          source: asset,
          sourceHandle: "url",
          target: hero,
          targetHandle: "content",
        },
        {
          id: `${hero}-${heroPv}-url`,
          source: hero,
          sourceHandle: "url",
          target: heroPv,
          targetHandle: "url",
        },
        // Hero → three crops, each steered by its own brief.
        ...[
          [feedPrompt, feed, feedPv],
          [storyPrompt, story, storyPv],
          [bannerPrompt, banner, bannerPv],
        ].flatMap(([prompt, gen, pv]) => [
          {
            id: `${prompt}-${gen}-prompt`,
            source: prompt,
            sourceHandle: "prompt",
            target: gen,
            targetHandle: "prompt",
          },
          {
            id: `${hero}-${gen}-image`,
            source: hero,
            sourceHandle: "url",
            target: gen,
            targetHandle: "image",
          },
          {
            id: `${gen}-${pv}-url`,
            source: gen,
            sourceHandle: "url",
            target: pv,
            targetHandle: "url",
          },
        ]),
      ],
    };
  },
};

/**
 * TikTok Reference Clip — a creator post in, two Seedance 2.5 clips out.
 *
 * Video Style Extract does the reading: it pulls the post down (yt-dlp), reads
 * its frames, and emits an enhanced prompt already aimed at `productContext`.
 * That single prompt then drives both video nodes, which is the whole
 * comparison the template exists to make:
 *
 *   • T2V — the reference's pacing and look, unconstrained. Fast, and shows
 *     you what the extraction actually understood.
 *   • I2V — the same prompt opening on a still of *your* product, so the clip
 *     is grounded in the real packaging instead of an invented lookalike.
 *
 * Run the extract node first; the two video nodes are downstream of its prompt
 * and have nothing to submit until it has produced one.
 */
const tiktokReferenceClip: StudioTemplate = {
  id: "tiktok-reference-clip",
  name: "TikTok Reference Clip",
  description:
    "Analyse a TikTok post's look and pacing, then render it two ways on Seedance 2.5: a free text-to-video read, and the same direction opening on a still of your own product.",
  badge: "TT→2V",
  order: 10,
  build: (): CanvasShape => {
    const vse = newId("vse");
    const asset = newId("asset");
    const framePrompt = newId("tp-frame");
    const frame = newId("ig-frame");
    const framePv = newId("pv-frame");
    const freeVideo = newId("vg-free");
    const groundedVideo = newId("vg-grounded");
    const freePv = newId("pv-free");
    const groundedPv = newId("pv-grounded");

    const frameBrief = `A 9:16 vertical opening frame for a short-form beauty ad: the ${OWN_PRODUCT} from the reference image held in a hand against a softly lit, warm neutral background, shallow depth of field, glossy highlight running along the cap. Keep the product's shape, colour, material and any packaging text exactly as in the reference — it must stay recognisably the same object. Natural skin texture, true-to-life colour, native short-video feel rather than a studio pack shot. No added text, no logos, no watermark, no price.`;

    const SEEDANCE_25 = "dreamina-seedance-2-5-260628";

    return {
      nodes: [
        {
          id: vse,
          type: "videoStyleExtract",
          position: POS(0, 200),
          data: {
            form: {
              videoUrl: REFERENCE_TIKTOK_URL,
              productContext: OWN_PRODUCT,
              styleBrief: "",
              enhancedPrompt: "",
              fidelity: "faithful",
            },
          },
        },
        {
          id: framePrompt,
          type: "textPrompt",
          position: POS(0, 780),
          data: { form: textForm(frameBrief) },
        },
        {
          id: asset,
          type: "asset",
          position: POS(0, 1160),
          data: { form: {} },
        },
        {
          id: frame,
          type: "imageGen",
          position: POS(500, 940),
          data: { form: { ...imageForm(), size: "1440x2560" } },
        },
        {
          id: framePv,
          type: "preview",
          position: POS(920, 940),
          data: { form: {} },
        },
        {
          id: freeVideo,
          type: "videoGen",
          position: POS(920, 120),
          data: {
            form: {
              ...videoForm(),
              model: SEEDANCE_25,
              duration: 10,
              ratio: "9:16",
              audio: true,
            },
          },
        },
        {
          id: groundedVideo,
          type: "videoGen",
          position: POS(1380, 520),
          data: {
            form: {
              ...videoForm(),
              model: SEEDANCE_25,
              duration: 10,
              ratio: "9:16",
              audio: true,
            },
          },
        },
        {
          id: freePv,
          type: "preview",
          position: POS(1380, 120),
          data: { form: {} },
        },
        {
          id: groundedPv,
          type: "preview",
          position: POS(1800, 520),
          data: { form: {} },
        },
      ],
      edges: [
        // One extracted prompt, both lanes.
        {
          id: `${vse}-${freeVideo}-prompt`,
          source: vse,
          sourceHandle: "prompt",
          target: freeVideo,
          targetHandle: "prompt",
        },
        {
          id: `${vse}-${groundedVideo}-prompt`,
          source: vse,
          sourceHandle: "prompt",
          target: groundedVideo,
          targetHandle: "prompt",
        },
        {
          id: `${freeVideo}-${freePv}-url`,
          source: freeVideo,
          sourceHandle: "url",
          target: freePv,
          targetHandle: "url",
        },
        // Your product photo → an opening still → the grounded lane's
        // first frame.
        {
          id: `${framePrompt}-${frame}-prompt`,
          source: framePrompt,
          sourceHandle: "prompt",
          target: frame,
          targetHandle: "prompt",
        },
        {
          id: `${asset}-${frame}-image`,
          source: asset,
          sourceHandle: "url",
          target: frame,
          targetHandle: "image",
        },
        {
          id: `${frame}-${framePv}-url`,
          source: frame,
          sourceHandle: "url",
          target: framePv,
          targetHandle: "url",
        },
        {
          id: `${frame}-${groundedVideo}-image`,
          source: frame,
          sourceHandle: "url",
          target: groundedVideo,
          targetHandle: "image",
        },
        {
          id: `${groundedVideo}-${groundedPv}-url`,
          source: groundedVideo,
          sourceHandle: "url",
          target: groundedPv,
          targetHandle: "url",
        },
      ],
    };
  },
};

/**
 * The six F2 cuts, in the plan's own order: three Branding, three Performing.
 *
 * Ratios are the plan's, with one substitution — F2 asks for 4:5 and the
 * engine's ratio enum (VIDEO_RATIOS) has no 4:5, so the five 4:5 cuts render
 * at 3:4. That's the nearest supported portrait and still fills a Meta feed
 * card; 9:16 would be cropped, which is the thing F2 exists to avoid.
 *
 * Durations are the plan's own throughout, B2 included at 20s — 2.5 renders a
 * single take up to 30, so nothing here has to be cut back to fit.
 *
 * Brand names are stripped throughout per the plan's ⚠️ note — a named brand
 * gets its logo flagged or rendered as garbled text. The Asset node carries the
 * real product into every cut instead, which is the documented fallback.
 */
const F2_CUTS: ReadonlyArray<{
  key: string;
  /** Plan section, shown nowhere but useful when tracing a cut back. */
  label: string;
  ratio: string;
  duration: number;
  prompt: string;
}> = [
  {
    key: "b1",
    label: "B1 · The world inside one drop of serum",
    ratio: "3:4",
    duration: 15,
    prompt:
      "Shot 1 (≈5s): Extreme macro — a drop of amber serum hangs slowly from the mouth of a glass dropper, breaks away and falls, landing on a still water surface and kicking up a tiny splash and concentric ripples, light passing through the amber liquid and refracting warm gold flecks. Locked macro camera, even diffused light, warm amber palette, shallow depth of field. The crisp fine sound of a droplet hitting water.\n" +
      "Shot 2 (≈5s): The serum diffuses slowly across the water in fine wisps, and the dark brown frosted glass bottle from the reference image rises slowly into the centre of frame, sheen flowing across its surface. The camera pushes in extremely slowly, warm gold side light outlining the bottle. Minimal rippling water sound.\n" +
      "Shot 3 (≈5s): The camera pulls slowly back; the bottle rests centred above its reflection on the water, a highlight sweeping gently across the metal of the dropper. Slow pull-back, quiet and premium. The instrumental resolves on a closing note.\n" +
      "No voiceover, no price and no CTA throughout, the frame filling a portrait feed card, clean and lyrical, no captions or watermarks. The brand name appears only as the printing on the product's own packaging.",
  },
  {
    key: "b2",
    label: "B2 · Morning ritual",
    ratio: "3:4",
    duration: 20,
    prompt:
      "Shot 1 (≈5s): A young woman with deep skin tone wakes in a bedroom flooded with early sunlight, stretches and walks toward her vanity, morning light through sheer curtains casting soft dappled patches on her skin. Slow medium follow shot, warm gold morning light, airy frame. Gentle ambience and a soothing morning music bed.\n" +
      "Shot 2 (≈5s): She squeezes cream from the tube in the reference image onto her fingertips, dots it on her forehead, cheeks and chin, then works it upward in circles; the balm is pushed into a translucent film, her skin showing a natural glow and real pores. Medium close-up, warm side light, shallow depth of field. Soft application sound.\n" +
      "Shot 3 (≈5s): She pats her face to help absorption, smiling naturally into the mirror with relaxed eyes, morning light moving across her face. Medium close-up, natural light. The music bed rises.\n" +
      "Shot 4 (≈5s): She pulls the curtains open to let the sunlight pour in; the frame holds on her relaxed profile with the product resting on the vanity. Slow medium pull-back, warm gold backlight. The instrumental resolves.\n" +
      "No hard selling points, no price and no CTA throughout — emotion and tone come first; English captions only, portrait feed framing, authentic with no skin smoothing, no watermarks.",
  },
  {
    key: "b3",
    label: "B3 · Texture as proof",
    ratio: "1:1",
    duration: 15,
    prompt:
      "Shot 1 (≈5s): Extreme macro sweeping slowly across a patch of real skin, natural pores, fine vellus hair and a soft sheen visible, the skin texture authentic with no smoothing. Slow macro lateral move, soft top light, shallow depth of field. Minimal near-silent ambience.\n" +
      "Shot 2 (≈5s): A finger scoops a thick, rich dollop of cream from the frosted jar in the reference image; the balm mounds on the fingertip, its edge collapsing slightly, the fine texture and highlights of the cream clearly visible. Slow macro follow, warm diffused light. Soft tacky sound of the scoop.\n" +
      "Shot 3 (≈5s): The cream is worked slowly across the skin by fingertips into a hydrated thin film, the skin turning from matte to translucent and glowing; the camera then pulls slowly back, the jar resting centred, a highlight sweeping across the lid. Slow pull-back. Closing instrumental note.\n" +
      "No voiceover, no price and no CTA throughout, square 1:1 composition, texture authentic and premium, no captions or watermarks.",
  },
  {
    key: "p1",
    label: "P1 · 3-second before/after contrast",
    ratio: "3:4",
    duration: 15,
    prompt:
      "Shot 1 (≈4s): The frame splits left and right — on the left a patch of dry, dull cheek skin with fine lines, on the right the same patch hydrated, firm and brightened, a crisp dividing line between them, with large English on-screen text popping up at the top: \"7 days. See the difference.\" Extreme close-up, bright frontal light. A crisp alert sound effect.\n" +
      "Shot 2 (≈6s): The camera cuts to the whole cheek as a hand spreads the cream across it; once the balm covers the skin the texture smooths out and a glow gradually comes through, the change on the same area clearly visible. English voiceover at a slightly fast clip: \"Smooths fine lines and firms in a week.\" Medium close-up, hard frontal light. Fast application sound.\n" +
      "Shot 3 (≈5s): The bottle from the reference image sits centred filling 60% of the frame, the left/right before-and-after split screen returning, with a large English CTA at the bottom: \"Shop now\", English voiceover: \"Get yours today.\" Medium close-up with a slight push in, bright product lighting. Closing beat sound effect.\n" +
      "English voiceover and English captions throughout so it reads with sound off, portrait feed framing with the top 14% and bottom 20% kept clear for platform safe zones, no over-smoothing of skin, no watermarks.",
  },
  {
    key: "p2",
    label: "P2 · Pain-point question opening",
    ratio: "3:4",
    duration: 15,
    prompt:
      "Shot 1 (≈4s): A young woman examines her dull, tired face in the mirror, brows slightly furrowed, asking in English with resignation: \"Still fighting dull, tired skin?\", with matching English on-screen text at the top. Medium close-up, natural window light at home, realistic skin texture. Quiet indoor room tone.\n" +
      "Shot 2 (≈6s): She applies the cream from the reference image to her face, pressing and working it upward with her fingertips, the skin gradually brightening from dull and revealing a healthy glow, the change natural and believable. English voiceover: \"Brightens and hydrates, all day.\" Medium close-up, bright window light, shallow depth of field. Soft application sound.\n" +
      "Shot 3 (≈5s): The bottle sits centred with a large English CTA \"Shop now\" beside it, the woman smiling with satisfaction into the mirror, English voiceover: \"Try it today.\" Medium close-up with a slight push in, bright product lighting. Closing beat sound effect.\n" +
      "English voiceover and English captions throughout, portrait feed framing with the top 14% and bottom 20% kept clear, authentic with no over-smoothing, no watermarks.",
  },
  {
    key: "p3",
    label: "P3 · One master, many hooks for A/B",
    ratio: "3:4",
    duration: 15,
    prompt:
      "Shot 1 (≈3s): A hand picks up the product from the reference image and holds it toward the camera, a clean empty area reserved across the top of frame where the English hook text \"Hydration that lasts.\" fades in — keep that band otherwise empty so the hook can be swapped for A/B variants later. Locked medium close-up, bright airy frontal light. Clear indoor room tone.\n" +
      "Shot 2 (≈7s): She works the cream into her cheek in circles, the balm pushed into a translucent film and the skin revealing a hydrated glow, intercut with close-ups of the fingertip scoop and the application. English voiceover: \"Melts in fast, keeps skin fresh all day.\" Alternating medium close-ups and close-ups, bright window light. Soft application sound.\n" +
      "Shot 3 (≈5s): The bottle sits centred filling 60% of the frame, with a large English CTA at the bottom: \"Shop now\", the woman nodding with satisfaction. English voiceover: \"Grab yours.\" Medium close-up with a slight push in, bright product lighting. Closing beat sound effect.\n" +
      "The top hook band and the voiceover are the swappable modules for A/B derivation; English captions throughout, portrait feed framing, no over-smoothing of skin, no watermarks.",
  },
];

/**
 * F2 · Feed Video Set — all six cuts from
 * `docs/plans-en/F2-Landscape-Square-Feed-Video.md` on one canvas.
 *
 * One Asset node feeds every cut's reference port, so a single product upload
 * carries the real packaging through all six renders — Seedance 2.5's
 * reference mode is what makes that work, and it's why the prompts can say
 * "the bottle from the reference image" instead of describing a lookalike.
 *
 * Six 15s renders is a real spend. The runner executes what you ask it to, so
 * the usual way to work this template is to run one lane, judge it, then run
 * the rest — not to hit Run All on first open.
 */
const feedVideoSet: StudioTemplate = {
  id: "feed-video-set",
  name: "F2 · Feed Video Set",
  description:
    "All six F2 feed cuts — three Branding, three Performing — off one product upload, portrait and square, on Seedance 2.5 with native audio.",
  badge: "1→6V",
  order: 11,
  build: (): CanvasShape => {
    const asset = newId("asset");
    const SEEDANCE_25 = "dreamina-seedance-2-5-260628";

    const lanes = F2_CUTS.map((cut, i) => ({
      cut,
      promptId: newId(`tp-${cut.key}`),
      videoId: newId(`vg-${cut.key}`),
      previewId: newId(`pv-${cut.key}`),
      y: i * 420 - 1050,
    }));

    return {
      nodes: [
        { id: asset, type: "asset", position: POS(0, 0), data: { form: {} } },
        ...lanes.flatMap(({ cut, promptId, videoId, previewId, y }) => [
          {
            id: promptId,
            type: "textPrompt",
            position: POS(460, y),
            data: { form: textForm(cut.prompt) },
          },
          {
            id: videoId,
            type: "videoGen",
            position: POS(960, y),
            data: {
              form: {
                ...videoForm(),
                model: SEEDANCE_25,
                duration: cut.duration,
                ratio: cut.ratio,
                audio: true,
              },
            },
          },
          {
            id: previewId,
            type: "preview",
            position: POS(1400, y),
            data: { form: {} },
          },
        ]),
      ],
      edges: lanes.flatMap(({ promptId, videoId, previewId }) => [
        {
          id: `${promptId}-${videoId}-prompt`,
          source: promptId,
          sourceHandle: "prompt",
          target: videoId,
          targetHandle: "prompt",
        },
        // assetId → `references`, not url → `image`: the product should
        // persist through the whole cut as a reference, not just pin its
        // first frame. Every cut opens on something other than the product.
        {
          id: `${asset}-${videoId}-references`,
          source: asset,
          sourceHandle: "assetId",
          target: videoId,
          targetHandle: "references",
        },
        {
          id: `${videoId}-${previewId}-url`,
          source: videoId,
          sourceHandle: "url",
          target: previewId,
          targetHandle: "url",
        },
      ]),
    };
  },
};

// ──────────────── Heckler · Cinematic AI Prompt Engine ─────────────────
//
// Three cases from Heckler's R&D prompt examples (29 May 2026), each built the
// way that methodology works: lock the look as a 1:1 six-panel contact sheet
// first, then hand the sheet to the video engine as a reference image. The
// doc's own production note is the reason the graph has that shape — "a
// reference image attached alongside text outperforms text-only for
// hard-to-describe garment shapes", and every video block ends with "Attach
// character reference image."
//
// Prompts are the doc's engine paste-blocks, kept close to verbatim. Per its
// distillation rules the lens/aperture numbers stay (they change the output),
// one or two named style references stay, and the format line stays last —
// "the last thing the model reads biases composition."
//
// Video nodes run Seedance 2.0, which is what the doc targets and what
// videoForm() already defaults to; 16:9 at 15s is the format every block
// specifies, and 15s is on the 2.0 duration ladder.

/** Verbatim in every prompt, per §3. Without it the model invents on-screen
 *  text, which is the single most unreliable thing it renders. */
const NO_TEXT_RULE =
  "Absolutely no text, no lettering, no signage, no words, no numbers, no UI labels, no typography of any kind generated in the image. All text is added in post-production only.";

/** Verbatim in every prompt, per §3 — calibrated against known failure modes,
 *  not a generic quality incantation. */
const HECKLER_AVOID =
  "Avoid: blurry, oversaturated, airbrushed skin, plastic texture, bokeh balls, lens flare, overexposed highlights, underexposed shadows, visible noise artefacts, cartoon, illustration, painting, CGI render, stock photo, posed, stiff.";

type HecklerCase = {
  id: string;
  name: string;
  description: string;
  badge: string;
  order: number;
  /** One or more 1:1 contact sheets to lock before the clip runs. Every
   *  sheet's output is wired into the video node's URL reference port. */
  sheets: { label: string; prompt: string }[];
  video: string;
};

const HECKLER_CASES: readonly HecklerCase[] = [
  {
    id: "heckler-doors-rise",
    name: "Heckler · Doors Rise",
    description:
      "Wes Anderson cross-section staging. Lock a character contact sheet and the heritage hallway location, then run the 3-cut clip where the doors seal behind her.",
    badge: "2CS→V",
    order: 12,
    sheets: [
      {
        // §4.1 — Subject A wardrobe sheet. The bottom-row "NO FACE" repetition
        // is deliberate: the doc's first key learning is that it has to be
        // stated per panel or the model puts her face in the detail shots.
        label: "Character contact sheet — Subject A",
        prompt:
          "A single 1:1 square image containing exactly 6 different photographs of the same woman arranged in a strict 2-row by 3-column grid. The top row contains 3 portrait photographs showing her face and body. The bottom row contains 3 clothing-detail photographs showing ONLY close-ups of individual garments — the bottom row does NOT show the woman's face or body, only fabric, texture, and shoes in tight close-up.\n\n" +
          "The woman: aged 45–50, tall lean long-limbed frame, shoulder-length blonde bob honeyed ash tone worn down, fair skin with a soft even complexion, fine pores visible, natural unretouched texture, green eyes warm and intelligent with subtle crow's feet, light natural makeup, small gold hoop earrings, fine delicate pendant necklace. Wearing a classic white designer crew-neck tee, a brown-to-black ombre mohair knit tied around the neck draped over the shoulders sleeves loosely knotted at the front of her chest with fuzzy mohair texture graduating from deep black through warm chocolate brown, mid-blue stone-wash straight-leg denim jeans cropped above the ankle with a clean hem, the leg falling in a uniform column from knee to cropped hem with no flare and no kick-out at the ankle, black leather loafers.\n\n" +
          "Panel 1 (top left): Close-up portrait head and shoulders, 85mm f/1.8, her green eyes razor sharp, warm sidelight from a sash window, sly confident smile. Panel 2 (top centre): Full body head to toe, 50mm f/2, standing near a bookshelf, the full outfit visible. Panel 3 (top right): Side profile head through waist, 85mm f/1.8, jawline and blonde bob in sharp profile. Panel 4 (bottom left — NO FACE, clothing detail only): Extreme close-up of the white tee neckline and the brown ombre mohair knit. Panel 5 (bottom centre — NO FACE, clothing detail only): Extreme close-up of the mid-blue stone-wash straight-leg cropped denim. Panel 6 (bottom right — NO FACE, clothing detail only): Extreme close-up of the black leather loafers on honey-toned timber floor.\n\n" +
          `Kodak Portra 400 film stock. ${HECKLER_AVOID} Also avoid: flared jeans, bell-bottom, kick-flare hem, bootcut, wide-leg. ${NO_TEXT_RULE} 1:1 square format.`,
      },
      {
        // §4.3 — the same heritage hallway the clip walks through, locked
        // separately so the environment is fixed before the character enters.
        label: "Location contact sheet — heritage hallway",
        prompt:
          "A single 1:1 square image containing exactly 6 different photographs arranged in a strict 2-row by 3-column grid. All six photographs show the SAME interior space from different angles — no people visible. The space: a white heritage terrace interior — long high-ceilinged hallway with arched doorways, white walls with decorative panelling and cornices, ornate ceiling roses, brass ring pendant lights, polished pale timber floor. Soft coastal daylight from a far window.\n\n" +
          "Panel 1 (top left): Wide shot down the full hallway, 35mm f/2.8, deep focus, arched doorways receding in perspective. Panel 2 (top centre): Close-up, 85mm f/1.8, brass ring pendant from below, ornate ceiling rose, extreme shallow DOF. Panel 3 (top right): Medium low angle, 35mm f/2.8, along the polished timber floor, camera near ground, brass pendants reflected. Panel 4 (bottom left): Close-up, 85mm f/1.8, decorative heritage cornice, coastal daylight raking at low angle. Panel 5 (bottom centre): Medium, 50mm f/2, dark-framed artwork on white wall, brass pendant above. Panel 6 (bottom right): Wide exterior, 35mm f/2.8, Victorian terrace facade, white, wrought iron balustrade, morning sky clean above.\n\n" +
          // "people, figures, silhouettes" is the doc's critical exclusion here
          // — without it the model populates the empty space.
          `Kodachrome 400T register. Wes Anderson Grand Budapest Hotel staging. ${HECKLER_AVOID} Also avoid: people, figures, silhouettes, clutter. ${NO_TEXT_RULE} 1:1 square format.`,
      },
    ],
    // §5.1 — three 5s cuts. Magic is architectural: the doors rise like a
    // portcullis, nothing sparkles, and she never reacts with surprise.
    video:
      "CUT 1 (0:00–0:05): Wide cross-section. 35mm f/2.8. A woman in her early 40s with natural blonde shoulder-length hair, wearing a relaxed white linen blouse, chocolate brown maxi skirt with tan belt, cognac leather tote bag, gold bracelets, sculptural gold pendant — walks left to right through a white heritage hallway in full profile. Wes Anderson Grand Budapest Hotel register. Behind her, the first solid timber door begins to rise from the polished pale timber floor, shooting upward like a portcullis, sealing the archway. Architectural and mechanical — not fantasy. Deep focus. Warm coastal daylight. Her walk does not break rhythm. A small playful gesture with her free hand. Texture: dust motes in the light beam.\n\n" +
      "CUT 2 (0:05–0:10): Medium cross-section. 50mm f/2. Camera continues lateral track. A second door rises faster — the rhythm accelerating. A sly smile appears — small, confident, earned. Not a grin. The sculptural gold pendant catches the light. Shallower DOF — sealed doors behind soften into geometric pattern in warm bokeh. The sly smile IS the shot. Texture: polished floor reflects the bottom edges of the rising doors.\n\n" +
      "CUT 3 (0:10–0:15): Wide cross-section pulling back. 35mm f/2.8. Third door seals. Full hallway visible — three sealed doors behind her creating a rhythm of closed panels. Strong negative space above. She continues walking undisturbed. She knew this would happen. Texture: ornate heritage cornice catches a line of coastal light.\n\n" +
      `${NO_TEXT_RULE} 16:9 widescreen. 15 seconds.`,
  },
  {
    id: "heckler-slow-motion-crowd",
    name: "Heckler · Slow-Motion Crowd",
    description:
      "The Fred Astaire glide — commuters in slow motion, he at normal speed, camera arcing. Lock Subject B's contact sheet, then run the 3-cut clip.",
    badge: "CS→V",
    order: 13,
    sheets: [
      {
        // Subject B has no contact sheet in the source doc — §5.2 gives the
        // character lock only. This sheet is built to the §4.1/§4.2 pattern
        // from that lock, which is exactly the substitution §2.2 invites.
        label: "Character contact sheet — Subject B",
        prompt:
          "A single 1:1 square image containing exactly 6 different photographs of the same man arranged in a strict 2-row by 3-column grid. Top row: 3 portrait photographs showing his face and body. Bottom row: 3 detail photographs showing ONLY close-ups of wardrobe and footwear — the bottom row does NOT show his face or body.\n\n" +
          "The man: mid-30s, clean-shaven, close-cropped dark hair, warm approachable eyes, natural unretouched skin texture with fine pores visible, quiet fatherly warmth. Wearing an olive khaki shaket over a fitted tee, tan relaxed trousers, clean white sneakers. No accessories.\n\n" +
          "Panel 1 (top left): Close-up portrait head and shoulders, 85mm f/1.8, eyes sharp and warm, dappled morning light through park trees, the hint of a subtle smile. Panel 2 (top centre): Full body head to toe, 35mm f/2.8, mid-stride on a park path, the full outfit visible, weight on the front foot. Panel 3 (top right): Medium three-quarter turn, 50mm f/2, shoulder leading, the shaket falling open. Panel 4 (bottom left — NO FACE, clothing detail only): Extreme close-up of the olive khaki shaket collar and chest pocket, cotton twill weave visible. Panel 5 (bottom centre — NO FACE, clothing detail only): Extreme close-up of the tan relaxed trousers at the knee, fabric drape and fold. Panel 6 (bottom right — NO FACE, clothing detail only): Extreme close-up of the clean white sneakers on wet concrete, specular highlights.\n\n" +
          `Roger Deakins 1917 register. Kodak Portra 400 film stock. ${HECKLER_AVOID} ${NO_TEXT_RULE} 1:1 square format.`,
      },
    ],
    // §5.2 — the crowd moves slowly, it is not frozen, and the glide has to
    // carry micro-texture in the footwork or it reads as a slide.
    video:
      "CUT 1 (0:00–0:05): Wide. 35mm f/2.8. A man in his mid-30s, clean-shaven, close-cropped dark hair, olive khaki shaket over fitted tee, tan trousers, white sneakers — centre-frame, walking through morning commuters heading the opposite direction. Commuters in slow motion — coats flaring, briefcases suspended. He moves at normal speed, shoulder-led, fluid, with the effortless dancer-like glide of Fred Astaire. Park trees, dappled morning light. Deep focus. He is enjoying this. Micro-texture in footwork: little steps, shuffles, weight transfers. Roger Deakins 1917 register. Texture: leaves caught mid-fall, suspended in the morning light.\n\n" +
      "CUT 2 (0:05–0:10): Medium. 50mm f/2. Camera arcing around the man. He executes a clean spin — smooth shoulder-pivot to navigate between two slow-motion commuters. Orbiting from front to side. Micro-texture in feet: little steps, shuffles, weight transfers. Park and shopfronts shift in parallax. Eyes stay warm — not performing, simply moving. A flicker of a subtle smile. Texture: white sneakers on wet concrete, specular highlights.\n\n" +
      "CUT 3 (0:10–0:15): Reverse angle — shot from inside a cafe, through glass. 35mm f/2.8. The man passes outside, gliding past the window. Cafe interior warm and out of focus in foreground — coffee cup, hand, wood table. The man sharp through the glass. Slow-motion commuters drift behind him. A commuter inside turns to watch. Texture: cafe window glass, slight reflections, condensation at the lower edge.\n\n" +
      `${NO_TEXT_RULE} 16:9 widescreen. 15 seconds.`,
  },
  {
    id: "heckler-traffic-light-cascade",
    name: "Heckler · Traffic Light Cascade",
    description:
      "Vertigo dolly-zoom down a cascading row of green lights, bobbleheads doing the emoting. Lock Subject C's vehicle-interior sheet, then run the 3-cut clip.",
    badge: "CS→V",
    order: 14,
    sheets: [
      {
        // §4.2 — Subject C. Through-glass compositions layer interior calm
        // against exterior city; that's a deliberate strategy, not an accident.
        label: "Character contact sheet — Subject C",
        prompt:
          "A single 1:1 square image containing exactly 6 different photographs of the same man arranged in a strict 2-row by 3-column grid. Top row: 3 portrait photographs. Bottom row: 3 detail photographs showing ONLY close-ups of wardrobe, accessories, and environment — NO face.\n\n" +
          "The man: early 50s, Caucasian, angular bone structure, square jaw, trimmed salt-and-pepper beard, wavy salt-and-pepper hair, hazel-brown eyes, crow's feet, weathered complexion, tortoiseshell amber round-to-oval glasses. Wearing tan beige fine-knit crew-neck tee, grey relaxed-fit trousers, tan suede desert boots. Interior of a silver white electric SUV, clean minimal cockpit, CBD traffic and high-rises through the windshield.\n\n" +
          "Panel 1 (top left): Close-up portrait, 85mm f/1.8, seated in a car, through-windshield light, tortoiseshell glasses catching light, expression neutral patient professional. Panel 2 (top centre): Medium shot, 50mm f/2, through side window, city reflections sliding across glass. Panel 3 (top right): Medium interior, 35mm f/2.8, full cockpit, the quiet geometry of a modern EV. Panel 4 (bottom left — NO FACE): Extreme close-up of tortoiseshell amber glasses. Panel 5 (bottom centre — NO FACE): Extreme close-up of steering wheel and his hands. Panel 6 (bottom right — NO FACE): Extreme close-up of tan suede desert boots on car pedal.\n\n" +
          `David Fincher Mindhunter register — geometric control, cold light through automotive glass. Kodak Portra 400 film stock. ${HECKLER_AVOID} ${NO_TEXT_RULE} 1:1 square format.`,
      },
    ],
    // §5.3 — the dolly zoom is the centrepiece of cut 1; the comedy in cut 2
    // is the gap between his flatness and the bobbleheads' enthusiasm.
    video:
      "CUT 1 (0:00–0:05): Wide exterior. 35mm f/2.8. A row of traffic lights stretching into the urban distance — an intersection receding toward the CBD vanishing point. First light turns green, then the second, then a cascade — red to green rippling away. Dolly zoom: camera pushes forward while zooming out, creating the Vertigo compression effect. The lights feel infinite. The road opens like a runway. No character visible. Texture: traffic light hardware, metal poles, wet road surface reflecting the colour change.\n\n" +
      "CUT 2 (0:05–0:10): Close-up interior. 85mm f/1.8. Two bobblehead dog figurines on a car dashboard. They stir — tiny wobble, then full bob. The car is moving. Through the windshield: green lights recede. The driver's hands on the wheel — relaxed, steady, releasing the brake. His expression: deadpan. The figurines do the emoting for him. The contrast between the man's flatness and the dogs' enthusiasm IS the comedy. The man: early 50s, angular bone structure, trimmed salt-and-pepper beard, tortoiseshell glasses, tan fine-knit tee. Texture: spring mechanism of the bobbleheads, the cheap charm of dashboard ornaments in a premium vehicle.\n\n" +
      "CUT 3 (0:10–0:15): Medium interior. 50mm f/2. The man driving forward — silver white electric SUV accelerating through the cleared intersection. Green lights receding, road open, CBD high-rises on both sides. The slightest hint of satisfaction — not a smile, but the absence of frustration. Tortoiseshell glasses catch the green light reflected from the windshield. David Fincher Mindhunter register — geometric control, cold light through automotive glass. Texture: green light reflected in his glasses, matte dashboard, the premium quiet of an EV cabin.\n\n" +
      `${NO_TEXT_RULE} 16:9 widescreen. 15 seconds.`,
  },
];

/**
 * Build one Heckler case into a canvas.
 *
 * Shape, left to right: an optional Asset upload (your own character reference
 * photo) → one or two 1:1 contact sheets → the 3-cut clip, with every sheet
 * wired into the clip's `refImages` port.
 *
 * `refImages` rather than `image`: the sheet is a reference the whole clip
 * should honour, not its opening frame. Cut 1 of every case opens on something
 * the sheet does not show — a hallway in profile, a crowd, a row of traffic
 * lights — so pinning the first frame to a six-panel grid would fight the shot.
 *
 * Native audio is off. The doc's distillation rules drop audio notes, so none
 * of these prompts carries any audio direction; leaving it on would have the
 * engine invent a bed nobody asked for, over footage that gets scored in post.
 */
function buildHecklerCase(c: HecklerCase): CanvasShape {
  const asset = newId("asset");
  const video = newId("vg");
  const videoPv = newId("pv-video");
  const videoPrompt = newId("tp-video");

  const sheets = c.sheets.map((sheet, i) => ({
    sheet,
    promptId: newId(`tp-sheet${i}`),
    genId: newId(`ig-sheet${i}`),
    pvId: newId(`pv-sheet${i}`),
    y: i * 560,
  }));

  return {
    nodes: [
      { id: asset, type: "asset", position: POS(0, 320), data: { form: {} } },
      ...sheets.flatMap(({ sheet, promptId, genId, pvId, y }) => [
        {
          id: promptId,
          type: "textPrompt",
          position: POS(460, y - 120),
          data: { form: textForm(sheet.prompt) },
        },
        {
          id: genId,
          type: "imageGen",
          position: POS(940, y),
          // 1:1 square — the contact sheet grid only reads at square, and
          // every paste-block ends by saying so.
          data: { form: { ...imageForm(), size: "2048x2048" } },
        },
        {
          id: pvId,
          type: "preview",
          position: POS(1340, y),
          data: { form: {} },
        },
      ]),
      {
        id: videoPrompt,
        type: "textPrompt",
        position: POS(1340, sheets.length * 560 + 80),
        data: { form: textForm(c.video) },
      },
      {
        id: video,
        type: "videoGen",
        position: POS(1800, 200),
        data: {
          form: {
            ...videoForm(),
            duration: 15,
            ratio: "16:9",
            audio: false,
          },
        },
      },
      {
        id: videoPv,
        type: "preview",
        position: POS(2240, 200),
        data: { form: {} },
      },
    ],
    edges: [
      ...sheets.flatMap(({ promptId, genId, pvId }) => [
        {
          id: `${promptId}-${genId}-prompt`,
          source: promptId,
          sourceHandle: "prompt",
          target: genId,
          targetHandle: "prompt",
        },
        {
          id: `${asset}-${genId}-image`,
          source: asset,
          sourceHandle: "url",
          target: genId,
          targetHandle: "image",
        },
        {
          id: `${genId}-${pvId}-url`,
          source: genId,
          sourceHandle: "url",
          target: pvId,
          targetHandle: "url",
        },
        {
          id: `${genId}-${video}-refImages`,
          source: genId,
          sourceHandle: "url",
          target: video,
          targetHandle: "refImages",
        },
      ]),
      {
        id: `${videoPrompt}-${video}-prompt`,
        source: videoPrompt,
        sourceHandle: "prompt",
        target: video,
        targetHandle: "prompt",
      },
      {
        id: `${video}-${videoPv}-url`,
        source: video,
        sourceHandle: "url",
        target: videoPv,
        targetHandle: "url",
      },
    ],
  };
}

const hecklerTemplates: readonly StudioTemplate[] = HECKLER_CASES.map((c) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  badge: c.badge,
  order: c.order,
  build: () => buildHecklerCase(c),
}));

export const TEMPLATES: readonly StudioTemplate[] = [
  blank,
  cinematicStill,
  quickClip,
  imageToVideo,
  articleNarration,
  verticalFeedAd,
  referenceCreativePackage,
  garmentShotPackage,
  assetScenePackage,
  creativeUrlPipeline,
  tiktokReferenceClip,
  feedVideoSet,
  ...hecklerTemplates,
] as const;

export function findTemplate(id: string): StudioTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
