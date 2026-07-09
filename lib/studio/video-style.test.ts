import { describe, expect, it } from "vitest";
import {
  buildEnhancedPromptInstruction,
  buildEnhancedPromptPlan,
  buildProductAgnosticStyleBrief,
  fidelityTemperature,
  parseVideoStyleVisionAnalysis,
  selectSeedanceAnalysisFrames,
  selectSeedanceReferenceFrame,
} from "./video-style";

function frame(size: number) {
  return `data:image/jpeg;base64,${"a".repeat(size)}`;
}

describe("parseVideoStyleVisionAnalysis", () => {
  it("parses clean structured JSON", () => {
    const result = parseVideoStyleVisionAnalysis(`{
      "sourceLabel": "rhode lip tint",
      "summary": "Polished beauty ad with macro push-in.",
      "scenes": [{ "id": "s1", "title": "Hook", "subject": "a beauty product", "action": "push-in" }],
      "promptDna": [{ "axis": "camera", "finding": "slow push-in", "reusablePrompt": "slow controlled push-in" }],
      "styleBrief": "Macro beauty pacing, product-agnostic.",
      "frameObservations": ["Frame one observation."],
      "confidence": { "overall": 0.8, "visual": 0.8, "motion": 0.7, "prompt": 0.6 }
    }`);

    expect(result).not.toBeNull();
    expect(result?.styleBrief).toBe("Macro beauty pacing, product-agnostic.");
    expect(result?.frameObservations).toEqual(["Frame one observation."]);
    expect(result?.analysis?.scenes).toHaveLength(1);
    expect(result?.analysis?.promptDna[0].axis).toBe("camera");
    expect(result?.analysis?.confidence.overall).toBe(0.8);
  });

  it("recovers JSON wrapped in markdown fences", () => {
    const result = parseVideoStyleVisionAnalysis(
      "Here you go:\n```json\n{ \"styleBrief\": \"Brief.\" }\n```\n",
    );
    expect(result?.styleBrief).toBe("Brief.");
  });

  it("recovers JSON with trailing commas via jsonrepair", () => {
    const result = parseVideoStyleVisionAnalysis(
      '{ "styleBrief": "Brief.", "frameObservations": ["a", "b",] }',
    );
    expect(result?.styleBrief).toBe("Brief.");
    expect(result?.frameObservations).toEqual(["a", "b"]);
  });

  it("recovers JSON embedded in prose", () => {
    const result = parseVideoStyleVisionAnalysis(
      'Sure! {"styleBrief": "Embedded brief."} Hope that helps!',
    );
    expect(result?.styleBrief).toBe("Embedded brief.");
  });

  it("returns null for non-JSON garbage", () => {
    expect(parseVideoStyleVisionAnalysis("not json at all")).toBeNull();
    expect(parseVideoStyleVisionAnalysis("")).toBeNull();
  });
});

describe("buildProductAgnosticStyleBrief", () => {
  it("builds a brief from structured analysis without naming the source product", () => {
    const out = buildProductAgnosticStyleBrief({
      metadata: { title: "rhode peptide lip tint", uploader: "rhode" },
      analysis: {
        sourceLabel: "rhode",
        summary: "Polished beauty ad.",
        scenes: [
          {
            id: "s1",
            range: "0-3s",
            title: "Hook",
            subject: "a cylindrical beauty product",
            action: "macro push-in",
            camera: "slow push-in",
            lighting: "soft diffused",
            composition: "centered",
            motion: "controlled",
            sound: "",
            confidence: 0.8,
            evidence: [],
          },
        ],
        promptDna: [
          { axis: "camera", finding: "slow push-in", reusablePrompt: "slow controlled push-in", confidence: 0.9 },
        ],
        confidence: { overall: 0.8, visual: 0.8, motion: 0.7, prompt: 0.6 },
        caveats: [],
      },
      frameObservations: ["Macro close-up of glossy texture."],
    });

    expect(out.styleBrief).toContain("Motion grammar (product-agnostic)");
    expect(out.styleBrief).toContain("Hook");
    expect(out.styleBrief).toContain("camera: slow push-in");
    expect(out.styleBrief).toContain("Frame 1: Macro close-up");
    expect(out.styleBrief).not.toMatch(/rhode|peptide/i);
  });

  it("falls back to a generic motion grammar when analysis is empty", () => {
    const out = buildProductAgnosticStyleBrief({ metadata: {} });
    expect(out.styleBrief).toContain("Polished short-form beauty-ad pacing");
    expect(out.summary).toContain("Reference creative system");
  });
});

