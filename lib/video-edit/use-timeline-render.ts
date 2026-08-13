"use client";

/**
 * Timeline render — execute a plan end to end, from marks to a finished cut.
 *
 * This is the "edit the video" path. The user marks moments; this runs
 * everything else:
 *
 *   1. Render any keyframe that has marks but no edited still. The frame edit
 *      is an implementation detail here, not a step the user performs.
 *   2. Render each segment in order, chaining continuity forward.
 *   3. Assemble the segments into one clip, with the original audio.
 *
 * ── Sequential, not parallel, and that is not an oversight ───────────────
 *
 * Segment N+1 is chained from segment N's final frame, so it cannot start
 * until N has finished. Firing them in parallel would be faster and would
 * produce a set of clips that each invent their own interpretation of the same
 * scene — which is precisely the drift the chaining exists to prevent.
 *
 * ── Partial results are kept ─────────────────────────────────────────────
 *
 * A five-segment plan that fails on segment four has still produced three
 * clips that cost real money and minutes. They are recorded on the version as
 * they land, so a failure leaves the user with what they paid for and a clear
 * statement of where it stopped — not an error and nothing to show.
 */

import * as React from "react";
import { classifyError, type ErrorClass } from "@/lib/compare/error-class";
import { mediaProxyUrl } from "@/lib/compare/media-proxy";
import { stageGeneratedVideo } from "@/lib/library/auto-save";
import { assembleSegments } from "./assemble";
import { uploadFrameToLibrary } from "./asset-upload";
import { grabFrameAt } from "./frame-grab";
import {
  appendVideoVersion,
  getVideoEditSession,
  newVideoEditId,
  patchVideoVersion,
} from "./sessions";
import { planTimeline, type PlanCoverage, type PlannedSegment } from "./timeline-plan";
import { compileSegmentPrompt } from "./video-prompt";
import type { VideoEditSession, VideoEditVersion } from "./types";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200;

export type TimelineRenderState =
  | { status: "idle" }
  | { status: "preparing"; message: string }
  | {
      status: "rendering";
      segmentIndex: number;
      totalSegments: number;
      elapsedMs: number;
      message: string;
    }
  | { status: "assembling"; message: string }
  | { status: "success"; videoUrl: string; elapsedMs: number; notes: string[] }
  | { status: "error"; message: string; errorClass: ErrorClass; partial?: string[] };

