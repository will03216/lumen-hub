/**
 * Reels ↔ Studio drift guard.
 *
 * The Reels feature is a curated catalog of templates that hand off to
 * Studio via URL params. When the user clicks "Use template", we run
 * `hydratePreset` → Studio state. If the template references a model
 * Studio doesn't know about, hydration silently returns null and the
 * click-through no-ops with no user feedback. That's a silent-failure
 * foot-gun we've already tripped on once (a stale `seedream-4-0-…` ID
 * stayed in `ModelId` long after it was removed from Studio).
 *
 * These tests lock in the invariant: every `ModelId` exposed by
 * templates.ts MUST resolve against the Studio registry, and every
 * template's kind + video caps MUST match what Studio will accept.
 * Future drift will fail CI instead of hiding in the click-through.
 */

import { describe, expect, it } from "vitest";
import {
  findImageModel,
  findVideoModel,
} from "@/lib/studio/models";
import { MODEL_LABELS, TEMPLATES, type ModelId } from "./templates";

// ────────────────────────── ModelId ↔ Studio registry ───────────────────

describe("Reels ModelId catalog", () => {
  it("every ModelId in MODEL_LABELS resolves against the Studio registry", () => {
    // MODEL_LABELS is typed `Record<ModelId, string>`, so its keys ARE
    // the union members. If any doesn't resolve in Studio, the bridge
    // will return null on hydrate — fail loudly here instead.
    const ids = Object.keys(MODEL_LABELS) as ModelId[];
    const unknown = ids.filter(
      (id) => !findImageModel(id) && !findVideoModel(id),
    );
    expect(unknown).toEqual([]);
  });
});

// ────────────────────────── Template ↔ model kind alignment ─────────────

describe("Reels templates vs. Studio caps", () => {
  it("every template's model is known to Studio", () => {
    const orphans = TEMPLATES.filter(
      (t) => !findImageModel(t.model) && !findVideoModel(t.model),
    ).map((t) => `${t.id} → ${t.model}`);
    expect(orphans).toEqual([]);
  });

  it("template kind matches the model's Studio kind (no image template pointing at a video model)", () => {
    // A template marked `kind: "image"` must reference a model in
    // IMAGE_MODELS; symmetrically for video. Misaligned kind would
    // pass hydration silently but send a Seedance model through the
    // Seedream branch (or vice versa) and fail at the API layer.
    const mismatched = TEMPLATES.filter((t) => {
      if (t.kind === "image") return !findImageModel(t.model);
      return !findVideoModel(t.model);
    }).map((t) => `${t.id} · kind=${t.kind} · model=${t.model}`);
    expect(mismatched).toEqual([]);
  });

  it("every video template's resolution is within its model's caps", () => {
    // Seedance 2.0 (standard) + 2.0 Fast cap at 720p. Preset-bridge
    // silently clamps 1080p → 720p on hydrate, but authoring-time
    // mismatches still read as bugs — the template claims 1080p but
    // the user gets 720p. Fail here so the author catches it.
    const exceeded = TEMPLATES.filter((t) => t.kind === "video")
      .filter((t) => {
        const res = t.preset.resolution;
        if (!res) return false;
        const model = findVideoModel(t.model);
        if (!model) return false;
        return !model.caps.resolutions.includes(res);
      })
      .map((t) => `${t.id} · ${t.model} · ${t.preset.resolution}`);
    expect(exceeded).toEqual([]);
  });

  it("every video template's duration is within its model's caps", () => {
    const exceeded = TEMPLATES.filter((t) => t.kind === "video")
      .filter((t) => {
        const d = t.preset.duration;
        if (d === undefined) return false;
        const model = findVideoModel(t.model);
        if (!model) return false;
        return !model.caps.durations.includes(d);
      })
      .map((t) => `${t.id} · ${t.model} · ${t.preset.duration}s`);
    expect(exceeded).toEqual([]);
  });

  it("no video template requests generate_audio when the model doesn't support it", () => {
    // Only Seedance 2.0 family has native audio. Asking an older model
    // for audio either errors at the API or silently drops the flag —
    // both are worse than catching it here.
    const bad = TEMPLATES.filter((t) => t.kind === "video")
      .filter((t) => {
        if (!t.preset.generate_audio) return false;
        const model = findVideoModel(t.model);
        return !model?.caps.audio;
      })
      .map((t) => `${t.id} · ${t.model}`);
    expect(bad).toEqual([]);
  });
});
