import { describe, expect, it } from "vitest";
import { describePlan, planTimeline } from "./timeline-plan";
import { compileSegmentPrompt } from "./video-prompt";
import { MAX_WINDOW_SECONDS } from "./types";
import type { Keyframe, VideoEditSession } from "./types";

function kf(t: number, instruction = "the jacket is black leather"): Keyframe {
  return {
    id: `kf-${t}`,
    t,
    sourceFrameUrl: "/f.jpg",
    width: 1920,
    height: 1080,
    annotations: [],
    instruction,
    editedFrameUrl: "https://cdn/e.jpg",
    assetStatus: "active",
    role: "reference",
    createdAt: 1,
  };
}

function session(
  duration: number,
  keyframes: Keyframe[],
  over: Partial<VideoEditSession> = {},
): VideoEditSession {
  return {
    id: "s",
    name: "n",
    createdAt: 1,
    updatedAt: 1,
    source: { url: "https://cdn/c.mp4", width: 1920, height: 1080, duration },
    window: { start: 0, end: Math.min(duration, MAX_WINDOW_SECONDS) },
    keyframes,
    activeKeyframeId: null,
    intent: "she walks toward camera",
    variant: null,
    model: "dreamina-seedance-2-0-260128",
    duration: 8,
    ratio: "16:9",
    resolution: "720p",
    audioMode: "preserve",
    versions: [],
    ...over,
  };
}

const plan = (
  duration: number,
  keyframes: Keyframe[],
  coverage: "full" | "edits" = "full",
) => planTimeline({ session: session(duration, keyframes), coverage });

describe("planTimeline — covering the whole clip", () => {
  it("covers a long clip end to end, within the model's per-call ceiling", () => {
    const p = plan(90, [kf(0)]);
    expect(p.errors).toHaveLength(0);
    // No segment may exceed one render, and together they must span the source.
    for (const s of p.segments)
      expect(s.end - s.start).toBeLessThanOrEqual(MAX_WINDOW_SECONDS + 0.001);
    expect(p.segments[0].start).toBe(0);
    expect(p.segments[p.segments.length - 1].end).toBeCloseTo(90, 1);
  });

  it("leaves no gaps between consecutive segments", () => {
    // A gap is footage that simply vanishes from the output.
    const p = plan(40, [kf(0), kf(12), kf(30)]);
    for (let i = 1; i < p.segments.length; i++) {
      expect(p.segments[i].start).toBeCloseTo(p.segments[i - 1].end, 2);
    }
  });

  it("starts a segment ON an edit, because a pinned frame is the strongest control", () => {
    const p = plan(30, [kf(0), kf(12)]);
    const starts = p.segments.map((s) => Math.round(s.start));
    expect(starts).toContain(12);
    expect(p.segments.find((s) => Math.round(s.start) === 12)?.openingKeyframeId).toBe(
      "kf-12",
    );
  });

  it("never emits a runt segment", () => {
    // A 1.5s tail is not a shot; it is a cut that reads as a glitch. The clip
    // is the ceiling plus a sliver, so the split has to produce the runt if
    // it is ever going to.
    const p = plan(MAX_WINDOW_SECONDS + 2, [kf(0)]);
    for (const s of p.segments) {
      expect(s.duration).toBeGreaterThanOrEqual(4);
      expect(s.duration).toBeLessThanOrEqual(MAX_WINDOW_SECONDS);
    }
  });

  it("refuses to cut on an edit that would leave an illegal piece", () => {
    // An edit 2s after the previous cut cannot open a segment — the piece
    // before it would be 2s. It becomes a timed beat instead.
    const p = plan(20, [kf(0), kf(2)]);
    expect(p.segments.every((s) => s.start !== 2)).toBe(true);
    expect(p.segments[0].beats.map((b) => b.keyframeId)).toContain("kf-2");
  });

  it("chains a continuation segment but not one that opens on its own edit", () => {
    // Long enough that the stretch after the edit needs more than one render —
    // otherwise there is no continuation segment to assert about.
    const p = plan(MAX_WINDOW_SECONDS * 2 + 12, [kf(0), kf(12)]);
    const opener = p.segments.find((s) => s.openingKeyframeId === "kf-12")!;
    expect(opener.chainFromPrevious).toBe(false);
    const continuation = p.segments.find(
      (s) => !s.openingKeyframeId && s.index > 0,
    );
    expect(continuation?.chainFromPrevious).toBe(true);
  });
});

describe("planTimeline — covering only the edits", () => {
  it("regenerates around each edit and leaves the rest alone", () => {
    // The point of this mode: one change at 0:42 of a two-minute video should
    // not cost twelve renders.
    const full = plan(120, [kf(42)], "full");
    const edits = plan(120, [kf(42)], "edits");
    expect(edits.videoRenders).toBeLessThan(full.videoRenders);
    expect(edits.videoRenders).toBe(1);
  });

  it("merges edits close enough that their windows overlap", () => {
    const p = plan(60, [kf(20), kf(23)], "edits");
    expect(p.videoRenders).toBe(1);
    expect(p.segments[0].start).toBeLessThan(20);
    expect(p.segments[0].end).toBeGreaterThan(23);
  });

  it("keeps distant edits as separate segments", () => {
    const p = plan(60, [kf(10), kf(45)], "edits");
    expect(p.videoRenders).toBe(2);
    // Two segments a long way apart must NOT claim to be continuous.
    expect(p.segments[1].chainFromPrevious).toBe(false);
  });
});

