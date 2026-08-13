/**
 * The prompt, as Dreamina builds it: free text with marked keyframes inline.
 *
 * ── What this replaces, and why ──────────────────────────────────────────
 *
 * The first design ran two model calls per edit: Seedream rendered a corrected
 * still, then Seedance animated it. That is the right shape for a model that
 * can only accept a finished frame — and the wrong shape for Seedance 2.5,
 * which takes reference images directly and is asked, in prose, what to do
 * with them.
 *
 * So the marked frame IS the reference. The user draws a box round the hat and
 * types "make it a bit bigger"; the frame with the box on it goes up as a
 * `reference_image`, and the prompt names it by its timestamp. No intermediate
 * render, no intermediate cost, and nothing for the user to approve twice.
 *
 * ⚠ INFERRED, NOT DOCUMENTED. That Seedance 2.5 interprets drawn marks on a
 * reference image is read off Dreamina's product behaviour, not off a spec.
 * It is the strongest evidence available — Dreamina is first-party and ships
 * against this model — but it is not a published contract, and the first live
 * render is what confirms it. If marks turn out to be ignored, the fallback is
 * the Seedream pre-render, which still exists in use-frame-edit.ts.
 *
 * ── Why a token list rather than a string ────────────────────────────────
 *
 * A chip is a reference AND a position. "make the hat bigger" means something
 * different before and after the chip it refers to, and a plain string would
 * force us to guess which mark a sentence is about. The token list keeps the
 * user's own ordering, which is the only reliable statement of intent we get.
 */

import {
  EDIT_TASK_MAX_SECONDS,
  EDIT_TASK_MIN_SECONDS,
  type Keyframe,
  type VideoEditSession,
} from "./types";

export type PromptToken =
  | { kind: "text"; text: string }
  | { kind: "mark"; keyframeId: string };

export type CompiledMarksPrompt = {
  /** The exact string for the `text` content item. */
  prompt: string;
  /**
   * Everything the request references, in wire order: the source clip first as
   * a `reference_video`, then each marked frame as a `reference_image`. The
   * labels are the names the prompt uses ("Video 1", "Image 1"), matching the
   * vendor's own convention.
   */
  references: Array<{
    keyframeId: string;
    url: string;
    label: string;
    kind: "video" | "image";
  }>;
  /** The full source length, rounded — this render is the WHOLE video, so the
   *  duration is not a user preference to be defaulted. */
  duration: number;
  warnings: string[];
  errors: string[];
};

/** `00:05`, matching how the chips read in the UI. Whole seconds: a chip
 *  showing centiseconds would be noise, and the model does not need them to
 *  find a moment in a six-second clip. */
