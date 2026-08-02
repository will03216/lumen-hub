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
  MAX_VISION_IMAGES,
  type StoryBreakdownInput,
} from "@/lib/byteplus";
import { logBytePlusError, logRouteError } from "@/lib/server-log";
import { buildGroundedSystemText } from "@/lib/server/seedance-skill";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";
import { looksLikeScript, parseScript, renderScenePrompt } from "@/lib/story/script-format";
import { isAcceptedImageSource } from "@/lib/story/image-format";

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

  let body: { story?: unknown; targetDuration?: unknown; assets?: unknown };
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

  // Reference images the model should LOOK at. Labelled so it knows which is
  // the character and which is the location — an unlabelled pile of images is
  // far weaker guidance than "this is the lead, this is the bar".
  const images = collectImages(body.assets);

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
      { story, targetDuration, authoredScenes, images },
      byteplus,
      system,
    );
    return NextResponse.json({
      scenes,
      authored: Boolean(authoredScenes?.length),
      // Echoed so the UI can say how many images the model actually saw.
      imagesAnalysed: images.length,
      skillDocs: selectedDocs,
    });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof BytePlusError) {
      logBytePlusError("story.breakdown", err, startedAt, {
        target_duration: targetDuration,
        authored_scenes: authoredScenes?.length ?? 0,
        images: images.length,
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

/**
 * Pull the story's reference images out of a SceneAssets-shaped payload and
 * label each by role.
 *
 * Only http(s) URLs and data URIs are forwarded — anything else would be sent
 * verbatim to the upstream API, and a caller-supplied string is not something
 * to hand on unchecked. Capped at MAX_VISION_IMAGES because each one costs
 * vision tokens on every breakdown.
 */
function collectImages(raw: unknown): { url: string; label?: string }[] {
  if (!raw || typeof raw !== "object") return [];
  const a = raw as Record<string, unknown>;

  // Case-sensitive mime check, matching the upstream: "image/PNG" and
  // image/avif are rejected there, so catch them here with a clear message
  // instead of forwarding them into an opaque 400.
  const ok = (u: unknown): u is string =>
    typeof u === "string" && isAcceptedImageSource(u);

  const out: { url: string; label?: string }[] = [];
  const named: [string, string][] = [
    ["character", "Lead character"],
    ["background", "Location / environment"],
    ["prop", "Key prop"],
    ["firstFrame", "Opening frame"],
    ["lastFrame", "Closing frame"],
  ];
  for (const [key, label] of named) {
    if (ok(a[key])) out.push({ url: (a[key] as string).trim(), label });
  }
  if (Array.isArray(a.refImages)) {
    for (const u of a.refImages) {
      if (ok(u)) out.push({ url: u.trim(), label: "Style reference" });
    }
  }
  return out.slice(0, MAX_VISION_IMAGES);
}
