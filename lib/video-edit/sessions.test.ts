import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTests,
  addKeyframe,
  clampDuration,
  createVideoEditSession,
  getVideoEditSession,
  listVideoEditSessions,
  patchKeyframe,
  ratioForSize,
  removeKeyframe,
  restoreVideoVersion,
  appendVideoVersion,
  upsertKeyframeAnnotation,
} from "./sessions";
import { MAX_KEYFRAMES, MAX_WINDOW_SECONDS, type VideoSource } from "./types";

const SOURCE: VideoSource = {
  url: "/library-cache/clip.mp4",
  width: 1920,
  height: 1080,
  duration: 30,
};

function mkSession(source: Partial<VideoSource> = {}) {
  return createVideoEditSession({ source: { ...SOURCE, ...source } });
}

function addAt(sessionId: string, t: number) {
  return addKeyframe(sessionId, {
    t,
    sourceFrameUrl: `/library-cache/f-${t}.jpg`,
    width: 1920,
    height: 1080,
    instruction: "",
    role: "reference",
  });
}

beforeEach(() => {
  __resetForTests();
});

describe("createVideoEditSession", () => {
  it("defaults the working window to the whole clip when it fits", () => {
    const s = mkSession({ duration: 8 });
    expect(s.window).toEqual({ start: 0, end: 8 });
    expect(s.duration).toBe(8);
  });

  it("caps the window at the Seedance output ceiling for a long clip", () => {
    const s = mkSession({ duration: 90 });
    expect(s.window).toEqual({ start: 0, end: MAX_WINDOW_SECONDS });
    expect(s.duration).toBe(MAX_WINDOW_SECONDS);
  });

  it("defaults the ratio to the source's own shape", () => {
    expect(mkSession({ width: 1080, height: 1920 }).ratio).toBe("9:16");
    expect(mkSession({ width: 1920, height: 1080 }).ratio).toBe("16:9");
    expect(mkSession({ width: 1000, height: 1000 }).ratio).toBe("1:1");
  });

  it("lists most-recently-touched first", () => {
    const a = mkSession();
    const b = mkSession();
    // Two sessions created inside the same millisecond tie on updatedAt, and
    // the tie-break is arbitrary — the contract is "most recently touched",
    // not "most recently created". So touch `a` and assert it surfaces.
    patchKeyframe(a.id, "none", {});
    const ids = listVideoEditSessions().map((s) => s.id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(b.id);
    expect(ids[0]).toBe(a.id);
  });
});

describe("keyframes", () => {
  it("keeps the ledger sorted by timestamp regardless of insertion order", () => {
    const s = mkSession();
    addAt(s.id, 5);
    addAt(s.id, 1);
    addAt(s.id, 3);
    expect(getVideoEditSession(s.id)!.keyframes.map((k) => k.t)).toEqual([1, 3, 5]);
  });

  it("re-sorts after a patch that moves a keyframe in time", () => {
    const s = mkSession();
    const a = addAt(s.id, 1)!;
    addAt(s.id, 5);
    patchKeyframe(s.id, a.id, { t: 9 });
    expect(getVideoEditSession(s.id)!.keyframes.map((k) => k.t)).toEqual([5, 9]);
  });

  it("returns the existing row when the same frame is grabbed twice", () => {
    const s = mkSession();
    const first = addAt(s.id, 3.2)!;
    // Within one frame at 24fps — the decoder landing a few ms either side is
    // the same frame, not a second keyframe.
    const again = addKeyframe(s.id, {
      t: 3.209,
      sourceFrameUrl: "/library-cache/other.jpg",
      width: 1920,
      height: 1080,
      instruction: "",
      role: "reference",
    })!;
    expect(again.id).toBe(first.id);
    expect(getVideoEditSession(s.id)!.keyframes).toHaveLength(1);
  });

  it("treats a genuinely different frame as a new keyframe", () => {
    const s = mkSession();
    addAt(s.id, 3.2);
    addAt(s.id, 3.3);
    expect(getVideoEditSession(s.id)!.keyframes).toHaveLength(2);
  });

  it("refuses to exceed the cap rather than evicting an older keyframe", () => {
    const s = mkSession();
    for (let i = 0; i < MAX_KEYFRAMES; i++) addAt(s.id, i + 1);
    const refused = addAt(s.id, 99);
    expect(refused).toBeNull();
    expect(getVideoEditSession(s.id)!.keyframes).toHaveLength(MAX_KEYFRAMES);
  });

  it("moves the selection off a removed keyframe", () => {
    const s = mkSession();
    const a = addAt(s.id, 1)!;
    addAt(s.id, 2);
    expect(getVideoEditSession(s.id)!.activeKeyframeId).not.toBeNull();
    removeKeyframe(s.id, getVideoEditSession(s.id)!.activeKeyframeId!);
    const after = getVideoEditSession(s.id)!;
    expect(after.keyframes).toHaveLength(1);
    expect(after.activeKeyframeId).toBe(a.id);
  });
});

describe("annotations on a keyframe", () => {
  const mark = (id: string) =>
    ({
      id,
      kind: "point" as const,
      label: `Mark ${id}`,
      color: "#FF00E5",
      createdAt: 1,
      at: { x: 10, y: 10 },
    });

  it("refuses an add over the cap and says so", () => {
    const s = mkSession();
    const kf = addAt(s.id, 1)!;
    expect(upsertKeyframeAnnotation(s.id, kf.id, mark("a"), 2)).toBe(true);
    expect(upsertKeyframeAnnotation(s.id, kf.id, mark("b"), 2)).toBe(true);
    expect(upsertKeyframeAnnotation(s.id, kf.id, mark("c"), 2)).toBe(false);
    expect(getVideoEditSession(s.id)!.keyframes[0].annotations).toHaveLength(2);
  });

  it("updates in place rather than appending when the id already exists", () => {
    const s = mkSession();
    const kf = addAt(s.id, 1)!;
    upsertKeyframeAnnotation(s.id, kf.id, mark("a"), 5);
    upsertKeyframeAnnotation(
      s.id,
      kf.id,
      { ...mark("a"), at: { x: 99, y: 99 } },
      5,
    );
    const list = getVideoEditSession(s.id)!.keyframes[0].annotations;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ at: { x: 99, y: 99 } });
  });
});

