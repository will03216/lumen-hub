/**
 * POST /api/forge/critic
 *
 * Score a generated asset against its shot's prompt + the template's QA rubric
 * using the Seed 2.0 Pro VLM (BytePlus). Returns score, pass/fail, per-check
 * localized reasons, and a fix hint that drives targeted regeneration in the
 * inner loop. Uses the caller's BytePlus key from Settings — no separate Claude
 * key needed.
 *
 * - image specs: score the asset URL directly.
 * - video specs: try native `video_url`; the client also supplies sampled
 *   frames as a fallback when the model rejects video input.
 *
 * Deterministic checks (aspect/duration/fps) are handled in the executor; this
 * is the semantic layer.
 */

import { NextRequest, NextResponse } from "next/server";
import { logRouteError } from "@/lib/server-log";
import { BytePlusError, scoreAsset } from "@/lib/byteplus";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

type CriticBody = {
  kind?: "image" | "video";
  prompt?: string;
  mustChecks?: string[];
  minScore?: number;
  imageUrl?: string;
  videoUrl?: string;
  frames?: string[];
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const keys = await getUserKeys();
    const body = (await req.json()) as CriticBody;

    const kind = body.kind === "video" ? "video" : "image";
    const prompt = (body.prompt ?? "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "The intended prompt is required." }, { status: 400 });
    }
    const checks = Array.isArray(body.mustChecks) ? body.mustChecks : [];
    const minScore = typeof body.minScore === "number" ? body.minScore : 0.85;

    const result = await scoreAsset(
      {
        kind,
        prompt,
        checks,
        imageUrl: body.imageUrl,
        videoUrl: body.videoUrl,
        frames: body.frames,
      },
      keys.byteplus,
    );

    // A must-check that the rubric required but the critic failed blocks the
    // pass even if the overall score is high.
    const anyMustFailed = result.checks.some((c) => checks.includes(c.check) && !c.pass);
    const pass = result.score >= minScore && !anyMustFailed;

    return NextResponse.json({
      verdict: {
        score: result.score,
        pass,
        checks: result.checks,
        fixHint: result.fixHint || (pass ? "Passes QA." : "Regenerate to better match the spec."),
        mode: result.mode,
      },
    });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    logRouteError("forge/critic", err, startedAt);
    const status = err instanceof BytePlusError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status });
  }
}
