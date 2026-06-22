/**
 * Forge — critic→regen loop + Seed VLM scoreAsset (offline, mocked fetch).
 *
 * Covers the inner-loop control flow (pass→stop, fail→regen→cap, critic
 * unavailable) and the scoreAsset video→frames fallback. No network/keys.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  runCriticLoopGuard,
  deriveParamOverrides,
  deriveReviserHints,
} from "@/app/studio/nodes/qa-guard";
import { scoreAsset } from "@/lib/byteplus";

const fail = (check: string, reason = "") => ({ check, pass: false, reason });

function jsonResponse(obj: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  } as unknown as Response;
}

/** Route a stubbed fetch by URL: critic verdicts vs. the reviser vs. trace. */
function router(criticFor: (url: string) => Response, reviseTo = "REVISED PROMPT") {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/forge/critic")) return criticFor(url);
    if (url.includes("/api/forge/revise")) return jsonResponse({ prompt: reviseTo });
    if (url.includes("/api/forge/trace")) return new Response(null, { status: 204 });
    return jsonResponse({}, false, 404);
  });
}

/** A BytePlus /chat/completions success carrying a JSON verdict string. */
function chatResponse(verdictJson: object, status = 200): Response {
  const ok = status >= 200 && status < 300;
  const body = ok
    ? JSON.stringify({ choices: [{ message: { content: JSON.stringify(verdictJson) } }] })
    : "upstream error";
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const signal = new AbortController().signal;

/** A critic verdict response keyed by overall score. */
function verdict(score: number, checks: Array<{ check: string; pass: boolean; reason: string }> = []) {
  return jsonResponse({ verdict: { score, pass: false, checks, fixHint: "fix it", mode: "image" } });
}

describe("runCriticLoopGuard — the inner loop", () => {
  it("passes on the first attempt → one generation, qaPass true", async () => {
    vi.stubGlobal("fetch", router(() => verdict(0.92)));
    let gens = 0;
    const r = await runCriticLoopGuard({
      kind: "image",
      basePrompt: "p",
      qa: { qaChecks: ["brand_color_present"], qaMinScore: 0.85, regenCap: 3 },
      signal,
      generate: async () => `url-${++gens}`,
    });
    expect(gens).toBe(1);
    expect(r.url).toBe("url-1");
    expect(r.outputs.qaPass).toBe("true");
    expect(r.outputs.qaAttempts).toBe("1");
  });

  it("#1 reflexion: on failure it revises the prompt before regenerating", async () => {
    let call = 0;
    vi.stubGlobal("fetch", router(() => verdict(++call < 2 ? 0.4 : 0.9)));
    const prompts: string[] = [];
    let gens = 0;
    const r = await runCriticLoopGuard({
      kind: "image",
      basePrompt: "original",
      qa: { qaChecks: ["logo_placement"], qaMinScore: 0.85, regenCap: 3 },
      signal,
      generate: async (p) => {
        prompts.push(p);
        return `url-${++gens}`;
      },
    });
    expect(gens).toBe(2);
    expect(prompts[0]).toBe("original");
    expect(prompts[1]).toBe("REVISED PROMPT"); // came from /api/forge/revise
    expect(r.outputs.qaPass).toBe("true");
  });

  it("#2 best-of-N: returns the highest-scoring attempt, not the last", async () => {
    const scores = [0.5, 0.6, 0.55];
    let i = 0;
    vi.stubGlobal("fetch", router(() => verdict(scores[i++] ?? 0.55)));
    let gens = 0;
    const r = await runCriticLoopGuard({
      kind: "image",
      basePrompt: "p",
      qa: { qaChecks: ["x"], qaMinScore: 0.85, regenCap: 2 },
      signal,
      generate: async () => `url-${++gens}`,
    });
    expect(gens).toBe(3);
    expect(r.url).toBe("url-2"); // 0.60 beat 0.55, not the last
    expect(r.outputs.qaScore).toBe("0.60");
    expect(r.outputs.qaPass).toBe("false");
  });

  it("#4 early-stop: bails when the score plateaus, before regenCap", async () => {
    vi.stubGlobal("fetch", router(() => verdict(0.3)));
    let gens = 0;
    const r = await runCriticLoopGuard({
      kind: "image",
      basePrompt: "p",
      qa: { qaChecks: ["x"], qaMinScore: 0.85, regenCap: 5 },
      signal,
      generate: async () => `url-${++gens}`,
    });
    // flat score → best on attempt 1, then 2 no-improve attempts → stop at 3,
    // well short of regenCap (5)+1.
    expect(gens).toBe(3);
    expect(r.outputs.qaPass).toBe("false");
  });

  it("#5 calibration: samples the critic N times and medians the score", async () => {
    const seq = [0.9, 0.86, 0.88]; // median 0.88 → pass
    let i = 0;
    let criticCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/forge/critic")) {
          criticCalls++;
          return verdict(seq[i++ % seq.length]);
        }
        if (url.includes("/api/forge/trace")) return new Response(null, { status: 204 });
        return jsonResponse({}, false, 404);
      }),
    );
    let gens = 0;
    const r = await runCriticLoopGuard({
      kind: "image",
      basePrompt: "p",
      qa: { qaChecks: ["x"], qaMinScore: 0.85, regenCap: 2, criticSamples: 3 },
      signal,
      generate: async () => `url-${++gens}`,
    });
    expect(criticCalls).toBe(3); // one attempt, three samples
    expect(gens).toBe(1);
    expect(r.outputs.qaScore).toBe("0.88");
    expect(r.outputs.qaPass).toBe("true");
    expect(r.outputs.qaConfidence).toBeDefined();
  });

  it("#6 deterministic checks auto-pass without the VLM", async () => {
    // Only deterministic checks present → the critic gets an empty rubric but
    // still scores; the merged verdict shows the deterministic checks passing.
    vi.stubGlobal("fetch", router(() => verdict(0.9)));
    let gens = 0;
    const r = await runCriticLoopGuard({
      kind: "image",
      basePrompt: "p",
      qa: { qaChecks: ["aspect_duration_ok", "brand_color_present"], qaMinScore: 0.85, regenCap: 1 },
      signal,
      generate: async () => `url-${++gens}`,
    });
    const checks = JSON.parse(r.outputs.qaChecksJson ?? "[]") as Array<{ check: string; pass: boolean }>;
    expect(checks.find((c) => c.check === "aspect_duration_ok")?.pass).toBe(true);
  });

  it("critic unavailable → keeps the render, surfaces reason, no retry", async () => {
    vi.stubGlobal("fetch", router(() => jsonResponse({ error: "missing_api_key" }, false, 402)));
    let gens = 0;
    const r = await runCriticLoopGuard({
      kind: "image",
      basePrompt: "p",
      qa: { qaChecks: ["x"], qaMinScore: 0.85, regenCap: 3 },
      signal,
      generate: async () => `url-${++gens}`,
    });
    expect(gens).toBe(1);
    expect(r.url).toBe("url-1");
    expect(r.outputs.qaReason).toMatch(/critic unavailable/i);
    expect(r.outputs.qaPass).toBeUndefined();
  });
});

