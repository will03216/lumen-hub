/**
 * Forge — budget estimation + gates.
 *
 * "Show projected spend at the freeze gate" and "hard budget ceilings" are not
 * optional in an agentic media pipeline — agentic loops can explode cost. This
 * module turns a Production Spec into a per-shot + total estimate (accounting
 * for the regen cap, since the inner critic loop can re-render up to N times)
 * and flags any spec that would breach the template's caps.
 *
 * Pure, client-safe.
 */

import type { ProductionSpec, ProductionShot } from "./spec";
import { CAPABILITIES } from "./capabilities";

export type ShotCostEstimate = {
  shotId: string;
  title: string;
  /** Cost of one clean pass (single generation). */
  baseUsd: number;
  /** Worst-case including the regen cap (base × (1 + regenCap)). */
  worstCaseUsd: number;
  breach: boolean;
};

export type SpecCostEstimate = {
  perShot: ShotCostEstimate[];
  /** Expected spend assuming an average of ~1 regen across the project. */
  expectedUsd: number;
  /** Hard ceiling: every shot regenerates to its cap. */
  worstCaseUsd: number;
  projectCapUsd: number;
  /** True when worst-case spend would breach the project cap. */
  breach: boolean;
  notes: string[];
};

/** Cost of generating one shot once, from the spec's output contract. */
function baseShotCost(spec: ProductionSpec, shot: ProductionShot): number {
  const out = spec.global.output;
  if (out.kind === "image") {
    return CAPABILITIES.imageGen.perImageUsd ?? 0.04;
  }
  const seconds = shot.durationS ?? out.durationS ?? 5;
  const perSecond = CAPABILITIES.videoGen.perSecondUsd ?? 0.18;
  // 1080p+ carries an upscale/quality premium.
  const resMultiplier = (shot.resolution ?? out.resolution) === "1080p" ? 1.4 : 1;
  return seconds * perSecond * resMultiplier;
}

export function estimateSpecCost(spec: ProductionSpec): SpecCostEstimate {
  const regenCap = Math.max(0, spec.global.budget.regenCap);
  const perShotCap = spec.global.budget.perShotCapUsd;
  const notes: string[] = [];

  const perShot: ShotCostEstimate[] = spec.shots.map((shot) => {
    const base = baseShotCost(spec, shot);
    const worst = base * (1 + regenCap);
    const breach = worst > perShotCap * (1 + regenCap) || base > perShotCap;
    return {
      shotId: shot.id,
      title: shot.title,
      baseUsd: round(base),
      worstCaseUsd: round(worst),
      breach,
    };
  });

  const baseTotal = perShot.reduce((s, p) => s + p.baseUsd, 0);
  // Expected ≈ one extra regen amortised across the whole project.
  const expected = round(baseTotal * (regenCap > 0 ? 1.25 : 1));
  const worst = round(perShot.reduce((s, p) => s + p.worstCaseUsd, 0));
  const breach = worst > spec.global.budget.projectCapUsd;

  if (breach) {
    notes.push(
      `Worst-case spend ($${worst}) exceeds the project cap ($${spec.global.budget.projectCapUsd}). The executor will halt at the cap and escalate to a human rather than overspend.`,
    );
  }
  if (perShot.some((p) => p.breach)) {
    notes.push("One or more shots exceed the per-shot cap on their own.");
  }
  notes.push(
    "Estimates use order-of-magnitude public pricing and include the regeneration cap. They bound spend decisions; actual billing is metered per call.",
  );

  return {
    perShot,
    expectedUsd: expected,
    worstCaseUsd: worst,
    projectCapUsd: spec.global.budget.projectCapUsd,
    breach,
    notes,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
