/**
 * The single tolerant reader for layer-separation responses.
 *
 * WHY THIS FILE EXISTS AS ITS OWN THING.
 *
 * Every other upstream shape we consume is documented and stable, so we read
 * it inline and move on. Layer separation is not: it is a *preview* feature,
 * and its own documentation says the response shape is non-final (PRD §10 R1).
 * We have the field names from a spec sheet and a demo page, not from a
 * contract anyone has promised to keep. The realistic failure mode is not "it
 * breaks loudly" — it is `z_index` quietly becoming `zIndex`, or
 * `bounding_box` arriving as a bare `[x, y, w, h]`, and the viewer rendering
 * seventeen layers all stacked at z=0 with nobody able to say why.
 *
 * So all of the tolerance lives here, in one pure function with an exhaustive
 * test table, instead of being sprinkled across the route and the viewer. Two
 * consequences worth stating explicitly:
 *
 *  · It is TOTAL. Any input at all — null, a string, `{}`, `{data: "nope"}` —
 *    returns `{layers: [], unknown: [], warnings: [...]}`. It never throws.
 *    A route that has already spent a paid upstream call must not then 500 on
 *    a parse; it should hand back what it understood plus a note about what it
 *    didn't.
 *
 *  · Entries it does NOT recognise are echoed verbatim into `unknown[]`, and
 *    the route puts that array on the wire. That is deliberate: when the shape
 *    drifts, whoever is looking at the failure can open the network tab, see
 *    the actual upstream entry, and fix the mapping — without a redeploy to
 *    add logging, and without a BYOK key of their own to reproduce with.
 *
 * ON BOUNDING BOXES. Upstream nominally sends both `absolute` (source pixels)
 * and `normalized` (the same 0–1000 integer space the annotation tags use).
 * In practice we may get one, the other, both, or a bare 4-array. We derive
 * the missing form from `sourceDims` when we can. Note that the derivation is
 * agnostic to whether the tuple means `[x1,y1,x2,y2]` or `[x,y,w,h]` — either
 * way components 0 and 2 scale by width and components 1 and 3 scale by
 * height — which is fortunate, because the spec doesn't say which it is.
 *
 * ON THE BACKGROUND PLATE. Entry 0 is documented as the background: `z_index`
 * 0, no bbox, no name, full canvas. Detecting it matters because a viewer that
 * gets this wrong composites the background over everything and shows a blank
 * frame. We therefore detect it two ways — the explicit `z_index === 0`, and
 * the "no bbox, no name, full-canvas size" heuristic for when `z_index` is
 * missing entirely — because the two failure modes are independent.
 */

/** A layer the viewer can actually mount. Every optional field is optional
 *  because upstream may omit it, not because we don't want it. */
export type NormalizedLayer = {
  /** Position in the raw `data[]` array. Kept even though we sort, so a
   *  network-tab entry can be matched to a rendered layer by eye. */
  index: number;
  /** 0 = background plate. Falls back to `index` when upstream omits it. */
  zIndex: number;
  url?: string;
  b64?: string;
  size?: string;
  name?: string;
  description?: string;
  bboxAbsolute?: [number, number, number, number];
  bboxNormalized?: [number, number, number, number];
};

export type NormalizedLayerResponse = {
  /** Sorted by `zIndex` ascending, background first — i.e. paint order. */
  layers: NormalizedLayer[];
  /** Entries we could not read, verbatim. Diagnostic, not for rendering. */
  unknown: unknown[];
  /** Human-readable, safe to surface in the UI. Not errors — a response can
   *  be perfectly usable and still warrant a note. */
  warnings: string[];
};

/** Pixel dimensions of the image that was sent up. Optional because the
 *  caller may not know them (a remote URL it never decoded); without them we
 *  simply can't derive one bbox form from the other, and say so. */
export type SourceDims = { width: number; height: number };

type Vec4 = [number, number, number, number];

/** The 0–1000 integer coordinate space shared with the annotation tags. */
const NORM_MAX = 1000;

/** 1 background plate + at most 16 layers. Anything past this is drift worth
 *  flagging, but not worth discarding — a caller can still use layer 18. */
const MAX_EXPECTED_ENTRIES = 17;

