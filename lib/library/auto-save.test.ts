/**
 * Staging helpers — pin the idempotency contract.
 *
 * Both Generator panels and the Canvas Preview node call these helpers
 * from polling / event flows that can fire twice for the same task. The
 * helpers must funnel both fires into a single Library record.
 *
 * Behavior changed after the Freepik-style redesign: renders now commit
 * directly to Library (no Drafts staging step). The idempotency contract
 * carries over — the same URL / task id produces a single asset row.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetForTests as resetAssets, listAssets } from "./assets";
import { stageGeneratedImage, stageGeneratedVideo } from "./auto-save";

// stageGenerated* fires `mirrorAsset` as a side effect. The mirror tests
// live in `mirror.test.ts`; here we just want to verify the addAsset
// shape, so mock the network call out of the picture.
vi.mock("./mirror", () => ({
  mirrorAsset: vi.fn().mockResolvedValue(null),
  shouldMirror: vi.fn().mockReturnValue(false),
}));

afterEach(() => {
  resetAssets();
});

describe("library/auto-save — image", () => {
  it("creates a single asset per URL even when fired multiple times", () => {
    const input = {
      url: "https://cdn.bytepluses.com/img/abc.png",
      prompt: "a red square",
      model: "seedream-5-0-lite-260128",
      size: "2048x2048",
      seed: 42,
    };
    stageGeneratedImage(input);
    stageGeneratedImage(input);
    stageGeneratedImage(input);
    const assets = listAssets();
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      kind: "image",
      url: input.url,
      prompt: input.prompt,
      model: input.model,
      size: input.size,
      seed: 42,
      source: "generated",
    });
  });

  it("treats different URLs as distinct assets", () => {
    stageGeneratedImage({
      url: "https://cdn/a.png",
      prompt: "x",
      model: "seedream-5-0-lite-260128",
      size: "2048x2048",
    });
    stageGeneratedImage({
      url: "https://cdn/b.png",
      prompt: "y",
      model: "seedream-5-0-lite-260128",
      size: "2048x2048",
    });
    expect(listAssets()).toHaveLength(2);
  });
});

describe("library/auto-save — video", () => {
  it("uses the BytePlus task id so polling double-fires upsert", () => {
    const input = {
      taskId: "abc123xyz",
      videoUrl: "https://cdn/vid.mp4",
      prompt: "an ocean",
      model: "dreamina-seedance-2-0-260128",
      ratio: "16:9",
      duration: 5,
      resolution: "720p",
      mode: "t2v",
    };
    stageGeneratedVideo(input);
    stageGeneratedVideo(input);
    const assets = listAssets();
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      kind: "video",
      url: input.videoUrl,
      prompt: input.prompt,
      model: input.model,
      ratio: "16:9",
      duration: 5,
      source: "generated",
    });
    // Engine-specific knobs land in `params`, not promoted to top-level.
    expect(assets[0].params).toEqual({ mode: "t2v", resolution: "720p" });
  });

  it("omits empty params instead of carrying undefined", () => {
    stageGeneratedVideo({
      taskId: "task-only",
      videoUrl: "https://cdn/v.mp4",
      prompt: "x",
      model: "dreamina-seedance-2-0-260128",
      ratio: "16:9",
      duration: 5,
    });
    expect(listAssets()[0].params).toEqual({});
  });
});
