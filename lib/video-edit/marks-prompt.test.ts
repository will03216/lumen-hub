import { describe, expect, it } from "vitest";
import {
  chipLabel,
  compileMarksPrompt,
  formatChipTime,
  tokensFor,
  tokensToPlainText,
  type PromptToken,
} from "./marks-prompt";
import type { Keyframe, VideoEditSession } from "./types";

function kf(id: string, t: number, over: Partial<Keyframe> = {}): Keyframe {
  return {
    id,
    t,
    sourceFrameUrl: "/clean.jpg",
    width: 1920,
    height: 1080,
    annotations: [],
    instruction: "",
    markedFrameUrl: `https://cdn/marked-${id}.jpg`,
    assetStatus: "active",
    role: "reference",
    createdAt: 1,
    ...over,
  };
}

function session(keyframes: Keyframe[], over: Partial<VideoEditSession> = {}): VideoEditSession {
  return {
    id: "s",
    name: "n",
    createdAt: 1,
    updatedAt: 1,
    source: { url: "https://cdn/c.mp4", width: 1920, height: 1080, duration: 6 },
    window: { start: 0, end: 6 },
    keyframes,
    activeKeyframeId: null,
    intent: "",
    variant: null,
    model: "dreamina-seedance-2-5-260628",
    duration: 6,
    ratio: "16:9",
    resolution: "720p",
    audioMode: "preserve",
    versions: [],
    ...over,
  };
}

const compile = (tokens: PromptToken[], keyframes: Keyframe[]) =>
  compileMarksPrompt({ session: session(keyframes), tokens });

describe("formatChipTime", () => {
  it("reads mm:ss, matching the chip in the UI", () => {
    expect(formatChipTime(5)).toBe("00:05");
    expect(formatChipTime(65)).toBe("01:05");
    // Centiseconds on a chip are noise; the model doesn't need them to find a
    // moment in a six-second clip.
    expect(formatChipTime(5.4)).toBe("00:05");
  });
});

describe("compileMarksPrompt — regenerating the WHOLE video", () => {
  it("sends the source clip as the first reference", () => {
    // Without it the model is shown a still and asked for a video, so it
    // invents everything after the first frame — the "it only regenerated
    // part of it" failure.
    const out = compile([{ kind: "text", text: "make the hat bigger" }], []);
    expect(out.references[0]).toMatchObject({ kind: "video", label: "Video 1" });
    expect(out.prompt).toContain("Recreate the full");
    expect(out.prompt).toContain("Video 1");
  });

  it("does NOT block while the clip is still uploading", () => {
    // The deadlock this replaced: Generate was disabled by "the clip isn't
    // uploaded yet", and the only thing that uploaded the clip was pressing
    // Generate. Any readiness check that gates the control which produces
    // readiness is a deadlock — readiness is the render path's job.
    const out = compileMarksPrompt({
      session: session([kf("a", 5)], {
        source: { url: "/library-cache/local.mp4", width: 1920, height: 1080, duration: 6 },
        sourceVideoStatus: "uploading",
      }),
      tokens: [{ kind: "mark", keyframeId: "a" }],
    });
    expect(out.errors).toHaveLength(0);
    expect(out.warnings.some((w) => /preparing the source clip/i.test(w))).toBe(true);
    // And the prompt still describes the whole-video render, because that IS
    // what will be sent once the upload lands.
    expect(out.prompt).toContain("Recreate the full");
  });

  it("blocks only once the clip upload has actually FAILED", () => {
    const out = compileMarksPrompt({
      session: session([kf("a", 5)], {
        source: { url: "/library-cache/local.mp4", width: 1920, height: 1080, duration: 6 },
        sourceVideoStatus: "failed",
        sourceVideoError: "clip is 40 seconds; the limit is 15",
      }),
      tokens: [{ kind: "mark", keyframeId: "a" }],
    });
    expect(out.errors.some((e) => /could not be uploaded/i.test(e))).toBe(true);
    // The upstream reason is carried through — "it failed" alone is unactionable.
    expect(out.errors[0]).toContain("40 seconds");
  });

  it("takes its duration from the source, not from a preference", () => {
    const out = compileMarksPrompt({
      session: session([], {
        source: { url: "https://cdn/c.mp4", width: 1920, height: 1080, duration: 10.05 },
        duration: 4,
      }),
      tokens: [{ kind: "text", text: "brighter" }],
    });
    expect(out.duration).toBe(10);
    expect(out.prompt).toContain("10-second");
  });

  it("places each marked frame at its own timestamp", () => {
    const out = compile(
      [
        { kind: "mark", keyframeId: "a" },
        { kind: "text", text: "make it a bit bigger" },
        { kind: "mark", keyframeId: "b" },
      ],
      [kf("a", 5), kf("b", 1)],
    );
    expect(out.prompt).toContain("at 00:05, apply the change marked in Image 1");
    expect(out.prompt).toContain("at 00:01, apply the change marked in Image 2");
    expect(out.prompt).toContain("make it a bit bigger");
    expect(out.errors).toHaveLength(0);
  });

  it("tells the model everything else is unchanged", () => {
    // The difference between "edit this video" and "make a new one like it".
    const out = compile([{ kind: "mark", keyframeId: "a" }], [kf("a", 5)]);
    expect(out.prompt).toMatch(/stays identical to Video 1/i);
    expect(out.prompt).toMatch(/change nothing else/i);
  });

  it("sends the MARKED composite, not the clean frame", () => {
    // The whole point: the model is being shown what was circled. A clean
    // frame next to "make it bigger" is a request it cannot satisfy and will
    // answer anyway.
    const out = compile([{ kind: "mark", keyframeId: "a" }], [kf("a", 5)]);
    expect(out.references.find((r) => r.kind === "image")!.url).toBe(
      "https://cdn/marked-a.jpg",
    );
  });

  it("prefers the ingested asset URL when one exists", () => {
    // A frame with a face needs the ingested copy to clear privacy moderation.
    const out = compile(
      [{ kind: "mark", keyframeId: "a" }],
      [kf("a", 5, { markedAssetUrl: "https://tos/ingested.jpg" })],
    );
    expect(out.references.find((r) => r.kind === "image")!.url).toBe(
      "https://tos/ingested.jpg",
    );
  });

  it("references a frame once even when it is chipped twice", () => {
    // Two chips for one frame is a legitimate thing to write; two identical
    // reference images is not.
    const out = compile(
      [
        { kind: "mark", keyframeId: "a" },
        { kind: "text", text: "and again at the end" },
        { kind: "mark", keyframeId: "a" },
      ],
      [kf("a", 5)],
    );
    expect(out.references.filter((r) => r.kind === "image")).toHaveLength(1);
  });

  it("orders references by first appearance in the prompt", () => {
    // The content array's order is what the model reads; it must match the
    // order the prose introduces them in.
    const out = compile(
      [
        { kind: "mark", keyframeId: "b" },
        { kind: "mark", keyframeId: "a" },
      ],
      [kf("a", 1), kf("b", 5)],
    );
    expect(
      out.references.filter((r) => r.kind === "image").map((r) => r.keyframeId),
    ).toEqual(["b", "a"]);
  });

  it("blocks on a mark whose upload has not finished", () => {
    const out = compile(
      [{ kind: "mark", keyframeId: "a" }],
      [kf("a", 5, { markedFrameUrl: undefined })],
    );
    expect(out.errors.some((e) => /finished uploading/i.test(e))).toBe(true);
  });

  it("warns rather than crashing when a chip's frame was deleted", () => {
    const out = compile(
      [
        { kind: "text", text: "make it bigger" },
        { kind: "mark", keyframeId: "gone" },
      ],
      [kf("a", 5)],
    );
    expect(out.warnings.some((w) => /no longer exists/i.test(w))).toBe(true);
    expect(out.prompt).toContain("make it bigger");
  });

  it("refuses an empty prompt", () => {
    expect(compile([], []).errors.some((e) => /say what should change/i.test(e))).toBe(
      true,
    );
    expect(
      compile([{ kind: "text", text: "   " }], []).errors.length,
    ).toBeGreaterThan(0);
  });

  it("collapses the whitespace a chip boundary leaves behind", () => {
    const out = compile(
      [
        { kind: "text", text: "make   the hat" },
        { kind: "mark", keyframeId: "a" },
        { kind: "text", text: "  bigger  " },
      ],
      [kf("a", 5)],
    );
    expect(out.prompt).not.toMatch(/\s{2,}/);
  });

  it("still blocks a coordinate tag smuggled in through free text", () => {
    const out = compile(
      [{ kind: "text", text: "edit <bbox>[[1,2,3,4]]</bbox> here" }],
      [],
    );
    expect(out.errors.some((e) => /coordinate tags/i.test(e))).toBe(true);
  });
});