export function normalizeLayerResponse(
  res: unknown,
  sourceDims?: SourceDims,
): NormalizedLayerResponse {
  const warnings: string[] = [];
  const unknown: unknown[] = [];

  const data = extractData(res);
  if (!data) {
    warnings.push(
      "The layer response had no readable data array, so nothing could be separated out of it.",
    );
    return { layers: [], unknown, warnings };
  }

  const dims = validDims(sourceDims);
  // Per-entry problems are counted and reported once at the end. Seventeen
  // copies of "z_index missing" is noise that buries the one warning that
  // actually mattered.
  let missingZ = 0;
  let bareArrayBoxes = 0;
  let underivable = 0;
  let heuristicBackgrounds = 0;

  const layers: NormalizedLayer[] = [];
  data.forEach((entry, index) => {
    if (!isRecord(entry)) {
      unknown.push(entry);
      return;
    }

    const url = str(entry.url);
    // `b64Json` is the camelCase drift of the documented `b64_json`; `b64` is
    // what the demo page's own JS calls it.
    const b64 = str(entry.b64_json) ?? str(entry.b64Json) ?? str(entry.b64);
    if (!url && !b64) {
      // An entry with no image payload is not a layer by any reading — it is
      // either a new envelope shape or an upstream error stub. Either way the
      // viewer can't render it, so it goes out for inspection instead.
      unknown.push(entry);
      return;
    }

    const name = str(entry.name);
    const description = str(entry.description);
    const size = str(entry.size);

    const rawZ = num(entry.z_index) ?? num(entry.zIndex);
    const rawBox = entry.bounding_box ?? entry.boundingBox ?? entry.bbox;
    const box = readBox(rawBox);
    if (box.wasBareArray) bareArrayBoxes++;

    let bboxAbsolute = box.absolute;
    let bboxNormalized = box.normalized;
    if (dims) {
      if (bboxAbsolute && !bboxNormalized) {
        bboxNormalized = scale4(bboxAbsolute, NORM_MAX / dims.width, NORM_MAX / dims.height, NORM_MAX);
      } else if (bboxNormalized && !bboxAbsolute) {
        bboxAbsolute = scale4(bboxNormalized, dims.width / NORM_MAX, dims.height / NORM_MAX);
      }
    } else if ((bboxAbsolute && !bboxNormalized) || (bboxNormalized && !bboxAbsolute)) {
      underivable++;
    }

    const hasBox = Boolean(bboxAbsolute ?? bboxNormalized);
    // The heuristic half of background detection: no box to place it by, no
    // name to call it, and it covers the whole canvas. Only reachable when
    // `size` and `sourceDims` are both known — without them "full canvas" is
    // unknowable and we'd rather fall back to the array index than guess.
    const looksLikeBackground = !hasBox && !name && isFullCanvas(size, dims);

    let zIndex: number;
    if (rawZ !== undefined) {
      // Explicit wins, always. Upstream knows its own stacking order better
      // than our heuristic does, including the case where the background
      // genuinely isn't first in the array.
      zIndex = Math.round(rawZ);
    } else if (looksLikeBackground) {
      zIndex = 0;
      heuristicBackgrounds++;
    } else {
      // Array order is the documented stacking order, so it is the right
      // fallback — but it is a guess, and the caller is told so.
      zIndex = index;
      missingZ++;
    }

    layers.push({
      index,
      zIndex,
      ...(url ? { url } : {}),
      ...(b64 ? { b64 } : {}),
      ...(size ? { size } : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(bboxAbsolute ? { bboxAbsolute } : {}),
      ...(bboxNormalized ? { bboxNormalized } : {}),
    });
  });

  // Paint order, background first. Sorting here rather than in the viewer
  // because this is the only place that knows how much of `zIndex` was
  // inferred; `index` breaks ties so the sort stays deterministic on the
  // all-fell-back-to-index case.
  layers.sort((a, b) => a.zIndex - b.zIndex || a.index - b.index);

  if (data.length === 0) {
    warnings.push("The layer response contained no images at all.");
  }
  if (data.length > MAX_EXPECTED_ENTRIES) {
    warnings.push(
      `The model returned ${data.length} entries; the documented maximum is ${MAX_EXPECTED_ENTRIES} (1 background plate plus 16 layers). All of them were kept.`,
    );
  }
  if (layers.length === 1) {
    // The empty-viewer trap: one entry means the model handed the picture
    // back unsplit. Showing a "layer viewer" with a single layer in it reads
    // as a broken feature, so the caller gets told what actually happened.
    warnings.push(
      "Only one image came back, so nothing was separated — the model returned the picture unchanged. Try a different image or describe the element you want isolated.",
    );
  }
  if (layers.length === 0 && unknown.length > 0) {
    warnings.push(
      `None of the ${unknown.length} entries in the response looked like a layer. The response shape may have changed upstream; the raw entries are included for inspection.`,
    );
  } else if (unknown.length > 0) {
    warnings.push(
      `${unknown.length} of ${data.length} entries could not be read as layers and were skipped.`,
    );
  }
  if (missingZ > 0) {
    warnings.push(
      `${missingZ} ${plural(missingZ, "layer")} arrived without a stacking order; their position in the response was used instead.`,
    );
  }
  if (bareArrayBoxes > 0) {
    warnings.push(
      `${bareArrayBoxes} bounding ${plural(bareArrayBoxes, "box", "boxes")} arrived as a plain 4-number array and ${bareArrayBoxes === 1 ? "was" : "were"} read as absolute pixels.`,
    );
  }
  if (underivable > 0) {
    warnings.push(
      `${underivable} bounding ${plural(underivable, "box", "boxes")} had only one coordinate space and the source dimensions were not supplied, so the other could not be derived.`,
    );
  }
  if (heuristicBackgrounds > 1) {
    // One is the expected background plate. Two or more means the heuristic
    // is matching things it shouldn't, and the viewer will stack them.
    warnings.push(
      `${heuristicBackgrounds} entries looked like a full-canvas background plate; they were all placed at the bottom of the stack.`,
    );
  }

  return { layers, unknown, warnings };
}

/* ------------------------------------------------------------------ */
/* Coercion helpers. All of these answer "is it this?" with a value or
   undefined — never a throw, never a partial. */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The `data[]` array, wherever it turns out to live. We accept a bare array
 *  as the whole response too: it costs one line and covers the plausible
 *  "envelope removed" drift. */
function extractData(res: unknown): unknown[] | undefined {
  if (Array.isArray(res)) return res;
  if (!isRecord(res)) return undefined;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.images)) return res.images;
  if (Array.isArray(res.layers)) return res.layers;
  return undefined;
}

