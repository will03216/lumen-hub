/**
 * fal.ai client — second image upstream alongside BytePlus.
 *
 * Why this exists
 * ---------------
 * §61 brought OpenAI's GPT Image 2 in via fal.ai. fal hosts a queue API
 * (submit + poll) which doesn't fit BytePlus's single-shot generations
 * call — so the route layer dispatches on `provider` and one side of
 * that fork lives here.
 *
 * The exported shape (`generateImageFal` → `ImageGenResponse`) matches
 * `lib/byteplus.ts` so the route returns the same `{ data: [{ url }] }`
 * envelope to the client regardless of upstream. The Generator and
 * Canvas image-gen-node never need to know which engine ran.
 *
 * Auth
 * ----
 * `FAL_API_KEY` from .env.local. fal expects `Authorization: Key <key>`
 * (not Bearer). Format `<key_id>:<key_secret>` — opaque to us.
 *
 * Polling
 * -------
 * Submit returns a `request_id`; we poll `/requests/{id}/status` every
 * 2s and grab the result from `/requests/{id}` once status flips to
 * `COMPLETED`. Cap at 4 minutes — gpt-image-2 at quality:"high" takes
 * 60–180s in our measurements, and the route's `maxDuration = 300`
 * gives the poll loop room without pinning the function past Vercel
 * Pro's 5-minute cap. If renders routinely exceed this we should
 * switch to the two-route submit/poll pattern that /api/video uses.
 */

import type { ImageGenResponse } from "./byteplus";
import { MissingKeyError } from "@/lib/server/missing-key";

const QUEUE_BASE = "https://queue.fal.run";

function apiKey(override?: string): string {
  // Strict BYOK — no env fallback. The user's key must be supplied per call.
  if (!override) throw new MissingKeyError("fal");
  return override;
}

/** Same status surface as BytePlusError so `lib/server-log` and the
 *  client classifier can treat both upstreams uniformly. */
export class FalError extends Error {
  status: number;
  statusText: string;
  body: string;
  constructor(status: number, statusText: string, body: string) {
    super(`fal ${status} ${statusText}: ${body.slice(0, 500)}`);
    this.name = "FalError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

async function falRequest(
  path: string,
  init: RequestInit,
  keyOverride?: string,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${QUEUE_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey(keyOverride)}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new FalError(res.status, res.statusText, text);
  return { status: res.status, text };
}

// ─────────────────────────── Size translation ──────────────────────────
//
// BytePlus and our UI take "WIDTHxHEIGHT". fal's gpt-image-2 accepts
// either an enum (`square_hd`, `landscape_4_3`, …) or a `{width, height}`
// object. Going via the object lets us preserve the user's exact
// selection — fal clamps to the nearest supported size internally.
function parseSize(size: string | undefined): { width: number; height: number } | undefined {
  if (!size) return undefined;
  const m = size.match(/^(\d+)x(\d+)$/i);
  if (!m) return undefined;
  return { width: Number(m[1]), height: Number(m[2]) };
}

// ─────────────────────────── Public API ────────────────────────────────

export type FalImageParams = {
  prompt: string;
  /** fal model id, e.g. "openai/gpt-image-2". The leading `fal-ai/` or
   *  any other vendor prefix is preserved verbatim. */
  model: string;
  /** Optional UI size string ("2048x2048"). Translated to {width,height}. */
  size?: string;
  /** gpt-image-2 quality tier. Defaults to "high" — the route doesn't
   *  surface this dial yet but the field is plumbed for when it does. */
  quality?: "low" | "medium" | "high";
  /** Number of variants per submission. fal calls it `num_images`; the
   *  Generator's batch flow fires N parallel submissions instead, so
   *  this stays 1 by default. */
  num_images?: number;
  /** Reference image URL(s). gpt-image-2's edit endpoint takes
   *  `image_urls`; we route there when refs are present. */
  image?: string | string[];
};

/**
 * Submit a render to fal and return when the result is ready.
 *
 * Returns the BytePlus-compatible `ImageGenResponse` shape so the route
 * layer doesn't need to know about fal at all — it just hands the JSON
 * back to the client.
 */
export async function generateImageFal(
  params: FalImageParams,
  apiKey?: string,
): Promise<ImageGenResponse> {
  // T2I goes to the base text-to-image endpoint. With at least one
  // reference URL we use the `/edit` sub-endpoint, which takes
  // `image_urls` instead of `prompt`-only.
  const refs = params.image
    ? Array.isArray(params.image)
      ? params.image
      : [params.image]
    : [];
  const useEdit = refs.length > 0;
  const path = useEdit ? `/${params.model}/edit` : `/${params.model}`;

  const body: Record<string, unknown> = {
    prompt: params.prompt,
    quality: params.quality ?? "high",
    num_images: params.num_images ?? 1,
    output_format: "png",
  };
  const dims = parseSize(params.size);
  if (dims) body.image_size = dims;
  if (useEdit) body.image_urls = refs;

  const submitted = await falRequest(path, {
    method: "POST",
    body: JSON.stringify(body),
  }, apiKey);
  const { request_id } = JSON.parse(submitted.text) as { request_id: string };
  if (!request_id) {
    throw new FalError(502, "Bad Gateway", "fal submit returned no request_id");
  }

  const result = await pollForResult(params.model, request_id, apiKey);
  return falToImageGenResponse(result);
}

// ─────────────────────────── Poll loop ─────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 240_000;

type FalStatus = {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | (string & {});
  request_id?: string;
};

type FalResult = {
  images?: Array<{
    url?: string;
    width?: number;
    height?: number;
    content_type?: string;
  }>;
  /** Some fal endpoints return a top-level `image` instead of `images[]`. */
  image?: { url?: string; width?: number; height?: number };
};

async function pollForResult(model: string, id: string, apiKey?: string): Promise<FalResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = (await falRequest(
      `/${model}/requests/${id}/status`,
      { method: "GET" },
      apiKey,
    ).then((r) => JSON.parse(r.text) as FalStatus));
    if (status.status === "COMPLETED") {
      const result = await falRequest(`/${model}/requests/${id}`, {
        method: "GET",
      }, apiKey);
      return JSON.parse(result.text) as FalResult;
    }
    if (status.status === "FAILED") {
      throw new FalError(502, "Bad Gateway", `fal task ${id} reported FAILED`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new FalError(
    504,
    "Gateway Timeout",
    `fal task ${id} did not complete within ${POLL_TIMEOUT_MS / 1000}s`,
  );
}

// ─────────────────────────── Shape adapter ─────────────────────────────

function falToImageGenResponse(r: FalResult): ImageGenResponse {
  const items = r.images ?? (r.image ? [r.image] : []);
  return {
    created: Math.floor(Date.now() / 1000),
    data: items
      .filter((i): i is { url: string; width?: number; height?: number } =>
        typeof i.url === "string",
      )
      .map((i) => ({
        url: i.url,
        size:
          i.width && i.height ? `${i.width}x${i.height}` : undefined,
      })),
  };
}
