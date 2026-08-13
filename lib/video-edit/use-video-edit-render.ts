"use client";

/**
 * The video render — compiled prompt + keyframe ledger → Seedance → a clip.
 *
 * Wraps POST /api/video rather than forking it, for the same reason the image
 * editor wraps /api/image: that route already carries BYOK, the Minimax
 * provider branch, 1:1 status forwarding and the task-id contract. Nothing
 * about this feature belongs inside it.
 *
 * Submit-and-poll follows lib/compare/use-video-render.ts. What this hook adds
 * on top, and why it isn't just that hook:
 *
 * · It writes a VERSION ROW BEFORE the request goes out, as `pending`. That
 *   ordering is what lets a render survive a refresh mid-flight — the row is
 *   already in the store with the compiled prompt and the ledger snapshot that
 *   produced it, so a reload shows a failed render rather than losing the only
 *   record of what was sent.
 *
 * · It refuses to submit when the compiler reports integrity errors. Each one
 *   of those produces a request that is either rejected upstream or silently
 *   wrong (a dropped reference renders as "the model ignored my edit"), and
 *   both are worse than a blocked button with a reason next to it.
 */

import * as React from "react";
import { classifyError, type ErrorClass } from "@/lib/compare/error-class";
import { stageGeneratedVideo } from "@/lib/library/auto-save";
import { assemble, planAssembly } from "./assemble";
import {
  appendVideoVersion,
  getVideoEditSession,
  newVideoEditId,
  patchVideoVersion,
} from "./sessions";
import { compileVideoPrompt, type CompiledVideoPrompt } from "./video-prompt";
import { selectVariant } from "./variant-select";
import type { VideoEditSession, VideoEditVersion } from "./types";

const POLL_INTERVAL_MS = 3000;
/** ~10 min, matching Studio and Compare. A Seedance render at 1080p can take
 *  several minutes; anything past this is a stuck task, not a slow one. */
const POLL_MAX_TRIES = 200;

export type VideoEditRenderState =
  | { status: "idle" }
  | { status: "submitting"; startedAt: number; versionId: string }
  | { status: "polling"; startedAt: number; versionId: string; taskId: string; elapsedMs: number }
  | { status: "assembling"; versionId: string; summary: string }
  | {
      status: "success";
      versionId: string;
      videoUrl: string;
      elapsedMs: number;
      /** Non-fatal things worth saying: audio dropped for drift, assembly
       *  failed and the raw render is being shown instead. */
      notes: string[];
    }
  | {
      status: "error";
      versionId?: string;
      message: string;
      errorClass: ErrorClass;
      missingKey?: boolean;
    };

/** The full request body, built where it can be shown to someone. */
export function buildVideoRequest(
  session: VideoEditSession,
  compiled: CompiledVideoPrompt,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: compiled.prompt,
    model: session.model,
    duration: compiled.duration,
    ratio: session.ratio,
    resolution: session.resolution,
    // `preserve` muxes the SOURCE audio in post — asking Seedance to also
    // generate a track would mean paying for one we immediately discard.
    audio: session.audioMode === "generate",
  };
  if (session.seed !== undefined) body.seed = session.seed;
  if (compiled.plan.images.length > 0) body.images = compiled.plan.images;
  if (compiled.plan.videos.length > 0) body.videos = compiled.plan.videos;
  if (compiled.plan.references.length > 0) body.references = compiled.plan.references;
  return body;
}

/** Compile without submitting — drives the disclosure and the button's
 *  disabled state, and is the same call the submit path makes so the two can
 *  never disagree about what would be sent. */
export function previewCompile(
  session: VideoEditSession,
  hasPerson: boolean,
): CompiledVideoPrompt {
  return compileVideoPrompt({
    session,
    variant: session.variant ?? selectVariant(session).id,
    hasPerson,
  });
}