describe("restoreVideoVersion", () => {
  it("brings back the ledger and its marks, not just the settings", () => {
    const s = mkSession();
    const kf = addAt(s.id, 4)!;
    appendVideoVersion(s.id, {
      id: "v1",
      createdAt: 1,
      intent: "make the jacket leather",
      compiledPrompt: "…",
      variant: "B",
      model: s.model,
      duration: 8,
      ratio: "16:9",
      resolution: "720p",
      audioMode: "preserve",
      keyframesSnapshot: [{ ...kf, instruction: "black leather" }],
      outputs: [{ url: "https://cdn/out.mp4" }],
      status: "done",
    });

    // Drift the live session away from the version.
    removeKeyframe(s.id, kf.id);
    expect(getVideoEditSession(s.id)!.keyframes).toHaveLength(0);

    expect(restoreVideoVersion(s.id, "v1")).toBe(true);
    const after = getVideoEditSession(s.id)!;
    expect(after.intent).toBe("make the jacket leather");
    expect(after.variant).toBe("B");
    expect(after.keyframes).toHaveLength(1);
    expect(after.keyframes[0].instruction).toBe("black leather");
  });

  it("reports an unknown version rather than silently doing nothing", () => {
    const s = mkSession();
    expect(restoreVideoVersion(s.id, "nope")).toBe(false);
  });
});

describe("helpers", () => {
  it("clamps duration into Seedance's 4-15 window", () => {
    expect(clampDuration(1)).toBe(4);
    expect(clampDuration(7.4)).toBe(7);
    expect(clampDuration(99)).toBe(MAX_WINDOW_SECONDS);
    expect(clampDuration(Number.NaN)).toBe(5);
  });

  it("picks the nearest ratio rather than the nearest arithmetic difference", () => {
    // 1280x536 is 2.39 — cinemascope, closest to 21:9 (2.33) and not 16:9.
    expect(ratioForSize(1280, 536)).toBe("21:9");
    expect(ratioForSize(0, 0)).toBe("16:9");
  });
});
