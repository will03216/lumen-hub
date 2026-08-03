/**
 * normalizeLayerResponse — the test table IS the specification.
 *
 * The upstream shape is preview-flagged and documented as non-final (PRD §10
 * R1), which means the usual "assert the happy path and move on" is exactly
 * wrong here: the happy path is the case least likely to break. Each block
 * below is a shape we have concrete reason to expect — a camelCase
 * serializer, a stripped bounding box, a missing z_index, a response that
 * didn't separate anything — and the point of enumerating them in one file is
 * that when the shape does drift, the fix is a new row here rather than an
 * archaeology session across the route and the viewer.
 *
 * The garbage block matters as much as the rest. This function runs after a
 * paid upstream call has already succeeded; throwing there would turn a
 * partially-readable response into a 500 and lose the evidence.
 */

import { describe, expect, it } from "vitest";
import { normalizeLayerResponse } from "./layers-normalize";

/** Matches the PRD's worked example: 2K widescreen source. */
const DIMS = { width: 2048, height: 1152 };

/** The shape as documented: entry 0 is the background plate (z 0, no bbox, no
 *  name), entries 1..n carry z_index, both bbox spaces, name and description. */
function documentedResponse() {
  return {
    created: 1770000000,
    data: [
      { url: "https://cdn.example/bg.png", size: "2048x1152", z_index: 0 },
      {
        url: "https://cdn.example/l1.png",
        size: "2048x1152",
        z_index: 1,
        name: "red umbrella",
        description: "A red umbrella held above the subject.",
        bounding_box: {
          absolute: [400, 100, 900, 600],
          normalized: [195, 87, 439, 521],
        },
      },
      {
        url: "https://cdn.example/l2.png",
        size: "2048x1152",
        z_index: 2,
        name: "subject",
        description: "The person in the foreground.",
        bounding_box: {
          absolute: [700, 300, 1300, 1100],
          normalized: [342, 260, 635, 955],
        },
      },
    ],
  };
}

describe("the documented shape", () => {
  it("reads every field off every entry", () => {
    const { layers, unknown, warnings } = normalizeLayerResponse(
      documentedResponse(),
      DIMS,
    );

    expect(unknown).toEqual([]);
    expect(warnings).toEqual([]);
    expect(layers).toHaveLength(3);

    expect(layers[0]).toEqual({
      index: 0,
      zIndex: 0,
      url: "https://cdn.example/bg.png",
      size: "2048x1152",
    });
    expect(layers[1]).toEqual({
      index: 1,
      zIndex: 1,
      url: "https://cdn.example/l1.png",
      size: "2048x1152",
      name: "red umbrella",
      description: "A red umbrella held above the subject.",
      bboxAbsolute: [400, 100, 900, 600],
      bboxNormalized: [195, 87, 439, 521],
    });
    expect(layers[2].name).toBe("subject");
  });

  it("returns layers in paint order, background first", () => {
    const res = documentedResponse();
    // Same three layers, shuffled on the wire. Order in data[] is not a
    // contract; z_index is.
    res.data = [res.data[2], res.data[0], res.data[1]];
    const { layers } = normalizeLayerResponse(res, DIMS);
    expect(layers.map((l) => l.zIndex)).toEqual([0, 1, 2]);
    // …and `index` still points back at the raw entry for diagnosis.
    expect(layers.map((l) => l.index)).toEqual([1, 2, 0]);
  });

  it("works without source dimensions when both bbox spaces are present", () => {
    const { layers, warnings } = normalizeLayerResponse(documentedResponse());
    expect(layers[1].bboxAbsolute).toEqual([400, 100, 900, 600]);
    expect(layers[1].bboxNormalized).toEqual([195, 87, 439, 521]);
    expect(warnings).toEqual([]);
  });
});

describe("key casing drift", () => {
  it("accepts camelCase zIndex and boundingBox", () => {
    const { layers, warnings } = normalizeLayerResponse(
      {
        data: [
          { url: "bg.png", size: "2048x1152", zIndex: 0 },
          {
            url: "l1.png",
            zIndex: 1,
            name: "lamp",
            boundingBox: {
              absolute: [10, 20, 30, 40],
              normalized: [5, 17, 15, 35],
            },
          },
        ],
      },
      DIMS,
    );
    expect(layers.map((l) => l.zIndex)).toEqual([0, 1]);
    expect(layers[1].bboxAbsolute).toEqual([10, 20, 30, 40]);
    expect(layers[1].bboxNormalized).toEqual([5, 17, 15, 35]);
    expect(warnings).toEqual([]);
  });

  it("accepts snake_case and camelCase mixed within one response", () => {
    const { layers } = normalizeLayerResponse(
      {
        data: [
          { url: "a.png", z_index: 3, boundingBox: { absolute: [0, 0, 8, 8] } },
          { url: "b.png", zIndex: 4, bounding_box: { absolute: [1, 1, 9, 9] } },
        ],
      },
      DIMS,
    );
    expect(layers.map((l) => l.zIndex)).toEqual([3, 4]);
    expect(layers[0].bboxAbsolute).toEqual([0, 0, 8, 8]);
    expect(layers[1].bboxAbsolute).toEqual([1, 1, 9, 9]);
  });
});