describe("buildEnhancedPromptPlan", () => {
  it("combines style brief grammar with the target product", () => {
    const plan = buildEnhancedPromptPlan({
      styleBrief: "Slow push-in, macro texture, soft light.",
      productContext: "N°7 glossy pink lipstick",
    });

    expect(plan).toContain("N°7 glossy pink lipstick");
    expect(plan).toContain("Slow push-in, macro texture, soft light.");
    expect(plan).toContain("replaced by N°7 glossy pink lipstick's own packaging identity");
  });

  it("uses a default base prompt when none is given", () => {
    const plan = buildEnhancedPromptPlan({
      styleBrief: "",
      productContext: "Acme serum",
    });
    expect(plan).toContain("Create a premium product video for Acme serum");
  });

  it("demands source product identity be replaced by the target", () => {
    const plan = buildEnhancedPromptPlan({
      styleBrief: "x",
      productContext: "MyBrand cream",
    });
    expect(plan).toContain("replaced by MyBrand cream's own packaging identity");
  });
});

describe("buildEnhancedPromptInstruction", () => {
  const product = "N°7 glossy pink lipstick";

  it("faithful stays on the brief — no arc re-inference, no Shot blocks", () => {
    const instr = buildEnhancedPromptInstruction(product, "faithful");
    expect(instr).toContain("PRESERVING its creative idea and wording as faithfully");
    expect(instr).toContain("Do NOT re-invent the advertising arc");
    expect(instr).not.toMatch(/Shot N blocks/i);
    expect(instr).toContain("source-free composition");
  });

  it("balanced keeps the arc but mirrors the brief's beat order", () => {
    const instr = buildEnhancedPromptInstruction(product, "balanced");
    expect(instr).toContain("Keep the brief's creative beat arc and its core idea");
    expect(instr).toContain("mirroring the brief's beat order");
  });

  it("rewrite re-infers the arc and restructures into Shot N blocks", () => {
    const instr = buildEnhancedPromptInstruction(product, "rewrite");
    expect(instr).toContain("First infer the advertising idea");
    expect(instr).toContain("3 concise Shot N blocks");
  });

  it("every fidelity injects the source-strip rule", () => {
    for (const f of ["faithful", "balanced", "rewrite"] as const) {
      expect(buildEnhancedPromptInstruction(product, f)).toContain(
        "No source brand, logo, packaging, people, typography, CTA, price, or exact scene",
      );
    }
  });
});

describe("fidelityTemperature", () => {
  it("keeps faithful coldest and rewrite warmest", () => {
    expect(fidelityTemperature("faithful")).toBeLessThan(fidelityTemperature("balanced"));
    expect(fidelityTemperature("balanced")).toBeLessThanOrEqual(fidelityTemperature("rewrite"));
    expect(fidelityTemperature("faithful")).toBeLessThanOrEqual(0.4);
    expect(fidelityTemperature("rewrite")).toBeGreaterThanOrEqual(0.4);
  });
});

describe("selectSeedanceReferenceFrame", () => {
  it("selects an information-rich reference frame and keeps it first for analysis", () => {
    const frames = [frame(100), frame(400), frame(900), frame(2000), frame(1200), frame(300)];
    const reference = selectSeedanceReferenceFrame(frames);
    const selected = selectSeedanceAnalysisFrames(frames, reference, 4);

    expect(reference).toMatchObject({ imageUrl: frames[3], frameIndex: 3 });
    expect(selected).toHaveLength(4);
    expect(selected[0]).toBe(reference?.imageUrl);
    expect(new Set(selected).size).toBe(selected.length);
  });
});
