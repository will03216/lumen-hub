/**
 * Minimax overseas API — second video upstream alongside BytePlus.
 *
 * Why this exists
 * ---------------
 * §62 brings MiniMax Hailuo 2.3 and T2V-01-Director in alongside the
 * BytePlus Seedance family. fal/byteplus pattern from §61 transfers
 * directly: the route dispatches on a `provider` field, and both
 * branches return the same `VideoTaskResponse` / `VideoTaskStatus`
 * shapes so the client never learns which engine ran.
 *
 * Auth
 * ----
 * `MINIMAX_API_KEY` from .env.local. Standard `Authorization: Bearer <key>`.
 * `MINIMAX_GROUP_ID` rides as a URL query param on /v1/files/retrieve
 * (and §63's /v1/t2a_v2). Required only when retrieving the rendered
 * file URL — submit and status endpoints don't need it.
 *
 * Poll shape
 * ----------
 * Minimax video is async: submit returns a task_id, /v1/query/video_generation
 * polls status, and on Success returns a `file_id` (not a URL). One more
 * call to /v1/files/retrieve resolves the actual mp4 download URL. The
 * adapter inlines that second call inside `getVideoTaskMinimax` so the
 * route layer keeps its single-call polling shape.
 *
 * Status mapping
 * --------------
 * Minimax statuses → our VideoTaskStatus enum:
 *   Queueing | Preparing | Processing → "running"
 *   Success                            → "succeeded"
 *   Fail                               → "failed"
 *   anything else / unknown            → "queued" (defensive)
 */

import type { VideoParams, VideoTaskResponse, VideoTaskStatus } from "./byteplus";
import { MissingKeyError } from "@/lib/server/missing-key";

const BASE_URL = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1";

function apiKey(override?: string): string {
  // Strict BYOK — no env fallback. The user's key must be supplied per call.
  if (!override) throw new MissingKeyError("minimax");
  return override;
}

/** Only required by /v1/files/retrieve and /v1/t2a_v2. We throw lazily
 *  so submit/status calls don't fail just because the GroupId isn't set
 *  yet — the user only feels the gap when an actual file URL is needed. */
function groupId(override?: string): string {
  // Strict BYOK — no env fallback. The user's group id must be supplied per call.
  if (!override) throw new MissingKeyError("minimax_group_id");
  return override;
}

/** Same shape as BytePlusError / FalError so server-log and the client
 *  classifier can treat all three uniformly. */
export class MinimaxError extends Error {
  status: number;
  statusText: string;
  body: string;
  constructor(status: number, statusText: string, body: string) {
    super(`Minimax ${status} ${statusText}: ${body.slice(0, 500)}`);
    this.name = "MinimaxError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

// ─────────────────────────── HTTP shell ────────────────────────────────

async function mxRequest<T = unknown>(
  path: string,
  init: RequestInit,
  keyOverride?: string,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey(keyOverride)}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new MinimaxError(res.status, res.statusText, text);
  // Minimax sometimes returns 200 with `base_resp.status_code != 0` for
  // logical errors (invalid prompt, exhausted quota, etc.). Promote those
  // to MinimaxError so the route catches them uniformly.
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new MinimaxError(502, "Bad Gateway", `Non-JSON body: ${text}`);
  }
  const base = (parsed as { base_resp?: { status_code?: number; status_msg?: string } }).base_resp;
  if (base && typeof base.status_code === "number" && base.status_code !== 0) {
    // Map a few well-known codes to HTTP-ish equivalents so the
    // classifier still routes them sensibly (1004 = auth, 1008 = quota,
    // 2013 = invalid params). Anything we don't recognise stays 502.
    const httpFromMx: Record<number, number> = {
      1002: 429, // rate limit
      1004: 401, // authentication
      1008: 402, // quota / insufficient balance
      1013: 400, // invalid params
      2013: 400, // invalid params (alt)
    };
    const status = httpFromMx[base.status_code] ?? 502;
    throw new MinimaxError(status, base.status_msg ?? "Bad Gateway", text);
  }
  return parsed as T;
}

