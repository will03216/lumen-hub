/**
 * Mirror — host allowlist + happy/sad path against a mocked /api/library/mirror.
 *
 * The real route lives in app/api/library/mirror/route.ts and writes to
 * disk; here we only verify the *client* contract:
 *   - non-mirrorable URLs short-circuit (data:, blob:, third-party CDN)
 *   - successful mirror patches the asset's `mirrorUrl` and status
 *   - failed mirror flips status to "failed" but leaves `url` alone
 *   - already-mirrored asset isn't re-fetched
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  addAsset,
  getAsset,
  type Asset,
} from "./assets";
import { mirrorAsset, shouldMirror } from "./mirror";

afterEach(() => {
  __resetForTests();
  vi.restoreAllMocks();
});

const seedRecord = (overrides: Partial<Asset> = {}): Asset =>
  addAsset({
    kind: "image",
    url: "https://cdn.bytepluses.com/img/a.png",
    source: "generated",
    ...overrides,
  });

describe("library/mirror — shouldMirror allowlist", () => {
  it("accepts BytePlus-family CDN hosts", () => {
    const cases = [
      "https://cdn.bytepluses.com/img/a.png",
      "https://x.byteplusapi.com/v.mp4",
      "https://y.volccdn.com/p.png",
      "https://z.volcengineusercontent.com/q.png",
      "https://tos-ap-southeast-1.volces.com/bucket/c.mp4",
    ];
    for (const url of cases) expect(shouldMirror(url)).toBe(true);
  });

  it("skips non-BytePlus hosts and non-https URLs", () => {
    const cases = [
      "https://example.com/a.png",
      "https://r2.cloudflarestorage.com/x.mp4",
      "http://cdn.bytepluses.com/insecure.png",
      "data:image/png;base64,AAAA",
      "blob:https://lumen.app/uuid",
      "/relative.png",
      "not a url",
    ];
    for (const url of cases) expect(shouldMirror(url)).toBe(false);
  });

  it("matches on hostname suffix only — not substring", () => {
    expect(
      shouldMirror("https://bytepluses.com.attacker.example/file.png"),
    ).toBe(false);
    expect(shouldMirror("https://fakebytepluses.com/file.png")).toBe(false);
  });
});

describe("library/mirror — mirrorAsset", () => {
  beforeEach(() => {
    // jsdom's `fetch` is a stub; Vitest provides `vi.spyOn` on `globalThis.fetch`.
    if (!globalThis.fetch) globalThis.fetch = (() => Promise.resolve()) as unknown as typeof fetch;
  });

  it("returns null and skips fetch for non-mirrorable URLs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const asset = seedRecord({
      url: "data:image/png;base64,AAAA",
      id: "data-asset",
    });
    const result = await mirrorAsset(asset);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("patches mirrorUrl and status on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ mirrorUrl: "/library-cache/abc.png", sizeBytes: 1024 }),
        { status: 200 },
      ),
    );
    const asset = seedRecord({ id: "abc" });
    const result = await mirrorAsset(asset);
    expect(result?.mirrorUrl).toBe("/library-cache/abc.png");
    expect(result?.mirrorStatus).toBe("mirrored");
    // Original URL is preserved for lineage.
    expect(getAsset("abc")?.url).toBe(asset.url);
  });

  it("flips status to 'failed' on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "upstream 404" }), { status: 502 }),
    );
    const asset = seedRecord({ id: "fail" });
    const result = await mirrorAsset(asset);
    expect(result).toBeNull();
    expect(getAsset("fail")?.mirrorStatus).toBe("failed");
    expect(getAsset("fail")?.mirrorUrl).toBeUndefined();
  });

  it("flips status to 'failed' on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const asset = seedRecord({ id: "neterr" });
    const result = await mirrorAsset(asset);
    expect(result).toBeNull();
    expect(getAsset("neterr")?.mirrorStatus).toBe("failed");
  });

  it("short-circuits when the asset is already mirrored", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const asset = seedRecord({
      id: "done",
      mirrorUrl: "/library-cache/done.png",
      mirrorStatus: "mirrored",
    });
    const result = await mirrorAsset(asset);
    expect(result).toEqual(asset);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
