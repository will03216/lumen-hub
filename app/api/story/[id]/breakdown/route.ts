/**
 * POST /api/story/[id]/breakdown
 *
 * One call: the Seed model decides the shot list AND writes each shot's
 * Seedance prompt. This replaces the two-step "split on paragraphs, then ask
 * for prompts" flow — paragraph breaks are a typography heuristic, not a
 * directorial one, and a model handed a pre-cut fragment doesn't know why it
 * was cut there.
 *
 * Body:     { story: string, targetDuration?: number }
 * Response: { scenes: [{ index, duration, prompt, heading?, characters? }],
 *             authored: boolean, skillDocs: string[] }
 *
 * When the story is a formatted screenplay, its authored scene boundaries are
 * passed through and the model is told to honour them — the writer's scene
 * breaks outrank anything we could infer.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  breakdownStory,
  BREAKDOWN_SYSTEM,
  BytePlusError,
  type StoryBreakdownInput,
} from "@/lib/byteplus";
import { logBytePlusError, logRouteError } from "@/lib/server-log";
import { buildGroundedSystemText } from "@/lib/server/seedance-skill";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";
import { looksLikeScript, parseScript, renderScenePrompt } from "@/lib/story/script-format";

export const runtime = "nodejs";
export const maxDuration = 120;

const MIN_TARGET = 5;
const MAX_TARGET = 600;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  await params;

  let body: { story?: unknown; targetDuration?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.story !== "string" || body.story.trim().length < 10) {
    return NextResponse.json(
      { error: "story is required (at least 10 characters)" },
      { status: 400 },
    );
  }
  const story = body.story;

  const rawTarget = Number(body.targetDuration);
  const targetDuration = Number.isFinite(rawTarget)
    ? Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(rawTarget)))
    : 60;

  // A formatted screenplay already declares its scene breaks. Hand them to the
  // model as fixed boundaries instead of letting it re-cut the writer's work.
  const authoredScenes: StoryBreakdownInput["authoredScenes"] = looksLikeScript(story)
    ? parseScript(story).scenes.map((s) => ({
        heading: s.slugline.raw || `Scene ${s.number}`,
        characters: s.characters,
        body: renderScenePrompt(s),
      }))
    : undefined;

  const { byteplus } = await getUserKeys();

  const { system, selectedDocs } = await buildGroundedSystemText(BREAKDOWN_SYSTEM, {
    brief: story,
    mode: "t2v",
    // Any real story is multi-shot, so continuity guidance always applies —
    // this is the one call that decides how the shots relate to each other.
    shotCount: Math.max(2, authoredScenes?.length ?? 0),
  });

  try {
    const scenes = await breakdownStory(
      { story, targetDuration, authoredScenes },
      byteplus,
      system,
    );
    return NextResponse.json({
      scenes,
      authored: Boolean(authoredScenes?.length),
      skillDocs: selectedDocs,
    });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof BytePlusError) {
      logBytePlusError("story.breakdown", err, startedAt, {
        target_duration: targetDuration,
        authored_scenes: authoredScenes?.length ?? 0,
      });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("story.breakdown", err, startedAt, {});
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