export function useVideoEditRender(sessionId: string) {
  const [state, setState] = React.useState<VideoEditRenderState>({ status: "idle" });
  const abortRef = React.useRef<AbortController | null>(null);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingVersionRef = React.useRef<string | null>(null);

  const cleanupTick = React.useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  /** Close out the in-flight row. Without this an aborted render leaves a
   *  version stuck at `pending` forever: it spins, nothing reconciles it (the
   *  status is persisted, so not even a remount does), and it eats one of the
   *  MAX_VIDEO_VERSIONS slots. */
  const settleAborted = React.useCallback(() => {
    const versionId = pendingVersionRef.current;
    if (!versionId) return;
    pendingVersionRef.current = null;
    patchVideoVersion(sessionId, versionId, {
      status: "failed",
      error: "Cancelled.",
    });
  }, [sessionId]);

  const settleRef = React.useRef(settleAborted);
  settleRef.current = settleAborted;
  React.useEffect(
    () => () => {
      cleanupTick();
      if (abortRef.current) {
        abortRef.current.abort();
        settleRef.current();
      }
    },
    [cleanupTick],
  );

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cleanupTick();
    settleAborted();
    setState({ status: "idle" });
  }, [cleanupTick, settleAborted]);

  const render = React.useCallback(
    async (opts: { hasPerson?: boolean } = {}) => {
      const session = getVideoEditSession(sessionId);
      if (!session) return;

      const compiled = previewCompile(session, opts.hasPerson ?? false);
      if (compiled.errors.length > 0) {
        setState({
          status: "error",
          message: compiled.errors[0],
          errorClass: classifyError(400, compiled.errors[0]),
        });
        return;
      }

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      cleanupTick();

      const startedAt = Date.now();
      const versionId = newVideoEditId();
      const body = buildVideoRequest(session, compiled);

      appendVideoVersion(sessionId, {
        id: versionId,
        createdAt: startedAt,
        parentId: session.versions.at(-1)?.id,
        intent: session.intent,
        compiledPrompt: compiled.prompt,
        variant: compiled.variant,
        model: session.model,
        duration: compiled.duration,
        ratio: session.ratio,
        resolution: session.resolution,
        seed: session.seed,
        audioMode: session.audioMode,
        keyframesSnapshot: session.keyframes.map((k) => ({ ...k })),
        requestBody: body,
        outputs: [],
        status: "pending",
      } satisfies VideoEditVersion);
      pendingVersionRef.current = versionId;
      setState({ status: "submitting", startedAt, versionId });

      const fail = (
        status: number | undefined,
        message: string,
      ) => {
        cleanupTick();
        patchVideoVersion(sessionId, versionId, {
          status: "failed",
          error: message,
          elapsedMs: Date.now() - startedAt,
        });
        pendingVersionRef.current = null;
        setState({
          status: "error",
          versionId,
          message,
          errorClass: classifyError(status, message),
          missingKey: status === 402,
        });
      };

      try {
        const res = await fetch("/api/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}) as Record<string, unknown>);
        if (ctrl.signal.aborted) return;

        if (!res.ok) {
          return fail(
            res.status,
            (data as { error?: string }).error ?? `Submit failed (${res.status})`,
          );
        }
        const taskId = (data as { id?: string }).id;
        if (!taskId) return fail(undefined, "Missing task id from /api/video.");

        patchVideoVersion(sessionId, versionId, { taskId });
        setState({
          status: "polling",
          startedAt,
          versionId,
          taskId,
          elapsedMs: Date.now() - startedAt,
        });
        tickRef.current = setInterval(() => {
          setState((prev) =>
            prev.status === "polling"
              ? { ...prev, elapsedMs: Date.now() - prev.startedAt }
              : prev,
          );
        }, 1000);

        for (let tries = 0; tries < POLL_MAX_TRIES; tries++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          if (ctrl.signal.aborted) return;

          const pr = await fetch(`/api/video/${taskId}`, { signal: ctrl.signal });
          const pdata = (await pr.json().catch(() => ({}))) as {
            status?: string;
            content?: { video_url?: string };
            error?: { message?: string };
          };
          if (!pr.ok) {
            return fail(pr.status, `Poll failed (${pr.status})`);
          }

          if (pdata.status === "succeeded") {
            cleanupTick();
            const rawUrl = pdata.content?.video_url;
            if (!rawUrl) return fail(undefined, "Succeeded without a video URL.");

            // ── Assembly (PRD §5G) ────────────────────────────────────────
            //
            // The model's output is not always the deliverable. If the user
            // is keeping their own audio, or editing through a window in a
            // longer clip, the real result is the assembled file — so that is
            // what gets stored, staged to the Library, and shown.
            //
            // A FAILED assembly is not a failed render. The render succeeded
            // and was paid for; falling back to the raw clip with a warning
            // is strictly better than throwing away a clip that cost minutes.
            const plan = planAssembly(session, compiled.duration);
            let videoUrl = rawUrl;
            let assemblyNote: string | undefined;

            if (plan.needed) {
              setState({
                status: "assembling",
                versionId,
                summary: plan.summary,
              });
              try {
                const out = await assemble({
                  sourceUrl: session.source.url,
                  renderedUrl: rawUrl,
                  window: session.window,
                  plan,
                  signal: ctrl.signal,
                });
                videoUrl = out.url;
              } catch (e) {
                if (e instanceof DOMException && e.name === "AbortError") return;
                assemblyNote = `The clip rendered, but assembly failed: ${
                  e instanceof Error ? e.message : String(e)
                } — showing the raw render instead.`;
              }
            }

            const elapsedMs = Date.now() - startedAt;
            patchVideoVersion(sessionId, versionId, {
              status: "done",
              outputs: [{ url: videoUrl }],
              elapsedMs,
              // Kept on the version rather than only in transient state: an
              // assembly that silently didn't happen is exactly the thing
              // someone will ask about a week later.
              error: assemblyNote,
            });
            pendingVersionRef.current = null;

            // The user's INTENT, not the compiled prompt. The feed's "reuse
            // prompt" action seeds the generator with whatever is stored here,
            // and the compiled string carries reference tags that mean nothing
            // outside this session. The compiled prompt is kept on the version.
            stageGeneratedVideo({
              taskId,
              videoUrl,
              prompt: session.intent.trim() || compiled.prompt,
              model: session.model,
              ratio: session.ratio,
              duration: compiled.duration,
              resolution: session.resolution,
              seed: session.seed,
              mode: `video-edit:${compiled.variant}`,
            });

            setState({
              status: "success",
              versionId,
              videoUrl,
              elapsedMs,
              notes: [...plan.warnings, ...(assemblyNote ? [assemblyNote] : [])],
            });
            return;
          }

          if (pdata.status === "failed" || pdata.status === "cancelled") {
            // Moderation rejections arrive here, and the upstream message is
            // the actionable part — an output-stage block needs a different
            // fix than an input-stage one.
            return fail(
              undefined,
              pdata.error?.message ??
                (pdata.status === "cancelled" ? "Task cancelled." : "Task failed."),
            );
          }
        }
        return fail(undefined, "Polling timed out after ~10 minutes.");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        fail(undefined, e instanceof Error ? e.message : String(e));
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [sessionId, cleanupTick],
  );

  return { state, render, cancel };
}