// ─────────────────────────── Param translation ─────────────────────────

/** Our type uses lowercase ("720p"); Minimax wants uppercase ("720P").
 *  Normalise at the boundary so the rest of the codebase stays clean. */
function toMxResolution(r?: string): string | undefined {
  if (!r) return undefined;
  // Minimax: 720P, 768P, 1080P. Anything else passes through capitalised.
  return r.toUpperCase().endsWith("P") ? r.toUpperCase() : `${r.replace(/p$/i, "")}P`;
}

/** Minimax accepts durations 6 | 10 (varies by model). The caller
 *  enforces model caps; we just pass through. */
function toMxDuration(d?: number): number | undefined {
  return typeof d === "number" && Number.isFinite(d) ? d : undefined;
}

/** Minimax I2V mode: when the caller passes `images[]` with a first-
 *  frame URL we forward it as `first_frame_image`. T2V-01-Director gets
 *  the same treatment if present. Caller responsible for valid URLs. */
function firstFrameUrl(p: VideoParams): string | undefined {
  const first = p.images?.find((i) => !i.role || i.role === "first_frame");
  return first?.url;
}

// ─────────────────────────── Public API ────────────────────────────────

type MxCreateResponse = {
  task_id?: string;
  base_resp?: { status_code: number; status_msg?: string };
};

/** Submit a render. Returns our `VideoTaskResponse` shape so the route
 *  layer treats it identically to BytePlus's response. */
export async function createVideoTaskMinimax(
  p: VideoParams,
  keys?: { apiKey?: string },
): Promise<VideoTaskResponse> {
  const body: Record<string, unknown> = {
    model: p.model,
    prompt: p.prompt,
    // prompt_optimizer defaults to true on Minimax's side; keep it explicit
    // so behaviour is stable when the upstream default changes.
    prompt_optimizer: true,
  };
  const dur = toMxDuration(p.duration);
  if (dur !== undefined) body.duration = dur;
  const res = toMxResolution(p.resolution);
  if (res) body.resolution = res;
  const ff = firstFrameUrl(p);
  if (ff) body.first_frame_image = ff;
  // Seed isn't part of Minimax's documented schema; intentionally not
  // forwarded. Watermark / camerafixed / ratio likewise — Minimax handles
  // ratio via resolution, and camera control is prompt-side ([Pan left]).

  const out = await mxRequest<MxCreateResponse>("/video_generation", {
    method: "POST",
    body: JSON.stringify(body),
  }, keys?.apiKey);
  if (!out.task_id) {
    throw new MinimaxError(502, "Bad Gateway", "missing task_id in submit response");
  }
  return {
    id: out.task_id,
    model: p.model ?? "",
    status: "queued",
  };
}

type MxQueryResponse = {
  task_id?: string;
  status?: string; // Queueing | Preparing | Processing | Success | Fail
  file_id?: string;
  video_width?: number;
  video_height?: number;
  base_resp?: { status_code: number; status_msg?: string };
};

type MxFileRetrieveResponse = {
  file?: {
    file_id?: string;
    bytes?: number;
    created_at?: number;
    filename?: string;
    purpose?: string;
    download_url?: string;
  };
  base_resp?: { status_code: number; status_msg?: string };
};

/** Poll a task. On success we make a second call to /files/retrieve to
 *  resolve the actual download URL, and stitch both into a single
 *  VideoTaskStatus so the route's poll branch stays a single call. */