describe("planTimeline — cost and refusal", () => {
  it("refuses to plan with no edits, and says what to do", () => {
    const p = plan(30, []);
    expect(p.errors[0]).toMatch(/mark up at least one moment/i);
    expect(p.segments).toHaveLength(0);
  });

  it("ignores a keyframe that carries neither marks nor an instruction", () => {
    // Grabbing a frame to look at it is not an edit.
    const p = plan(30, [kf(0), kf(10, "")]);
    expect(p.segments.every((s) => s.openingKeyframeId !== "kf-10")).toBe(true);
  });

  it("counts the frame renders the user has not paid for yet", () => {
    const unrendered = { ...kf(5), editedFrameUrl: undefined };
    const p = planTimeline({
      session: session(20, [kf(0), unrendered]),
      coverage: "full",
    });
    expect(p.frameRenders).toBe(1);
  });

  it("warns before a plan that costs a lot of renders", () => {
    // The >6 warning is a spend guard, not a model limit, so the clip has to
    // be long enough to need seven renders at whatever the ceiling is.
    const p = plan(MAX_WINDOW_SECONDS * 8, [kf(0)]);
    expect(p.videoRenders).toBeGreaterThan(6);
    expect(p.warnings.some((w) => /costs money/i.test(w))).toBe(true);
  });

  it("summarises the spend in one line", () => {
    expect(describePlan(plan(30, [kf(0)]))).toMatch(/video render/);
  });
});

describe("compileSegmentPrompt — the timestamps the user asked for", () => {
  const seg = {
    index: 1,
    start: 12,
    end: 20,
    duration: 8,
    beats: [
      { keyframeId: "a", relT: 2.5, instruction: "she turns toward the window" },
      { keyframeId: "b", relT: 6, instruction: "the neon sign flickers on" },
    ],
    chainFromPrevious: true,
  };

  it("writes beat times RELATIVE to the segment, never absolute", () => {
    // The model is rendering 8 seconds and has no idea this is 0:12 of a
    // longer film. "14.5 seconds" in an 8-second render lands nowhere.
    const { prompt } = compileSegmentPrompt({
      session: session(60, []),
      segment: seg,
      totalSegments: 3,
    });
    expect(prompt).toContain("2.5-6 seconds");
    expect(prompt).not.toContain("14.5");
    expect(prompt).not.toContain("18 seconds");
  });

  it("uses the vendor's RANGE convention, not bare instants", () => {
    // BytePlus's own 2.5 reference request is written "2-4 seconds: …". A
    // range states how long a beat occupies; an instant leaves every action's
    // duration unstated.
    const { prompt } = compileSegmentPrompt({
      session: session(60, []),
      segment: seg,
      totalSegments: 3,
    });
    expect(prompt).toMatch(/\d+(\.\d+)?-\d+(\.\d+)? seconds:/);
    expect(prompt).not.toMatch(/\bAt \d/);
  });

  it("runs the last beat to the end of the take", () => {
    const { prompt } = compileSegmentPrompt({
      session: session(60, []),
      segment: seg,
      totalSegments: 3,
    });
    // seg.duration is 8, and the last beat starts at 6.
    expect(prompt).toContain("6-8 seconds");
  });

  it("describes the opening seconds before the first beat", () => {
    // Otherwise the first 2.5 seconds of the take are simply unspecified.
    const { prompt } = compileSegmentPrompt({
      session: session(60, []),
      segment: seg,
      totalSegments: 3,
    });
    expect(prompt).toContain("0-2.5 seconds");
  });

  it("keeps beats inside one take rather than turning each into a cut", () => {
    const { prompt } = compileSegmentPrompt({
      session: session(60, []),
      segment: seg,
      totalSegments: 3,
    });
    expect(prompt).toMatch(/do not cut/i);
    expect(prompt).not.toContain("Shot 2:");
  });

  it("tells a chained segment to carry continuity forward", () => {
    const { prompt } = compileSegmentPrompt({
      session: session(60, []),
      segment: seg,
      totalSegments: 3,
    });
    expect(prompt).toMatch(/continues directly from the previous shot/i);
    expect(prompt).toMatch(/same subject, wardrobe, background/i);
  });

  it("does not restate what a pinned opening frame already shows", () => {
    const withOpening = {
      ...seg,
      openingKeyframeId: "kf-12",
      chainFromPrevious: false,
    };
    const { prompt } = compileSegmentPrompt({
      session: session(60, [kf(12)]),
      segment: withOpening,
      totalSegments: 3,
    });
    expect(prompt).toMatch(/holds throughout/i);
    expect(prompt).not.toMatch(/continues directly from the previous/i);
  });

  it("tells an empty continuation segment not to invent an event", () => {
    const empty = { ...seg, beats: [], chainFromPrevious: true };
    const { prompt } = compileSegmentPrompt({
      session: session(60, []),
      segment: empty,
      totalSegments: 3,
    });
    expect(prompt).toMatch(/nothing new happens/i);
  });

  it("flags a beat with no instruction instead of emitting an empty sentence", () => {
    const { prompt, warnings } = compileSegmentPrompt({
      session: session(60, []),
      segment: { ...seg, beats: [{ keyframeId: "a", relT: 2, instruction: "  " }] },
      totalSegments: 3,
    });
    expect(warnings.some((w) => /no instruction/i.test(w))).toBe(true);
    expect(prompt).not.toContain("At 2.0s, .");
  });

  it("never emits a coordinate tag", () => {
    const { prompt } = compileSegmentPrompt({
      session: session(60, []),
      segment: seg,
      totalSegments: 3,
    });
    expect(prompt).not.toMatch(/<\/?(?:point|bbox)>/i);
  });
});
