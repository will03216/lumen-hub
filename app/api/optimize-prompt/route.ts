import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { logRouteError } from "@/lib/server-log";
import { buildGroundedSystem } from "@/lib/server/seedance-skill";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Counts of each reference type wired into the node, used to tell the model
 *  which inline `[imageN]` / `[videoN]` / `[audioN]` tags must appear. */
type ReferenceManifest = {
  subjectImages?: number;
  refImages?: number;
  videos?: number;
  audios?: number;
};

type OptimizeBody = {
  rawPrompt?: string;
  mode?: string;
  shotCount?: number;
  claudeModel?: string;
  claudeApiKey?: string;
  systemPrompt?: string;
  /** When true, the server grounds the call in the bundled skill's reference docs. */
  useSkillDocs?: boolean;
  references?: ReferenceManifest;
  outputLanguage?: string;
  customOutputLanguage?: string;
};

/** Legacy thinking budget — only used by pre-adaptive models (Haiku 4.5 and
 *  older), which still take `thinking: {type:"enabled", budget_tokens}`. Must
 *  be < max_tokens. Adaptive-thinking models (Opus 4.6+, Sonnet 4.6) ignore it
 *  and control depth via `output_config.effort` instead — see `thinkingParams`. */
const THINKING_BUDGET = 4000;
const MAX_TOKENS = 8000;

/** Opus 4.6+, Sonnet 4.6, and Fable/Mythos 5 REQUIRE adaptive thinking —
 *  `thinking:{type:"enabled", budget_tokens}` returns a 400 on Opus 4.7/4.8.
 *  Older models (Haiku 4.5, Sonnet 4.5, …) still use the enabled+budget form
 *  and reject `effort`. */
function usesAdaptiveThinking(model: string): boolean {
  return /opus-4-(6|7|8)|sonnet-4-6|fable-5|mythos-5/.test(model);
}

/** Model-aware thinking params to merge into messages.create. */
function thinkingParams(model: string): Record<string, unknown> {
  return usesAdaptiveThinking(model)
    ? { thinking: { type: "adaptive" }, output_config: { effort: "high" } }
    : { thinking: { type: "enabled", budget_tokens: THINKING_BUDGET } };
}

function resolveLanguageInstruction(outputLanguage = "match", customOutputLanguage = ""): string {
  if (outputLanguage === "en") return "Write the optimized prompt in English.";
  if (outputLanguage === "es") return "Write the optimized prompt in Spanish.";
  if (outputLanguage === "fr") return "Write the optimized prompt in French.";
  if (outputLanguage === "zh") return "Write the optimized prompt in Chinese.";
  if (outputLanguage === "custom")
    return customOutputLanguage.trim() || "Write the optimized prompt in the same language as the input.";
  return "Write the optimized prompt in the same language as the input.";
}

function resolveModeInstruction(mode = "t2v"): string {
  switch (mode) {
    case "i2v":
      return "Mode: Image-to-Video (I2V). A reference image carries the subject and environment — describe ONLY motion, camera move, and lighting changes. Do NOT restate what the image already shows.";
    case "r2v":
      return "Mode: Reference-to-Video / motion transfer (R2V). State what to transfer from each reference (motion, camera rhythm, style).";
    case "v2v":
      return "Mode: Video-to-Video / face swap (V2V). State explicitly what to preserve from the source video (body motion, background, lighting) and what to replace.";
    default:
      return "Mode: Text-to-Video (T2V). Build the full scene from scratch using the 6-component formula.";
  }
}

function refCounts(ref?: ReferenceManifest) {
  const subjectImages = Math.max(0, ref?.subjectImages ?? 0);
  const refImages = Math.max(0, ref?.refImages ?? 0);
  const videos = Math.max(0, ref?.videos ?? 0);
  const audios = Math.max(0, ref?.audios ?? 0);
  return { subjectImages, refImages, videos, audios, total: subjectImages + refImages + videos + audios };
}

/** Spell out the exact tags the model must place, in argument order. */
function buildReferenceInstruction(ref?: ReferenceManifest): string {
  const { subjectImages, refImages, videos, audios, total } = refCounts(ref);
  if (total === 0) return "";
  const lines: string[] = [
    "References will be supplied at generation time. You MUST tag EACH one inline, adjacent to the entity it represents (never floating at the end of a sentence), using these exact tags in this exact order. Every tag listed below must appear at least once:",
  ];
  let img = 1;
  for (let i = 0; i < subjectImages; i++) lines.push(`- [image${img++}]: subject / first-frame image reference`);
  for (let i = 0; i < refImages; i++) lines.push(`- [image${img++}]: style / reference image`);
  for (let i = 1; i <= videos; i++) lines.push(`- [video${i}]: reference video (motion / camera rhythm)`);
  for (let i = 1; i <= audios; i++) lines.push(`- [audio${i}]: reference audio (lip-sync / beat / pacing)`);
  return lines.join("\n");
}