export function formatChipTime(t: number): string {
  const total = Math.round(t);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** What a chip reads as in the composed prompt. */
export function chipLabel(kf: Keyframe): string {
  return `the marked frame at ${formatChipTime(kf.t)}`;
}

export function compileMarksPrompt(input: {
  session: VideoEditSession;
  tokens: PromptToken[];
}): CompiledMarksPrompt {
  const { session, tokens } = input;
  const warnings: string[] = [];
  const errors: string[] = [];
  const references: CompiledMarksPrompt["references"] = [];
  const seen = new Set<string>();
  const byId = new Map(session.keyframes.map((k) => [k.id, k]));

  // ── The source clip is the FIRST reference, and the load-bearing one ────
  //
  // Without it the model is shown a single still and asked for a video, so it
  // invents one: new camera, new pacing, new everything after the first frame.
  // That is the "it only regenerated part of it" failure. With the clip as a
  // reference video, the request becomes "re-render THIS, with these changes"
  // rather than "make something starting from this frame".
  const videoUrl = session.sourceVideoAssetUrl ?? publicSourceUrl(session);
  if (videoUrl) {
    references.push({
      keyframeId: "__source__",
      url: videoUrl,
      label: "Video 1",
      kind: "video",
    });
  } else if (session.sourceVideoStatus === "failed") {
    // A genuine, terminal failure: the clip cannot be attached, so the render
    // would silently become "invent a new video from a still". Block.
    errors.push(
      `The source clip could not be uploaded for reference: ${session.sourceVideoError ?? "unknown error"}. Without it the model would regenerate a new video instead of yours.`,
    );
  } else {
    // NOT an error. The upload is either in flight or has not started, and the
    // render path runs it before compiling for real.
    //
    // This used to be an error, which deadlocked the feature: Generate was
    // disabled by a condition that only pressing Generate could clear. Any
    // "not ready yet" state that gates the control which makes it ready is a
    // deadlock, and the fix is for readiness to be the render path's job, not
    // the button's.
    warnings.push("Preparing the source clip for reference…");
  }

  // ── Each marked frame, tagged and timestamped ──────────────────────────
  //
  // Absolute times, because this render IS the whole video: an edit at 00:05
  // of the source is an edit at 00:05 of the output.
  const beats: string[] = [];
  const freeText: string[] = [];

  for (const token of tokens) {
    if (token.kind === "text") {
      const text = token.text.trim();
      if (text) freeText.push(text);
      continue;
    }

    const kf = byId.get(token.keyframeId);
    if (!kf) {
      warnings.push(
        "A marked frame referenced in the prompt no longer exists and has been left out.",
      );
      continue;
    }

    const url = markedFrameUrl(kf);
    if (!url) {
      errors.push(
        `The marks at ${formatChipTime(kf.t)} haven't finished uploading yet.`,
      );
      continue;
    }

    if (!seen.has(kf.id)) {
      seen.add(kf.id);
      references.push({
        keyframeId: kf.id,
        url,
        label: `Image ${references.filter((r) => r.kind === "image").length + 1}`,
        kind: "image",
      });
    }
    const label = references.find((r) => r.keyframeId === kf.id)?.label ?? "Image 1";
    // The instruction that follows this chip in the user's own ordering is
    // what the edit at this moment is; anything before the first chip is
    // treated as applying to the whole video.
    beats.push(
      `at ${formatChipTime(kf.t)}, apply the change marked in ${label}`,
    );
  }

  if (references.filter((r) => r.kind === "image").length === 0 &&
      tokens.some((t) => t.kind === "mark")) {
    errors.push("None of the marked frames are ready to send yet.");
  }

  const instruction = freeText.join(" ").trim();
  if (!instruction && beats.length === 0) {
    errors.push("Say what should change, or mark a frame and describe it.");
  }

  // The clip's own length is a hard gate for this task type, and it is worth
  // checking here rather than letting the API say it: the request is otherwise
  // well-formed, so the rejection arrives after the upload and reads as a
  // mysterious parameter error.
  const sourceSeconds = session.source.duration;
  if (sourceSeconds < EDIT_TASK_MIN_SECONDS) {
    errors.push(
      `Video editing needs a clip of at least ${EDIT_TASK_MIN_SECONDS} seconds; this one is ${sourceSeconds.toFixed(1)}s.`,
    );
  }
  if (sourceSeconds > EDIT_TASK_MAX_SECONDS) {
    errors.push(
      `Video editing caps at ${EDIT_TASK_MAX_SECONDS} seconds; this clip is ${sourceSeconds.toFixed(1)}s. Trim it before editing.`,
    );
  }

  const duration = Math.round(sourceSeconds);
  const parts: string[] = [];

  if (session.sourceVideoStatus !== "failed") {
    // The preamble follows the vendor's own phrasing — "Use … from Video 1
    // throughout" — which is how their reference request binds a clip.
    parts.push(
      `Recreate the full ${duration}-second video shown in Video 1. Keep its subject, framing, camera movement, lighting, pacing and background exactly as they are throughout.`,
    );
  }

  if (beats.length > 0) {
    parts.push(
      `Apply these changes at the moments shown, and change nothing else: ${beats.join("; ")}.`,
    );
  }

  if (instruction) parts.push(instruction);

  if (session.sourceVideoStatus !== "failed") {
    parts.push(
      "Every part of the video not described above stays identical to Video 1.",
    );
  }

  const prompt = parts.join(" ").replace(/\s+/g, " ").trim();

  if (/<\/?(?:point|bbox)>/i.test(prompt)) {
    errors.push(
      "Internal: coordinate tags reached the video prompt. They belong to the image model only.",
    );
  }

  return { prompt, references, warnings, errors, duration };
}

/**
 * A URL the model can fetch for the source clip.
 *
 * A `/library-cache/…` path is same-origin to us and unreachable from
 * BytePlus, so it does not count — the caller has to ingest first. Returning
 * undefined rather than the local path is what turns that into a clear error
 * instead of an upstream fetch failure.
 */
function publicSourceUrl(session: VideoEditSession): string | undefined {
  return /^https?:/i.test(session.source.url) ? session.source.url : undefined;
}

/**
 * The image a chip sends.
 *
 * Order of preference, and the reason for each:
 *
 * 1. `markedFrameUrl` — the frame WITH the marks drawn on it. This is the
 *    whole point: the model is being shown what was circled.
 * 2. `assetUrl` — the same image after asset ingest, which is what a face
 *    needs in order to clear privacy moderation.
 *
 * A keyframe with neither is not ready, and the compiler says so rather than
 * quietly sending the clean frame — a clean frame with "make it bigger" next
 * to it is a request the model cannot satisfy and will answer anyway.
 */
function markedFrameUrl(kf: Keyframe): string | undefined {
  return kf.markedAssetUrl ?? kf.markedFrameUrl;
}

/** Free text from a token list, for a plain-text fallback and for search. */
export function tokensToPlainText(
  tokens: PromptToken[],
  session: VideoEditSession,
): string {
  const byId = new Map(session.keyframes.map((k) => [k.id, k]));
  return tokens
    .map((t) =>
      t.kind === "text"
        ? t.text
        : (() => {
            const kf = byId.get(t.keyframeId);
            return kf ? chipLabel(kf) : "";
          })(),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Migrate a legacy free-text intent into tokens.
 *
 * Sessions created before the chip model have `intent` and no tokens. Rather
 * than a store migration, the reader falls back — an old session opens with
 * its text intact and gains chips as soon as marks are saved.
 */
export function tokensFor(session: VideoEditSession): PromptToken[] {
  if (session.promptTokens && session.promptTokens.length > 0) {
    return session.promptTokens;
  }
  return session.intent.trim() ? [{ kind: "text", text: session.intent }] : [];
}
