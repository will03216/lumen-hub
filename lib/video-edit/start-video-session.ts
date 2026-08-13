"use client";

/**
 * Creating a video-edit session — the shared path behind every entry point
 * (the dashboard drop zone, the Creations-feed pencil on a video, the Library
 * action, and Studio's frame-extract node).
 *
 * Metadata is measured here, once, before the session exists. Duration, width
 * and height are not optional: the working window, the default ratio and every
 * asset-bounds check derive from them, so a source without them is only half
 * usable. Measuring at creation means the timeline never has to render an
 * "unmeasured" state.
 *
 * Mirrors lib/edit/start-session.ts, including the timeout: an HTMLVideoElement
 * settles only via loadedmetadata or error, so a stalled CDN would otherwise
 * leave the caller's busy flag on for the life of the page.
 */

import {
  ALLOWED_VIDEO_MIME,
  MAX_UPLOAD_BYTES,
} from "@/lib/media/upload-formats";
import { mediaProxyUrl } from "@/lib/compare/media-proxy";
import { isAllowedRefUrl } from "@/lib/edit/same-origin";
import { createVideoEditSession } from "./sessions";
import type { VideoEditSession } from "./types";

const MEASURE_TIMEOUT_MS = 30_000;

/** Longer than the image editor's ceiling would allow anyway, and chosen so a
 *  user is told "too long" before they wait through an upload. */
const MAX_SOURCE_SECONDS = 120;

export type VideoMeta = { width: number; height: number; duration: number };

/**
 * Intrinsic size and duration of a video URL.
 *
 * Rejects rather than resolving to zeroes, so a caller cannot persist an
 * unmeasured source. Goes through the media proxy: a BytePlus CDN URL does not
 * satisfy the crossOrigin preflight, and an element that never loads metadata
 * looks identical to one that is merely slow.
 */
export function measureVideo(url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        video.src = "";
        reject(new Error("Timed out loading that clip — it may be offline."));
      });
    }, MEASURE_TIMEOUT_MS);

    video.onloadedmetadata = () =>
      finish(() => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        const duration = video.duration;
        if (!width || !height) {
          reject(new Error("Could not read the clip's dimensions."));
          return;
        }
        if (!Number.isFinite(duration) || duration <= 0) {
          // Live streams and some fragmented MP4s report Infinity. The editor
          // needs a finite timeline, so this is a real rejection rather than a
          // fallback to a guess.
          reject(new Error("That clip has no readable duration."));
          return;
        }
        resolve({ width, height, duration });
      });

    video.onerror = () =>
      finish(() =>
        reject(new Error("Could not load that clip — check the URL or format.")),
      );

    video.src = mediaProxyUrl(url);
  });
}

export async function startVideoSessionFromUrl(opts: {
  url: string;
  name?: string;
  assetId?: string;
  bytes?: number;
}): Promise<VideoEditSession> {
  assertAllowedUrl(opts.url);
  const meta = await measureVideo(opts.url);
  assertDuration(meta.duration);

  return createVideoEditSession({
    name: opts.name ?? defaultName(opts.url),
    source: {
      url: opts.url,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      bytes: opts.bytes,
      assetId: opts.assetId,
    },
  });
}

export async function startVideoSessionFromFile(
  file: File,
): Promise<VideoEditSession> {
  // Check against the server's own allow-list rather than a loose `video/*`.
  // A .mkv is a video by that looser test, passes every client gate, and then
  // fails the upload with a raw 415 the user can do nothing with.
  if (!ALLOWED_VIDEO_MIME.has(file.type)) {
    throw new Error(
      file.type
        ? `${file.name} is a ${file.type.replace("video/", "").toUpperCase()} — use MP4, MOV or WebM.`
        : `${file.name} isn't a supported video. Use MP4, MOV or WebM.`,
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `${file.name} is ${formatBytes(file.size)} — the limit is 50 MB. Trim the clip or export it smaller first.`,
    );
  }

  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/library/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }

  return startVideoSessionFromUrl({
    url: data.url,
    name: stripExtension(file.name),
    bytes: file.size,
  });
}

// ─────────────────────────── Helpers ──────────────────────────────────────

function assertAllowedUrl(url: string): void {
  if (!isAllowedRefUrl(url)) {
    throw new Error(
      "That doesn't look like a video URL. Paste an https:// link, or upload the file instead.",
    );
  }
}

function assertDuration(duration: number): void {
  if (duration > MAX_SOURCE_SECONDS) {
    throw new Error(
      `That clip is ${Math.round(duration)}s — the editor takes up to ${MAX_SOURCE_SECONDS}s. Trim it first.`,
    );
  }
}

function defaultName(url: string): string {
  const tail = url.split("?")[0].split("/").pop();
  return tail ? stripExtension(tail) : "Untitled Video Edit";
}

function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "") || "Untitled Video Edit";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
