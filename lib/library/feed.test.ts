/**
 * Tests for `buildCreationsFeed` — verifies merge, sort, filter, and
 * date-bucketing behave deterministically.
 */

import { describe, expect, it } from "vitest";
import { buildCreationsFeed } from "./feed";
import type { Asset } from "./assets";
import type { InFlightImage, InFlightVideo } from "./in-flight";

// Anchored "now" so date-bucket math is reproducible across timezones.
// 2026-05-12 12:00 UTC.
const NOW = new Date("2026-05-12T12:00:00Z").getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function makeAsset(over: Partial<Asset> = {}): Asset {
  return {
    id: over.id ?? "a",
    kind: "image",
    url: "https://cdn.example/x.png",
    source: "generated",
    createdAt: NOW - HOUR,
    updatedAt: NOW - HOUR,
    tags: [],
    pinned: false,
    ...over,
  };
}

function makePendingImage(over: Partial<InFlightImage> = {}): InFlightImage {
  return {
    id: over.id ?? "p1",
    startedAt: NOW - 60_000,
    prompt: "rendering…",
    model: "seedream-5-0-lite-260128",
    size: "2048x2048",
    ...over,
  };
}

function makePendingVideo(over: Partial<InFlightVideo> = {}): InFlightVideo {
  return {
    id: over.id ?? "v1",
    status: "running",
    startedAt: NOW - 30_000,
    prompt: "rendering video…",
    model: "dreamina-seedance-2-0-260128",
    ratio: "16:9",
    duration: 5,
    resolution: "720p",
    mode: "t2v",
    ...over,
  };
}

describe("buildCreationsFeed", () => {
  it("returns empty groups when nothing to show", () => {
    const groups = buildCreationsFeed({
      assets: [],
      pendingImages: [],
      pendingVideos: [],
      now: NOW,
    });
    expect(groups).toEqual([]);
  });

  it("sorts newest first across kinds", () => {
    const a1 = makeAsset({ id: "img-1", createdAt: NOW - 2 * HOUR });
    const a2 = makeAsset({
      id: "vid-1",
      kind: "video",
      createdAt: NOW - HOUR,
    });
    const a3 = makeAsset({
      id: "aud-1",
      kind: "audio",
      createdAt: NOW - 30 * 60_000,
    });
    const groups = buildCreationsFeed({
      assets: [a1, a2, a3],
      pendingImages: [],
      pendingVideos: [],
      now: NOW,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].bucket).toBe("today");
    const ids = groups[0].entries.map((e) =>
      e.type === "asset" ? e.asset.id : "pending",
    );
    expect(ids).toEqual(["aud-1", "vid-1", "img-1"]);
  });

  it("places pending renders above saved assets in today bucket", () => {
    const saved = makeAsset({ id: "saved", createdAt: NOW - 6 * HOUR });
    const pending = makePendingImage({ startedAt: NOW - 60_000 });
    const groups = buildCreationsFeed({
      assets: [saved],
      pendingImages: [pending],
      pendingVideos: [],
      now: NOW,
    });
    expect(groups).toHaveLength(1);
    const entries = groups[0].entries;
    expect(entries[0].type).toBe("pending-image");
    expect(entries[1].type).toBe("asset");
  });

  it("groups into today / yesterday / this-week / older buckets", () => {
    const a = makeAsset({ id: "today", createdAt: NOW - HOUR });
    const b = makeAsset({ id: "yest", createdAt: NOW - 26 * HOUR });
    const c = makeAsset({ id: "week", createdAt: NOW - 4 * DAY });
    const d = makeAsset({ id: "old", createdAt: NOW - 30 * DAY });
    const groups = buildCreationsFeed({
      assets: [a, b, c, d],
      pendingImages: [],
      pendingVideos: [],
      now: NOW,
    });
    expect(groups.map((g) => g.bucket)).toEqual([
      "today",
      "yesterday",
      "this-week",
      "older",
    ]);
  });

  it("filters by kind", () => {
    const img = makeAsset({ id: "i", kind: "image" });
    const vid = makeAsset({ id: "v", kind: "video" });
    const aud = makeAsset({ id: "a", kind: "audio" });
    const groups = buildCreationsFeed({
      assets: [img, vid, aud],
      pendingImages: [makePendingImage()],
      pendingVideos: [makePendingVideo()],
      filterKind: "video",
      now: NOW,
    });
    const entries = groups[0].entries;
    expect(entries).toHaveLength(2); // pending-video + saved video
    expect(entries.every((e) => e.kind === "video")).toBe(true);
  });

  it("favoritesOnly drops un-pinned and all pending", () => {
    const pinned = makeAsset({ id: "pin", pinned: true });
    const unpinned = makeAsset({ id: "u", pinned: false });
    const groups = buildCreationsFeed({
      assets: [pinned, unpinned],
      pendingImages: [makePendingImage()],
      pendingVideos: [],
      favoritesOnly: true,
      now: NOW,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(1);
    const first = groups[0].entries[0];
    expect(first.type).toBe("asset");
    if (first.type === "asset") {
      expect(first.asset.id).toBe("pin");
    }
  });

  it("ignores non-feed kinds like 'reference'", () => {
    const ref = makeAsset({ id: "ref", kind: "reference" });
    const img = makeAsset({ id: "img", kind: "image" });
    const groups = buildCreationsFeed({
      assets: [ref, img],
      pendingImages: [],
      pendingVideos: [],
      now: NOW,
    });
    const ids = groups[0].entries
      .filter((e) => e.type === "asset")
      .map((e) => (e.type === "asset" ? e.asset.id : ""));
    expect(ids).toEqual(["img"]);
  });
});
