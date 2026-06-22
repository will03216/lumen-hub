/**
 * Forge — Pipeline Template (a vertical, as data).
 *
 * A Pipeline Template is the unit of "launch a new customer / vertical." It is
 * *data that compiles*, not code: tool scope, locked references, output
 * contract, QA criteria, gates, budgets, default models, and the guidance the
 * Director/Planner agent reasons within. Filming vs UGC vs E-commerce differ
 * only in this data — never in the core engine.
 *
 * Pure, client-safe types (shared by the planner, the freeze-gate UI, and the
 * compiler).
 */

import type { NodeTypeId } from "@/app/studio/types";
import type { OutputKind, SpecOutput, SpecBudget, ShotQA } from "../spec";

export type AgencyLevel = "locked" | "low" | "medium" | "high";

export type PipelineTemplate = {
  /** Stable id, e.g. "ugc.v1", "filming.v1". */
  id: string;
  /** Vertical family, e.g. "ugc", "filming", "ecommerce". */
  vertical: string;
  label: string;
  /** One-line positioning shown on the vertical picker. */
  tagline: string;
  description: string;
  /** Lucide icon name (resolved in the UI). */
  icon: string;
  /** Accent hue for the card (Tailwind-friendly hex). */
  accent: string;

  /** Locked output contract the agent may not change. */
  output: SpecOutput & { kind: OutputKind; structure?: string[] };

  /** Default model routing. */
  models: { video?: string; image?: string; upscale?: string };

  /** The only Studio node types the compiler may emit for this template — the
   *  agent literally cannot call out-of-scope capabilities. */
  toolScope: NodeTypeId[];

  references: {
    /** Reference categories that must be locked, e.g. ["brand_avatar",
     *  "brand_colors", "logo"]. */
    mustLock: string[];
    identityRefs?: { min: number; recommended: number };
  };

  /** Consistency-engine switches for this vertical. */
  consistency: {
    frameChaining: boolean;
    batchBySolveType: boolean;
    bible: boolean;
    seedLock: boolean;
  };

  /** QA contract: required checks + auto-promote threshold. */
  qa: ShotQA;

  /** Variation policy (A/B at scale). */
  variations?: { count: number; batch: boolean };

  /** Human gates. `freeze` is always required. */
  gates: { freeze: "required"; publish: "auto" | "human" };

  budget: SpecBudget;

  /** Per-stage agency levels (informational + fed to the planner). */
  agency: Record<string, AgencyLevel>;

  // ── Planner inputs ──
  /** How many shots/clips the planner should target by default. */
  defaultShotCount: number;
  /** Allowed roles in narrative order — the planner assigns each shot a role. */
  shotRoles: string[];
  /** Vertical-specific instructions injected into the Planner agent's system
   *  prompt. Encodes the creative + consistency doctrine for this vertical. */
  plannerGuidance: string;
};
