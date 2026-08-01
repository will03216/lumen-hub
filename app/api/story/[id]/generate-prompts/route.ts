/**
 * POST /api/story/[id]/generate-prompts
 *
 * Calls Seed 2.0 (Pro or Lite depending on BYTEPLUS_PROMPT_MODEL) with the
 * full story text and the current scene breakdown, returning a tighter
 * cinematic video-generation prompt for every scene.
 *
 * Body: { story: string, scenes: { index: number, script: string, duration: number }[] }
 * Response: { scenes: { index: number, prompt: string }[] }
 *
 * Set BYTEPLUS_PROMPT_MODEL=seed-2-0-pro-<date> in .env.local to use the
 * Pro model. Omitting it falls back to the Lite model already enabled on
 * most accounts.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  BytePlusError,
  generateScenePrompts,
  SCENE_PROMPT_SYSTEM,
  type ScenePromptInput,
} from "@/lib/byteplus";
import { logBytePlusError, logRouteError } from "@/lib/server-log";
import { buildGroundedSystemText } from "@/lib/server/seedance-skill";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  // `id` is available for future per-story rate-limiting or logging.
  const { id: _storyId } = await params;

  let body: { story?: unknown; scenes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.story !== "string" || !body.story.trim()) {
    return NextResponse.json({ error: "story is required" }, { status: 400 });
  }
  if (!Array.isArray(body.scenes) || body.scenes.length === 0) {
    return NextResponse.json({ error: "scenes must be a non-empty array" }, { status: 400 });
  }

  const scenes = body.scenes as ScenePromptInput[];
  const { byteplus } = await getUserKeys();

  // Ground the Seed model in the bundled Seedance skill rather than leaving it
  // on the model's priors. The doc set is chosen from the story text plus the
  // scene scripts — a keyword scan over the story alone would miss craft cues
  // that only appear in an individual scene (a whispered line, a colour note).
  // Multi-scene work always pulls continuity guidance via shotCount.
  const brief = [body.story, ...scenes.map((s) => s.script ?? "")].join("\n");
  const { system, selectedDocs } = await buildGroundedSystemText(SCENE_PROMPT_SYSTEM, {
    brief,
    mode: "t2v",
    shotCount: scenes.length,
  });

  try {
    const result = await generateScenePrompts(body.story, scenes, byteplus, system);
    return NextResponse.json({ scenes: result, skillDocs: selectedDocs });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof BytePlusError) {
      logBytePlusError("story.generate-prompts", err, startedAt, {
        scene_count: scenes.length,
      });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("story.generate-prompts", err, startedAt, {});
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
