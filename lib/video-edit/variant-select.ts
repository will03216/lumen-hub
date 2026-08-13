/**
 * Which prompt variant to use — PRD §10.3.
 *
 * This is the INTERIM heuristic. It exists because a default has to exist, not
 * because we know it is right: §10.5 defines a 12-clip blind bench whose
 * measured result replaces this table. Until that runs, every choice here is a
 * hypothesis, and the `why` string says which one so a user disagreeing with
 * the pick can see the reasoning rather than fighting a black box.
 *
 * Kept pure and separate from the compiler so the bench can drive it directly.
 */

import { classifyIntent, type MeasuredDefaults } from "./bench";
import { MEASURED_DEFAULTS } from "./measured-defaults";
import { CAMERA_MOVE_RE } from "./duration-calc";
import {
  REF_VIDEO_MAX_SECONDS,
  type Keyframe,
  type PromptVariantId,
  type VideoEditSession,
} from "./types";

export type VariantChoice = {
  id: PromptVariantId;
  why: string;
};

export type VariantAvailability = {
  id: PromptVariantId;
  available: boolean;
  /** Why it can't be used, when it can't. Shown on the disabled option — a
   *  greyed-out control with no explanation is the most common way a good
   *  feature reads as broken. */
  reason?: string;
};

/** Words that mean the edit adds or removes something rather than restyling
 *  what is already there. Compositional edits are the case where showing the
 *  model both states (B) beats pinning a frame (A), because a pinned frame can
 *  be re-rendered back to the "before". */
const COMPOSITIONAL = /\b(remove|delete|erase|add|insert|place|put|replace|swap|take out|get rid of)\b/i;


export function selectVariant(
  session: VideoEditSession,
  /** Injected so the bench can drive the selector directly, and so a test can
   *  pin the table instead of depending on whatever the last run measured. */
  measured: MeasuredDefaults = MEASURED_DEFAULTS,
): VariantChoice {
  const ready = session.keyframes.filter((k) => Boolean(k.editedFrameUrl));
  const windowLength = session.window.end - session.window.start;
  const intent = session.intent;

  // ── Measurement beats the heuristic, where a measurement exists ─────────
  //
  // §10.5's bench replaces guesses one edit class at a time. A class with a
  // verdict uses it; a class without one keeps falling through to the
  // hypothesis below, rather than inheriting another class's answer.
  //
  // Ledger SHAPE still wins over the measured table, and that ordering is
  // deliberate: variants D and E are not stylistic preferences, they are the
  // only ones that can consume two or three keyframes at all. A measured
  // default for "appearance" must not throw away the user's second keyframe.
  const measuredPick = ready.length === 1 ? measured[classifyIntent(intent)] : undefined;
  if (measuredPick && isUsable(measuredPick, session)) {
    return {
      id: measuredPick,
      why: `Measured: on the bench, ${measuredPick} scored best for this kind of edit.`,
    };
  }

  if (ready.length === 0) {
    return {
      id: "A",
      why: "No edited keyframe yet — A is the simplest path once one exists.",
    };
  }

  if (ready.length >= 3 || (ready.length >= 2 && CAMERA_MOVE_RE.test(intent))) {
    return {
      id: "D",
      why: `${ready.length} edited keyframes read as a shot list, so each one becomes a labelled shot.`,
    };
  }

  if (ready.length === 2) {
    return {
      id: "E",
      why: "Two keyframes pin both ends, leaving the model only the middle to solve.",
    };
  }

  if (COMPOSITIONAL.test(intent)) {
    return {
      id: "B",
      why: "Adding or removing something — showing the model both states beats pinning a frame it can re-render back to the original.",
    };
  }

  if (canUseMotionTransfer(session).available) {
    return {
      id: "C",
      why: `The window is ${windowLength.toFixed(1)}s, so the source clip fits as a motion reference — that keeps the original performance intact.`,
    };
  }

  if (isNearStart(ready[0], session)) {
    return {
      id: "A",
      why: "One edit at the start of the window — pin it as the first frame and describe only what moves.",
    };
  }

  return {
    id: "B",
    why: "One edit partway through the window, so it binds better as a tagged reference than as a first frame.",
  };
}

