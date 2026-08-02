/**
 * How a scene's images reach the video model.
 *
 * Two separate mechanisms that must not be conflated:
 *
 *   references — WHO/WHAT appears. Roles subject / environment. The model
 *                reads identity from these.
 *   images     — literal frames. first_frame / last_frame pin the clip's
 *                endpoints and the model interpolates between them;
 *                reference_image is loose visual guidance.
 *
 * Sending a character portrait as a first_frame would force the clip to open
 * on that portrait — a completely different result from using it as a subject
 * reference, which is why the mapping is pinned here.
 */

import { describe, expect, it } from "vitest";
import {
  inheritedAssetKeys,
  resolveSceneAssets,
  sceneAssetCount,
  type SceneAssets,
} from "./stories";
import { isAcceptedImageSource, isPubliclyFetchable } from "./image-format";

/** Mirrors the payload construction in lib/story/use-story-generation.ts. */
function buildPayload(assets: SceneAssets) {
  const references: Array<{ type: "image"; role: "subject" | "environment"; url: string }> = [];
  if (assets.character) references.push({ type: "image", role: "subject", url: assets.character });
  if (assets.background) references.push({ type: "image", role: "environment", url: assets.background });
  if (assets.prop) references.push({ type: "image", role: "subject", url: assets.prop });

  const images: Array<{ url: string; role: "first_frame" | "last_frame" | "reference_image" }> = [];
  if (assets.firstFrame) images.push({ url: assets.firstFrame, role: "first_frame" });
  if (assets.lastFrame) images.push({ url: assets.lastFrame, role: "last_frame" });
  for (const url of assets.refImages ?? []) {
    if (url?.trim()) images.push({ url: url.trim(), role: "reference_image" });
  }

  return {
    ...(references.length > 0 ? { references } : {}),
    ...(images.length > 0 ? { images } : {}),
  };
}

const A = "https://cdn.example.com/a.png";
const B = "https://cdn.example.com/b.png";
const C = "https://cdn.example.com/c.png";

describe("subject references", () => {
  it("maps character and prop to subject, background to environment", () => {
    const { references } = buildPayload({ character: A, background: B, prop: C });
    expect(references).toEqual([
      { type: "image", role: "subject", url: A },
      { type: "image", role: "environment", url: B },
      { type: "image", role: "subject", url: C },
    ]);
  });

  it("never emits subject references as frames", () => {
    const payload = buildPayload({ character: A, background: B, prop: C });
    expect(payload.images).toBeUndefined();
  });
});

describe("frames", () => {
  it("maps first and last frame to their roles", () => {
    const { images } = buildPayload({ firstFrame: A, lastFrame: B });
    expect(images).toEqual([
      { url: A, role: "first_frame" },
      { url: B, role: "last_frame" },
    ]);
  });

  it("allows a last frame with no first frame", () => {
    // Landing on a known pose without dictating the opening is legitimate.
    const { images } = buildPayload({ lastFrame: B });
    expect(images).toEqual([{ url: B, role: "last_frame" }]);
  });

  it("keeps frames out of references", () => {
    expect(buildPayload({ firstFrame: A, lastFrame: B }).references).toBeUndefined();
  });

  it("orders first frame before last frame", () => {
    const { images } = buildPayload({ lastFrame: B, firstFrame: A });
    expect(images!.map((i) => i.role)).toEqual(["first_frame", "last_frame"]);
  });
});

describe("extra reference images", () => {
  it("maps each to reference_image, after the frames", () => {
    const { images } = buildPayload({ firstFrame: A, refImages: [B, C] });
    expect(images).toEqual([
      { url: A, role: "first_frame" },
      { url: B, role: "reference_image" },
      { url: C, role: "reference_image" },
    ]);
  });

  it("trims and skips blank entries rather than sending empty urls", () => {
    const { images } = buildPayload({ refImages: ["  " + A + "  ", "", "   "] });
    expect(images).toEqual([{ url: A, role: "reference_image" }]);
  });

  it("omits images entirely when the array is empty", () => {
    expect(buildPayload({ refImages: [] }).images).toBeUndefined();
  });
});

describe("combined", () => {
  it("sends both mechanisms together without cross-contamination", () => {
    const payload = buildPayload({
      character: A,
      firstFrame: B,
      refImages: [C],
    });
    expect(payload.references).toEqual([{ type: "image", role: "subject", url: A }]);
    expect(payload.images).toEqual([
      { url: B, role: "first_frame" },
      { url: C, role: "reference_image" },
    ]);
  });

  it("sends nothing at all for an empty scene", () => {
    expect(buildPayload({})).toEqual({});
  });
});

