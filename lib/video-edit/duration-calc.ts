/**
 * Duration calculus — `duration` is computed, never guessed.
 *
 * Implements claude_skill/references/duration-calculus.md for the keyframe
 * case. The skill's rule is that every prompt is priced from what has to
 * happen in it — dialogue word count, action beats, camera-move minimums —
 * summed and clamped to Seedance's 4–15s window.
 *
 * Why bother, when there's a duration control right there in the UI: a guessed
 * duration fails in both directions and neither failure looks like a duration
 * problem. Too short and the model skips beats — the requested action simply
 * does not appear, reading as "the model ignored my prompt". Too long and it
 * pads, drifts, or invents a second beat nobody asked for.
 *
 * The computed number is a DEFAULT, not a lock. The user can override it; what
 * they cannot do is end up with an unconsidered one, and the basis string is
 * shown next to the control so the number is arguable rather than magic.
 */

import { clampDuration } from "./sessions";

/** Words per second of delivered dialogue. The skill's rate for natural pace;
 *  the +1.5s covers the breath before and the beat after the line. */
const WORDS_PER_SECOND = 2.3;
const DIALOGUE_PADDING_S = 1.5;

/** A discrete physical beat — one thing happening and completing. */
const SECONDS_PER_BEAT = 1.2;
const BEAT_PADDING_S = 0.5;

/** A camera move needs room to read as a move rather than a jitter. */
const CAMERA_MOVE_MIN_S = 4;

/** Nothing meaningful renders below this. */
const FLOOR_S = 4;

/**
 * Does this prose describe a camera move?
 *
 * Shared by the duration calculus (a move sets a 4s floor) and the variant
 * selector (an explicit move on a multi-keyframe edit means a shot list). Two
 * copies drifted once already: the first version matched the bare infinitive,
 * so "the camera pushes in" — the way anyone actually writes it — did not
 * match, and the duration silently lost its floor.
 *
 * Matches either an explicit "camera <verb>" or a verb that is unambiguously
 * about the camera. Bare "push" and "pull" are deliberately excluded: "she
 * pushes the door" is an action, not a move.
 */
export const CAMERA_MOVE_RE =
  /\b(?:camera\s+\w+|pans?|panning|tilts?|tilting|dolly|dollies|orbits?|orbiting|cranes?|zooms?|zooming|pushes?\s+in|pushing\s+in|pulls?\s+(?:out|back)|track(?:s|ing)\s+(?:shot|in|out|with))\b/i;

export type DurationBasis = {
  seconds: number;
  /** One line explaining how the number was reached, shown in the UI and in
   *  the compiled-prompt disclosure. */
  basis: string;
};

export type DurationInputs = {
  /** Number of distinct actions the prompt asks for across all shots. */
  beats: number;
  /** Spoken words, if any dialogue is being requested. */
  dialogueWords?: number;
  /** Whether the shot carries a camera move. */
  hasCameraMove?: boolean;
  /** Shots in the compiled prompt. Multi-shot needs ≈4–6s per shot, and that
   *  floor dominates the beat maths once there are two or more. */
  shots?: number;
  /** The working window's length. An output longer than the window it is
   *  replacing cannot be spliced back cleanly, so it caps the result. */
  windowSeconds?: number;
};

export function computeDuration(input: DurationInputs): DurationBasis {
  const parts: string[] = [];
  let total = 0;

  const beats = Math.max(0, input.beats);
  if (beats > 0) {
    const fromBeats = beats * SECONDS_PER_BEAT + BEAT_PADDING_S;
    total += fromBeats;
    parts.push(`${beats} beat${beats === 1 ? "" : "s"} × 1.2 + 0.5`);
  }

  const words = Math.max(0, input.dialogueWords ?? 0);
  if (words > 0) {
    const fromDialogue = words / WORDS_PER_SECOND + DIALOGUE_PADDING_S;
    total += fromDialogue;
    parts.push(`${words} words ÷ 2.3 + 1.5`);
  }

  // A camera move is a FLOOR, not an addend. Adding it would double-count the
  // time the action already occupies — the move happens during the beats, not
  // after them.
  if (input.hasCameraMove && total < CAMERA_MOVE_MIN_S) {
    total = CAMERA_MOVE_MIN_S;
    parts.push("camera-move minimum 4s");
  }

  // Multi-shot has its own floor: the shot budget is ≈4–6s each, and a 3-shot
  // prompt squeezed into 8s renders as a smear.
  const shots = Math.max(1, input.shots ?? 1);
  if (shots > 1) {
    const shotFloor = shots * 4;
    if (total < shotFloor) {
      total = shotFloor;
      parts.push(`${shots} shots × 4s minimum`);
    }
  }

  if (total < FLOOR_S) {
    total = FLOOR_S;
    if (parts.length === 0) parts.push("4s floor");
  }

  let seconds = clampDuration(total);

  // The window cap comes last, after clamping, and is allowed to push below
  // what the beats wanted: a 6s window spliced back into its own footage must
  // be 6s of output or the seam moves. Never below the 4s floor, though —
  // Seedance will not accept it.
  const windowSeconds = input.windowSeconds;
  if (windowSeconds !== undefined && Number.isFinite(windowSeconds)) {
    const capped = clampDuration(Math.min(seconds, Math.round(windowSeconds)));
    if (capped !== seconds) {
      parts.push(`capped to the ${Math.round(windowSeconds)}s window`);
      seconds = capped;
    }
  }

  return { seconds, basis: parts.join(" + ") || `${seconds}s` };
}

/**
 * Estimate beats from prose, for when the user typed an intent and we have to
 * price it without asking them to count.
 *
 * Counts clause separators that mark a new physical event rather than
 * splitting on every comma — "she turns, slowly" is one beat, "she turns and
 * the door opens" is two. Crude on purpose: the number feeds a default the
 * user can see and change, so being roughly right beats being unpredictable.
 */
export function estimateBeats(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 1;
  const separators = trimmed.match(
    /\b(?:then|and then|after that|before|while|as)\b|[;.]/gi,
  );
  // +1 because N separators join N+1 clauses.
  return Math.min(4, (separators?.length ?? 0) + 1);
}

/** Words inside double or single quotes — the dialogue the model has to say. */
export function estimateDialogueWords(text: string): number {
  const quoted = text.match(/["'“”‘’]([^"'“”‘’]{2,})["'“”‘’]/g);
  if (!quoted) return 0;
  return quoted
    .map((q) => q.replace(/["'“”‘’]/g, "").trim())
    .reduce((sum, phrase) => sum + phrase.split(/\s+/).filter(Boolean).length, 0);
}
