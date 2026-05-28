/**
 * Unit tests for saved-history — per-(kind, side) render history in
 * localStorage.
 *
 * Coverage targets the bits most likely to regress:
 *   · Empty / malformed / schema-drifted storage → safe fallback ([])
 *   · Per-item field validation (drop partials, keep valids)
 *   · Bucket isolation — writing one bucket doesn't clobber the other three
 *   · MAX_HISTORY cap enforcement on both read and write
 *
 * happy-dom provides window.localStorage; we clear it between tests.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_HISTORY,
  clearHistoryBucket,
  readHistoryBucket,
  writeHistoryBucket,
  type HistoryItem,
} from "./saved-history";

const IMG_MODEL = "seedream-5-0-lite-260128";
const VID_MODEL = "dreamina-seedance-2-0-260128";

// Discriminant-aware factories: typing the `overrides` against each branch
// individually keeps the return type narrow (TS otherwise widens to the
// union and can't satisfy HistoryItem's exhaustive-key requirement).
type ImgItem = Extract<HistoryItem, { kind: "image" }>;
type VidItem = Extract<HistoryItem, { kind: "video" }>;

const imgItem = (url: string, overrides: Partial<ImgItem> = {}): ImgItem => ({
  kind: "image",
  url,
  size: "2048x2048",
  model: IMG_MODEL,
  prompt: "test prompt",
  ts: Date.now(),
  elapsedMs: 1234,
  ...overrides,
});

const vidItem = (url: string, overrides: Partial<VidItem> = {}): VidItem => ({
  kind: "video",
  url,
  ratio: "16:9",
  model: VID_MODEL,
  prompt: "test prompt",
  resolution: "720p",
  duration: 5,
  mode: "t2v",
  ts: Date.now(),
  elapsedMs: 4567,
  ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
});

// ────────────────────────── empty + malformed ───────────────────────────

describe("readHistoryBucket — empty / malformed storage", () => {
  it("returns [] when storage is empty", () => {
    expect(readHistoryBucket("image", "A")).toEqual([]);
    expect(readHistoryBucket("video", "B")).toEqual([]);
  });

  it("returns [] when JSON is malformed", () => {
    window.localStorage.setItem("lumen.compare.history", "{broken");
    expect(readHistoryBucket("image", "A")).toEqual([]);
  });

  it("returns [] when storage shape is wrong (array at root)", () => {
    window.localStorage.setItem(
      "lumen.compare.history",
      JSON.stringify(["not", "an", "object"]),
    );
    expect(readHistoryBucket("image", "A")).toEqual([]);
  });

  it("returns [] for a missing bucket, even when other buckets have data", () => {
    writeHistoryBucket("image", "A", [imgItem("u1")]);
    // image/B wasn't written — should still be [].
    expect(readHistoryBucket("image", "B")).toEqual([]);
    expect(readHistoryBucket("video", "A")).toEqual([]);
  });
});

// ────────────────────────── per-item sanitize ───────────────────────────

describe("readHistoryBucket — sanitize malformed items", () => {
  it("drops items missing required fields", () => {
    const blob = {
      image: {
        A: [
          imgItem("valid-url"),
          { kind: "image", url: "missing-model" }, // no model/prompt/ts/elapsedMs
          { kind: "image", model: "x", prompt: "y" }, // no url/ts
        ],
        B: [],
      },
      video: { A: [], B: [] },
    };
    window.localStorage.setItem("lumen.compare.history", JSON.stringify(blob));
    const items = readHistoryBucket("image", "A");
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("valid-url");
  });

  it("drops video items that lack video-specific fields (resolution/duration/mode)", () => {
    const blob = {
      image: { A: [], B: [] },
      video: {
        A: [
          vidItem("full"),
          {
            kind: "video",
            url: "missing-resolution",
            ratio: "16:9",
            model: VID_MODEL,
            prompt: "p",
            // no resolution, duration, mode
            ts: Date.now(),
            elapsedMs: 1000,
          },
        ],
        B: [],
      },
    };
    window.localStorage.setItem("lumen.compare.history", JSON.stringify(blob));
    const items = readHistoryBucket("video", "A");
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("full");
  });

  it("drops items whose kind doesn't match the bucket (shape drift guard)", () => {
    // Image bucket with a mis-tagged video item — must be filtered out.
    const blob = {
      image: {
        A: [imgItem("img1"), vidItem("vid-in-image-bucket")],
        B: [],
      },
      video: { A: [], B: [] },
    };
    window.localStorage.setItem("lumen.compare.history", JSON.stringify(blob));
    const items = readHistoryBucket("image", "A");
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("img1");
  });
});

// ────────────────────────── bucket isolation ────────────────────────────

describe("writeHistoryBucket — bucket isolation", () => {
  it("doesn't clobber the three sibling buckets", () => {
    writeHistoryBucket("image", "A", [imgItem("imgA-1")]);
    writeHistoryBucket("image", "B", [imgItem("imgB-1")]);
    writeHistoryBucket("video", "A", [vidItem("vidA-1")]);
    writeHistoryBucket("video", "B", [vidItem("vidB-1")]);

    // Overwriting one bucket shouldn't touch the others.
    writeHistoryBucket("image", "A", [imgItem("imgA-2"), imgItem("imgA-3")]);

    expect(readHistoryBucket("image", "A").map((i) => i.url)).toEqual([
      "imgA-2",
      "imgA-3",
    ]);
    expect(readHistoryBucket("image", "B").map((i) => i.url)).toEqual(["imgB-1"]);
    expect(readHistoryBucket("video", "A").map((i) => i.url)).toEqual(["vidA-1"]);
    expect(readHistoryBucket("video", "B").map((i) => i.url)).toEqual(["vidB-1"]);
  });

  it("clearHistoryBucket empties one bucket and leaves others alone", () => {
    writeHistoryBucket("image", "A", [imgItem("x")]);
    writeHistoryBucket("video", "A", [vidItem("y")]);
    clearHistoryBucket("image", "A");
    expect(readHistoryBucket("image", "A")).toEqual([]);
    expect(readHistoryBucket("video", "A")).toHaveLength(1);
  });
});

// ────────────────────────── MAX_HISTORY cap ─────────────────────────────

describe("MAX_HISTORY cap", () => {
  it("write caps items at MAX_HISTORY", () => {
    const many = Array.from({ length: MAX_HISTORY + 4 }, (_, i) =>
      imgItem(`url-${i}`),
    );
    writeHistoryBucket("image", "A", many);
    const items = readHistoryBucket("image", "A");
    expect(items).toHaveLength(MAX_HISTORY);
    // Keep the first N, drop the overflow — matches the panel's "latest-first"
    // invariant where the newest items are at the head.
    expect(items[0].url).toBe("url-0");
    expect(items[MAX_HISTORY - 1].url).toBe(`url-${MAX_HISTORY - 1}`);
  });

  it("read caps at MAX_HISTORY even when storage was poisoned past the cap", () => {
    // Someone edits localStorage in devtools and dumps 20 items. Read must
    // still only return MAX_HISTORY so the strip can't overflow its budget.
    const many = Array.from({ length: 20 }, (_, i) => imgItem(`poisoned-${i}`));
    const blob = {
      image: { A: many, B: [] },
      video: { A: [], B: [] },
    };
    window.localStorage.setItem("lumen.compare.history", JSON.stringify(blob));
    expect(readHistoryBucket("image", "A")).toHaveLength(MAX_HISTORY);
  });
});