describe("sceneAssetCount", () => {
  it("counts every slot including the array", () => {
    expect(
      sceneAssetCount({
        character: A,
        background: B,
        prop: C,
        firstFrame: A,
        lastFrame: B,
        refImages: [A, B, C],
      }),
    ).toBe(8);
  });

  it("is zero for an empty scene and ignores an empty array", () => {
    expect(sceneAssetCount({})).toBe(0);
    expect(sceneAssetCount({ refImages: [] })).toBe(0);
  });

  it("counts old scenes that predate the new fields", () => {
    // Stories saved before frames existed must still report correctly.
    expect(sceneAssetCount({ character: A, background: B })).toBe(2);
  });
});

// ─────────────────── Story-wide defaults ───────────────────

describe("resolveSceneAssets", () => {
  it("uses the story default when the scene sets nothing", () => {
    expect(resolveSceneAssets({}, { character: A })).toEqual({ character: A });
  });

  it("lets the scene override the story", () => {
    expect(resolveSceneAssets({ character: B }, { character: A })).toEqual({ character: B });
  });

  it("merges PER FIELD, not all-or-nothing", () => {
    // The whole point: a scene overriding its first frame must still inherit
    // the story's character rather than losing every default.
    const out = resolveSceneAssets({ firstFrame: C }, { character: A, background: B });
    expect(out).toEqual({ character: A, background: B, firstFrame: C });
  });

  it("treats a blank string as unset so it does not mask the default", () => {
    expect(resolveSceneAssets({ character: "   " }, { character: A })).toEqual({ character: A });
  });

  it("replaces refImages wholesale rather than concatenating", () => {
    // Appending would quietly grow past the model's reference limit.
    expect(resolveSceneAssets({ refImages: [C] }, { refImages: [A, B] }).refImages).toEqual([C]);
  });

  it("inherits refImages when the scene has none or only blanks", () => {
    expect(resolveSceneAssets({}, { refImages: [A] }).refImages).toEqual([A]);
    expect(resolveSceneAssets({ refImages: [] }, { refImages: [A] }).refImages).toEqual([A]);
    expect(resolveSceneAssets({ refImages: ["  "] }, { refImages: [A] }).refImages).toEqual([A]);
  });

  it("omits absent keys instead of storing undefined", () => {
    const out = resolveSceneAssets({ character: A }, {});
    expect(Object.keys(out)).toEqual(["character"]);
    expect("background" in out).toBe(false);
  });

  it("is a no-op when there are no defaults at all", () => {
    expect(resolveSceneAssets({ character: A }, undefined)).toEqual({ character: A });
    expect(resolveSceneAssets(undefined, undefined)).toEqual({});
  });

  it("applies the same defaults to every scene", () => {
    const defaults = { character: A, background: B };
    const scenes = [{}, { firstFrame: C }, { character: B }];
    const resolved = scenes.map((s) => resolveSceneAssets(s, defaults));
    // Each scene sees the shared character unless it said otherwise.
    expect(resolved[0].character).toBe(A);
    expect(resolved[1].character).toBe(A);
    expect(resolved[2].character).toBe(B);
    expect(resolved.every((r) => r.background === B)).toBe(true);
  });

  it("feeds the payload builder the inherited images", () => {
    const resolved = resolveSceneAssets({ firstFrame: C }, { character: A });
    const payload = buildPayload(resolved);
    expect(payload.references).toEqual([{ type: "image", role: "subject", url: A }]);
    expect(payload.images).toEqual([{ url: C, role: "first_frame" }]);
  });
});

describe("inheritedAssetKeys", () => {
  it("names only the fields coming from the story", () => {
    const keys = inheritedAssetKeys({ character: B }, { character: A, background: A });
    expect([...keys]).toEqual(["background"]);
  });

  it("counts refImages as inherited when the scene has none", () => {
    expect(inheritedAssetKeys({}, { refImages: [A] }).has("refImages")).toBe(true);
    expect(inheritedAssetKeys({ refImages: [B] }, { refImages: [A] }).has("refImages")).toBe(false);
  });

  it("is empty when there are no defaults", () => {
    expect(inheritedAssetKeys({ character: A }, undefined).size).toBe(0);
    expect(inheritedAssetKeys({}, {}).size).toBe(0);
  });
});

// ───────────── Images sent to the vision model ─────────────

/** Mirrors collectImages() in app/api/story/[id]/breakdown/route.ts. */
function collectImages(raw: unknown, cap = 6): { url: string; label?: string }[] {
  if (!raw || typeof raw !== "object") return [];
  const a = raw as Record<string, unknown>;
  const ok = (u: unknown): u is string =>
    typeof u === "string" && /^(https?:\/\/|data:image\/)/i.test(u.trim());
  const out: { url: string; label?: string }[] = [];
  for (const [key, label] of [
    ["character", "Lead character"],
    ["background", "Location / environment"],
    ["prop", "Key prop"],
    ["firstFrame", "Opening frame"],
    ["lastFrame", "Closing frame"],
  ] as [string, string][]) {
    if (ok(a[key])) out.push({ url: (a[key] as string).trim(), label });
  }
  if (Array.isArray(a.refImages)) {
    for (const u of a.refImages) if (ok(u)) out.push({ url: u.trim(), label: "Style reference" });
  }
  return out.slice(0, cap);
}

