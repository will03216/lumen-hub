/**
 * Forge — Production Spec (the IR).
 *
 * The Production Spec is the *seam* between the probabilistic agent plane and
 * the deterministic executor. The agent (Director/Planner) reasons freely
 * within a vertical template's bounds and *compiles* its plan into this
 * machine-readable contract. Once frozen, the Spec drives deterministic
 * execution: `lib/forge/compiler.ts` expands it into a Studio node graph that
 * `app/studio/runner.ts` already knows how to run.
 *
 * Design stance (mirrors the HLD): "compile, don't improvise." Agency lives
 * *before* the freeze gate; determinism *after* it. Everything here is plain,
 * client-safe TypeScript (no server-only imports) so the same types flow
 * through the API, the freeze-gate UI, and the compiler.
 */

import type { PipelineTemplate } from "./templates/types";

// ─────────────────────────── Spec types ────────────────────────────────

export type OutputKind = "video" | "image";

export type SpecOutput = {
  kind: OutputKind;
  /** Aspect ratio, e.g. "9:16", "16:9", "2.39:1". */
  aspect: string;
  /** Total/target duration for video shots (seconds). Omit for image specs. */
  durationS?: number;
  fps?: number;
  /** e.g. "1080p", "720p". */
  resolution?: string;
  /** Image pixel size when kind === "image", e.g. "2048x2048". */
  imageSize?: string;
};

export type SpecBudget = {
  projectCapUsd: number;
  perShotCapUsd: number;
  /** Hard cap on regenerations per shot in the inner critic loop. */
  regenCap: number;
};

export type SpecGlobal = {
  output: SpecOutput;
  models: { video?: string; image?: string; upscale?: string };
  /** Typed reference handles the executor must inject on every relevant call,
   *  e.g. "identity:avatar_maya", "style:acme_look", "brand:acme_kit". */
  lockedRefs: string[];
  brandKit?: string;
  budget: SpecBudget;
};

export type ShotQA = {
  /** Deterministic + rubric checks that must pass, e.g. "hook_in_first_2s". */
  must: string[];
  /** Minimum VLM-critic score (0–1) to auto-promote without a human. */
  minScore: number;
};

export type ProductionShot = {
  id: string;
  /** Narrative role within the structure, e.g. "hook" | "body" | "cta" |
   *  "establishing" | "product_hero". */
  role: string;
  title: string;
  /** Compiled, model-ready prompt. This is what the executor renders. */
  prompt: string;
  /** Typed refs anchored to this specific shot (subset/refinement of global
   *  lockedRefs, possibly with a frame-chain anchor like
   *  "identity:avatar_maya@frame_007"). */
  refs: string[];
  /** Locked seed — set on approval so the final is reproducible. */
  seed?: number;
  durationS?: number;
  ratio?: string;
  resolution?: string;
  qa?: ShotQA;
  /** Shots batched by what the model must solve (close-up, wide, …) so visual
   *  conditions stay tight within a batch. */
  batchGroup?: string;
};

export type SpecGate = {
  id: string;
  /** "freeze" | "pre_publish" | "storyboard" | "pre_final" … */
  kind: string;
  status: "pending" | "approved" | "rejected";
};

export type ProductionSpec = {
  specId: string;
  /** Content hash of everything that affects execution. Recomputed on every
   *  edit; pinned at freeze for reproducibility + lineage. */
  specHash: string;
  templateId: string;
  vertical: string;
  /** Free-text human brief the spec was compiled from. */
  brief: string;
  createdAt: number;
  frozen: boolean;
  frozenAt?: number;
  global: SpecGlobal;
  shots: ProductionShot[];
  gates: SpecGate[];
  qa: ShotQA;
};

// ─────────────────────────── Hashing ───────────────────────────────────

/** Deterministic, dependency-free string hash (djb2-xor). Not cryptographic —
 *  it identifies spec revisions for caching + lineage, not for security. */
function djb2(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  // >>> 0 forces unsigned; base36 keeps it short + URL-safe.
  return (h >>> 0).toString(36);
}

/** Canonical projection of the fields that actually drive execution. Excludes
 *  volatile bookkeeping (specId, specHash, createdAt, gate status) so two
 *  logically-identical plans hash equal. */
export function computeSpecHash(spec: ProductionSpec): string {
  const canonical = JSON.stringify({
    t: spec.templateId,
    g: spec.global,
    qa: spec.qa,
    s: spec.shots.map((sh) => ({
      r: sh.role,
      p: sh.prompt,
      refs: sh.refs,
      seed: sh.seed,
      d: sh.durationS,
      ratio: sh.ratio,
      res: sh.resolution,
      qa: sh.qa,
    })),
  });
  return "sha-djb2:" + djb2(canonical);
}

// ─────────────────────────── Validation ────────────────────────────────

export type SpecIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  shotId?: string;
};

export type SpecValidation = {
  ok: boolean;
  issues: SpecIssue[];
};