describe("bounding_box as a bare 4-array", () => {
  it("reads it as absolute pixels and derives the normalized form", () => {
    const { layers, warnings } = normalizeLayerResponse(
      { data: [{ url: "l.png", z_index: 1, name: "x", bounding_box: [100, 200, 300, 400] }] },
      DIMS,
    );
    expect(layers[0].bboxAbsolute).toEqual([100, 200, 300, 400]);
    expect(layers[0].bboxNormalized).toEqual([49, 174, 146, 347]);
    // The assumption is a guess, so it must be visible rather than silent.
    expect(warnings.some((w) => /plain 4-number array/.test(w))).toBe(true);
  });

  it("ignores an array that isn't four numbers", () => {
    const { layers } = normalizeLayerResponse(
      { data: [{ url: "l.png", z_index: 1, bounding_box: [1, 2, 3] }] },
      DIMS,
    );
    expect(layers[0].bboxAbsolute).toBeUndefined();
    expect(layers[0].bboxNormalized).toBeUndefined();
  });

  it("tolerates numeric strings inside the tuple", () => {
    const { layers } = normalizeLayerResponse(
      { data: [{ url: "l.png", z_index: "2", bounding_box: ["100", "200", "300", "400"] }] },
      DIMS,
    );
    expect(layers[0].zIndex).toBe(2);
    expect(layers[0].bboxAbsolute).toEqual([100, 200, 300, 400]);
  });
});

describe("deriving the missing coordinate space", () => {
  it("absolute-only → normalized from source dims", () => {
    const { layers, warnings } = normalizeLayerResponse(
      {
        data: [
          { url: "l.png", z_index: 1, name: "x", bounding_box: { absolute: [100, 200, 300, 400] } },
        ],
      },
      DIMS,
    );
    expect(layers[0].bboxNormalized).toEqual([49, 174, 146, 347]);
    expect(warnings.some((w) => /could not be derived/.test(w))).toBe(false);
  });

  it("normalized-only → absolute from source dims", () => {
    const { layers } = normalizeLayerResponse(
      {
        data: [
          { url: "l.png", z_index: 1, name: "x", bounding_box: { normalized: [100, 200, 300, 400] } },
        ],
      },
      DIMS,
    );
    expect(layers[0].bboxAbsolute).toEqual([205, 230, 614, 461]);
  });

  it("clamps a derived normalized box into the 0–1000 space", () => {
    // An absolute box that overshoots the frame — upstream rounding, or a box
    // measured against a pre-crop source. The normalized space has a hard
    // ceiling, so we clamp rather than emit 1200.
    const { layers } = normalizeLayerResponse(
      { data: [{ url: "l.png", z_index: 1, name: "x", bounding_box: { absolute: [-40, 0, 4096, 2304] } }] },
      DIMS,
    );
    expect(layers[0].bboxNormalized).toEqual([0, 0, 1000, 1000]);
  });

  it("keeps what it has and says so when source dims are unknown", () => {
    const { layers, warnings } = normalizeLayerResponse({
      data: [{ url: "l.png", z_index: 1, name: "x", bounding_box: { absolute: [100, 200, 300, 400] } }],
    });
    expect(layers[0].bboxAbsolute).toEqual([100, 200, 300, 400]);
    expect(layers[0].bboxNormalized).toBeUndefined();
    expect(warnings.some((w) => /could not be derived/.test(w))).toBe(true);
  });

  it("treats nonsense source dims as no source dims", () => {
    const { layers } = normalizeLayerResponse(
      { data: [{ url: "l.png", z_index: 1, name: "x", bounding_box: { absolute: [1, 2, 3, 4] } }] },
      { width: 0, height: -5 },
    );
    expect(layers[0].bboxNormalized).toBeUndefined();
  });
});