describe("tokensFor — old sessions still open", () => {
  it("falls back to the legacy free-text intent", () => {
    const s = session([], { intent: "make the jacket leather" });
    expect(tokensFor(s)).toEqual([{ kind: "text", text: "make the jacket leather" }]);
  });

  it("prefers tokens once they exist", () => {
    const tokens: PromptToken[] = [{ kind: "text", text: "new" }];
    const s = session([], { intent: "old", promptTokens: tokens });
    expect(tokensFor(s)).toBe(tokens);
  });

  it("returns nothing for an empty session rather than a blank token", () => {
    expect(tokensFor(session([], { intent: "  " }))).toEqual([]);
  });
});

describe("tokensToPlainText", () => {
  it("renders chips as their label, for search and for the Library", () => {
    const s = session([kf("a", 5)]);
    expect(
      tokensToPlainText(
        [
          { kind: "text", text: "make" },
          { kind: "mark", keyframeId: "a" },
          { kind: "text", text: "bigger" },
        ],
        s,
      ),
    ).toBe("make the marked frame at 00:05 bigger");
  });
});

describe("chipLabel", () => {
  it("names the moment, which is how the prompt refers to it", () => {
    expect(chipLabel(kf("a", 5))).toBe("the marked frame at 00:05");
  });
});

describe("the video-editing task type's own limits", () => {
  it("refuses a clip shorter than the task type accepts", () => {
    // The API rejects this after the upload, as an opaque parameter error.
    // Catching it here says which number is wrong and by how much.
    const out = compileMarksPrompt({
      session: session([], {
        source: { url: "https://cdn/c.mp4", width: 1920, height: 1080, duration: 2.5 },
      }),
      tokens: [{ kind: "text", text: "brighter" }],
    });
    expect(out.errors.some((e) => /at least 4 seconds/i.test(e))).toBe(true);
    expect(out.errors[0]).toContain("2.5s");
  });

  it("refuses a clip longer than 30 seconds", () => {
    const out = compileMarksPrompt({
      session: session([], {
        source: { url: "https://cdn/c.mp4", width: 1920, height: 1080, duration: 45 },
      }),
      tokens: [{ kind: "text", text: "brighter" }],
    });
    expect(out.errors.some((e) => /caps at 30 seconds/i.test(e))).toBe(true);
  });

  it("accepts the range in between", () => {
    for (const duration of [4, 10.05, 30]) {
      const out = compileMarksPrompt({
        session: session([], {
          source: { url: "https://cdn/c.mp4", width: 1920, height: 1080, duration },
        }),
        tokens: [{ kind: "text", text: "brighter" }],
      });
      expect(out.errors).toHaveLength(0);
    }
  });
});