function buildUserMessage(
  rawPrompt: string,
  mode: string,
  shotCount: number,
  ref: ReferenceManifest | undefined,
  outputLanguage = "match",
  customOutputLanguage = "",
): string {
  const shotsInstruction =
    shotCount <= 1
      ? "Produce a single-shot prompt assembled as one dense paragraph in the order Subject → Action → Environment → Camera → Lighting → Style → Constraints."
      : `Produce a multi-shot prompt using the "Shot N:" grammar (a shared technical preamble, then ${shotCount} labeled shot blocks, ≈4–6s each, max 3 shots per prompt). Each shot gets one primary action and one camera move.`;

  const langInstruction = resolveLanguageInstruction(outputLanguage, customOutputLanguage);
  const modeInstruction = resolveModeInstruction(mode);
  const refInstruction = buildReferenceInstruction(ref);

  return (
    `Here is the raw prompt to optimize:\n\n"""\n${rawPrompt}\n"""\n\n` +
    `${modeInstruction}\n\n` +
    (refInstruction ? `${refInstruction}\n\n` : "") +
    `${shotsInstruction}\n\n` +
    `${langInstruction}\n\n` +
    `Run the full optimization pipeline (triage → 6-component scaffold → anti-slop pass → prose-craft pass → author the shot → length & duration check → integrity check), applying every relevant rule from the reference documents above. ` +
    `Compute the duration with the duration-calculus rules rather than guessing it. ` +
    `Preserve any concrete technical specs the user already gave (film stock, focal length, aperture, named lighting).\n\n` +
    `Output the optimized prompt text first — no preamble, no explanation, no quotes, no markdown fences, no JSON. ` +
    `Then, on a single new final line, output exactly "DURATION: <N>" where N is the computed total duration in seconds (integer 4–15). Output nothing after that line.`
  );
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as OptimizeBody;

    if (!body.claudeApiKey?.trim()) {
      return NextResponse.json({ error: "Claude API key is required." }, { status: 400 });
    }
    if (!body.systemPrompt?.trim()) {
      return NextResponse.json({ error: "System prompt is required." }, { status: 400 });
    }

    const rawPrompt = (body.rawPrompt ?? "").trim();
    if (!rawPrompt) {
      return NextResponse.json({ error: "Provide a raw prompt to optimize." }, { status: 400 });
    }

    const model = body.claudeModel?.trim() || "claude-opus-4-7";
    const mode = body.mode?.trim() || "t2v";
    const shotCount = typeof body.shotCount === "number" ? Math.max(1, body.shotCount) : 1;
    const hasReferences = refCounts(body.references).total > 0;
    const client = new Anthropic({ apiKey: body.claudeApiKey.trim() });

    // For the Seedance preset, ground the call in the real reference docs.
    // Custom presets pass through as a plain string. Falls back to the embedded
    // prompt if the docs directory is unavailable.
    let system: string | Anthropic.TextBlockParam[] = body.systemPrompt.trim();
    let selectedDocs: string[] = [];
    if (body.useSkillDocs) {
      ({ system, selectedDocs } = await buildGroundedSystem(body.systemPrompt.trim(), {
        brief: rawPrompt,
        mode,
        shotCount,
        hasReferences,
      }));
    }

    const message = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      ...thinkingParams(model),
      system,
      messages: [
        {
          role: "user",
          content: buildUserMessage(
            rawPrompt,
            mode,
            shotCount,
            body.references,
            body.outputLanguage,
            body.customOutputLanguage,
          ),
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming);

    // With thinking enabled the response leads with thinking blocks — take the
    // first text block, not content[0].
    const textBlock = message.content.find((b) => b.type === "text");
    let raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    if (!raw) {
      return NextResponse.json({ error: "Claude returned an empty response." }, { status: 500 });
    }

    // Strip stray markdown fences if Claude wrapped the prompt despite instructions.
    raw = raw.replace(/^```(?:\w+)?\n?/i, "").replace(/\n?```$/, "").trim();

    // Peel off the trailing "DURATION: N" line (computed via duration-calculus).
    let duration: number | null = null;
    const durMatch = raw.match(/\n?\s*DURATION:\s*(\d{1,2})\s*$/i);
    if (durMatch) {
      const n = parseInt(durMatch[1], 10);
      if (Number.isFinite(n)) duration = Math.min(15, Math.max(4, n));
      raw = raw.slice(0, durMatch.index).trim();
    }

    const prompt = raw;
    if (!prompt) {
      return NextResponse.json({ error: "No optimized prompt returned from Claude." }, { status: 500 });
    }

    // Write debug snapshot (only in non-production; never logs the API key).
    if (process.env.NODE_ENV !== "production") {
      const debugDir = join(process.cwd(), "debug");
      await mkdir(debugDir, { recursive: true });
      await writeFile(
        join(debugDir, "optimize-prompt-latest.json"),
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            request: {
              model,
              mode,
              shotCount,
              useSkillDocs: !!body.useSkillDocs,
              references: refCounts(body.references),
              selectedDocs,
              rawPromptLength: rawPrompt.length,
            },
            usage: message.usage,
            output: { prompt, duration },
          },
          null,
          2,
        ),
      );
    }

    return NextResponse.json({ prompt, duration });
  } catch (err) {
    logRouteError("optimize-prompt", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
