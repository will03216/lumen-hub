import { describe, expect, it } from "vitest";
import {
  canUseMotionTransfer,
  rolesForVariant,
  selectVariant,
  variantAvailability,
} from "./variant-select";
import type { Keyframe, VideoEditSession } from "./types";

function kf(t: number, over: Partial<Keyframe> = {}): Keyframe {
  return {
    id: `kf-${t}`,
    t,
    sourceFrameUrl: "/f.jpg",
    width: 1920,
    height: 1080,
    annotations: [],
    instruction: "",
    editedFrameUrl: "https://cdn/e.jpg",
    assetStatus: "active",
    role: "reference",
    createdAt: 1,
    ...over,
  };
}

function session(over: Partial<VideoEditSession> = {}): VideoEditSession {
  return {
    id: "s",
    name: "n",
    createdAt: 1,
    updatedAt: 1,
    source: {
      url: "https://cdn/clip.mp4",
      width: 1920,
      height: 1080,
      duration: 30,
    },
    window: { start: 0, end: 8 },
    keyframes: [],
    activeKeyframeId: null,
    intent: "make the jacket leather",
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

describe("selectVariant", () => {
  it("picks the bookend when two keyframes pin both ends", () => {
    const out = selectVariant(session({ keyframes: [kf(0), kf(7)] }));
    expect(out.id).toBe("E");
    expect(out.why).toBeTruthy();
  });

  it("picks the shot list at three or more keyframes", () => {
    expect(selectVariant(session({ keyframes: [kf(0), kf(3), kf(6)] })).id).toBe("D");
  });

  it("picks the shot list for two keyframes with an explicit camera move", () => {
    const out = selectVariant(
      session({
        keyframes: [kf(0), kf(5)],
        intent: "the camera pushes in as she turns",
      }),
    );
    expect(out.id).toBe("D");
  });

  it("prefers the tagged delta for compositional edits", () => {
    // A pinned first frame can be re-rendered back to the "before", which is
    // exactly the failure mode for add/remove edits.
    for (const intent of [
      "remove the paper cup from the table",
      "add a neon sign above the door",
      "replace the poster on the wall",
    ]) {
      expect(selectVariant(session({ keyframes: [kf(0)], intent })).id).toBe("B");
    }
  });

  it("prefers motion transfer for a single restyle inside a short window", () => {
    const out = selectVariant(
      session({ keyframes: [kf(4)], intent: "make the jacket leather" }),
    );
    expect(out.id).toBe("C");
  });

  it("falls back to the first frame when the window is too long for a video reference", () => {
    const out = selectVariant(
      session({
        keyframes: [kf(0)],
        window: { start: 0, end: 40 },
        intent: "make the jacket leather",
      }),
    );
    expect(out.id).toBe("A");
  });

  it("never returns a variant with no keyframes without explaining itself", () => {
    const out = selectVariant(session({ keyframes: [] }));
    expect(out.id).toBe("A");
    expect(out.why).toMatch(/no edited keyframe/i);
  });
});

describe("measured defaults override the heuristic", () => {
  it("uses a measured winner for the matching edit class", () => {
    const out = selectVariant(
      session({ keyframes: [kf(4)], intent: "make the jacket leather" }),
      { appearance: "B" },
    );
    expect(out.id).toBe("B");
    expect(out.why).toMatch(/measured/i);
  });

  it("leaves an unmeasured class on the hypothesis", () => {
    // A class we did not measure must not inherit another class's answer.
    const out = selectVariant(
      session({ keyframes: [kf(4)], intent: "remove the paper cup" }),
      { appearance: "B" },
    );
    expect(out.why).not.toMatch(/measured/i);
  });

  it("never picks a measured variant the session cannot run", () => {
    // The table is a preference, not a licence to pick something unavailable —
    // C needs a source clip short enough to be a reference video.
    const out = selectVariant(
      session({
        keyframes: [kf(4)],
        window: { start: 0, end: 40 },
        intent: "make the jacket leather",
      }),
      { appearance: "C" },
    );
    expect(out.id).not.toBe("C");
  });

  it("lets the ledger shape win over the table", () => {
    // D and E are not stylistic preferences — they are the only variants that
    // can consume a second keyframe at all. A measured "appearance" default
    // must not silently discard the user's second edit.
    const out = selectVariant(
      session({ keyframes: [kf(0), kf(6)], intent: "make the jacket leather" }),
      { appearance: "B" },
    );
    expect(out.id).toBe("E");
  });
});

describe("canUseMotionTransfer", () => {
  it("refuses a window past the reference-video ceiling, with the numbers", () => {
    const out = canUseMotionTransfer(session({ window: { start: 0, end: 20 } }));
    expect(out.available).toBe(false);
    expect(out.reason).toContain("15s");
    expect(out.reason).toContain("20.0s");
  });

  it("refuses a source with no public URL and no asset", () => {
    const out = canUseMotionTransfer(
      session({
        source: {
          url: "/library-cache/local.mp4",
          width: 1920,
          height: 1080,
          duration: 8,
        },
      }),
    );
    expect(out.available).toBe(false);
    expect(out.reason).toMatch(/public URL|asset-library/i);
  });
});

describe("variantAvailability", () => {
  it("gives every unavailable variant a reason", () => {
    const rows = variantAvailability(session({ keyframes: [] }));
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      if (!row.available) expect(row.reason).toBeTruthy();
    }
  });

  it("opens up the multi-keyframe variants once two frames are ready", () => {
    const rows = variantAvailability(session({ keyframes: [kf(0), kf(6)] }));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.available]));
    expect(byId.D).toBe(true);
    expect(byId.E).toBe(true);
  });

  it("does not count a keyframe that has not been rendered yet", () => {
    const rows = variantAvailability(
      session({ keyframes: [kf(0, { editedFrameUrl: undefined })] }),
    );
    expect(rows.find((r) => r.id === "A")!.available).toBe(false);
  });
});

describe("rolesForVariant", () => {
  it("assigns both ends under the bookend variant", () => {
    const roles = rolesForVariant("E", [kf(0), kf(3), kf(9)]);
    expect(roles.get("kf-0")).toBe("first_frame");
    expect(roles.get("kf-9")).toBe("last_frame");
    expect(roles.get("kf-3")).toBe("reference");
  });

  it("assigns only an opening frame under A and D", () => {
    for (const v of ["A", "D"] as const) {
      const roles = rolesForVariant(v, [kf(0), kf(5)]);
      expect(roles.get("kf-0")).toBe("first_frame");
      expect(roles.get("kf-5")).toBe("reference");
    }
  });

  it("makes everything a plain reference under B and C", () => {
    for (const v of ["B", "C"] as const) {
      const roles = rolesForVariant(v, [kf(0), kf(5)]);
      expect([...roles.values()]).toEqual(["reference", "reference"]);
    }
  });
});
