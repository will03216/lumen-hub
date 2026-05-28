/**
 * Mirror — download a BytePlus CDN asset to local disk so the Library
 * stays alive after the upstream signed URL expires.
 *
 * Why this exists
 * ---------------
 * BytePlus video / image CDN URLs are signed with a TTL on the order of
 * hours-to-days. Storing the raw URL in the Library means a user who
 * comes back next week sees a wall of broken thumbnails. This route
 * pulls the bytes through our server while the signature is still
 * valid and writes them under `public/library-cache/<id>.<ext>`,
 * which Next.js serves at `/library-cache/<id>.<ext>`.
 *
 * Storage tier
 * ------------
 * Local disk for the dev tier — works on any laptop, no cloud account
 * needed. For a serverless prod deploy (e.g. Vercel) the `public/`
 * directory is bundled at build time, so this path needs to be swapped
 * for an S3 / R2 / Supabase Storage upload. The swap is exactly the
 * `writeMirrorFile` function below; everything else stays.
 *
 * Idempotency & cost
 * ------------------
 * The route checks for an existing cache file by id+extension before
 * fetching. Re-firing the mirror for the same asset becomes free after
 * the first success — useful when the client retries failed mirrors.
 */

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { isByteplusHost } from "@/lib/media/byteplus-hosts";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_DIR = path.join(process.cwd(), "public", "library-cache");

// TODO(ops): no eviction yet. A power user generating 50 videos/day at
// ~30MB each fills 1.5GB/day; the dir grows forever. Add an LRU sweep
// (mtime-based) when total bytes exceeds e.g. 5GB before this surface
// has more than dev-tier traffic.

// Hard ceiling so a runaway upstream can't fill the disk. Tuned for our
// renders: 1080p clips top out around 30MB, stills around 6MB.
const MAX_BYTES = 100 * 1024 * 1024; // 100MB

// ─────────────────────────── Schema validation ──────────────────────────

type MirrorBody = {
  id?: string;
  url?: string;
  kind?: "image" | "video" | "audio" | "reference";
};

type ValidatedRequest = {
  id: string;
  url: URL;
  kind: "image" | "video" | "audio" | "reference";
};

function validate(body: MirrorBody): ValidatedRequest | { error: string; status: number } {
  if (!body.id || typeof body.id !== "string") {
    return { error: "id is required", status: 400 };
  }
  // Restrict id to URL-safe chars so we can use it directly in the
  // filename without any escaping. Generated ids are uuid or `gen_<hex>`
  // / `task_<id>` — all safe — so anything outside this set is suspicious.
  if (!/^[A-Za-z0-9_-]+$/.test(body.id)) {
    return { error: "id contains unsafe characters", status: 400 };
  }
  if (!body.url || typeof body.url !== "string") {
    return { error: "url is required", status: 400 };
  }
  let url: URL;
  try {
    url = new URL(body.url);
  } catch {
    return { error: "url is not parseable", status: 400 };
  }
  if (url.protocol !== "https:") {
    return { error: "https required", status: 400 };
  }
  if (!isByteplusHost(url.hostname)) {
    return { error: "host not allowed", status: 403 };
  }
  if (
    body.kind !== "image" &&
    body.kind !== "video" &&
    body.kind !== "audio" &&
    body.kind !== "reference"
  ) {
    return { error: "kind must be image/video/audio/reference", status: 400 };
  }
  return { id: body.id, url, kind: body.kind };
}

// ─────────────────────────── Route ──────────────────────────────────────

export async function POST(req: NextRequest) {
  const json = (await req.json().catch(() => ({}))) as MirrorBody;
  const validated = validate(json);
  if ("error" in validated) {
    return jsonResponse(
      { error: validated.error },
      { status: validated.status },
    );
  }
  const { id, url, kind } = validated;

  ensureCacheDir();

  // Resolve the on-disk filename. Extension comes from the URL pathname
  // first (BytePlus URLs include the original extension); we fall back
  // to a kind-default. Either way, the user-supplied id is the only
  // dynamic part of the path — no traversal risk.
  const ext = guessExtension(url, kind);
  const filename = `${id}${ext}`;
  const filePath = path.join(CACHE_DIR, filename);
  const mirrorUrl = `/library-cache/${filename}`;

  // Idempotency: if we already mirrored this id+extension, return now.
  // The asset id is deterministic per render (URL-hash for images,
  // task-id for videos), so this short-circuits redundant downloads
  // when the client retries or the auto-save fires twice.
  if (existsSync(filePath)) {
    const sizeBytes = (await stat(filePath)).size;
    return jsonResponse({ mirrorUrl, sizeBytes, cached: true });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { cache: "no-store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return jsonResponse(
      { error: `upstream unreachable: ${message}` },
      { status: 502 },
    );
  }
  if (!upstream.ok) {
    return jsonResponse(
      { error: `upstream ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BYTES) {
    return jsonResponse(
      { error: `upstream too large (${declaredLength} > ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  if (!upstream.body) {
    return jsonResponse(
      { error: "upstream returned no body" },
      { status: 502 },
    );
  }

  // Stream upstream → disk. Buffering with arrayBuffer() peaked at 2× the
  // file size in heap (the ArrayBuffer plus the typed-array view); a
  // 30MB video × N concurrent mirrors put real pressure on RAM. Streaming
  // keeps memory flat regardless of file size. We enforce MAX_BYTES on
  // the written file post-pipeline and unlink anything that violated it
  // — a misreported content-length can't fill the disk past one file.
  try {
    // Cast through `unknown` because Node's `Readable.fromWeb` typings
    // expect the Node-flavoured ReadableStream while `upstream.body`
    // is the DOM-flavoured one. They are interop-compatible at runtime.
    await pipeline(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Readable.fromWeb(upstream.body as any),
      createWriteStream(filePath),
    );
  } catch (err) {
    // Clean up partial write so the next attempt isn't fooled by a
    // truncated cache file existing on disk.
    await unlink(filePath).catch(() => undefined);
    const message = err instanceof Error ? err.message : "stream failed";
    return jsonResponse(
      { error: `stream failed: ${message}` },
      { status: 502 },
    );
  }

  const sizeBytes = (await stat(filePath)).size;
  if (sizeBytes > MAX_BYTES) {
    await unlink(filePath).catch(() => undefined);
    return jsonResponse(
      { error: `upstream too large (${sizeBytes} > ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  return jsonResponse({ mirrorUrl, sizeBytes, cached: false });
}

// ─────────────────────────── Helpers ────────────────────────────────────

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/** The extension on the BytePlus CDN path is the most reliable signal —
 *  Content-Type from these CDNs is sometimes generic `application/octet-
 *  stream`. Fall back to a sensible default per kind so we never write
 *  a file with no extension. */
function guessExtension(
  url: URL,
  kind: "image" | "video" | "audio" | "reference",
): string {
  const m = url.pathname.match(/\.([a-z0-9]{1,5})$/i);
  if (m) return `.${m[1].toLowerCase()}`;
  if (kind === "video") return ".mp4";
  if (kind === "audio") return ".mp3";
  return ".png";
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}
