/**
 * Unit tests for preset-bridge.ts — URL → Studio hydration.
 *
 * Covers `hydrateFromQuery`, the Compare→Studio handoff entry point. The
 * function is mostly coercion logic (mode / resolution / duration / ratio
 * → Studio enums), which is exactly the kind of thing that drifts silently
 * when we add a new model or resolution option and forget a matrix cell.
 *
 * `hydratePreset` is thin — just a template lookup + shape wrap — so we
 * don't retest it here; the matrix-heavy helpers inside it are better
 * covered via integration with real templates.
 *
 * No DOM needed for this module; it's pure functions over plain strings.
 */

import { describe, expect, it } from "vitest";
import { hydrateFromQuery } from "./preset-bridge";

const IMG_MODEL = "seedream-5-0-lite-260128";
const VID_MODEL_V2 = "dreamina-seedance-2-0-260128";
const VID_MODEL_V2_FAST = "dreamina-seedance-2-0-fast-260128";
const VID_MODEL_V15 = "seedance-1-5-pro-251215";

// ────────────────────────── null / shortcut cases ───────────────────────

describe("hydrateFromQuery — nulls", () => {
  it("returns null with no params", () => {
    expect(hydrateFromQuery({})).toBeNull();
  });

  it("returns null when prompt is missing", () => {
    expect(hydrateFromQuery({ model: IMG_MODEL })).toBeNull();
  });

  it("returns null when model is missing", () => {
    expect(hydrateFromQuery({ prompt: "hi" })).toBeNull();
  });

  it("returns null when prompt is only whitespace", () => {
    expect(hydrateFromQuery({ prompt: "   ", model: IMG_MODEL })).toBeNull();
  });

  it("returns null for an unknown model id (unclassifiable kind)", () => {
    expect(hydrateFromQuery({ prompt: "hi", model: "ghost-model" })).toBeNull();
  });
});

// ────────────────────────── image hydration ─────────────────────────────

describe("hydrateFromQuery — image", () => {
  it("hydrates minimum-viable image params, defaulting size", () => {
    const r = hydrateFromQuery({ prompt: "hi", model: IMG_MODEL });
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("image");
    if (r!.kind !== "image") throw new Error("narrow");
    expect(r!.state.prompt).toBe("hi");
    expect(r!.state.model).toBe(IMG_MODEL);
    expect(r!.state.size).toBe("2048x2048"); // default
    expect(r!.state.sizeFallback).toBe(false);
  });

  it("passes through an explicit size as-is", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: IMG_MODEL,
      size: "3840x2160",
    });
    if (!r || r.kind !== "image") throw new Error("expected image");
    expect(r.state.size).toBe("3840x2160");
  });

  it("has no `template` field for URL-hydration (breadcrumb guard)", () => {
    // Compare→Studio handoff explicitly sets no template so PresetBreadcrumb
    // won't render. A regression here would spuriously show "From template".
    const r = hydrateFromQuery({ prompt: "hi", model: IMG_MODEL });
    if (!r) throw new Error("expected result");
    expect(r.template).toBeUndefined();
  });
});

// ────────────────────────── video mode coercion ─────────────────────────

describe("hydrateFromQuery — video mode", () => {
  it.each([
    ["t2v", "t2v", null],
    ["i2v", "i2v", "starting-frame"],
    ["reference", "reference", "reference"],
    ["first_last", "first_last", "first-last-frames"],
  ] as const)(
    "mode=%s → mode=%s + requiresUserInput=%s",
    (input, expectedMode, expectedInput) => {
      const r = hydrateFromQuery({
        prompt: "hi",
        model: VID_MODEL_V2,
        mode: input,
      });
      if (!r || r.kind !== "video") throw new Error("expected video");
      expect(r.state.mode).toBe(expectedMode);
      expect(r.state.requiresUserInput).toBe(expectedInput);
    },
  );

  it("defaults unknown mode strings to t2v (no user input needed)", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2,
      mode: "xyz",
    });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.mode).toBe("t2v");
    expect(r.state.requiresUserInput).toBeNull();
  });
});

// ────────────────────────── duration coercion ───────────────────────────

describe("hydrateFromQuery — duration", () => {
  it("accepts a numeric string", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2,
      duration: "10",
    });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.duration).toBe(10);
  });

  it("accepts a raw number", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2,
      duration: 12,
    });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.duration).toBe(12);
  });

  it("falls back to 5 when duration is non-numeric", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2,
      duration: "soon",
    });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.duration).toBe(5);
  });

  it("falls back to 5 when duration is 0 or negative", () => {
    const r0 = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2,
      duration: "0",
    });
    if (!r0 || r0.kind !== "video") throw new Error("expected video");
    expect(r0.state.duration).toBe(5);

    const rn = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2,
      duration: "-3",
    });
    if (!rn || rn.kind !== "video") throw new Error("expected video");
    expect(rn.state.duration).toBe(5);
  });
});

// ────────────────────────── ratio coercion ──────────────────────────────

describe("hydrateFromQuery — ratio", () => {
  it("passes through a valid ratio unchanged", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2,
      ratio: "9:16",
    });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.ratio).toBe("9:16");
  });

  it("normalises a slash-separated ratio to colon form", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2,
      ratio: "21/9",
    });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.ratio).toBe("21:9");
  });

  it("falls back to 16:9 for an unknown ratio", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2,
      ratio: "2:3",
    });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.ratio).toBe("16:9");
  });
});

// ────────────────────────── resolution + model cap ──────────────────────

describe("hydrateFromQuery — resolution", () => {
  it("passes through 480p / 720p / 1080p on capable models", () => {
    for (const res of ["480p", "720p", "1080p"] as const) {
      const r = hydrateFromQuery({
        prompt: "hi",
        model: VID_MODEL_V15, // 1.5 Pro supports 1080p
        resolution: res,
      });
      if (!r || r.kind !== "video") throw new Error("expected video");
      expect(r.state.resolution).toBe(res);
    }
  });

  it("caps Seedance 2.0 (standard) at 720p even when asked for 1080p", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2,
      resolution: "1080p",
    });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.resolution).toBe("720p");
  });

  it("caps Seedance 2.0 Fast at 720p too", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V2_FAST,
      resolution: "1080p",
    });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.resolution).toBe("720p");
  });

  it("falls back to 720p for an unknown resolution string", () => {
    const r = hydrateFromQuery({
      prompt: "hi",
      model: VID_MODEL_V15,
      resolution: "4K",
    });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.resolution).toBe("720p");
  });
});

// ────────────────────────── video defaults ──────────────────────────────

describe("hydrateFromQuery — video defaults", () => {
  it("cameraFixed defaults to false and generateAudio defaults to true", () => {
    const r = hydrateFromQuery({ prompt: "hi", model: VID_MODEL_V2 });
    if (!r || r.kind !== "video") throw new Error("expected video");
    expect(r.state.cameraFixed).toBe(false);
    expect(r.state.generateAudio).toBe(true);
  });
});
