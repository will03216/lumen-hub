"use client";

/**
 * Frame extraction — the part where the timestamp is easy to get wrong.
 *
 * Follows the `<video>` + 2D canvas approach that app/studio/nodes/
 * frame-extract-node.tsx established (no ffmpeg in the bundle; the browser
 * already has a decoder), and adds the thing that node did not need and this
 * feature cannot work without: an ACCURATE timestamp.
 *
 * ── Why `currentTime` is not the answer ──────────────────────────────────
 *
 * Setting `video.currentTime = 3.2` does not seek to 3.2s. It seeks to the
 * nearest frame the decoder can present, which — depending on keyframe spacing,
 * codec and browser — can be tens of milliseconds away, and on a sparsely-keyed
 * clip considerably more. Reading back `video.currentTime` after `seeked` is
 * better but still reports the *presentation clock*, not necessarily the frame
 * that got composited.
 *
 * `requestVideoFrameCallback` reports `mediaTime`: the presentation timestamp
 * of the exact frame that was just painted. That is the only number that is
 * guaranteed to describe the pixels we are about to read out of the canvas, so
 * it is the number that lands in the ledger.
 *
 * The failure this prevents is invisible: a keyframe whose stored `t` is 40ms
 * off still looks perfect on its own. It only shows up much later, as a bookend
 * chain that jumps, or as a spliced seam that stutters — at which point nothing
 * points back at frame extraction.
 *
 * Safari has shipped rVFC since 15.4, but the fallback matters for anything
 * older and for the odd embedded webview, so it degrades to `seeked` +
 * `currentTime` and marks the result `approximate`.
 */

/** Matches the JPEG quality frame-extract-node settles on: a 1080p frame stays
 *  well under 700KB, where PNG at native size would blow past the 10MB image
 *  input ceiling. */
const JPEG_QUALITY = 0.92;

/** A seek that never settles would leave the caller's `busy` flag stuck on,
 *  disabling the Grab button for the life of the page. Same reasoning as
 *  MEASURE_TIMEOUT_MS in lib/edit/start-session.ts. */
const SEEK_TIMEOUT_MS = 10_000;

export type GrabbedFrame = {
  /** JPEG data URI. Uploaded immediately by the caller — never stored. */
  dataUrl: string;
  /** Decoder-reported mediaTime, seconds, 3dp. See the header. */
  t: number;
  width: number;
  height: number;
  /** True when rVFC was unavailable and `t` came from `currentTime` instead.
   *  Surfaced in the UI, because an approximate timestamp is still usable —
   *  it just isn't trustworthy enough to chain bookends from silently. */
  approximate: boolean;
};

type RVFCMetadata = { mediaTime: number };
type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, metadata: RVFCMetadata) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export function supportsFrameCallback(video: HTMLVideoElement): boolean {
  return typeof (video as VideoWithRVFC).requestVideoFrameCallback === "function";
}

/** Seconds to 3dp. Every timestamp that reaches the store goes through here,
 *  so a comparison between two of them is never defeated by float dust. */
export function roundT(t: number): number {
  return Math.round(t * 1000) / 1000;
}

/**
 * Seek and wait until the frame at `t` is actually presented.
 *
 * Resolves with the presented frame's mediaTime when rVFC is available. The
 * rVFC callback is registered BEFORE currentTime is assigned — registering it
 * after means racing a seek that may already have completed, and on a cached
 * clip the callback then never fires until some unrelated repaint.
 */
export function seekToFrame(
  video: HTMLVideoElement,
  t: number,
): Promise<{ t: number; approximate: boolean }> {
  return new Promise((resolve, reject) => {
    const v = video as VideoWithRVFC;
    let settled = false;
    let rvfcHandle: number | undefined;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      if (rvfcHandle !== undefined) v.cancelVideoFrameCallback?.(rvfcHandle);
      fn();
    };

    const timer = setTimeout(
      () =>
        finish(() =>
          reject(new Error("Timed out seeking — the clip may still be loading.")),
        ),
      SEEK_TIMEOUT_MS,
    );

    const onError = () =>
      finish(() => reject(new Error("The clip could not be decoded.")));

    // Fallback path. `seeked` fires when the presentation clock has moved, so
    // currentTime is the best available answer without rVFC.
    const onSeeked = () => {
      if (supportsFrameCallback(video)) return; // rVFC will settle it
      finish(() => resolve({ t: roundT(video.currentTime), approximate: true }));
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);

    if (supportsFrameCallback(video)) {
      rvfcHandle = v.requestVideoFrameCallback!((_now, metadata) => {
        finish(() => resolve({ t: roundT(metadata.mediaTime), approximate: false }));
      });
    }

    try {
      video.currentTime = t;
    } catch (e) {
      finish(() => reject(e instanceof Error ? e : new Error(String(e))));
    }
  });
}

/**
 * Read the currently-presented frame out of a video element.
 *
 * Assumes the caller has already seeked and that a frame is presented — this
 * function does not seek, so the timestamp it is handed is the one that
 * `seekToFrame` resolved with, not a fresh read of `currentTime`. Splitting it
 * this way is what keeps the invariant enforceable: there is exactly one place
 * a timestamp is produced, and it is not here.
 */
export function captureFrame(
  video: HTMLVideoElement,
  t: number,
  approximate: boolean,
): GrabbedFrame {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error("The clip has no decoded dimensions yet.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D context for frame capture.");

  ctx.drawImage(video, 0, 0, width, height);

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    // A tainted canvas. The clip was loaded cross-origin without the media
    // proxy — naming the cause is the difference between a fixable report and
    // "frame capture failed".
    throw new Error(
      "This clip is cross-origin, so its frames can't be read. Load it through the media proxy.",
    );
  }

  return { dataUrl, t: roundT(t), width, height, approximate };
}

/** Seek + capture, the two steps every caller wants together. */
export async function grabFrameAt(
  video: HTMLVideoElement,
  at: number,
): Promise<GrabbedFrame> {
  const { t, approximate } = await seekToFrame(video, at);
  return captureFrame(video, t, approximate);
}

// ─────────────────────────── Filmstrip ────────────────────────────────────

/**
 * Evenly-spaced sample times for the filmstrip.
 *
 * Deliberately excludes the exact endpoints. The first and last frames of a
 * clip are very often black or a fade, so a strip that starts and ends on them
 * looks broken; sampling at the midpoint of each slice gives every thumbnail
 * something to show.
 */
export function filmstripTimes(duration: number, count: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || count <= 0) return [];
  const step = duration / count;
  return Array.from({ length: count }, (_, i) => roundT(step * (i + 0.5)));
}

/**
 * Clamp a scrub position into a clip.
 *
 * Backing off the very end matters: seeking exactly to `duration` puts most
 * decoders past the last frame, which either fires `ended` and presents
 * nothing or returns a black frame. One frame of margin at 24fps is ~42ms.
 */
export function clampToClip(t: number, duration: number): number {
  if (!Number.isFinite(t)) return 0;
  return roundT(Math.min(Math.max(t, 0), Math.max(0, duration - 0.042)));
}
