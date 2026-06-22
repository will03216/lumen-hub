/**
 * Forge — Prompt Engineer agent (server-only). The optional "second pass".
 *
 * The Planner decomposes the brief into shots (creative intent). The Prompt
 * Engineer then takes ONE shot at a time and runs it through the FULL Seedance
 * optimization pipeline — the same machinery the Prompt Optimizer node /
 * optimize-prompt route use — grounded in the real reference docs. This is what
 * the bundled Claude skill does for a single prompt; here it runs per shot
 * across a whole multi-shot production, with the shot's role + locked refs as
 * context.
 *
 * Two upgrades over the single Planner pass:
 *   1. Depth — the whole pipeline (triage → 6-component → anti-slop →
 *      prose-craft → integrity check) runs with full attention on one shot.
 *   2. Computed duration — duration-calculus runs per shot instead of a guess.
 *
 * Frame-chaining I2V mode is threaded through (`mode`) for when the compiler
 * wires first-frames between shots; today it defaults to T2V to match the
 * compiled graph.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildGroundedSystem } from "@/lib/server/seedance-skill";
import { SEEDANCE_OPTIMIZER_PROMPT } from "../seedance-directive";
import type { PipelineTemplate } from "../templates/types";
import type { ProductionShot } from "../spec";

const MAX_TOKENS = 4000;

export type ShotMode = "t2v" | "i2v" | "r2v";

export type EngineeredPrompt = {
  prompt: string;
  /** Duration computed via duration-calculus (seconds), if the model returned it. */
  durationS?: number;
  selectedDocs: string[];
};

function buildUser(shot: ProductionShot, template: PipelineTemplate, mode: ShotMode): string {
  const modeLine =
    mode === "i2v"
      ? "Mode: Image-to-Video (I2V). The previous shot's final frame carries the subject and environment forward — describe ONLY motion, camera movement, and expression change. Do NOT restate identity, wardrobe, or set already established."
      : mode === "r2v"
        ? "Mode: Reference-to-Video (R2V). State what to transfer from each reference (motion, camera rhythm, style)."
        : "Mode: Text-to-Video (T2V). Build the full scene from scratch with the 6-component formula.";

  const lockLine = template.references.mustLock.length
    ? `These references are LOCKED for this production and must stay identical across shots: ${template.references.mustLock.join(", ")}. Keep the subject's identity consistent; vary only what this shot changes.`
    : "";

  return [
    `Optimize this single shot of a ${template.label} production (role: ${shot.role}).`,
    "",
    "RAW SHOT IDEA:",
    '"""',
    shot.prompt.trim(),
    '"""',
    "",
    modeLine,
    lockLine,
    `Output contract: ${template.output.kind === "video" ? `video, ${template.output.aspect}` : `image, ${template.output.aspect}`}.`,
    "Produce a single dense, render-reliable prompt (one paragraph; Subject → Action → Environment → Camera → Lighting → Style → Constraints). Compute the duration with the duration-calculus rules rather than guessing.",
    "",
    'Output the optimized prompt first — no preamble, no quotes, no fences. Then on a single final line output exactly "DURATION: <N>" where N is the computed duration in seconds (integer 4–15). Output nothing after that line.',
  ]
    .filter(Boolean)
    .join("\n");
}

/** Strip stray fences + peel the trailing DURATION line. */
function parseOutput(raw0: string): { prompt: string; durationS?: number } {
  let raw = raw0.replace(/^```(?:\w+)?\n?/i, "").replace(/\n?```$/i, "").trim();
  let durationS: number | undefined;
  const m = raw.match(/\n?\s*DURATION:\s*(\d{1,2})\s*$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) durationS = Math.min(15, Math.max(4, n));
    raw = raw.slice(0, m.index).trim();
  }
  return { prompt: raw, durationS };
}

