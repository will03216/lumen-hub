/**
 * The variant bench — PRD §10.5.
 *
 * §10.3's selection table is a hypothesis. Every entry in it is a guess about
 * how Seedance responds to a given way of presenting an edit, and shipping a
 * guess as a default is how a feature ends up working on the demo clip and
 * nothing else. This module is the machinery for replacing it with a
 * measurement.
 *
 * ── What is here and what is not ─────────────────────────────────────────
 *
 * The SCORING and AGGREGATION are here, pure and tested: what the axes are,
 * how a variant's score for an edit class is computed, and how a winner is
 * picked. Running the bench needs live API access, real clips and a human to
 * score them — that is scripts/video-edit-bench.ts.
 *
 * Splitting it this way means the part that decides what "wins" is reviewable
 * and testable without spending a cent, and the runner is a thin shell around
 * it. It also means a run's raw results can be re-aggregated later, when the
 * weighting is argued about — and it will be.
 *
 * ── The weighting, stated so it can be disagreed with ────────────────────
 *
 * The headline score is `editFidelity × editPersistence`. A multiplication,
 * not a mean, and that is the whole opinion: a change that is present at frame
 * one and gone by the last frame is not half a success, it is a failure that
 * demos well. Multiplying makes a zero on either axis a zero overall, which is
 * what a user would say if asked.
 *
 * `sourceFidelity` and `motionQuality` are reported and deliberately NOT in
 * the headline. They matter, but a variant that preserves the background
 * perfectly while failing to make the edit is not the one to ship.
 */

import type { PromptVariantId } from "./types";

/**
 * The three kinds of edit, which are expected to want different variants.
 *
 * This split is itself part of the hypothesis: §10.3 assumes a compositional
 * edit behaves differently from a restyle. If the bench shows one variant
 * winning every class, the selector collapses to a constant and that is a
 * result worth having.
 */
export type EditClass = "appearance" | "compositional" | "motion";

export const EDIT_CLASSES: readonly EditClass[] = [
  "appearance",
  "compositional",
  "motion",
] as const;

/** One clip in the fixed bench set. */
export type BenchClip = {
  id: string;
  url: string;
  editClass: EditClass;
  /** What the user would have typed. */
  intent: string;
  /** What the frame edit should say. */
  frameInstruction: string;
  /** Seconds — where the edit is most legible. */
  at: number;
  ratio: string;
  /** Whether a person is on screen. Drives the constraint line, and the
   *  bench must include enough of these to be honest: privacy moderation only
   *  fires on faces, so a bench without them measures the easy case. */
  hasPerson: boolean;
};

/** 1–5 on each axis. Scored blind — the scorer must not know which variant
 *  produced which clip, or the §10.3 hypothesis scores itself. */
export type BenchScore = {
  /** Is the requested change there at all? */
  editFidelity: number;
  /** Does it survive to the last frame? */
  editPersistence: number;
  /** Is everything else preserved? */
  sourceFidelity: number;
  /** Artefacts, warping, flicker. */
  motionQuality: number;
};

export type BenchResult = {
  clipId: string;
  editClass: EditClass;
  variant: PromptVariantId;
  score?: BenchScore;
  /** Set when the render never produced a clip. Distinct from a score of 1:
   *  a moderation block is a different failure from a bad render, and
   *  averaging them together hides which one a variant suffers from. */
  failure?: "moderation" | "error" | "timeout";
  latencyMs?: number;
};

export type VariantSummary = {
  variant: PromptVariantId;
  /** editFidelity × editPersistence, averaged over scored runs. Max 25. */
  headline: number;
  editFidelity: number;
  editPersistence: number;
  sourceFidelity: number;
  motionQuality: number;
  /** Scored runs. A summary over one clip is not evidence. */
  n: number;
  /** Runs that produced nothing, by cause. */
  failures: { moderation: number; error: number; timeout: number };
  /** Failures as a share of all attempts. A variant that wins on the clips it
   *  renders while failing half of them is not the better variant, and the
   *  headline alone would not say so. */
  failureRate: number;
};

export function summarize(
  results: readonly BenchResult[],
  variant: PromptVariantId,
): VariantSummary {
  const mine = results.filter((r) => r.variant === variant);
  const scored = mine.filter((r): r is BenchResult & { score: BenchScore } =>
    Boolean(r.score),
  );

  const failures = {
    moderation: mine.filter((r) => r.failure === "moderation").length,
    error: mine.filter((r) => r.failure === "error").length,
    timeout: mine.filter((r) => r.failure === "timeout").length,
  };
  const failureCount = failures.moderation + failures.error + failures.timeout;

  const mean = (pick: (s: BenchScore) => number) =>
    scored.length === 0
      ? 0
      : scored.reduce((sum, r) => sum + pick(r.score), 0) / scored.length;

  return {
    variant,
    // Per-run product, then averaged — NOT the product of the two averages.
    // Those differ, and the per-run form is the one that says "this variant
    // both landed the edit and held it, on the same clip".
    headline:
      scored.length === 0
        ? 0
        : scored.reduce(
            (sum, r) => sum + r.score.editFidelity * r.score.editPersistence,
            0,
          ) / scored.length,
    editFidelity: mean((s) => s.editFidelity),
    editPersistence: mean((s) => s.editPersistence),
    sourceFidelity: mean((s) => s.sourceFidelity),
    motionQuality: mean((s) => s.motionQuality),
    n: scored.length,
    failures,
    failureRate: mine.length === 0 ? 0 : failureCount / mine.length,
  };
}

