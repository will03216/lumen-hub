/**
 * Client-side video frame capture (browser canvas).
 *
 * Extracted from the Frame Extract node so it can be reused by the Forge
 * guarded-generation loop, which samples frames from a freshly-rendered clip to
 * feed the VLM critic. Routes the video through `mediaProxyUrl` so a BytePlus
 * CDN clip loads same-origin (otherwise the canvas is tainted and `toDataURL`
 * throws SecurityError).
 *
 * Browser-only (uses document/canvas). Returns JPEG data URIs.
 */

import { mediaProxyUrl } from "@/lib/compare/media-proxy";

/** Promise wrapper around a one-shot DOM media event with abort support. */
function waitForEvent(el: HTMLMediaElement, type: string, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      el.removeEventListener(type, onEvent);
      el.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`video ${type} failed: load error`)); };
    const onAbort = () => { cleanup(); reject(new DOMException("aborted", "AbortError")); };
    el.addEventListener(type, onEvent, { once: true });
    el.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Capture one frame at `atSec` from `videoUrl` as a JPEG data URI sized to the
 *  video's native dimensions. `at` is clamped to the clip's duration. */
export async function captureFrame(videoUrl: string, atSec: number, signal: AbortSignal): Promise<string> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = mediaProxyUrl(videoUrl);

  await waitForEvent(video, "loadedmetadata", signal);
  if (signal.aborted) throw new DOMException("aborted", "AbortError");

  const targetTime = Math.min(Math.max(0, atSec), Math.max(0, video.duration - 0.05));
  video.currentTime = targetTime;
  await waitForEvent(video, "seeked", signal);
  if (signal.aborted) throw new DOMException("aborted", "AbortError");

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2D unavailable");
  ctx.drawImage(video, 0, 0);
  // JPEG @ 0.85 keeps even a 1080p capture comfortably small for an inline
  // critic payload (3 frames per call).
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Sample representative frames (first → end) for VLM scoring. Loads the clip's
 * metadata once to learn its duration, then captures `count` evenly-spaced
 * frames. Failures on individual captures are skipped rather than fatal — a
 * partial sample still lets the critic score.
 */
export async function sampleFrames(
  videoUrl: string,
  count: number,
  signal: AbortSignal,
): Promise<string[]> {
  // Learn duration from a throwaway element.
  const probe = document.createElement("video");
  probe.preload = "metadata";
  probe.muted = true;
  probe.src = mediaProxyUrl(videoUrl);
  let duration = 0;
  try {
    await waitForEvent(probe, "loadedmetadata", signal);
    duration = Number.isFinite(probe.duration) ? probe.duration : 0;
  } catch {
    duration = 0;
  }

  const n = Math.max(1, count);
  // Times across the clip: first frame, then spread toward (but not at) the end.
  const times: number[] =
    duration > 0
      ? Array.from({ length: n }, (_, i) => (duration * i) / n)
      : Array.from({ length: n }, () => 0);

  const frames: string[] = [];
  for (const t of times) {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    try {
      frames.push(await captureFrame(videoUrl, t, signal));
    } catch (err) {
      if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
      // skip a bad capture; keep going
    }
  }
  return frames;
}
