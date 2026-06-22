/**
 * Forge — Planner agent (server-only).
 *
 * The Planner is the "compiler frontend": it interprets the human brief within
 * a vertical template's bounds and emits a structured shot list that becomes
 * the Production Spec. It reasons freely about creative content (hooks, scene
 * beats, camera language) but is fenced by the template's locked policy
 * (output contract, roles, reference locks, consistency doctrine).
 *
 * It returns *data*, not prose — a JSON shot array validated before it ever
 * reaches the Spec. This is the divergent half of the pipeline; everything
 * after the freeze gate is deterministic.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PipelineTemplate } from "../templates/types";
import type { ProductionShot } from "../spec";
import { buildGroundedSystem } from "@/lib/server/seedance-skill";

export type PlannerInput = {
  brief: string;
  template: PipelineTemplate;
  /** Override the default shot count from the template. */
  shotCount?: number;
  apiKey: string;
  model?: string;
};

type RawShot = {
  role?: string;
  title?: string;
  prompt?: string;
  refs?: string[];
  duration_s?: number;
  batch_group?: string;
};

const MAX_TOKENS = 8000;

function buildSystem(template: PipelineTemplate): string {
  const t = template;
  return [
    "You are the Planner agent in Forge, a guarded agentic production pipeline.",
    "Your job: decompose a creative brief into a precise, model-ready SHOT LIST for ONE vertical's production line.",
    "",
    "CORE DOCTRINE — compile, don't improvise:",
    "- You reason freely about creative content, but you operate INSIDE this template's locked policy. Never change the output contract, never invent new locked identities, never exceed the shot budget.",
    "- Each shot's `prompt` must be a dense, self-contained, model-ready generation prompt (not a description of intent). Write it the way a senior prompt engineer would for a text-to-" +
      (t.output.kind === "image" ? "image" : "video") +
      " model: subject, action, environment, camera, lighting, style, in one tight block.",
    "- Honour continuity: keep locked references (identity, product, garment, location, brand) IDENTICAL across shots. Describe motion/scene/light changes, never re-describe a new identity.",
    "",
    `VERTICAL: ${t.label} (${t.vertical})`,
    `OUTPUT CONTRACT (locked): kind=${t.output.kind}, aspect=${t.output.aspect}` +
      (t.output.durationS ? `, ~${t.output.durationS}s total` : "") +
      (t.output.resolution ? `, ${t.output.resolution}` : "") +
      (t.output.structure ? `, structure=[${t.output.structure.join(" → ")}]` : ""),
    `ALLOWED SHOT ROLES (in narrative order): ${t.shotRoles.join(", ")}`,
    `LOCKED REFERENCES (must stay constant): ${t.references.mustLock.join(", ") || "none"}`,
    `CONSISTENCY: frame-chaining=${t.consistency.frameChaining}, batch-by-solve-type=${t.consistency.batchBySolveType}, seed-lock=${t.consistency.seedLock}`,
    `QA CHECKS each shot must satisfy: ${t.qa.must.join(", ")}`,
    "",
    "VERTICAL DIRECTION:",
    t.plannerGuidance,
    "",
    "OUTPUT FORMAT — return ONLY a JSON object, no prose, no markdown fences:",
    "{",
    '  "shots": [',
    '    { "role": "<one of the allowed roles>", "title": "<≤6 words>", "prompt": "<dense model-ready prompt>", "refs": ["identity:...","brand:..."], "duration_s": <int seconds, video only>, "batch_group": "<close-up|medium|wide|hero|...>" }',
    "  ]",
    "}",
  ].join("\n");
}

function buildUser(input: PlannerInput): string {
  const count = input.shotCount ?? input.template.defaultShotCount;
  return [
    "BRIEF:",
    '"""',
    input.brief.trim(),
    '"""',
    "",
    `Produce exactly ${count} shot(s), each assigned a role from the allowed list in narrative order.`,
    input.template.output.kind === "video"
      ? "Give each shot a realistic per-shot duration in seconds that sums to roughly the total output duration."
      : "Omit duration_s (this is an image vertical).",
    "For every locked reference category, include a `refs` entry so the executor injects it on this shot.",
    "Return the JSON object now.",
  ].join("\n");
}

/** Extract the first balanced JSON object from a model response. */
function extractJson(text: string): unknown {
  const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Planner returned no JSON object.");
  }
  return JSON.parse(fenced.slice(start, end + 1));
}

let shotSeq = 0;
function shotId(): string {
  shotSeq += 1;
  return `s${shotSeq}`;
}

/** Run the Planner and return validated, normalized shots ready for assembleSpec. */
export type PlannerResult = {
  shots: ProductionShot[];
  /** Seedance reference docs the prompts were grounded in (empty when not a
   *  Seedance video vertical, or when the skill dir is unavailable). */
  groundedDocs: string[];
};

/** True when this template renders video on a Seedance-family model — the case
 *  where the bundled Seedance skill doctrine applies to each shot prompt. */
export function usesSeedance(template: PipelineTemplate): boolean {
  const m = (template.models.video ?? "").toLowerCase();
  return template.output.kind === "video" && (m.includes("seedance") || m.includes("dreamina-seedance"));
}

export async function runPlanner(input: PlannerInput): Promise<PlannerResult> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const model = input.model?.trim() || "claude-sonnet-4-6";

  // Ground Seedance video verticals in the same authoritative reference docs
  // the optimize-prompt route uses — so each shot's prompt follows the real
  // Seedance 2.0 doctrine (6-component formula, shot grammar, anti-slop,
  // duration calculus, reference tagging), not the model's priors.
  let system: string | Anthropic.TextBlockParam[] = buildSystem(input.template);
  let groundedDocs: string[] = [];
  if (usesSeedance(input.template)) {
    const grounded = await buildGroundedSystem(buildSystem(input.template), {
      brief: input.brief,
      mode: "t2v",
      shotCount: input.shotCount ?? input.template.defaultShotCount,
      hasReferences: input.template.references.mustLock.length > 0,
    });
    system = grounded.system;
    groundedDocs = grounded.selectedDocs;
  }

  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: buildUser(input) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  if (!raw.trim()) throw new Error("Planner returned an empty response.");

  const parsed = extractJson(raw) as { shots?: RawShot[] };
  if (!parsed.shots || !Array.isArray(parsed.shots) || parsed.shots.length === 0) {
    throw new Error("Planner returned no shots.");
  }

  const allowedRoles = new Set(input.template.shotRoles);
  shotSeq = 0;

  const shots = parsed.shots.map((s, i): ProductionShot => {
    const role =
      s.role && allowedRoles.has(s.role)
        ? s.role
        : input.template.shotRoles[Math.min(i, input.template.shotRoles.length - 1)];
    return {
      id: shotId(),
      role,
      title: (s.title ?? `${role} ${i + 1}`).trim().slice(0, 60),
      prompt: (s.prompt ?? "").trim(),
      refs: Array.isArray(s.refs) ? s.refs.filter((r) => typeof r === "string") : [],
      durationS:
        input.template.output.kind === "video"
          ? typeof s.duration_s === "number" && s.duration_s > 0
            ? Math.round(s.duration_s)
            : undefined
          : undefined,
      ratio: undefined,
      resolution: undefined,
      batchGroup: typeof s.batch_group === "string" ? s.batch_group : undefined,
      qa: { must: [...input.template.qa.must], minScore: input.template.qa.minScore },
    };
  });

  return { shots, groundedDocs };
}