export function useTimelineRender(
  sessionId: string,
  deps: {
    /** Renders one keyframe's still. Reused verbatim so an auto-render and a
     *  manual one cannot diverge. */
    renderFrame: (keyframeId: string) => Promise<void>;
    hasPerson: boolean;
  },
) {
  const [state, setState] = React.useState<TimelineRenderState>({ status: "idle" });
  const abortRef = React.useRef<AbortController | null>(null);
  const depsRef = React.useRef(deps);
  depsRef.current = deps;

  React.useEffect(
    () => () => abortRef.current?.abort(),
    [],
  );

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "idle" });
  }, []);

  const render = React.useCallback(
    async (coverage: PlanCoverage = "full") => {
      const session = getVideoEditSession(sessionId);
      if (!session) return;

      const plan = planTimeline({ session, coverage });
      if (plan.errors.length > 0) {
        setState({
          status: "error",
          message: plan.errors[0],
          errorClass: classifyError(400, plan.errors[0]),
        });
        return;
      }

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const startedAt = Date.now();
      const notes = [...plan.warnings];

      // ── 1. Frame renders the user never has to ask for ──────────────────
      const needFrames = session.keyframes.filter(
        (k) => !k.editedFrameUrl && (k.annotations.length > 0 || k.instruction.trim()),
      );
      for (const [i, kf] of needFrames.entries()) {
        setState({
          status: "preparing",
          message: `Editing frame ${i + 1} of ${needFrames.length} at ${kf.t.toFixed(1)}s…`,
        });
        await depsRef.current.renderFrame(kf.id);
        if (ctrl.signal.aborted) return;
        const after = getVideoEditSession(sessionId)?.keyframes.find((k) => k.id === kf.id);
        if (!after?.editedFrameUrl) {
          const message = `The frame edit at ${kf.t.toFixed(1)}s failed: ${after?.editError ?? "unknown error"}. Fix it before rendering the video.`;
          setState({ status: "error", message, errorClass: classifyError(502, message) });
          return;
        }
      }

      // Re-read: the frame renders wrote to the store.
      const fresh = getVideoEditSession(sessionId);
      if (!fresh) return;

      const versionId = newVideoEditId();
      appendVideoVersion(sessionId, {
        id: versionId,
        createdAt: startedAt,
        parentId: fresh.versions.at(-1)?.id,
        intent: fresh.intent,
        compiledPrompt: "", // filled in as segments compile
        variant: fresh.variant ?? "A",
        model: fresh.model,
        duration: plan.totalDuration,
        ratio: fresh.ratio,
        resolution: fresh.resolution,
        seed: fresh.seed,
        audioMode: fresh.audioMode,
        keyframesSnapshot: fresh.keyframes.map((k) => ({ ...k })),
        outputs: [],
        status: "pending",
      } satisfies VideoEditVersion);

      // ── 2. Segments, in order, chained ──────────────────────────────────
      const segmentUrls: string[] = [];
      const prompts: string[] = [];
      /** The previous segment's final frame, hosted — the next segment's
       *  opening. Undefined for the first, and for any segment that opens on
       *  an edit of its own. */
      let carriedFrameUrl: string | undefined;

      for (const segment of plan.segments) {
        setState({
          status: "rendering",
          segmentIndex: segment.index,
          totalSegments: plan.segments.length,
          elapsedMs: Date.now() - startedAt,
          message: `Rendering ${segment.start.toFixed(1)}–${segment.end.toFixed(1)}s`,
        });

        const compiled = compileSegmentPrompt({
          session: fresh,
          segment,
          totalSegments: plan.segments.length,
          hasPerson: depsRef.current.hasPerson,
        });
        prompts.push(`[segment ${segment.index + 1}] ${compiled.prompt}`);
        notes.push(...compiled.warnings);

        const firstFrameUrl = openingUrlFor(segment, fresh, carriedFrameUrl);

        const body: Record<string, unknown> = {
          prompt: compiled.prompt,
          model: fresh.model,
          duration: segment.duration,
          ratio: fresh.ratio,
          resolution: fresh.resolution,
          audio: fresh.audioMode === "generate",
          ...(fresh.seed !== undefined ? { seed: fresh.seed } : {}),
          ...(firstFrameUrl
            ? { images: [{ url: firstFrameUrl, role: "first_frame" }] }
            : {}),
          // The same reference track on every segment, so a multi-segment
          // render is scored as one piece rather than as N clips that each
          // restart the music.
          ...(fresh.audioRefUrl
            ? { audios: [{ url: fresh.audioRefUrl, role: "reference_audio" }] }
            : {}),
        };

        try {
          const url = await submitAndPoll(body, ctrl.signal);
          segmentUrls.push(url);
          patchVideoVersion(sessionId, versionId, {
            outputs: segmentUrls.map((u) => ({ url: u })),
          });

          // The handoff to the next segment. Extracting it here — from the
          // clip that was just produced — is what makes the next render a
          // continuation rather than a fresh interpretation.
          carriedFrameUrl = await extractFinalFrame(url, ctrl.signal);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          const message = e instanceof Error ? e.message : String(e);
          const where = `segment ${segment.index + 1} of ${plan.segments.length} (${segment.start.toFixed(1)}–${segment.end.toFixed(1)}s)`;
          patchVideoVersion(sessionId, versionId, {
            status: "failed",
            error: `Stopped at ${where}: ${message}`,
            outputs: segmentUrls.map((u) => ({ url: u })),
            elapsedMs: Date.now() - startedAt,
          });
          setState({
            status: "error",
            message: `Stopped at ${where}: ${message}`,
            errorClass: classifyError(undefined, message),
            // The clips already paid for. Losing them to a later failure would
            // be the worst outcome of the whole flow.
            partial: segmentUrls,
          });
          return;
        }
      }

      // ── 3. One clip out ─────────────────────────────────────────────────
      setState({
        status: "assembling",
        message:
          segmentUrls.length > 1
            ? `Joining ${segmentUrls.length} segments${fresh.audioMode === "preserve" ? " and restoring the original audio" : ""}…`
            : "Finishing…",
      });

      let finalUrl = segmentUrls[0];
      const needsAssembly =
        segmentUrls.length > 1 || fresh.audioMode === "preserve";

      if (needsAssembly) {
        try {
          finalUrl = (
            await assembleSegments({
              segmentUrls,
              sourceUrl: fresh.source.url,
              audio: fresh.audioMode === "preserve" ? "preserve" : "keep",
              // Under "edits" coverage the output is not the same length as
              // the source, so the audio would drift; the route is told the
              // span it is soundtracking.
              window: { start: plan.segments[0].start, end: plan.segments.at(-1)!.end },
              signal: ctrl.signal,
            })
          ).url;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          notes.push(
            `The segments rendered but joining them failed: ${e instanceof Error ? e.message : String(e)}. Showing the first segment; all of them are on the version.`,
          );
        }
      }

      const elapsedMs = Date.now() - startedAt;
      patchVideoVersion(sessionId, versionId, {
        status: "done",
        compiledPrompt: prompts.join("\n\n"),
        outputs: [{ url: finalUrl }, ...segmentUrls.slice(1).map((u) => ({ url: u }))],
        elapsedMs,
      });

      stageGeneratedVideo({
        taskId: versionId,
        videoUrl: finalUrl,
        prompt: fresh.intent.trim() || "smart video edit",
        model: fresh.model,
        ratio: fresh.ratio,
        duration: plan.totalDuration,
        resolution: fresh.resolution,
        seed: fresh.seed,
        mode: `video-edit:timeline:${coverage}`,
      });

      setState({ status: "success", videoUrl: finalUrl, elapsedMs, notes });
    },
    [sessionId],
  );

  return { state, render, cancel };
}

