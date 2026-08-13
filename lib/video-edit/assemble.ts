/**
 * Post-render assembly — PRD §5G.
 *
 * Seedance hands back a bare clip: no original audio, and no relationship to
 * the footage around the window it replaces. This module decides whether
 * anything has to be done about that, and describes it in words the UI can
 * show before it happens.
 *
 * Split from the route so the DECISION is pure and testable. Whether a render
 * needs assembling is a question about numbers — window length, output
 * duration, audio mode — and getting it wrong is expensive in a way the
 * ffmpeg call is not: assembling when you shouldn't burns three minutes of
 * re-encoding, and not assembling when you should silently ships a clip with
 * no sound.
 */

import type { AudioMode, VideoEditSession } from "./types";

export type AssemblePlan = {
  /** Whether to call the route at all. */
  needed: boolean;
  /** Mux the source's own audio for the window back over the render. */
  audio: "preserve" | "keep";
  /** Put the untouched footage back around the window. */
  splice: boolean;
  /** One line for the UI, saying what will happen and why. */
  summary: string;
  /** Why assembly was skipped or degraded, when it was. */
  warnings: string[];
};

/**
 * Audio drift tolerance.
 *
 * The source's window and the render are rarely the exact same length —
 * Seedance takes an integer duration and a window is arbitrary. Under half a
 * second the mux is imperceptible; past it, lips visibly lead or trail, and
 * silence is a better outcome than a clip that looks dubbed.
 */
const AUDIO_DRIFT_TOLERANCE_S = 0.5;

export function planAssembly(
  session: VideoEditSession,
  renderedDuration: number,
): AssemblePlan {
  const warnings: string[] = [];
  const windowLength = session.window.end - session.window.start;

  // Anything left of the window's start, or right of its end, is footage the
  // render never saw and the user never asked to change.
  const hasHead = session.window.start > 0.05;
  const hasTail = session.window.end < session.source.duration - 0.05;
  const splice = hasHead || hasTail;

  let audio: AssemblePlan["audio"] = "keep";
  if (session.audioMode === "preserve") {
    const drift = Math.abs(windowLength - renderedDuration);
    if (drift <= AUDIO_DRIFT_TOLERANCE_S) {
      audio = "preserve";
    } else {
      warnings.push(
        `The original audio is ${windowLength.toFixed(1)}s and the render is ${renderedDuration}s — muxing them would drift by ${drift.toFixed(1)}s, so the clip is coming back without it. Match the render length to the window to keep the sound.`,
      );
    }
  }

  const needed = audio === "preserve" || splice;

  return {
    needed,
    audio,
    splice,
    warnings,
    summary: describe(audio === "preserve", splice, session),
  };
}

function describe(
  preserving: boolean,
  splicing: boolean,
  session: VideoEditSession,
): string {
  if (!preserving && !splicing) {
    return "The render is the whole clip and needs no assembly.";
  }
  const parts: string[] = [];
  if (preserving) parts.push("keeping the original audio");
  if (splicing) {
    const before = session.window.start;
    const after = session.source.duration - session.window.end;
    const bits: string[] = [];
    if (before > 0.05) bits.push(`the first ${before.toFixed(1)}s`);
    if (after > 0.05) bits.push(`the last ${after.toFixed(1)}s`);
    parts.push(`splicing ${bits.join(" and ")} of untouched footage back around it`);
  }
  return `Assembling: ${parts.join(", ")}.`;
}

export type AssembleResult = { url: string; spliced: boolean };

export async function assemble(opts: {
  sourceUrl: string;
  renderedUrl: string;
  window: { start: number; end: number };
  plan: AssemblePlan;
  signal?: AbortSignal;
}): Promise<AssembleResult> {
  const res = await fetch("/api/video-edit/assemble", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceUrl: opts.sourceUrl,
      renderedUrl: opts.renderedUrl,
      window: opts.window,
      audio: opts.plan.audio,
      splice: opts.plan.splice,
    }),
    signal: opts.signal,
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    spliced?: boolean;
    error?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? `Assembly failed (${res.status})`);
  }
  return { url: data.url, spliced: Boolean(data.spliced) };
}

/**
 * Join N rendered segments into one clip, optionally with the source's audio.
 *
 * The timeline path's assembler. Distinct from `assemble()` above, which puts
 * ONE render back into its surrounding footage — here the segments already
 * cover the span, so there is nothing to splice around, only to join.
 */
export async function assembleSegments(opts: {
  segmentUrls: string[];
  sourceUrl: string;
  audio: "preserve" | "keep";
  /** The span of the source these segments cover, for the audio mux. */
  window: { start: number; end: number };
  signal?: AbortSignal;
}): Promise<AssembleResult> {
  const res = await fetch("/api/video-edit/assemble", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      segmentUrls: opts.segmentUrls,
      sourceUrl: opts.sourceUrl,
      audio: opts.audio,
      window: opts.window,
      // The segments ARE the output; there is no untouched footage to wrap
      // around them.
      splice: false,
    }),
    signal: opts.signal,
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    spliced?: boolean;
    error?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? `Assembly failed (${res.status})`);
  }
  return { url: data.url, spliced: Boolean(data.spliced) };
}
