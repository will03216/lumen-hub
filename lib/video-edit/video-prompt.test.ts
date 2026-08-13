import { describe, expect, it } from "vitest";
import {
  audioModeIsValid,
  compileVideoPrompt,
  MOTION_CONSTRAINT,
  PORTRAIT_CONSTRAINT,
  stripSlop,
} from "./video-prompt";
import type {
  Keyframe,
  PromptVariantId,
  VideoEditSession,
} from "./types";

// ─────────────────────────── Fixtures ─────────────────────────────────────

function kf(over: Partial<Keyframe> = {}): Keyframe {
  return {
    id: over.id ?? "kf1",
    t: over.t ?? 0,
    sourceFrameUrl: "/library-cache/src.jpg",
    width: 1920,
    height: 1080,
    annotations: [],
    instruction: "black leather jacket",
    editedFrameUrl: "https://cdn.byteplus/edited.jpg",
    assetId: "asset-edited-1",
    sourceAssetId: "asset-source-1",
    assetUrl: "https://tos.public/edited.jpg",
    assetStatus: "active",
    role: "reference",
    createdAt: 1,
    ...over,
  };
}

function session(over: Partial<VideoEditSession> = {}): VideoEditSession {
  return {
    id: "s1",
    name: "test",
    createdAt: 1,
    updatedAt: 1,
    source: {
      url: "https://cdn.byteplus/clip.mp4",
      width: 1920,
      height: 1080,
      duration: 30,
    },
    window: { start: 0, end: 8 },
    keyframes: [kf()],
    activeKeyframeId: "kf1",
    intent: "she walks toward camera and the jacket creases at the elbow",
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

const ALL_VARIANTS: PromptVariantId[] = ["A", "B", "C", "D", "E"];

function compile(variant: PromptVariantId, over: Partial<VideoEditSession> = {}) {
  return compileVideoPrompt({ session: session(over), variant });
}

// ─────────────────────────── The invariant ────────────────────────────────

describe("no coordinate tags ever reach a video prompt", () => {
  // The whole point of PRD §7.4: <point>/<bbox> are a Seedream contract,
  // reverse-engineered from that model's demo. Seedance has no equivalent, so
  // emitting one is inert at best and renders literal angle brackets at worst.
  it.each(ALL_VARIANTS)("variant %s emits no <point> or <bbox>", (variant) => {
    const withMarks = session({
      keyframes: [
        kf({ id: "a", t: 0 }),
        kf({ id: "b", t: 6, assetId: "asset-edited-2" }),
      ],
      intent: "remove the sign and make the jacket leather",
    });
    const out = compileVideoPrompt({ session: withMarks, variant });
    expect(out.prompt).not.toMatch(/<\/?point>/i);
    expect(out.prompt).not.toMatch(/<\/?bbox>/i);
    expect(out.errors).not.toContain(
      expect.stringContaining("coordinate tags reached"),
    );
  });

  it("catches a coordinate tag that arrives through the user's own intent", () => {
    // A user pasting a compiled Seedream prompt into the intent box is the one
    // path that can smuggle a tag through, and it must be blocked rather than
    // sent.
    const out = compile("A", { intent: "edit here <bbox>[[1,2,3,4]]</bbox>" });
    expect(out.errors.some((e) => e.includes("coordinate tags"))).toBe(true);
  });
});

// ─────────────────────────── Wire plan ────────────────────────────────────

describe("wire plan — the asset-id vs URL asymmetry", () => {
  it("variant A pins a first frame by URL and tags nothing", () => {
    const out = compile("A");
    expect(out.plan.images).toEqual([
      { url: "https://tos.public/edited.jpg", role: "first_frame" },
    ]);
    expect(out.plan.references).toHaveLength(0);
    // An untagged single image is what makes Seedance treat it as a literal
    // first frame. A [image1] tag here would silently convert it into a styled
    // subject reference and the frame would stop being the opening.
    expect(out.prompt).not.toMatch(/\[image\d\]/);
  });

  it("variant B binds both states as asset-id references and tags them", () => {
    const out = compile("B");
    expect(out.plan.images).toHaveLength(0);
    expect(out.plan.references).toEqual([
      { type: "image", role: "subject", asset_id: "asset-source-1" },
      { type: "image", role: "subject", asset_id: "asset-edited-1" },
    ]);
    expect(out.prompt).toContain("[image1]");
    expect(out.prompt).toContain("[image2]");
  });

  it("variant E pins both ends, first frame before last", () => {
    const out = compile("E", {
      keyframes: [kf({ id: "a", t: 0 }), kf({ id: "b", t: 7 })],
    });
    expect(out.plan.images.map((i) => i.role)).toEqual([
      "first_frame",
      "last_frame",
    ]);
    expect(out.errors).toHaveLength(0);
  });

  it("variant C passes the source clip and the look reference", () => {
    const out = compile("C", {
      source: {
        url: "https://cdn.byteplus/clip.mp4",
        width: 1920,
        height: 1080,
        duration: 30,
        byteplusAssetId: "asset-video-1",
      },
    });
    expect(out.plan.references).toContainEqual({
      type: "video",
      role: "subject",
      asset_id: "asset-video-1",
    });
    expect(out.prompt).toContain("[video1]");
    expect(out.prompt).toContain("[image1]");
  });

  it("every tag in the prompt has an entry in the tag map", () => {
    const out = compile("D", {
      keyframes: [kf({ id: "a", t: 0 }), kf({ id: "b", t: 5, assetId: "asset-2" })],
    });
    const tags = out.prompt.match(/\[image\d+\]/g) ?? [];
    for (const tag of tags) {
      expect(out.tagMap.some((e) => e.tag === tag)).toBe(true);
    }
  });
});

// ─────────────────────────── Blocking errors ──────────────────────────────

describe("integrity errors block the render", () => {
  it("refuses a tagged reference whose asset has not finished uploading", () => {
    // references[] takes asset ids only. Without one the reference is dropped
    // from the request and the render comes back looking like the model
    // ignored the edit — so this is an error, not a warning.
    const out = compile("B", {
      keyframes: [kf({ assetId: undefined, sourceAssetId: undefined })],
    });
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.errors[0]).toMatch(/asset library/i);
  });

  it("never sends the edited frame as its own 'before'", () => {
    // The regression that shipped once: requireAsset fell back from
    // sourceAssetId to assetId, so variant B — whose whole premise is showing
    // the model a before AND an after — bound the SAME asset twice while the
    // prose insisted they differed. Silently wrong, and it reads as the edit
    // not taking rather than as a bug.
    const out = compile("B", { keyframes: [kf({ sourceAssetId: undefined })] });
    const ids = out.plan.references.map((r) => r.asset_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(out.errors.some((e) => /original frame/i.test(e))).toBe(true);
  });

  it("refuses variant D with only one keyframe", () => {
    const out = compile("D", { keyframes: [kf()] });
    expect(out.errors.some((e) => e.includes("two edited keyframes"))).toBe(true);
  });

  it("refuses variant E with only one keyframe", () => {
    const out = compile("E", { keyframes: [kf()] });
    expect(out.errors.some((e) => e.includes("two edited keyframes"))).toBe(true);
  });

  it("refuses variant C when the window exceeds the reference-video ceiling", () => {
    const out = compile("C", { window: { start: 0, end: 20 } });
    expect(out.errors.some((e) => e.includes("15s"))).toBe(true);
  });

  it("refuses an empty intent", () => {
    const out = compile("A", { intent: "   " });
    expect(out.errors.some((e) => e.includes("Describe the change"))).toBe(true);
  });

  it("refuses a camera brand name but keeps film stock and focal length", () => {
    const brand = compile("A", { intent: "shot on ARRI, she turns" });
    expect(brand.errors.some((e) => e.includes("ARRI"))).toBe(true);

    const stock = compile("A", {
      intent: "Kodak Vision3 250D, 50mm at T2.8, she turns",
    });
    expect(stock.errors).toHaveLength(0);
    expect(stock.prompt).toContain("Kodak Vision3 250D");
    expect(stock.prompt).toContain("50mm");
  });
});

// ─────────────────────────── Anti-slop ────────────────────────────────────

describe("anti-slop", () => {
  it("removes mood words and leaves readable prose", () => {
    const { text, removed } = stripSlop(
      "an epic, stunning shot of a beautiful woman walking",
    );
    expect(removed).toEqual(expect.arrayContaining(["epic", "stunning", "beautiful"]));
    expect(text).not.toMatch(/epic|stunning|beautiful/i);
    expect(text).not.toMatch(/\s{2,}/);
    expect(text).not.toMatch(/,\s*,/);
    expect(text).toContain("woman walking");
  });

  it("keeps concrete technical specs, which look verbose but are signal", () => {
    const { text, removed } = stripSlop(
      "50mm anamorphic at T2.8, magic-hour rim light, dust motes in the beam",
    );
    expect(removed).toHaveLength(0);
    expect(text).toBe(
      "50mm anamorphic at T2.8, magic-hour rim light, dust motes in the beam",
    );
  });

  it("warns rather than rewriting a bare emotion adjective", () => {
    // Replacing "emotional" with a guess at what emotional looks like is the
    // kind of invention this module refuses to do — that needs a writer.
    const out = compile("A", { intent: "she looks emotional as she turns" });
    expect(out.warnings.some((w) => w.includes("emotion adjective"))).toBe(true);
    expect(out.prompt).toContain("emotional");
  });
});

// ─────────────────────────── Constraint lines ─────────────────────────────

describe("constraint lines", () => {
  it("appends the full portrait stability line when a person is on screen", () => {
    const out = compileVideoPrompt({
      session: session(),
      variant: "A",
      hasPerson: true,
    });
    expect(out.prompt).toContain(PORTRAIT_CONSTRAINT);
  });

  it("uses the trimmed motion clause otherwise, to avoid adding noise", () => {
    const out = compileVideoPrompt({ session: session(), variant: "A" });
    expect(out.prompt).toContain(MOTION_CONSTRAINT);
    expect(out.prompt).not.toContain(PORTRAIT_CONSTRAINT);
  });
});

// ─────────────────────────── Shot grammar ─────────────────────────────────

describe("variant D shot grammar", () => {
  it("labels shots rather than emitting timestamp blocks", () => {
    const out = compile("D", {
      keyframes: [
        kf({ id: "a", t: 0, instruction: "she steps off the curb" }),
        kf({ id: "b", t: 5, instruction: "she turns toward the neon", assetId: "asset-2" }),
      ],
    });
    expect(out.prompt).toContain("Shot 1:");
    expect(out.prompt).toContain("Shot 2:");
    // Bare timestamp blocks are a weaker cut signal than labels.
    expect(out.prompt).not.toMatch(/^\d+–\d+s:/m);
  });

  it("holds the shot budget at three and says what it dropped", () => {
    const out = compile("D", {
      keyframes: [0, 3, 6, 9].map((t, i) =>
        kf({ id: `k${i}`, t, assetId: `asset-${i}` }),
      ),
    });
    expect(out.plan.references).toHaveLength(3);
    expect(out.warnings.some((w) => w.includes("shot budget"))).toBe(true);
    expect(out.prompt).not.toContain("Shot 4:");
  });
});

// ─────────────────────────── Duration ─────────────────────────────────────

describe("duration", () => {
  it("is capped by the working window so a splice cannot drift", () => {
    const out = compile("A", {
      window: { start: 0, end: 5 },
      duration: 0, // force the computed value through
      // Beats alone top out at ~5s, so the cap would not bind. Dialogue is
      // what pushes the computed duration past the window.
      intent: 'she walks and says "we should go now before it closes"',
    });
    expect(out.duration).toBeLessThanOrEqual(5);
    expect(out.durationBasis).toContain("window");
  });

  it("shows its working rather than producing a bare number", () => {
    const out = compile("A", { duration: 0, intent: "she pushes the door open" });
    expect(out.durationBasis).toMatch(/beat|words|minimum|window/);
  });
});

// ─────────────────────────── Warnings ─────────────────────────────────────

describe("warnings", () => {
  it("flags keyframes with no rendered edit rather than silently dropping them", () => {
    const out = compile("A", {
      keyframes: [kf(), kf({ id: "kf2", t: 5, editedFrameUrl: undefined })],
    });
    expect(out.warnings.some((w) => w.includes("no rendered edit"))).toBe(true);
  });

  it("warns when a bookend is pinned before its asset upload finished", () => {
    const out = compile("A", {
      keyframes: [kf({ assetUrl: undefined, assetStatus: "pending" })],
    });
    expect(
      out.warnings.some((w) => w.includes("has not finished uploading")),
    ).toBe(true);
  });
});

// ─────────────────────────── Audio ────────────────────────────────────────

describe("audioModeIsValid", () => {
  it("allows preserve only when the render matches the window it replaces", () => {
    expect(audioModeIsValid("preserve", 8, 8).ok).toBe(true);
    expect(audioModeIsValid("preserve", 8.2, 8).ok).toBe(true);
    const drift = audioModeIsValid("preserve", 12, 8);
    expect(drift.ok).toBe(false);
    expect(drift.reason).toContain("drift");
  });

  it("never blocks generated or silent audio", () => {
    expect(audioModeIsValid("generate", 12, 8).ok).toBe(true);
    expect(audioModeIsValid("silent", 12, 8).ok).toBe(true);
  });
});