describe("missing z_index", () => {
  it("falls back to the array position and warns", () => {
    const { layers, warnings } = normalizeLayerResponse(
      {
        data: [
          { url: "a.png", name: "a", bounding_box: { absolute: [0, 0, 10, 10] } },
          { url: "b.png", name: "b", bounding_box: { absolute: [0, 0, 10, 10] } },
          { url: "c.png", name: "c", bounding_box: { absolute: [0, 0, 10, 10] } },
        ],
      },
      DIMS,
    );
    expect(layers.map((l) => l.zIndex)).toEqual([0, 1, 2]);
    expect(warnings.some((w) => /without a stacking order/.test(w))).toBe(true);
  });

  it("reports the fallback once, not once per layer", () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      url: `l${i}.png`,
      name: `l${i}`,
      bounding_box: { absolute: [0, 0, 10, 10] },
    }));
    const { warnings } = normalizeLayerResponse({ data }, DIMS);
    const stacking = warnings.filter((w) => /without a stacking order/.test(w));
    expect(stacking).toHaveLength(1);
    expect(stacking[0]).toMatch(/^6 layers/);
  });
});

describe("background detection", () => {
  it("detects the plate by an explicit z_index of 0", () => {
    const { layers } = normalizeLayerResponse(documentedResponse(), DIMS);
    expect(layers[0].zIndex).toBe(0);
    expect(layers[0].name).toBeUndefined();
  });

  it("detects the plate by heuristic — no bbox, no name, full canvas", () => {
    // The plate is LAST in data[], so the array-index fallback would put it at
    // z 2 and the viewer would paint it over everything. Only the heuristic
    // saves this.
    const { layers, warnings } = normalizeLayerResponse(
      {
        data: [
          { url: "l1.png", z_index: 1, name: "hat", bounding_box: { absolute: [0, 0, 10, 10] } },
          { url: "l2.png", z_index: 2, name: "cat", bounding_box: { absolute: [0, 0, 10, 10] } },
          { url: "bg.png", size: "2048x1152" },
        ],
      },
      DIMS,
    );
    expect(layers[0]).toMatchObject({ index: 2, zIndex: 0, url: "bg.png" });
    // The heuristic fired, so nothing fell back to the array index.
    expect(warnings.some((w) => /without a stacking order/.test(w))).toBe(false);
  });

  it("does not fire the heuristic on a named or boxed entry", () => {
    const { layers } = normalizeLayerResponse(
      {
        data: [
          { url: "l1.png", z_index: 1, name: "hat", bounding_box: { absolute: [0, 0, 10, 10] } },
          // Full canvas, but it has a name — it's a full-frame layer (a sky
          // replacement, a colour grade), not the plate.
          { url: "sky.png", size: "2048x1152", name: "sky" },
        ],
      },
      DIMS,
    );
    const sky = layers.find((l) => l.url === "sky.png")!;
    expect(sky.zIndex).toBe(1); // array index, not 0
  });

  it("does not fire the heuristic when the size is not the full canvas", () => {
    const { layers } = normalizeLayerResponse(
      {
        data: [
          { url: "l1.png", z_index: 1, name: "hat", bounding_box: { absolute: [0, 0, 10, 10] } },
          { url: "crop.png", size: "512x512" },
        ],
      },
      DIMS,
    );
    expect(layers.find((l) => l.url === "crop.png")!.zIndex).toBe(1);
  });

  it("lets an explicit z_index override the heuristic", () => {
    // Upstream knows its own stacking order; a full-canvas entry that says
    // z 5 is a full-canvas entry at z 5.
    const { layers } = normalizeLayerResponse(
      {
        data: [
          { url: "bg.png", size: "2048x1152", z_index: 5 },
          { url: "l.png", z_index: 1, name: "x", bounding_box: { absolute: [0, 0, 10, 10] } },
        ],
      },
      DIMS,
    );
    expect(layers.map((l) => l.zIndex)).toEqual([1, 5]);
  });

  it("warns when more than one entry looks like a plate", () => {
    const { warnings } = normalizeLayerResponse(
      {
        data: [
          { url: "bg1.png", size: "2048x1152" },
          { url: "bg2.png", size: "2048x1152" },
          { url: "l.png", z_index: 1, name: "x", bounding_box: { absolute: [0, 0, 10, 10] } },
        ],
      },
      DIMS,
    );
    expect(warnings.some((w) => /looked like a full-canvas background plate/.test(w))).toBe(true);
  });
});

