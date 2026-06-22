/**
 * Forge — offline smoke test for the deterministic (post-freeze) half.
 *
 * Exercises everything that does NOT need an API key: the vertical templates,
 * Spec assembly + policy validation, budget estimation, the Spec→Canvas
 * compiler (incl. tool-scope enforcement), freeze, and the Production Bible.
 * The agentic half (Planner/Critic Claude calls) is covered by the manual UI
 * flow, not here.
 *
 * Run: npm test            (or: npm test -- forge)
 */

import { describe, it, expect } from "vitest";
import { listTemplates, getTemplate } from "./templates";
import type { PipelineTemplate } from "./templates/types";
import {
  assembleSpec,
  validateSpec,
  freezeSpec,
  computeSpecHash,
  type ProductionShot,
} from "./spec";
import { estimateSpecCost } from "./budget";
import { compileSpecToCanvas } from "./compiler";
import { appendBibleEvent, getBible, deriveBibleState } from "./bible";

/** Fabricate a plausible shot list for a template (stands in for the Planner). */
function mockShots(t: PipelineTemplate): ProductionShot[] {
  const count = t.defaultShotCount;
  return Array.from({ length: count }, (_, i): ProductionShot => {
    const role = t.shotRoles[Math.min(i, t.shotRoles.length - 1)];
    return {
      id: `s${i + 1}`,
      role,
      title: `${role} shot`,
      prompt: `A dense, model-ready ${role} prompt for ${t.label}. Subject, action, environment, camera, lighting, style.`,
      refs: t.references.mustLock.map((r) => `lock:${r}`),
      durationS: t.output.kind === "video" ? 5 : undefined,
      seed: 482913 + i,
      qa: { must: [...t.qa.must], minScore: t.qa.minScore },
    };
  });
}

describe("Forge vertical templates", () => {
  it("registers exactly the three v1 verticals", () => {
    const ids = listTemplates().map((t) => t.id).sort();
    expect(ids).toEqual(["advertisement.v1", "ecommerce.v1", "filming.v1"]);
  });

  it.each(listTemplates().map((t) => [t.id, t] as const))(
    "%s: brief → spec → validate → estimate → compile",
    (_id, t) => {
      // 1. Assemble a Production Spec from the template + (mock) planner shots.
      const spec = assembleSpec({ template: t, brief: "test brief", shots: mockShots(t) });
      expect(spec.shots.length).toBe(t.defaultShotCount);
      expect(spec.global.output.kind).toBe(t.output.kind);
      expect(spec.gates.some((g) => g.kind === "freeze")).toBe(true);

      // 2. Policy validation: no hard errors for a well-formed spec.
      const v = validateSpec(spec, t);
      expect(v.ok).toBe(true);
      expect(v.issues.filter((i) => i.level === "error")).toHaveLength(0);

      // 3. Budget estimate is positive and reports the cap.
      const cost = estimateSpecCost(spec);
      expect(cost.expectedUsd).toBeGreaterThan(0);
      expect(cost.projectCapUsd).toBe(t.budget.projectCapUsd);
      expect(cost.perShot).toHaveLength(spec.shots.length);

      // 4. Compiler expands the spec into a runnable canvas, in tool scope.
      const { canvas, droppedOutOfScope } = compileSpecToCanvas(spec, t);
      expect(droppedOutOfScope).toHaveLength(0);
      expect(canvas.nodes.length).toBeGreaterThan(0);

      const generatorType = t.output.kind === "video" ? "videoGen" : "imageGen";
      const generators = canvas.nodes.filter((n) => n.type === generatorType);
      expect(generators).toHaveLength(spec.shots.length);

      // Each generator is QA-guarded: the compiler stamps the rubric + regen cap.
      for (const g of generators) {
        const form = g.data.form as { qaChecks?: string[]; regenCap?: number };
        expect((form.qaChecks ?? []).length).toBeGreaterThan(0);
        expect(form.regenCap).toBe(t.budget.regenCap);
      }

      // Every node type the compiler emitted must be inside the template scope.
      for (const n of canvas.nodes) {
        expect(t.toolScope).toContain(n.type);
      }

      // Multi-shot video → a stitch finisher joins the clips.
      if (t.output.kind === "video" && spec.shots.length > 1) {
        expect(canvas.nodes.some((n) => n.type === "videoStitch")).toBe(true);
      }

      // Frame-chaining: one Frame Extract per gap, each wired
      // prevGen.url → frameExtract.video and frameExtract.frame → nextGen.image.
      if (t.output.kind === "video" && spec.shots.length > 1 && t.consistency.frameChaining) {
        const fxNodes = canvas.nodes.filter((n) => n.type === "frameExtract");
        expect(fxNodes).toHaveLength(spec.shots.length - 1);
        for (const fx of fxNodes) {
          const intoFx = canvas.edges.find((e) => e.target === fx.id && e.targetHandle === "video");
          const outOfFx = canvas.edges.find((e) => e.source === fx.id && e.sourceHandle === "frame");
          expect(intoFx?.sourceHandle).toBe("url"); // fed by a generator's url
          expect(outOfFx?.targetHandle).toBe("image"); // into next clip's first-frame
        }
      }

      // Seed-lock templates carry the locked seed into the generator form.
      if (t.consistency.seedLock) {
        const withSeed = generators.some(
          (g) => String((g.data.form as { seed?: string }).seed ?? "").length > 0,
        );
        expect(withSeed).toBe(true);
      }
    },
  );

  it("freezing pins the hash and approves the freeze gate", () => {
    const t = getTemplate("advertisement.v1")!;
    const spec = assembleSpec({ template: t, brief: "freeze me", shots: mockShots(t) });
    const frozen = freezeSpec(spec);
    expect(frozen.frozen).toBe(true);
    expect(frozen.frozenAt).toBeGreaterThan(0);
    expect(frozen.gates.find((g) => g.kind === "freeze")?.status).toBe("approved");
    expect(frozen.specHash).toBe(computeSpecHash(frozen));
  });

  it("enforces tool scope: a template missing its generator compiles to nothing", () => {
    const t = getTemplate("filming.v1")!;
    const scopedOut: PipelineTemplate = { ...t, toolScope: t.toolScope.filter((x) => x !== "videoGen") };
    const spec = assembleSpec({ template: scopedOut, brief: "x", shots: mockShots(t) });
    const { canvas, droppedOutOfScope } = compileSpecToCanvas(spec, scopedOut);
    expect(canvas.nodes).toHaveLength(0);
    expect(droppedOutOfScope).toContain("videoGen");
  });
});

describe("Production Bible (continuity memory)", () => {
  it("appends events and derives latest-wins state", () => {
    const pid = "test_prod_" + Math.random().toString(36).slice(2);
    appendBibleEvent(pid, "filming.v1", {
      kind: "character",
      key: "detective_kane",
      description: "weathered trench coat, grey stubble",
      seed: 1234,
    });
    appendBibleEvent(pid, "filming.v1", {
      kind: "character",
      key: "detective_kane",
      description: "weathered trench coat, grey stubble, now soaked from rain",
      seed: 1234,
    });
    const state = deriveBibleState(getBible(pid));
    expect(state["character:detective_kane"].description).toContain("soaked");
  });
});