/**
 * Validate a compiled Spec against its template's policy. This is the guard
 * that runs *before* the freeze gate: a spec that violates tool scope, output
 * contract, or QA policy cannot be promoted to execution.
 *
 * Budget is validated separately (it needs cost metadata) in
 * `lib/forge/budget.ts` so this stays a pure schema/policy check.
 */
export function validateSpec(
  spec: ProductionSpec,
  template: PipelineTemplate,
): SpecValidation {
  const issues: SpecIssue[] = [];
  const err = (code: string, message: string, shotId?: string) =>
    issues.push({ level: "error", code, message, shotId });
  const warn = (code: string, message: string, shotId?: string) =>
    issues.push({ level: "warning", code, message, shotId });

  if (spec.shots.length === 0) {
    err("no_shots", "The spec has no shots to execute.");
  }

  // Output contract — the agent may not change the vertical's locked output.
  if (spec.global.output.kind !== template.output.kind) {
    err(
      "output_kind",
      `Output kind "${spec.global.output.kind}" does not match template "${template.output.kind}".`,
    );
  }
  if (spec.global.output.aspect !== template.output.aspect) {
    warn(
      "aspect_drift",
      `Aspect "${spec.global.output.aspect}" differs from template default "${template.output.aspect}".`,
    );
  }

  // Reference locking — every must-lock ref must be present in lockedRefs.
  for (const must of template.references.mustLock) {
    const present = spec.global.lockedRefs.some((r) =>
      r.toLowerCase().includes(must.toLowerCase()),
    );
    if (!present) {
      warn(
        "missing_locked_ref",
        `Template requires a locked reference for "${must}" — none found. Consistency will suffer until one is attached.`,
      );
    }
  }

  // QA policy — the spec's must-checks must cover the template's required set.
  for (const must of template.qa.must) {
    if (!spec.qa.must.includes(must)) {
      warn(
        "qa_coverage",
        `Template QA requires "${must}" but it is absent from the spec QA contract.`,
      );
    }
  }

  // Per-shot integrity.
  for (const shot of spec.shots) {
    if (!shot.prompt.trim()) {
      err("empty_prompt", `Shot "${shot.title}" has an empty prompt.`, shot.id);
    }
    if (spec.global.output.kind === "video") {
      const d = shot.durationS ?? spec.global.output.durationS;
      if (!d || d <= 0) {
        warn(
          "no_duration",
          `Shot "${shot.title}" has no duration; the executor will fall back to the model default.`,
          shot.id,
        );
      }
    }
  }

  // Freeze must be a required gate for every template.
  if (!spec.gates.some((g) => g.kind === "freeze")) {
    err("no_freeze_gate", "Spec is missing the mandatory freeze gate.");
  }

  return { ok: !issues.some((i) => i.level === "error"), issues };
}

// ─────────────────────────── Construction ──────────────────────────────

/** Short, URL-safe, creation-ordered id (mirrors lib/studio/projects.ts). */
export function newSpecId(prefix = "sp"): string {
  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

/**
 * Assemble a ProductionSpec from a template + the planner's shot output. This
 * is the "Spec Compiler" step: it stamps the template's locked policy (output,
 * models, refs, budget, QA, gates) onto the agent's creative shot list, then
 * computes the content hash. The result is ready for validation + the freeze
 * gate.
 */
export function assembleSpec(args: {
  template: PipelineTemplate;
  brief: string;
  shots: ProductionShot[];
  lockedRefs?: string[];
  brandKit?: string;
}): ProductionSpec {
  const { template, brief } = args;
  const spec: ProductionSpec = {
    specId: newSpecId(),
    specHash: "",
    templateId: template.id,
    vertical: template.vertical,
    brief,
    createdAt: Date.now(),
    frozen: false,
    global: {
      output: { ...template.output },
      models: { ...template.models },
      lockedRefs: args.lockedRefs ?? [...template.references.mustLock.map((r) => `lock:${r}`)],
      brandKit: args.brandKit,
      budget: { ...template.budget },
    },
    shots: args.shots,
    gates: [
      { id: "g_freeze", kind: "freeze", status: "pending" },
      ...(template.gates.publish === "human"
        ? [{ id: "g_publish", kind: "pre_publish", status: "pending" as const }]
        : []),
    ],
    qa: { must: [...template.qa.must], minScore: template.qa.minScore },
  };
  spec.specHash = computeSpecHash(spec);
  return spec;
}

/** Freeze a spec: pin the hash, mark frozen, approve the freeze gate. After
 *  this the compiler may expand it to a graph and the executor may run it. */
export function freezeSpec(spec: ProductionSpec): ProductionSpec {
  const frozen: ProductionSpec = {
    ...spec,
    frozen: true,
    frozenAt: Date.now(),
    gates: spec.gates.map((g) =>
      g.kind === "freeze" ? { ...g, status: "approved" } : g,
    ),
  };
  frozen.specHash = computeSpecHash(frozen);
  return frozen;
}
