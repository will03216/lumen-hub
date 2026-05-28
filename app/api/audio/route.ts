/**
 * /api/audio — TTS via Minimax (§63).
 *
 * Unlike /api/image and /api/video, this route is synchronous: Minimax
 * returns the audio bytes inline (hex-encoded) in a single response.
 * The route decodes them, writes the file under public/library-cache/,
 * and hands back a same-origin URL the Drafts/Library plumbing can
 * hold onto without TTL pain.
 *
 * Why we don't reuse /api/library/mirror
 * --------------------------------------
 * mirror.ts is for downloading remote bytes that are already at some
 * URL (BytePlus CDN). Here we're authoring the bytes from scratch out
 * of the Minimax response, so the file-write step lives in this route.
 * The on-disk filename / extension conventions match mirror.ts so the
 * same `public/library-cache/<filename>` URL surface works for both.
 *
 * File id
 * -------
 * Deterministic hash over (text + voice + emotion + dials). Re-runs
 * with identical inputs collide on disk → idempotent save (matches the
 * §60 stage* helpers' upsert-by-id contract). Hash is sha256 → first
 * 12 hex chars; not a security primitive, just a stable key.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { MinimaxError, generateAudioMinimax } from "@/lib/minimax";
import { findAudioModel, MAX_AUDIO_TEXT_LEN } from "@/lib/studio/models";
import { logMinimaxError, logRouteError } from "@/lib/server-log";

export const runtime = "nodejs";
// TTS at 3000 chars takes ~10-30s upstream; cap the route so a hung
// connection doesn't pin a serverless instance.
export const maxDuration = 60;

const CACHE_DIR = path.join(process.cwd(), "public", "library-cache");

type AudioBody = {
  text?: string;
  voice_id?: string;
  model?: string;
  speed?: number;
  volume?: number;
  pitch?: number;
  emotion?: string;
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let textLen = 0;
  let voiceId: string | undefined;
  let model: string | undefined;
  try {
    const body = (await req.json()) as AudioBody;
    textLen = typeof body.text === "string" ? body.text.length : 0;
    voiceId = body.voice_id;
    model = body.model;

    // Validation. Minimax accepts up to 10000 chars but >3000 should
    // really stream — we keep TTS synchronous in §63 and document the
    // cap; the client mirrors it in the textarea char counter.
    if (!body.text || typeof body.text !== "string") {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 },
      );
    }
    if (body.text.length > MAX_AUDIO_TEXT_LEN) {
      return NextResponse.json(
        {
          error: `text exceeds ${MAX_AUDIO_TEXT_LEN}-char limit (got ${body.text.length})`,
        },
        { status: 400 },
      );
    }
    if (!body.voice_id || typeof body.voice_id !== "string") {
      return NextResponse.json(
        { error: "voice_id is required" },
        { status: 400 },
      );
    }
    // Only Minimax is supported for audio in §63; the model entry's
    // provider field still gates so future audio providers can opt in.
    const audioModel = findAudioModel(body.model ?? "speech-2.8-hd");
    if (!audioModel) {
      return NextResponse.json(
        { error: `unknown audio model: ${body.model}` },
        { status: 400 },
      );
    }

    const { audioBytes, durationSec, format } = await generateAudioMinimax({
      text: body.text,
      voiceId: body.voice_id,
      model: audioModel.id,
      speed: body.speed,
      volume: body.volume,
      pitch: body.pitch,
      emotion: body.emotion,
    });

    // Hash input → idempotent filename. Same script + voice + dials
    // collide on disk, which matches the §60 contract for stage* (one
    // record per logical input).
    const hash = createHash("sha256")
      .update(body.text)
      .update("|")
      .update(body.voice_id)
      .update("|")
      .update(String(body.speed ?? ""))
      .update("|")
      .update(String(body.volume ?? ""))
      .update("|")
      .update(String(body.pitch ?? ""))
      .update("|")
      .update(body.emotion ?? "")
      .digest("hex")
      .slice(0, 12);
    const ext = format === "wav" ? "wav" : "mp3";
    const filename = `audio-tts-${hash}.${ext}`;
    const filePath = path.join(CACHE_DIR, filename);
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(filePath, audioBytes);

    const url = `/library-cache/${filename}`;
    return NextResponse.json({
      data: [{ url, durationSec }],
    });
  } catch (err) {
    if (err instanceof MinimaxError) {
      logMinimaxError("audio", err, startedAt, {
        text_len: textLen,
        voice_id: voiceId,
        model,
      });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("audio", err, startedAt, {
      text_len: textLen,
      voice_id: voiceId,
      model,
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
