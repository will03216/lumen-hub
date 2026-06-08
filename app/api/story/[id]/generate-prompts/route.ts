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
import { BytePlusError, generateScenePrompts, type ScenePromptInput } from "@/lib/byteplus";
import { logBytePlusError, logRouteError } from "@/lib/server-log";
import { getUserKeys } from "@/lib/server/user-keys";

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

  try {
    const result = await generateScenePrompts(body.story, scenes, byteplus);
    return NextResponse.json({ scenes: result });
  } catch (err) {
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