// ─────────────────────────── Helpers ──────────────────────────────────────

/**
 * The URL that opens a segment.
 *
 * An edit on the boundary wins: it is the thing the user asked for, and a
 * pinned edited frame is the strongest control the model offers. Otherwise the
 * previous segment's final frame carries continuity forward. A segment with
 * neither opens free, which is correct for the first segment of a plan that
 * starts on untouched footage.
 */
function openingUrlFor(
  segment: PlannedSegment,
  session: VideoEditSession,
  carried: string | undefined,
): string | undefined {
  if (segment.openingKeyframeId) {
    const kf = session.keyframes.find((k) => k.id === segment.openingKeyframeId);
    // The asset URL when ingest finished, the raw edited frame otherwise —
    // same precedence as the variant compiler's bookend.
    return kf?.assetUrl ?? kf?.editedFrameUrl;
  }
  return segment.chainFromPrevious ? carried : undefined;
}

/**
 * Grab the last frame of a rendered clip, to open the next one.
 *
 * Backs off the very end: seeking to exactly `duration` puts most decoders
 * past the final frame and yields black, which would chain the next segment
 * out of a blank. Chaining also wants a SETTLED pose, and the last presented
 * frame of a completed take is the best available approximation.
 *
 * Returns undefined rather than throwing — a failed handoff costs continuity
 * on one seam, and losing the whole render over it would be a bad trade.
 */
async function extractFinalFrame(
  videoUrl: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  try {
    const el = document.createElement("video");
    el.crossOrigin = "anonymous";
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.src = mediaProxyUrl(videoUrl);

    await new Promise<void>((resolve, reject) => {
      el.onloadedmetadata = () => resolve();
      el.onerror = () => reject(new Error("could not load the rendered clip"));
      setTimeout(() => reject(new Error("timed out loading the rendered clip")), 20_000);
    });
    if (signal.aborted) return undefined;

    const frame = await grabFrameAt(el, Math.max(0, el.duration - 0.1));
    return await uploadFrameToLibrary(frame.dataUrl, `chain-${Date.now()}.jpg`);
  } catch {
    return undefined;
  }
}

async function submitAndPoll(
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !data.id) {
    throw new Error(data.error ?? `Submit failed (${res.status})`);
  }

  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const pr = await fetch(`/api/video/${data.id}`, { signal });
    const pd = (await pr.json().catch(() => ({}))) as {
      status?: string;
      content?: { video_url?: string };
      error?: { message?: string };
    };
    if (!pr.ok) throw new Error(`Poll failed (${pr.status})`);
    if (pd.status === "succeeded") {
      if (!pd.content?.video_url) throw new Error("Succeeded without a video URL.");
      return pd.content.video_url;
    }
    if (pd.status === "failed" || pd.status === "cancelled") {
      throw new Error(pd.error?.message ?? `Task ${pd.status}.`);
    }
  }
  throw new Error("Polling timed out after ~10 minutes.");
}
