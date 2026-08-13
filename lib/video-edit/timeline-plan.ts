/**
 * The timeline planner — turning "edit the video" into a set of generations.
 *
 * ── What changed, and why the old shape was wrong ────────────────────────
 *
 * The first design had the user edit ONE frame, then produce ONE clip of up to
 * 15s, with any surrounding footage spliced back untouched. That makes "edit a
 * video" mean "edit a frame and get a short clip back", and it puts the frame
 * render in front of the user as a chore they have to perform before the thing
 * they actually asked for.
 *
 * This module is the other shape: the user marks up moments ACROSS the
 * timeline, and the system works out how to regenerate the whole clip from
 * them. Seedance still only produces 4–15s at a time, so a 90s source is not
 * one call — it is a *plan* of calls, chained so they read as one film, with
 * each call's prompt carrying the timestamps of the edits that fall inside it.
 *
 * ── Why this is a separate, pure module ──────────────────────────────────
 *
 * The plan is the expensive decision in the feature. Each segment is a render:
 * minutes and real money, multiplied by however many the planner emits. A
 * planner that quietly returns 8 segments where 5 would do costs the user
 * three renders they did not need, and that is not something to discover from
 * a bill. So the plan is computed without touching the network or the store,
 * is shown to the user before anything is spent, and is tested directly.
 *
 * ── The rules, in priority order ─────────────────────────────────────────
 *
 * 1. A segment starts ON an edit wherever possible. A pinned first frame is
 *    the strongest control Seedance offers, so an edit at 12.0s is worth far
 *    more as the opening of a segment than as a beat buried inside one.
 * 2. Every segment is 4–15s. Those are hard model limits, not preferences.
 * 3. No runts. A 1.5s tail is not a shot; it is a cut that will read as a
 *    glitch. Runts merge into their neighbour even though that costs the
 *    "start on an edit" preference.
 * 4. Fewer segments beats more. Every extra segment is another render, another
 *    seam, and another chance for continuity to drift.
 */

import {
  MAX_WINDOW_SECONDS,
  MIN_WINDOW_SECONDS,
  type Keyframe,
  type VideoEditSession,
} from "./types";
import { clampDuration } from "./sessions";

/** One beat inside a segment: an edit that happens partway through it. */
export type SegmentBeat = {
  keyframeId: string;
  /** Absolute time in the source clip. */
  t: number;
  /** Seconds from the START of this segment — what the prompt talks in, since
   *  the model has no idea where in a longer film this segment sits. */
  relT: number;
  instruction: string;
};

export type PlannedSegment = {
  index: number;
  start: number;
  end: number;
  /** The integer Seedance will be asked for. May differ from `end - start` by
   *  a fraction of a second; the assembler trims to fit. */
  duration: number;
  /** The edit pinned as this segment's opening frame, when one lands on the
   *  boundary. This is the strongest control available and is why the planner
   *  prefers to cut here. */
  openingKeyframeId?: string;
  /** Edits that fall strictly inside the segment, as timed beats. */
  beats: SegmentBeat[];
  /**
   * Whether this segment continues from the previous one's final frame.
   *
   * True for every segment after the first that has no edit of its own to open
   * on — chaining is what stops each render inventing a new look for the same
   * scene. See continuity-and-editing.md: chain at a settled pose, and the
   * next prompt describes only what changes.
   */
  chainFromPrevious: boolean;
};

export type TimelinePlan = {
  segments: PlannedSegment[];
  /** Total seconds of output the plan will produce. */
  totalDuration: number;
  /** What the user is about to spend: one render per segment, plus one frame
   *  render per keyframe that still needs one. */
  videoRenders: number;
  frameRenders: number;
  warnings: string[];
  errors: string[];
};

/**
 * Coverage: how much of the source the plan regenerates.
 *
 * "full" rebuilds the whole clip end to end. "edits" regenerates only around
 * the moments that carry an edit, leaving the rest as original footage — far
 * cheaper on a long clip, and usually what someone wants when they changed one
 * thing at 0:42 of a two-minute video.
 */
export type PlanCoverage = "full" | "edits";

export type PlanInput = {
  session: VideoEditSession;
  coverage: PlanCoverage;
  /** Seconds of original footage to regenerate around an edit under "edits"
   *  coverage. Wide enough to establish the change, short enough to stay
   *  cheap. */
  padding?: number;
};

const DEFAULT_PADDING_S = 3;

/** Two edits closer together than this belong in the same segment — cutting
 *  between them would produce a sub-second shot. */
const MIN_BEAT_GAP_S = 1.0;