/** The minimum scored runs before a class's winner is treated as a result
 *  rather than as noise. Three is not a lot; it is the point below which a
 *  single lucky render decides the default. */
export const MIN_RUNS_FOR_A_VERDICT = 3;

export type ClassVerdict = {
  editClass: EditClass;
  winner: PromptVariantId | null;
  /** Why there is no winner, when there isn't. */
  reason?: string;
  ranking: VariantSummary[];
};

/**
 * Pick a winner for one edit class.
 *
 * Returns null rather than a coin-flip when the evidence is thin or the top
 * two are within noise of each other. A default chosen from a 0.1 difference
 * over three clips is not a measurement, and recording it as one would end the
 * argument on the wrong side.
 */
export function verdictFor(
  results: readonly BenchResult[],
  editClass: EditClass,
  variants: readonly PromptVariantId[] = ["A", "B", "C", "D", "E"],
): ClassVerdict {
  const scoped = results.filter((r) => r.editClass === editClass);
  const ranking = variants
    .map((v) => summarize(scoped, v))
    .sort((a, b) => b.headline - a.headline);

  const top = ranking[0];
  if (!top || top.n < MIN_RUNS_FOR_A_VERDICT) {
    return {
      editClass,
      winner: null,
      reason: `Not enough scored runs — the best variant has ${top?.n ?? 0}, and ${MIN_RUNS_FOR_A_VERDICT} is the floor.`,
      ranking,
    };
  }

  const runnerUp = ranking[1];
  if (runnerUp && top.headline - runnerUp.headline < TIE_THRESHOLD) {
    return {
      editClass,
      winner: null,
      reason: `${top.variant} and ${runnerUp.variant} are within ${TIE_THRESHOLD} of each other (${top.headline.toFixed(2)} vs ${runnerUp.headline.toFixed(2)}) — too close to call.`,
      ranking,
    };
  }

  return { editClass, winner: top.variant, ranking };
}

/**
 * How far ahead the leader must be, on a 25-point headline scale.
 *
 * 1.0 is roughly "a whole point of fidelity on one clip in five". Below that
 * the difference is scorer variance, not the variant.
 */
export const TIE_THRESHOLD = 1.0;

/**
 * The measured table, once a bench has run.
 *
 * Empty until then, and `selectVariant` falls through to the §10.3 heuristic
 * for any class with no verdict. That fallthrough is the honest behaviour:
 * a class we have not measured should keep using the hypothesis rather than
 * inheriting another class's answer.
 */
export type MeasuredDefaults = Partial<Record<EditClass, PromptVariantId>>;

export function measuredDefaultsFrom(
  results: readonly BenchResult[],
): MeasuredDefaults {
  const out: MeasuredDefaults = {};
  for (const cls of EDIT_CLASSES) {
    const verdict = verdictFor(results, cls);
    if (verdict.winner) out[cls] = verdict.winner;
  }
  return out;
}

/**
 * Classify an intent into a bench class, so a live session can look up its
 * measured default.
 *
 * Shares its vocabulary with the §10.3 selector deliberately: if the bench
 * classifies "remove the cup" as compositional and the selector does not, the
 * measured default is applied to a different population than it was measured
 * on.
 */
export function classifyIntent(intent: string): EditClass {
  if (/\b(remove|delete|erase|add|insert|place|replace|swap|take out)\b/i.test(intent)) {
    return "compositional";
  }
  if (
    /\b(walk|run|turn|move|camera|pan|tilt|push|dolly|track|orbit|zoom|crane)\b/i.test(
      intent,
    )
  ) {
    return "motion";
  }
  return "appearance";
}

/** A short human report, for the runner and for pasting into the PRD. */
export function formatReport(results: readonly BenchResult[]): string {
  const lines: string[] = [];
  for (const cls of EDIT_CLASSES) {
    const verdict = verdictFor(results, cls);
    lines.push(`## ${cls}`);
    lines.push(
      verdict.winner
        ? `Winner: ${verdict.winner}`
        : `No winner — ${verdict.reason}`,
    );
    lines.push("");
    lines.push("| variant | headline | fidelity | persistence | source | motion | n | fail% |");
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const s of verdict.ranking) {
      lines.push(
        `| ${s.variant} | ${s.headline.toFixed(2)} | ${s.editFidelity.toFixed(2)} | ${s.editPersistence.toFixed(2)} | ${s.sourceFidelity.toFixed(2)} | ${s.motionQuality.toFixed(2)} | ${s.n} | ${(s.failureRate * 100).toFixed(0)}% |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
