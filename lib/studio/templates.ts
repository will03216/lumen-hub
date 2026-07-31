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

export const TEMPLATES: readonly StudioTemplate[] = [
  blank,
  cinematicStill,
  quickClip,
  imageToVideo,
  articleNarration,
  referenceCreativePackage,
  garmentShotPackage,
  assetScenePackage,
] as const;

export function findTemplate(id: string): StudioTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