describe("images sent to the vision model", () => {
  it("labels each image by role so the model knows what it is looking at", () => {
    const out = collectImages({ character: A, background: B });
    expect(out).toEqual([
      { url: A, label: "Lead character" },
      { url: B, label: "Location / environment" },
    ]);
  });

  it("accepts data URIs as well as https", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";
    expect(collectImages({ character: dataUri })).toEqual([
      { url: dataUri, label: "Lead character" },
    ]);
  });

  it("refuses anything that is not an image url", () => {
    // These would otherwise be forwarded verbatim to the upstream API.
    for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "ftp://x/y.png", "", "   ", "not a url"]) {
      expect(collectImages({ character: bad })).toEqual([]);
    }
  });

  it("ignores non-string and malformed input entirely", () => {
    expect(collectImages(undefined)).toEqual([]);
    expect(collectImages("nope")).toEqual([]);
    expect(collectImages({ character: 42, refImages: "not-an-array" })).toEqual([]);
  });

  it("caps the count so vision tokens stay bounded", () => {
    const many = Array.from({ length: 12 }, (_, i) => `https://cdn.example.com/${i}.png`);
    expect(collectImages({ refImages: many })).toHaveLength(6);
  });

  it("keeps named slots ahead of loose style references", () => {
    const out = collectImages({ refImages: [C], character: A });
    expect(out.map((i) => i.label)).toEqual(["Lead character", "Style reference"]);
  });
});

// ───────────── Accepted image formats ─────────────

describe("isAcceptedImageSource", () => {
  it("accepts every mime the live API accepted", () => {
    // Measured, not assumed: these returned 200 from /responses.
    for (const m of ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/heic"]) {
      expect(isAcceptedImageSource(`data:${m};base64,AAAA`)).toBe(true);
    }
  });

  it("rejects the formats the live API rejected", () => {
    for (const m of ["image/avif", "image/svg+xml", "image/bmp", "image/tiff"]) {
      expect(isAcceptedImageSource(`data:${m};base64,AAAA`)).toBe(false);
    }
  });

  it("rejects uppercase mimes — the upstream check is case-sensitive", () => {
    // This is the exact shape that produced
    // InvalidParameter.UnsupportedImageFormat: "Invalid base64 image_url".
    expect(isAcceptedImageSource("data:image/PNG;base64,AAAA")).toBe(false);
    expect(isAcceptedImageSource("data:image/Jpeg;base64,AAAA")).toBe(false);
  });

  it("accepts http(s) URLs", () => {
    expect(isAcceptedImageSource("https://cdn.example.com/a.png")).toBe(true);
    expect(isAcceptedImageSource("http://cdn.example.com/a.png")).toBe(true);
  });

  it("rejects other schemes and junk", () => {
    for (const v of ["javascript:alert(1)", "file:///etc/passwd", "ftp://x/y.png", "", "   ", "data:text/plain;base64,AAAA", "AAAA"]) {
      expect(isAcceptedImageSource(v)).toBe(false);
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(isAcceptedImageSource("  https://cdn.example.com/a.png  ")).toBe(true);
  });
});

// ───────────── Reachability for the video renderer ─────────────

describe("isPubliclyFetchable", () => {
  // The video model downloads each reference itself, so this is a different
  // question from "is this a valid image" — a perfectly valid data URI fails.
  it("accepts public http(s) URLs", () => {
    expect(isPubliclyFetchable("https://cdn.example.com/a.png")).toBe(true);
    expect(isPubliclyFetchable("http://cdn.example.com/a.png")).toBe(true);
  });

  it("rejects data URIs even though they are valid images", () => {
    // This is exactly what produced 7 scenes failing with
    // InvalidParameter.UnsupportedImageFormat.
    expect(isPubliclyFetchable("data:image/jpeg;base64,AAAA")).toBe(false);
  });

  it("rejects blob and relative URLs", () => {
    expect(isPubliclyFetchable("blob:http://localhost/x")).toBe(false);
    expect(isPubliclyFetchable("/library-cache/upload-1.jpg")).toBe(false);
  });

  it("rejects localhost — BytePlus cannot reach the dev machine", () => {
    for (const u of [
      "http://localhost:3000/library-cache/a.jpg",
      "https://127.0.0.1/a.jpg",
      "http://0.0.0.0:3000/a.jpg",
    ]) {
      expect(isPubliclyFetchable(u)).toBe(false);
    }
  });

  it("does not reject a public host that merely contains 'localhost'", () => {
    expect(isPubliclyFetchable("https://localhost.example.com/a.jpg")).toBe(true);
  });

  it("tolerates whitespace", () => {
    expect(isPubliclyFetchable("  https://cdn.example.com/a.png ")).toBe(true);
  });
});
