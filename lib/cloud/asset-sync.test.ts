/**
 * Cloud sync — verify the no-op contract when cloud isn't configured.
 *
 * The whole point of feature-flagging Supabase is that the app must
 * never crash, throw, or generate noise when env vars are absent. This
 * suite pins that contract by calling the sync helpers without any
 * Supabase setup and asserting they resolve quietly.
 *
 * The "cloud configured but anonymous" path is hard to test without
 * mocking the Supabase client; we cover the env-flag branch here and
 * leave the signed-in path to integration testing once a real project
 * is provisioned.
 */

import { describe, expect, it } from "vitest";
import { syncAssetUpsert, syncAssetDelete } from "./asset-sync";
import type { Asset } from "@/lib/library/assets";

const minimalAsset: Asset = {
  id: "abc",
  kind: "image",
  url: "https://cdn.example.com/x.png",
  source: "generated",
  createdAt: 0,
  updatedAt: 0,
  tags: [],
  pinned: false,
};

describe("cloud/asset-sync — disabled state", () => {
  it("syncAssetUpsert resolves without throwing when cloud env is unset", async () => {
    await expect(syncAssetUpsert(minimalAsset)).resolves.toBeUndefined();
  });

  it("syncAssetDelete resolves without throwing when cloud env is unset", async () => {
    await expect(syncAssetDelete("abc")).resolves.toBeUndefined();
  });
});
