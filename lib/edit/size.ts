/**
 * Output sizing for the editor.
 *
 * WHY THIS EXISTS INSTEAD OF pickImageSize().
 *
 * The generator's pickImageSize(aspect, quality) deliberately applies no
 * clamp — its own docblock says so: "Engine may still reject extreme ratios
 * … those land in the route's existing error surface, no client-side clamp."
 * That is already a live bug on the default model: pickImageSize(16:9, "2k")
 * is 3072×1728 = 5,308,416 px, and Seedream 5.0 Pro rejects anything above
 * 4,624,220. Every 4K preset is over too. In the generator that surfaces as
 * a 400 the user can retry their way out of; in the editor it would burn a
 * render on every single attempt at a widescreen edit.
 *
 * So the editor computes its own size. sizeForEdit is a total function: for
 * any model and any source image it returns a "WxH" for which isSizeAllowed()
 * is true, and the test asserts that across the whole model registry.
 *
 * SCOPE OF THAT GUARANTEE — it covers the ceiling only. isSizeAllowed()
 * checks `px <= cap` and nothing else, so "the model will accept this" is a
 * stronger claim than anything here can make. Two open gaps, both inherited
 * rather than introduced:
 *
 *   · lib/studio/models.ts asserts a Seedream LOWER bound of ~3.7 M px in two
 *     places, and nothing anywhere enforces it. MIN_TOTAL_PIXELS below is
 *     262,144 — the *input* floor from the BytePlus docs, which is a
 *     different number for a different thing. If the 3.7 M output floor is
 *     real, a 16:9 source at 1K quality (2048x1152 = 2.36 M) is rejected, and
 *     so is every size pickImageSize produces at those settings. That needs
 *     one authoritative number from the API before either file can enforce it.
 *
 *   · Extreme aspects bottom out at a 128 px short side (16:1 at 1K gives
 *     2048x128) because the floor here is on total pixels. PRD §12.6 lists a
 *     512 px per-side minimum that nothing checks.
 *
 * Two deliberate choices worth knowing:
 *
 * · It never returns "adaptive". That is Seedream's own auto-sizer, which is
 *   not the same thing as "match the input image" — for an edit, aspect drift
 *   between input and output is a defect, not a convenience. A caller that
 *   genuinely wants adaptive should skip this function.
 *
 * · Rounding is always DOWN to a multiple of 8. Flooring can only reduce the
 *   pixel count, so it can never re-cross the ceiling we just scaled under.
 *   Rounding to nearest would reintroduce the very bug this file exists to
 *   prevent, on inputs that sit exactly at the cap.
 */

import {
  DEFAULT_IMAGE_QUALITY_ID,
  clampSizeToModel,
  findImageQuality,
  isSizeAllowed,
  modelMaxPixels,
  type ImageQualityId,
} from "@/lib/studio/models";

/** Engines want even dimensions; 8 is the common denominator across the
 *  Seedream family and leaves room for chroma subsampling. */
const MULTIPLE = 8;

/** Seedream's documented input floor (512×512). Applied to the output too —
 *  a sub-floor render is legal but useless, and asking for one usually means
 *  an extreme aspect at low quality rather than a real intent. */
const MIN_TOTAL_PIXELS = 262_144;

/** Used when a model declares no ceiling (e.g. the fal-hosted gpt-image-2).
 *  The largest ceiling in the registry, so it constrains nothing that any
 *  known model could have rendered anyway — it exists to stop a 6000×4000
 *  source from producing an absurd request. */
const FALLBACK_MAX_PIXELS = 4096 * 4096;

/** BytePlus documents 16:1 through 1:16. A source outside that range gets
 *  its ratio clamped rather than passed through to a guaranteed rejection. */
const MAX_ASPECT = 16;

export type SizeForEditOpts = {
  /** Source image intrinsic dimensions. */
  width: number;
  height: number;
  modelId: string;
  /** "source" (default) keeps the base image's aspect. Anything of the form
   *  "W:H" overrides it. "auto" is treated as "source" — see the docblock on
   *  why this function never emits "adaptive". */
  aspectRatio?: string;
  qualityId?: ImageQualityId;
};

export function sizeForEdit(opts: SizeForEditOpts): string {
  const cap = modelMaxPixels(opts.modelId) ?? FALLBACK_MAX_PIXELS;
  const longSide =
    findImageQuality(opts.qualityId ?? DEFAULT_IMAGE_QUALITY_ID)?.longSide ??
    2048;

  const ratio = resolveRatio(opts);

  // Lay the quality's long side on the longer axis.
  let w: number;
  let h: number;
  if (ratio >= 1) {
    w = longSide;
    h = longSide / ratio;
  } else {
    h = longSide;
    w = longSide * ratio;
  }

  // Scale to fit under the ceiling. sqrt because we're scaling an area.
  const px = w * h;
  if (px > cap) {
    const k = Math.sqrt(cap / px);
    w *= k;
    h *= k;
  } else if (px < MIN_TOTAL_PIXELS) {
    // Only scale up if doing so stays legal. Every real model's cap is an
    // order of magnitude above the floor, so this branch is belt-and-braces.
    const k = Math.sqrt(MIN_TOTAL_PIXELS / px);
    if (px * k * k <= cap) {
      w *= k;
      h *= k;
    }
  }

  const size = `${floorTo(w)}x${floorTo(h)}`;

  // Belt-and-braces. If some future ceiling makes the arithmetic above
  // insufficient, fall back to a known-legal preset rather than shipping a
  // request we already know will 400.
  return isSizeAllowed(size, opts.modelId)
    ? size
    : clampSizeToModel(size, opts.modelId);
}

/**
 * Source aspect, an explicit "W:H", or a safe default — clamped into the
 * range the engine accepts. Returns width/height as a number.
 */
function resolveRatio(opts: SizeForEditOpts): number {
  const explicit = opts.aspectRatio;
  if (explicit && explicit !== "source" && explicit !== "auto") {
    const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(explicit.trim());
    if (m) {
      const w = Number(m[1]);
      const h = Number(m[2]);
      if (w > 0 && h > 0) return clampRatio(w / h);
    }
    // Unparseable ratio strings fall through to the source aspect rather
    // than throwing — a bad stored value shouldn't block a render.
  }

  const { width, height } = opts;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 1; // Unmeasured ref — square is the least surprising guess.
  }
  return clampRatio(width / height);
}

function clampRatio(r: number): number {
  return Math.min(MAX_ASPECT, Math.max(1 / MAX_ASPECT, r));
}

function floorTo(v: number): number {
  return Math.max(MULTIPLE, Math.floor(v / MULTIPLE) * MULTIPLE);
}
