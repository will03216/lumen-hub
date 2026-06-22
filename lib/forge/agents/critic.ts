/**
 * Forge — QA / Consistency Critic agent (server-only).
 *
 * The Critic is the async evaluator: a VLM-as-judge that scores a generated
 * asset against the shot's Production Spec intent + the template's QA rubric.
 * It returns a score, a pass/fail decision, and — crucially — a *localized
 * reason* per failed check so the inner loop can do targeted regeneration
 * rather than blind retries.
 *
 * v1 scores a single image (for image specs, the asset itself; for video
 * specs, a representative frame the caller extracts). Deterministic checks
 * (aspect/duration/codec) live in the executor; this is the semantic layer.
 */

import Anthropic from "@anthropic-ai/sdk";

export type CriticInput = {
  /** Public https URL of the image (or extracted video frame) to score. */
  imageUrl: string;
  /** The compiled prompt the asset was supposed to realize. */
  prompt: string;
  /** Rubric checks that must hold, e.g. ["brand_color_present","hook_in_first_2s"]. */
  mustChecks: string[];
  /** Auto-promote threshold (0–1). */
  minScore: number;
  apiKey: string;
  model?: string;
};

export type CheckResult = {
  check: string;
  pass: boolean;
  reason: string;
};

export type CriticVerdict = {
  /** Overall 0–1 quality/consistency score. */
  score: number;
  /** True when score ≥ minScore AND no must-check failed. */
  pass: boolean;
  checks: CheckResult[];
  /** One-line, localized summary of what to fix on regeneration. */
  fixHint: string;
};

const MAX_TOKENS = 2000;

function buildSystem(): string {
  return [
    "You are the QA / Consistency Critic in Forge, a guarded production pipeline.",
    "You score one generated asset against its intended prompt and a rubric of required checks.",
    "Be a strict, calibrated judge: reward on-brief, on-brand, consistent results; penalize drift, artifacts, missing brand elements, and off-spec composition.",
    "For each rubric check, decide pass/fail with a concrete, localized reason (name the region or element, not a vague verdict).",
    "Return ONLY JSON, no prose, no fences:",
    '{ "score": <0..1 float>, "checks": [ { "check": "<id>", "pass": <bool>, "reason": "<localized>" } ], "fix_hint": "<one line: the single most important thing to change on regeneration>" }',
  ].join("\n");
}

function buildUser(input: CriticInput): string {
  return [
    "INTENDED PROMPT:",
    '"""',
    input.prompt.trim(),
    '"""',
    "",
    "REQUIRED CHECKS (score each):",
    ...input.mustChecks.map((c) => `- ${c}`),
    "",
    "Judge the attached image against the prompt and every check. Return the JSON verdict now.",
  ].join("\n");
}

function extractJson(text: string): unknown {
  const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Critic returned no JSON.");
  return JSON.parse(fenced.slice(start, end + 1));
}

export async function runCritic(input: CriticInput): Promise<CriticVerdict> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const model = input.model?.trim() || "claude-sonnet-4-6";

  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: buildSystem(),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: input.imageUrl } },
          { type: "text", text: buildUser(input) },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  if (!raw.trim()) throw new Error("Critic returned an empty response.");

  const parsed = extractJson(raw) as {
    score?: number;
    checks?: Array<{ check?: string; pass?: boolean; reason?: string }>;
    fix_hint?: string;
  };

  const score = clamp01(typeof parsed.score === "number" ? parsed.score : 0);
  const checks: CheckResult[] = (parsed.checks ?? []).map((c) => ({
    check: String(c.check ?? "unknown"),
    pass: !!c.pass,
    reason: String(c.reason ?? ""),
  }));
  const anyMustFailed = checks.some((c) => input.mustChecks.includes(c.check) && !c.pass);
  const pass = score >= input.minScore && !anyMustFailed;

  return {
    score,
    pass,
    checks,
    fixHint: String(parsed.fix_hint ?? "").trim() || (pass ? "Passes QA." : "Regenerate to better match the spec."),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
