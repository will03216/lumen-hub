import { describe, expect, it } from "vitest";
import { planAssembly } from "./assemble";
import type { VideoEditSession } from "./types";

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
      duration: 8,
    },
    window: { start: 0, end: 8 },
    keyframes: [],
    activeKeyframeId: null,
    intent: "x",
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

describe("planAssembly", () => {
  it("does nothing when the render IS the whole clip and audio is not kept", () => {
    const plan = planAssembly(session({ audioMode: "silent" }), 8);
    expect(plan.needed).toBe(false);
    expect(plan.splice).toBe(false);
    expect(plan.summary).toMatch(/no assembly/i);
  });

  it("preserves audio when the render matches the window it replaces", () => {
    const plan = planAssembly(session(), 8);
    expect(plan.needed).toBe(true);
    expect(plan.audio).toBe("preserve");
    expect(plan.warnings).toHaveLength(0);
    expect(plan.summary).toMatch(/original audio/i);
  });

  it("tolerates sub-half-second drift, because it is imperceptible", () => {
    const plan = planAssembly(session({ window: { start: 0, end: 8.4 } }), 8);
    expect(plan.audio).toBe("preserve");
  });

  it("drops the audio past the drift tolerance rather than shipping a dubbed clip", () => {
    // Lips visibly leading or trailing is a worse outcome than silence, and it
    // is the kind of defect a viewer notices without being able to name.
    const plan = planAssembly(
      session({ window: { start: 0, end: 12 }, source: { url: "u", width: 1920, height: 1080, duration: 12 } }),
      8,
    );
    expect(plan.audio).toBe("keep");
    expect(plan.warnings[0]).toMatch(/drift/i);
    expect(plan.warnings[0]).toContain("4.0s");
  });

  it("splices when the window starts after the clip does", () => {
    const plan = planAssembly(
      session({
        window: { start: 12, end: 20 },
        source: { url: "u", width: 1920, height: 1080, duration: 90 },
      }),
      8,
    );
    expect(plan.splice).toBe(true);
    expect(plan.needed).toBe(true);
    expect(plan.summary).toContain("first 12.0s");
    expect(plan.summary).toContain("last 70.0s");
  });

  it("splices only the head when the window runs to the end", () => {
    const plan = planAssembly(
      session({
        window: { start: 4, end: 12 },
        source: { url: "u", width: 1920, height: 1080, duration: 12 },
      }),
      8,
    );
    expect(plan.splice).toBe(true);
    expect(plan.summary).toContain("first 4.0s");
    expect(plan.summary).not.toContain("last");
  });

  it("ignores sub-frame slivers at either end", () => {
    // A window that misses the clip's bounds by 10ms is the whole clip. Cutting
    // a 0.01s segment and concatenating it produces a container ffmpeg may
    // refuse outright, for a piece of footage nobody can see.
    const plan = planAssembly(
      session({
        window: { start: 0.01, end: 7.99 },
        audioMode: "silent",
      }),
      8,
    );
    expect(plan.splice).toBe(false);
    expect(plan.needed).toBe(false);
  });

  it("never asks to preserve audio the user didn't ask for", () => {
    for (const mode of ["generate", "silent"] as const) {
      expect(planAssembly(session({ audioMode: mode }), 8).audio).toBe("keep");
    }
  });
});