describe("entry counts", () => {
  it("keeps everything past the documented 17 and flags the overflow", () => {
    const data = Array.from({ length: 21 }, (_, i) => ({
      url: `l${i}.png`,
      z_index: i,
      name: i === 0 ? undefined : `layer ${i}`,
    }));
    const { layers, warnings } = normalizeLayerResponse({ data }, DIMS);
    // Dropping data we were paid to fetch is worse than rendering 21 layers.
    expect(layers).toHaveLength(21);
    expect(warnings.some((w) => /returned 21 entries/.test(w))).toBe(true);
  });

  it("says nothing was separated when exactly one entry comes back", () => {
    const { layers, warnings } = normalizeLayerResponse(
      { created: 1, data: [{ url: "same.png", size: "2048x1152", z_index: 0 }] },
      DIMS,
    );
    // The layer is still returned — the caller decides whether to show it —
    // but the warning is what stops this rendering as an empty viewer.
    expect(layers).toHaveLength(1);
    expect(warnings.some((w) => /nothing was separated/.test(w))).toBe(true);
  });

  it("flags a response whose data array is empty", () => {
    const { layers, warnings } = normalizeLayerResponse({ created: 1, data: [] }, DIMS);
    expect(layers).toEqual([]);
    expect(warnings.some((w) => /no images at all/.test(w))).toBe(true);
  });
});

describe("payload variants", () => {
  it("reads b64_json when there is no url", () => {
    const { layers } = normalizeLayerResponse(
      {
        data: [
          { b64_json: "iVBORw0KGgo=", size: "2048x1152", z_index: 0 },
          { b64_json: "AAAA", z_index: 1, name: "x" },
        ],
      },
      DIMS,
    );
    expect(layers[0].b64).toBe("iVBORw0KGgo=");
    expect(layers[0].url).toBeUndefined();
    expect(layers[1].b64).toBe("AAAA");
  });

  it("reads the camelCase b64Json and bare b64 spellings", () => {
    const { layers } = normalizeLayerResponse(
      { data: [{ b64Json: "AA", z_index: 0 }, { b64: "BB", z_index: 1 }] },
      DIMS,
    );
    expect(layers.map((l) => l.b64)).toEqual(["AA", "BB"]);
  });

  it("keeps both when url and b64_json are present", () => {
    const { layers } = normalizeLayerResponse(
      { data: [{ url: "u.png", b64_json: "AA", z_index: 0 }] },
      DIMS,
    );
    expect(layers[0]).toMatchObject({ url: "u.png", b64: "AA" });
  });

  it("accepts a bare array as the whole response", () => {
    const { layers } = normalizeLayerResponse(
      [{ url: "a.png", z_index: 0 }, { url: "b.png", z_index: 1, name: "x" }],
      DIMS,
    );
    expect(layers).toHaveLength(2);
  });
});

describe("unrecognised entries", () => {
  it("echoes them verbatim instead of dropping them", () => {
    const weird = { asset: { href: "https://cdn.example/x.png" }, layer_order: 2 };
    const { layers, unknown, warnings } = normalizeLayerResponse(
      { data: [{ url: "bg.png", size: "2048x1152", z_index: 0 }, weird, null, "nope", 7] },
      DIMS,
    );
    expect(layers).toHaveLength(1);
    // Verbatim — this is what someone reads out of the network tab when the
    // shape moves, so it must not be reshaped on the way out.
    expect(unknown).toEqual([weird, null, "nope", 7]);
    expect(unknown[0]).toBe(weird);
    expect(warnings.some((w) => /could not be read as layers/.test(w))).toBe(true);
  });

  it("flags a total shape change loudly", () => {
    const { layers, unknown, warnings } = normalizeLayerResponse(
      { data: [{ href: "a.png" }, { href: "b.png" }] },
      DIMS,
    );
    expect(layers).toEqual([]);
    expect(unknown).toHaveLength(2);
    expect(warnings.some((w) => /shape may have changed upstream/.test(w))).toBe(true);
  });
});

describe("garbage in, empty out — never a throw", () => {
  const garbage: unknown[] = [
    null,
    undefined,
    "nope",
    42,
    true,
    {},
    { data: "nope" },
    { data: null },
    { data: 5 },
    { created: 1 },
    [],
    { data: [null, undefined, "x"] },
    { data: [[]] },
  ];

  for (const input of garbage) {
    it(`survives ${JSON.stringify(input) ?? "undefined"}`, () => {
      const out = normalizeLayerResponse(input, DIMS);
      expect(out.layers).toEqual([]);
      expect(Array.isArray(out.unknown)).toBe(true);
      // Silence would be the real failure — the caller has nothing else to go on.
      expect(out.warnings.length).toBeGreaterThan(0);
    });
  }

  it("survives garbage source dimensions too", () => {
    const bad = { width: NaN, height: Infinity } as unknown as {
      width: number;
      height: number;
    };
    expect(() => normalizeLayerResponse(documentedResponse(), bad)).not.toThrow();
  });

  it("does not mutate the response it was given", () => {
    const res = documentedResponse();
    const snapshot = JSON.parse(JSON.stringify(res));
    normalizeLayerResponse(res, DIMS);
    expect(res).toEqual(snapshot);
  });
});