describe("#3 lever-mapping table", () => {
  it("maps camera/motion failures → cameraFixed override (video only)", () => {
    expect(deriveParamOverrides("video", [fail("shot_composition", "camera too shaky")])).toEqual({
      cameraFixed: true,
    });
    // image specs get no param overrides
    expect(deriveParamOverrides("image", [fail("anything", "shaky blur")])).toEqual({});
  });

  it("maps audio failures → audio override", () => {
    expect(deriveParamOverrides("video", [fail("lip_sync", "voice not aligned")])).toEqual({
      audio: true,
    });
  });

  it("derives targeted reviser hints per failing dimension (video + image)", () => {
    const lighting = deriveReviserHints([fail("exposure", "washed out highlights")]);
    expect(lighting.some((h) => /light source/i.test(h))).toBe(true);

    const brand = deriveReviserHints([fail("brand_color_present", "teal missing")]);
    expect(brand.some((h) => /brand colours/i.test(h))).toBe(true);

    const logo = deriveReviserHints([fail("logo_placement", "logo cropped")]);
    expect(logo.some((h) => /lower-third|placement/i.test(h))).toBe(true);
  });

  it("returns nothing when no rule matches", () => {
    expect(deriveParamOverrides("video", [fail("totally_unknown_check", "n/a")])).toEqual({});
    expect(deriveReviserHints([fail("totally_unknown_check", "n/a")])).toEqual([]);
  });
});

describe("scoreAsset — Seed VLM", () => {
  it("scores an image directly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => chatResponse({ score: 0.81, checks: [{ check: "a", pass: true, reason: "ok" }], fix_hint: "h" })),
    );
    const r = await scoreAsset({ kind: "image", prompt: "p", checks: ["a"], imageUrl: "https://x/y.jpg" }, "key");
    expect(r.mode).toBe("image");
    expect(r.score).toBeCloseTo(0.81);
    expect(r.checks[0].check).toBe("a");
  });

  it("video: falls back to frames when native video_url is rejected", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n++;
        if (n === 1) return chatResponse({}, 400); // video_url rejected
        return chatResponse({ score: 0.7, checks: [], fix_hint: "" }); // frames accepted
      }),
    );
    const r = await scoreAsset(
      { kind: "video", prompt: "p", checks: [], videoUrl: "https://v/clip.mp4", frames: ["data:image/jpeg;base64,AAA"] },
      "key",
    );
    expect(n).toBe(2);
    expect(r.mode).toBe("frames");
    expect(r.score).toBeCloseTo(0.7);
  });
});