export async function getVideoTaskMinimax(id: string, keys?: { apiKey?: string; groupId?: string }): Promise<VideoTaskStatus> {
  const q = await mxRequest<MxQueryResponse>(
    `/query/video_generation?task_id=${encodeURIComponent(id)}`,
    { method: "GET" },
    keys?.apiKey,
  );
  const status = mapStatus(q.status);
  if (status !== "succeeded") {
    return {
      id,
      status,
      ...(status === "failed" && {
        error: { message: q.base_resp?.status_msg ?? `Minimax status: ${q.status}` },
      }),
    };
  }
  if (!q.file_id) {
    return {
      id,
      status: "failed",
      error: { message: "Minimax reported Success but no file_id" },
    };
  }
  const file = await mxRequest<MxFileRetrieveResponse>(
    `/files/retrieve?GroupId=${encodeURIComponent(groupId(keys?.groupId))}&file_id=${encodeURIComponent(q.file_id)}`,
    { method: "GET" },
    keys?.apiKey,
  );
  const url = file.file?.download_url;
  if (!url) {
    return {
      id,
      status: "failed",
      error: { message: "Minimax file retrieve returned no download_url" },
    };
  }
  return {
    id,
    status: "succeeded",
    content: { video_url: url },
  };
}

function mapStatus(s: string | undefined): VideoTaskStatus["status"] {
  switch (s) {
    case "Success":
      return "succeeded";
    case "Fail":
    case "Failed":
      return "failed";
    case "Processing":
      return "running";
    case "Queueing":
    case "Preparing":
      return "queued";
    default:
      // Defensive: don't fail hard on a status we haven't seen — let the
      // client keep polling. Anything genuinely stuck times out via the
      // client's own retry budget.
      return "queued";
  }
}

// ─────────────────────────── Audio (§63) ────────────────────────────────
//
// TTS is synchronous: Minimax `/v1/t2a_v2` returns the audio bytes inline
// as a hex string. We decode and persist server-side so the response
// carries a stable same-origin URL the Drafts/Library plumbing can hold
// onto without TTL pain.

export type AudioGenParams = {
  text: string;
  voiceId: string;
  speed?: number;     // 0.5 - 2.0
  volume?: number;    // 0 - 10
  pitch?: number;     // -12 - 12 semitones
  emotion?: string;   // neutral | happy | sad | angry | calm | ...
  model?: string;     // defaults to speech-2.8-hd
};

export type AudioGenResponse = {
  data: Array<{ url: string; durationSec?: number }>;
};

type MxAudioResponse = {
  data?: {
    audio?: string;       // hex-encoded
    status?: number;      // 1 in-progress, 2 success
  };
  extra_info?: {
    audio_length?: number;       // milliseconds
    audio_sample_rate?: number;
    audio_size?: number;
    audio_bitrate?: number;
    audio_format?: string;
  };
  trace_id?: string;
  base_resp?: { status_code: number; status_msg?: string };
};

/** Synchronous TTS: submit + decode + return URL. The route layer writes
 *  the decoded bytes to `public/library-cache/` so the URL is same-origin
 *  and survives indefinitely. */
export async function generateAudioMinimax(
  p: AudioGenParams,
  keys?: { apiKey?: string; groupId?: string },
): Promise<{ audioBytes: Buffer; durationSec: number; format: string }> {
  const body: Record<string, unknown> = {
    model: p.model ?? "speech-2.8-hd",
    text: p.text,
    voice_setting: {
      voice_id: p.voiceId,
      ...(p.speed != null && { speed: p.speed }),
      ...(p.volume != null && { vol: p.volume }),
      ...(p.pitch != null && { pitch: p.pitch }),
      ...(p.emotion && { emotion: p.emotion }),
    },
    // Minimax accepts "hex" | "url"; we ask for hex so the route can
    // write the file to our own cache directory (no signed-URL TTL).
    output_format: "hex",
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1,
    },
  };
  // t2a_v2 wants GroupId as a URL param, not a header.
  const out = await mxRequest<MxAudioResponse>(
    `/t2a_v2?GroupId=${encodeURIComponent(groupId(keys?.groupId))}`,
    { method: "POST", body: JSON.stringify(body) },
    keys?.apiKey,
  );
  const hex = out.data?.audio;
  if (!hex) {
    throw new MinimaxError(
      502,
      "Bad Gateway",
      "Minimax t2a_v2 returned no audio bytes",
    );
  }
  const audioBytes = Buffer.from(hex, "hex");
  const durationSec = (out.extra_info?.audio_length ?? 0) / 1000;
  const format = out.extra_info?.audio_format ?? "mp3";
  return { audioBytes, durationSec, format };
}