/** Whether a variant can actually run right now — the measured table is a
 *  preference, not a licence to pick something the session cannot support. */
function isUsable(id: PromptVariantId, session: VideoEditSession): boolean {
  return variantAvailability(session).find((v) => v.id === id)?.available ?? false;
}

/**
 * A keyframe counts as "at the start" if it sits in the first fifth of the
 * window. Pinning a first frame from the middle of a window throws away
 * everything before it, which is rarely what someone meant.
 */
function isNearStart(kf: Keyframe | undefined, session: VideoEditSession): boolean {
  if (!kf) return false;
  const length = session.window.end - session.window.start;
  if (length <= 0) return true;
  return (kf.t - session.window.start) / length <= 0.2;
}

export function canUseMotionTransfer(
  session: VideoEditSession,
): { available: boolean; reason?: string } {
  const windowLength = session.window.end - session.window.start;
  if (windowLength > REF_VIDEO_MAX_SECONDS) {
    return {
      available: false,
      reason: `A reference video caps at ${REF_VIDEO_MAX_SECONDS}s and this window is ${windowLength.toFixed(1)}s.`,
    };
  }
  if (!session.source.byteplusAssetId && !/^https?:/i.test(session.source.url)) {
    return {
      available: false,
      reason: "The source clip needs a public URL or an asset-library upload first.",
    };
  }
  return { available: true };
}

/** Every variant with whether it can run right now, for the picker. */
export function variantAvailability(
  session: VideoEditSession,
): VariantAvailability[] {
  const ready = session.keyframes.filter((k) => Boolean(k.editedFrameUrl));
  const motion = canUseMotionTransfer(session);

  return [
    {
      id: "A",
      available: ready.length >= 1,
      reason: ready.length >= 1 ? undefined : "Needs one edited keyframe.",
    },
    {
      id: "B",
      available: ready.length >= 1,
      reason: ready.length >= 1 ? undefined : "Needs one edited keyframe.",
    },
    {
      id: "C",
      available: ready.length >= 1 && motion.available,
      reason:
        ready.length < 1 ? "Needs one edited keyframe." : motion.reason,
    },
    {
      id: "D",
      available: ready.length >= 2,
      reason: ready.length >= 2 ? undefined : "Needs at least two edited keyframes.",
    },
    {
      id: "E",
      available: ready.length >= 2,
      reason: ready.length >= 2 ? undefined : "Needs two edited keyframes to pin both ends.",
    },
  ];
}

/**
 * Roles for the ledger, derived from the variant that will consume it.
 *
 * Role is not a property of a keyframe on its own — the same frame is a first
 * frame under A, a tagged reference under B, and one end of a bookend under E.
 * Deriving it here rather than storing a user-set role is what keeps the rail's
 * labels honest when the variant changes.
 */
export function rolesForVariant(
  variant: PromptVariantId,
  keyframes: Keyframe[],
): Map<string, Keyframe["role"]> {
  const roles = new Map<string, Keyframe["role"]>();
  const ready = keyframes.filter((k) => Boolean(k.editedFrameUrl));

  if (variant === "E" && ready.length >= 2) {
    roles.set(ready[0].id, "first_frame");
    roles.set(ready[ready.length - 1].id, "last_frame");
    for (const k of ready.slice(1, -1)) roles.set(k.id, "reference");
    return roles;
  }

  if (variant === "A" || variant === "D") {
    if (ready[0]) roles.set(ready[0].id, "first_frame");
    for (const k of ready.slice(1)) roles.set(k.id, "reference");
    return roles;
  }

  for (const k of ready) roles.set(k.id, "reference");
  return roles;
}