/** Non-empty trimmed string, or undefined. Trimming matters for `name`,
 *  which the model sometimes pads. */
function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** Finite number, tolerating the numeric-string form — JSON that has been
 *  round-tripped through a typed backend loses number-ness surprisingly
 *  often, and `"3"` is unambiguous. */
function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function vec4(v: unknown): Vec4 | undefined {
  if (!Array.isArray(v) || v.length !== 4) return undefined;
  const a = num(v[0]);
  const b = num(v[1]);
  const c = num(v[2]);
  const d = num(v[3]);
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return undefined;
  }
  return [a, b, c, d];
}

/**
 * Read whichever bounding-box form arrived.
 *
 * A bare 4-array is assumed to be ABSOLUTE pixels. It's a coin-flip in
 * principle — a normalized box is also four numbers — but absolute is the
 * form a stripped-down response would most plausibly collapse to, and the
 * assumption is reported in `warnings` so a wrong guess is visible rather
 * than silent. Don't replace this with a magnitude sniff: a small object in a
 * large image produces absolute coordinates well under 1000, so "all values
 * <= 1000 means normalized" would misread exactly the boxes that matter.
 */
function readBox(raw: unknown): {
  absolute?: Vec4;
  normalized?: Vec4;
  wasBareArray: boolean;
} {
  const bare = vec4(raw);
  if (bare) return { absolute: bare, wasBareArray: true };
  if (!isRecord(raw)) return { wasBareArray: false };
  return {
    absolute: vec4(raw.absolute),
    normalized: vec4(raw.normalized),
    wasBareArray: false,
  };
}

/** Scale a tuple componentwise: 0 and 2 by x, 1 and 3 by y. Works for both
 *  `[x1,y1,x2,y2]` and `[x,y,w,h]`, which is why we can derive one space from
 *  the other without knowing which convention upstream used. */
function scale4(v: Vec4, sx: number, sy: number, clampMax?: number): Vec4 {
  const out = [v[0] * sx, v[1] * sy, v[2] * sx, v[3] * sy].map((n) => {
    const r = Math.round(n);
    if (clampMax === undefined) return Math.max(0, r);
    return Math.min(clampMax, Math.max(0, r));
  });
  return out as Vec4;
}

/** Positive, finite, integral-enough dimensions — anything else and every
 *  derived coordinate would be garbage, so we treat dims as absent. */
function validDims(d: SourceDims | undefined): SourceDims | undefined {
  if (!d) return undefined;
  const w = num(d.width);
  const h = num(d.height);
  if (w === undefined || h === undefined || w <= 0 || h <= 0) return undefined;
  return { width: w, height: h };
}

/** Does this entry's `size` string cover the whole source frame? Tolerates
 *  the `×` separator some responses use. A 1 px slack absorbs the rounding
 *  upstream does when it echoes the size back. */
function isFullCanvas(size: string | undefined, dims: SourceDims | undefined): boolean {
  if (!size || !dims) return false;
  const m = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(size);
  if (!m) return false;
  return (
    Math.abs(Number(m[1]) - dims.width) <= 1 && Math.abs(Number(m[2]) - dims.height) <= 1
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}
