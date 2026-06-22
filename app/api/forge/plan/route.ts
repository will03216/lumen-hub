/**
 * POST /api/forge/plan
 *
 * The agentic planning step: take a human brief + a chosen vertical template,
 * run the Planner agent, assemble a Production Spec, validate it against the
 * template's policy, and return it with a pre-commit cost estimate. The client
 * shows this at the freeze gate. Nothing here spends generation budget — it's
 * pure reasoning + estimation before the deterministic executor runs.
 *
 * BYOK: a Claude API key is required (passed from the client, mirroring
 * /api/optimize-prompt) or falls back to ANTHROPIC_API_KEY on the server.
 */

import { NextRequest, NextResponse } from "next/server";
import { logRouteError } from "@/lib/server-log";
import { getTemplate } from "@/lib/forge/templates";
import { runPlanner, usesSeedance } from "@/lib/forge/agents/planner";
import { runPromptEngineer } from "@/lib/forge/agents/prompt-engineer";
import { assembleSpec, validateSpec, type ProductionShot } from "@/lib/forge/spec";
import { estimateSpecCost } from "@/lib/forge/budget";

export const runtime = "nodejs";
// Planner + N parallel per-shot Prompt Engineer calls; give headroom for Opus.
export const maxDuration = 300;

type PlanBody = {
  brief?: string;
  templateId?: string;
  shotCount?: number;
  claudeApiKey?: string;
  claudeModel?: string;
  /** Second pass: run each shot through the full Seedance Prompt Engineer
   *  pipeline (per-shot optimization). Defaults to on for Seedance verticals. */
  highFidelityPrompts?: boolean;
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as PlanBody;

    const brief = (body.brief ?? "").trim();
    if (!brief) {
      return NextResponse.json({ error: "A brief is required." }, { status: 400 });
    }

    const template = getTemplate(body.templateId);
    if (!template) {
      return NextResponse.json({ error: `Unknown template "${body.templateId}".` }, { status: 400 });
    }

    const apiKey = (body.claudeApiKey ?? process.env.ANTHROPIC_API_KEY ?? "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "A Claude API key is required to plan a production." },
        { status: 400 },
      );
    }

    const { shots: planned, groundedDocs } = await runPlanner({
      brief,
      template,
      shotCount: body.shotCount,
      apiKey,
      model: body.claudeModel,
    });

    // ── Second pass: per-shot Prompt Engineer ────────────────────────────
    // Default on for Seedance video verticals; the toggle can force it off.
    const runSecondPass =
      (body.highFidelityPrompts ?? true) && usesSeedance(template);

    let shots: ProductionShot[] = planned;
    let promptEngineered = 0;
    let engineerDocs: string[] = groundedDocs;

    if (runSecondPass) {
      // Frame-chaining: shot 0 establishes the look (T2V); every later shot
      // starts from the previous clip's final frame (I2V), so optimize those
      // prompts in I2V mode — motion + camera only, never restate identity.
      const chained = template.consistency.frameChaining && template.output.kind === "video";
      const results = await Promise.allSettled(
        planned.map((shot, i) =>
          runPromptEngineer({
            shot,
            template,
            apiKey,
            model: body.claudeModel,
            mode: chained && i > 0 ? "i2v" : "t2v",
          }),
        ),
      );
      shots = planned.map((shot, i) => {
        const r = results[i];
        if (r.status === "fulfilled" && r.value.prompt) {
          promptEngineered += 1;
          if (r.value.selectedDocs.length) engineerDocs = r.value.selectedDocs;
          return {
            ...shot,
            prompt: r.value.prompt,
            durationS: r.value.durationS ?? shot.durationS,
          };
        }
        // Optimization failed for this shot → keep the planner's draft prompt.
        return shot;
      });
    }

    const spec = assembleSpec({ template, brief, shots });
    const validation = validateSpec(spec, template);
    const cost = estimateSpecCost(spec);

    return NextResponse.json({
      spec,
      validation,
      cost,
      groundedDocs: engineerDocs,
      promptEngineered,
      secondPass: runSecondPass,
    });
  } catch (err) {
    logRouteError("forge/plan", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