export function planTimeline(input: PlanInput): TimelinePlan {
  const { session, coverage } = input;
  const warnings: string[] = [];
  const errors: string[] = [];
  const duration = session.source.duration;

  const edits = [...session.keyframes]
    .filter((k) => k.annotations.length > 0 || k.instruction.trim())
    .sort((a, b) => a.t - b.t);

  if (edits.length === 0) {
    errors.push(
      "No edits yet. Mark up at least one moment — grab a frame and say what should change about it.",
    );
    return {
      segments: [],
      totalDuration: 0,
      videoRenders: 0,
      frameRenders: 0,
      warnings,
      errors,
    };
  }

  if (duration < MIN_WINDOW_SECONDS) {
    warnings.push(
      `The clip is ${duration.toFixed(1)}s and the shortest render is ${MIN_WINDOW_SECONDS}s, so the output will be slightly longer than the source.`,
    );
  }

  const ranges =
    coverage === "full"
      ? [{ start: 0, end: duration }]
      : coalesce(
          edits.map((e) => ({
            start: Math.max(0, e.t - (input.padding ?? DEFAULT_PADDING_S)),
            end: Math.min(duration, e.t + (input.padding ?? DEFAULT_PADDING_S)),
          })),
        );

  const segments: PlannedSegment[] = [];
  for (const range of ranges) {
    segments.push(...splitRange(range, edits, warnings));
  }

  // Renumber across ranges, and decide chaining. A segment chains when it
  // continues immediately from the previous one — not merely when it follows
  // it in the list, because under "edits" coverage two segments can be a
  // minute apart and chaining them would be a lie.
  segments.forEach((seg, i) => {
    seg.index = i;
    const prev = segments[i - 1];
    seg.chainFromPrevious =
      Boolean(prev) && Math.abs(seg.start - prev.end) < 0.1 && !seg.openingKeyframeId;
  });

  const frameRenders = session.keyframes.filter(
    (k) => !k.editedFrameUrl && (k.annotations.length > 0 || k.instruction.trim()),
  ).length;

  if (segments.length > 6) {
    warnings.push(
      `This plan is ${segments.length} renders. Each one costs money and takes minutes — consider "around the edits" coverage, or a shorter clip.`,
    );
  }

  return {
    segments,
    totalDuration: segments.reduce((sum, s) => sum + s.duration, 0),
    videoRenders: segments.length,
    frameRenders,
    warnings,
    errors,
  };
}

/**
 * Split one continuous range into legal segments, preferring to cut on edits.
 *
 * The greedy walk is deliberate. An optimal segmentation is a small dynamic
 * program, and it would buy nothing a user could perceive: the constraint that
 * actually matters is "start on an edit when you can", and greedy honours it
 * whenever the resulting piece is legal.
 */
function splitRange(
  range: { start: number; end: number },
  edits: Keyframe[],
  warnings: string[],
): PlannedSegment[] {
  const out: PlannedSegment[] = [];
  const inside = edits.filter((e) => e.t >= range.start - 0.001 && e.t <= range.end + 0.001);

  // Candidate cut points: the range start, then every edit far enough from the
  // previous cut to leave a legal segment.
  const cuts: number[] = [range.start];
  for (const e of inside) {
    const last = cuts[cuts.length - 1];
    if (e.t - last >= MIN_WINDOW_SECONDS && range.end - e.t >= MIN_BEAT_GAP_S) {
      cuts.push(e.t);
    }
  }

  for (let i = 0; i < cuts.length; i++) {
    const start = cuts[i];
    let end = i + 1 < cuts.length ? cuts[i + 1] : range.end;

    // Rule 2: nothing over the model's ceiling. A long stretch between edits
    // becomes several segments, chained.
    while (end - start > MAX_WINDOW_SECONDS) {
      const cut = start + MAX_WINDOW_SECONDS;
      out.push(makeSegment(start, cut, inside));
      cuts.splice(i + 1, 0, cut);
      i++;
      return [...out, ...splitRange({ start: cut, end: range.end }, edits, warnings)];
    }

    // Rule 3: no runts. Fold a short tail into the segment before it rather
    // than emitting a cut nobody would call a shot.
    if (end - start < MIN_WINDOW_SECONDS) {
      const prev = out[out.length - 1];
      if (prev && end - prev.start <= MAX_WINDOW_SECONDS) {
        prev.end = end;
        prev.duration = clampDuration(Math.round(end - prev.start));
        prev.beats = beatsFor(prev.start, end, inside);
        continue;
      }
      // Nothing to fold into: stretch to the model's minimum and say so, since
      // the output will run past the source.
      end = Math.min(start + MIN_WINDOW_SECONDS, Math.max(end, start + MIN_WINDOW_SECONDS));
      warnings.push(
        `The stretch at ${start.toFixed(1)}s is shorter than the ${MIN_WINDOW_SECONDS}s minimum, so it renders as ${MIN_WINDOW_SECONDS}s.`,
      );
    }

    out.push(makeSegment(start, end, inside));
  }

  return out;
}

function makeSegment(
  start: number,
  end: number,
  edits: Keyframe[],
): PlannedSegment {
  // An edit sitting on the boundary opens the segment; the rest are beats.
  const opening = edits.find((e) => Math.abs(e.t - start) < 0.1);
  return {
    index: 0, // assigned after every range is planned
    start,
    end,
    duration: clampDuration(Math.round(end - start)),
    openingKeyframeId: opening?.id,
    beats: beatsFor(start, end, edits),
    chainFromPrevious: false, // decided once the full list exists
  };
}

/** Edits strictly inside a segment, timed from its start. */
function beatsFor(start: number, end: number, edits: Keyframe[]): SegmentBeat[] {
  return edits
    .filter((e) => e.t > start + 0.1 && e.t < end - 0.05)
    .map((e) => ({
      keyframeId: e.id,
      t: e.t,
      relT: Math.round((e.t - start) * 10) / 10,
      instruction: e.instruction,
    }));
}

/** Merge overlapping or touching ranges, so padding around two nearby edits
 *  produces one segment rather than two that overlap. */
function coalesce(
  ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 0.1) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** A one-line human summary, for the confirm step. */
export function describePlan(plan: TimelinePlan): string {
  if (plan.segments.length === 0) return "Nothing to render.";
  const renders =
    plan.frameRenders > 0
      ? `${plan.frameRenders} frame render${plan.frameRenders === 1 ? "" : "s"}, then ${plan.videoRenders} video render${plan.videoRenders === 1 ? "" : "s"}`
      : `${plan.videoRenders} video render${plan.videoRenders === 1 ? "" : "s"}`;
  return `${renders} → ${plan.totalDuration}s of output across ${plan.segments.length} segment${plan.segments.length === 1 ? "" : "s"}.`;
}
