/**
 * Unit tests for the Library asset store.
 *
 * The store is the single source of truth for the entire Library page +
 * the auto-save hooks in §45 / §46, so we pin its contract here:
 *  - pin-then-newest sort order (the page reads list in this order)
 *  - same-array-reference snapshot until a mutation lands (so React's
 *    useSyncExternalStore bail-out doesn't thrash)
 *  - listeners fire on every mutation
 *  - id-collisions are treated as upserts (auto-save callers can fire
 *    twice without creating ghost duplicates)
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  addAsset,
  getAsset,
  getAssetsSnapshot,
  listAssets,
  removeAsset,
  subscribeAssets,
  updateAsset,
} from "./assets";

// Cloud sync is exercised in lib/cloud/asset-sync tests; here we just
// neutralize the fire-and-forget side effect so the local-store contract
// stays the focus.
vi.mock("@/lib/cloud/asset-sync", () => ({
  syncAssetUpsert: vi.fn().mockResolvedValue(undefined),
  syncAssetDelete: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => __resetForTests());

const seed = (overrides: Partial<Parameters<typeof addAsset>[0]> = {}) =>
  addAsset({
    kind: "image",
    url: "https://cdn/image.png",
    source: "generated",
    prompt: "test",
    model: "seedream-5-0-lite-260128",
    ...overrides,
  });

describe("library/assets — CRUD", () => {
  it("creates an asset with auto-generated id and default tags/pinned", () => {
    const a = seed();
    expect(a.id).toBeTruthy();
    expect(a.tags).toEqual([]);
    expect(a.pinned).toBe(false);
    expect(a.createdAt).toBeGreaterThan(0);
    expect(getAsset(a.id)).toEqual(a);
  });

  it("treats addAsset with an existing id as an upsert (preserves createdAt)", () => {
    const first = seed({ id: "fixed", prompt: "v1" });
    const second = seed({ id: "fixed", prompt: "v2" });
    expect(second.id).toBe("fixed");
    expect(second.prompt).toBe("v2");
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
    expect(listAssets()).toHaveLength(1);
  });

  it("updateAsset patches an existing record and bumps updatedAt", async () => {
    const a = seed();
    // Force a measurable tick — Date.now() resolution is 1ms but consecutive
    // calls in the same script frame can land on the same millisecond.
    await new Promise((r) => setTimeout(r, 2));
    const b = updateAsset(a.id, { pinned: true });
    expect(b?.pinned).toBe(true);
    expect(b?.updatedAt).toBeGreaterThan(a.updatedAt);
    expect(b?.createdAt).toBe(a.createdAt);
  });

  it("updateAsset on a missing id returns null and is a no-op", () => {
    seed({ id: "real" });
    const before = listAssets();
    const result = updateAsset("ghost", { pinned: true });
    expect(result).toBeNull();
    expect(listAssets()).toEqual(before);
  });

  it("removeAsset returns false on missing id", () => {
    expect(removeAsset("ghost")).toBe(false);
  });
});

describe("library/assets — sort order", () => {
  it("floats pinned to the top, then sorts by createdAt desc", async () => {
    const oldUnpinned = seed({ id: "1", prompt: "old" });
    await new Promise((r) => setTimeout(r, 2));
    const newUnpinned = seed({ id: "2", prompt: "new" });
    await new Promise((r) => setTimeout(r, 2));
    const oldPinned = addAsset({
      kind: "image",
      url: "https://cdn/p.png",
      source: "generated",
      id: "3",
      pinned: true,
    });
    const list = listAssets();
    expect(list.map((a) => a.id)).toEqual([
      oldPinned.id,
      newUnpinned.id,
      oldUnpinned.id,
    ]);
  });
});

describe("library/assets — snapshot stability", () => {
  it("returns the same array reference until a mutation lands", () => {
    seed();
    const s1 = getAssetsSnapshot();
    const s2 = getAssetsSnapshot();
    expect(s1).toBe(s2);
    seed({ id: "another" });
    const s3 = getAssetsSnapshot();
    expect(s3).not.toBe(s1);
  });
});

describe("library/assets — subscribers", () => {
  it("fires on add, update, and remove", () => {
    let fires = 0;
    const unsub = subscribeAssets(() => fires++);
    const a = seed();
    expect(fires).toBe(1);
    updateAsset(a.id, { pinned: true });
    expect(fires).toBe(2);
    removeAsset(a.id);
    expect(fires).toBe(3);
    unsub();
    seed();
    expect(fires).toBe(3);
  });
});