export async function runPromptEngineer(args: {
  shot: ProductionShot;
  template: PipelineTemplate;
  apiKey: string;
  model?: string;
  mode?: ShotMode;
}): Promise<EngineeredPrompt> {
  const { shot, template, apiKey } = args;
  const mode = args.mode ?? "t2v";
  const client = new Anthropic({ apiKey });
  // Prompt synthesis is a "mid-tier" job — default to Sonnet, not Opus.
  const model = args.model?.trim() || "claude-sonnet-4-6";

  const { system, selectedDocs } = await buildGroundedSystem(SEEDANCE_OPTIMIZER_PROMPT, {
    brief: shot.prompt,
    mode,
    shotCount: 1,
    hasReferences: template.references.mustLock.length > 0,
  });

  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: buildUser(shot, template, mode) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  if (!raw.trim()) throw new Error("Prompt Engineer returned an empty response.");

  const { prompt, durationS } = parseOutput(raw);
  if (!prompt) throw new Error("Prompt Engineer returned no prompt.");
  return { prompt, durationS, selectedDocs };
}

// ─────────────────────── Reviser (reflexion) ───────────────────────────
//
// The "improve the prompt when the output is bad" step. Instead of blindly
// appending the critic's note, this re-runs the prompt through the Seedance
// optimizer *with the critic's per-check failures as constraints* — producing a
// revised, still-well-formed prompt that fixes exactly what failed while
// preserving what passed. This is the reflexion / self-refine pattern: the
// critic's structured feedback drives a targeted rewrite, not a string append.

export type CriticFailure = { check: string; reason: string };

export type ReviseInput = {
  /** The original spec intent (what the critic scores against — unchanged). */
  intent: string;
  /** The prompt that underperformed and should be revised. */
  currentPrompt: string;
  /** Per-check failures from the critic. */
  failed: CriticFailure[];
  /** One-line localized fix hint. */
  fixHint: string;
  /** Targeted doctrine hints from the lever table (per failing dimension). */
  hints?: string[];
  kind: "image" | "video";
  mode?: ShotMode;
  aspect?: string;
  apiKey: string;
  model?: string;
};

function buildReviseUser(input: ReviseInput): string {
  const failures = input.failed.length
    ? input.failed.map((f) => `- ${f.check}: ${f.reason || "failed"}`).join("\n")
    : `- ${input.fixHint || "overall quality below threshold"}`;
  return [
    "A previous generation from the prompt below UNDERPERFORMED. Revise the prompt to fix exactly the flagged problems while preserving everything that already worked. Do not drift from the original creative intent.",
    "",
    "ORIGINAL INTENT (do not contradict this):",
    `"""`,
    input.intent.trim(),
    `"""`,
    "",
    "CURRENT PROMPT (revise this):",
    `"""`,
    input.currentPrompt.trim(),
    `"""`,
    "",
    "CRITIC FOUND THESE PROBLEMS:",
    failures,
    "",
    input.fixHint ? `MOST IMPORTANT FIX: ${input.fixHint}` : "",
    input.hints && input.hints.length
      ? "\nTARGETED GUIDANCE (apply each that is relevant):\n" + input.hints.map((h) => `- ${h}`).join("\n")
      : "",
    "",
    "Apply the relevant doctrine for each failing dimension. Keep the prompt dense and single-paragraph.",
    input.kind === "video"
      ? 'Output the revised prompt first, then on a final line "DURATION: <N>". Nothing after.'
      : "Output ONLY the revised prompt — no preamble, no fences, no DURATION line.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Revise an underperforming prompt from the critic's structured feedback.
 *  Grounds video revisions in the Seedance docs; image revisions use a plain
 *  craft directive (Seedance doctrine is video-specific). */
export async function runPromptReviser(input: ReviseInput): Promise<{ prompt: string; durationS?: number }> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const model = input.model?.trim() || "claude-sonnet-4-6";
  const mode = input.mode ?? "t2v";

  let system: string | Anthropic.TextBlockParam[];
  if (input.kind === "video") {
    ({ system } = await buildGroundedSystem(SEEDANCE_OPTIMIZER_PROMPT, {
      brief: input.currentPrompt,
      mode,
      shotCount: 1,
      hasReferences: false,
    }));
  } else {
    system =
      "You are an expert image-generation prompt engineer. You revise a prompt to fix specific critic-flagged failures while preserving intent and any concrete specs. Output a dense, single-paragraph prompt. No preamble, no fences.";
  }

  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: buildReviseUser(input) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  if (!raw.trim()) throw new Error("Reviser returned an empty response.");
  const { prompt, durationS } = parseOutput(raw);
  if (!prompt) throw new Error("Reviser returned no prompt.");
  return { prompt, durationS };
}
