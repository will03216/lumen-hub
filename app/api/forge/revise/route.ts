/**
 * POST /api/forge/revise
 *
 * Reflexion step of the inner loop: given a prompt whose output failed the
 * critic, return a revised, still-well-formed prompt that fixes the flagged
 * failures (driven by the critic's per-check feedback, not a blind append).
 * Called by the guarded generator nodes during regeneration.
 *
 * Uses the Forge Claude key (BYOK from the client) or server ANTHROPIC_API_KEY.
 * Degrades gracefully: on any failure the caller falls back to a simpler retry.
 */

import { NextRequest, NextResponse } from "next/server";
import { logRouteError } from "@/lib/server-log";
import { runPromptReviser, type CriticFailure } from "@/lib/forge/agents/prompt-engineer";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReviseBody = {
  intent?: string;
  currentPrompt?: string;
  failed?: CriticFailure[];
  fixHint?: string;
  /** Targeted doctrine hints derived from the failing checks (lever table). */
  hints?: string[];
  kind?: "image" | "video";
  mode?: "t2v" | "i2v" | "r2v";
  aspect?: string;
  claudeApiKey?: string;
  claudeModel?: string;
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as ReviseBody;
    const intent = (body.intent ?? "").trim();
    const currentPrompt = (body.currentPrompt ?? "").trim();
    if (!intent || !currentPrompt) {
      return NextResponse.json({ error: "intent and currentPrompt are required." }, { status: 400 });
    }
    const apiKey = (body.claudeApiKey ?? process.env.ANTHROPIC_API_KEY ?? "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "A Claude API key is required to revise prompts." }, { status: 400 });
    }

    const revised = await runPromptReviser({
      intent,
      currentPrompt,
      failed: Array.isArray(body.failed) ? body.failed : [],
      fixHint: (body.fixHint ?? "").trim(),
      hints: Array.isArray(body.hints) ? body.hints.filter((h) => typeof h === "string") : [],
      kind: body.kind === "video" ? "video" : "image",
      mode: body.mode,
      aspect: body.aspect,
      apiKey,
      model: body.claudeModel,
    });

    return NextResponse.json({ prompt: revised.prompt, durationS: revised.durationS ?? null });
  } catch (err) {
    logRouteError("forge/revise", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
