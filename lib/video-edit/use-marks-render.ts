"use client";

/**
 * The simple path: marks → one Seedance 2.5 call → a clip.
 *
 * This is the Dreamina shape. The user draws on frames, types a sentence, and
 * presses generate once. There is no frame-render step to approve, no variant
 * to choose, no plan to read — the marked frames go up as reference images and
 * the prompt names them by timestamp.
 *
 * Two jobs live here:
 *
 *   saveMarks(keyframeId)  — burn the marks into a copy of the frame, host it,
 *                            and ingest it so a face clears moderation. This
 *                            is what the "Save" button in the mark modal does.
 *   render()               — compile the prompt and submit, once.
 */

import * as React from "react";
import { classifyError, type ErrorClass } from "@/lib/compare/error-class";
import { renderComposite } from "@/lib/edit/composite";
import { resolveSafeUrl } from "@/lib/edit/same-origin";
import { stageGeneratedVideo } from "@/lib/library/auto-save";
import {
  createGroup,
  ingestFrame,
  ingestVideo,
  uploadFrameToLibrary,
} from "./asset-upload";
import { compileMarksPrompt, tokensFor, tokensToPlainText } from "./marks-prompt";
import {
  appendVideoVersion,
  getVideoEditSession,
  newVideoEditId,
  patchKeyframe,
  patchVideoVersion,
  updateVideoEditSession,
} from "./sessions";
import {
  EDIT_TASK_DURATION,
  EDIT_TASK_RATIO,
  type VideoEditSession,
  type VideoEditVersion,
} from "./types";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200;

export type MarksRenderState =
  | { status: "idle" }
  | { status: "saving"; message: string }
  | { status: "submitting" }
  | { status: "polling"; elapsedMs: number }
  | { status: "success"; videoUrl: string; elapsedMs: number }
  | { status: "error"; message: string; errorClass: ErrorClass; missingKey?: boolean };

export function useMarksRender(sessionId: string) {
  const [state, setState] = React.useState<MarksRenderState>({ status: "idle" });
  const abortRef = React.useRef<AbortController | null>(null);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = React.useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  React.useEffect(
    () => () => {
      cleanup();
      abortRef.current?.abort();
    },
    [cleanup],
  );

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    cleanup();
    setState({ status: "idle" });
  }, [cleanup]);

  /**
   * Burn the marks into the frame and get it ready to send.
   *
   * The composite is the MESSAGE here, not contamination — the opposite of the
   * Seedream path, where the same pixels would have to be kept away from the
   * model. Worth stating because the two live one import apart.
   *
   * Ingest failure is not fatal: the composite still has a plain URL, and only
   * a frame containing a face actually needs the ingested copy. The keyframe
   * records the failure so the prompt bar can say so.
   */
  const saveMarks = React.useCallback(
    async (keyframeId: string) => {
      const session = getVideoEditSession(sessionId);
      const kf = session?.keyframes.find((k) => k.id === keyframeId);
      if (!session || !kf) return;

      setState({ status: "saving", message: "Saving marks…" });
      try {
        const safe = resolveSafeUrl(kf.sourceFrameUrl);
        const { dataUrl } = await renderComposite({
          url: safe.url,
          crossOrigin: safe.crossOrigin,
          width: kf.width,
          height: kf.height,
          annotations: kf.annotations,
          // Every mark is drawn, including the vector ones. On the Seedream
          // path point and box travel as coordinate tags with the image left
          // clean; here there are no tags, so a box that isn't drawn is a box
          // the model never sees.
          drawAll: true,
          mimeType: "image/jpeg",
        });

        const url = await uploadFrameToLibrary(
          dataUrl,
          `marked-${keyframeId}.jpg`,
        );
        patchKeyframe(sessionId, keyframeId, {
          markedFrameUrl: url,
          markedAssetUrl: undefined,
          assetStatus: "uploading",
          assetError: undefined,
        });

        let groupId = session.assetGroupId;
        if (!groupId) {
          groupId = await createGroup(`lumen-video-edit-${session.name}`);
          updateVideoEditSession(sessionId, { assetGroupId: groupId });
        }
        const { assetId, assetUrl } = await ingestFrame({
          url,
          groupId,
          filename: `marked-${keyframeId}.jpg`,
        });
        patchKeyframe(sessionId, keyframeId, {
          assetId,
          markedAssetUrl: assetUrl,
          assetStatus: "active",
        });
        setState({ status: "idle" });
      } catch (e) {
        patchKeyframe(sessionId, keyframeId, {
          assetStatus: "failed",
          assetError: e instanceof Error ? e.message : String(e),
        });
        setState({ status: "idle" });
      }
    },
    [sessionId],
  );

  /**
   * Get the source clip to somewhere the model can fetch it.
   *
   * Called before every render rather than at upload time: a session can be
   * reopened days later, and an ingest that happened once is cheap to skip and
   * expensive to have silently expired.
   */
  const ensureSourceVideo = React.useCallback(async () => {
    const session = getVideoEditSession(sessionId);
    if (!session || session.sourceVideoAssetUrl) return;

    updateVideoEditSession(sessionId, { sourceVideoStatus: "uploading" });
    try {
      let groupId = session.assetGroupId;
      if (!groupId) {
        groupId = await createGroup(`lumen-video-edit-${session.name}`);
        updateVideoEditSession(sessionId, { assetGroupId: groupId });
      }
      const { assetUrl } = await ingestVideo({
        url: session.source.url,
        groupId,
        filename: `source-${session.id}.mp4`,
      });
      updateVideoEditSession(sessionId, {
        sourceVideoAssetUrl: assetUrl,
        sourceVideoStatus: "active",
      });
    } catch (e) {
      updateVideoEditSession(sessionId, {
        sourceVideoStatus: "failed",
        sourceVideoError: e instanceof Error ? e.message : String(e),
      });
    }
  }, [sessionId]);

  const render = React.useCallback(async () => {
    setState({ status: "saving", message: "Preparing the source clip…" });
    await ensureSourceVideo();

    const session = getVideoEditSession(sessionId);
    if (!session) return;

    const compiled = compileMarksPrompt({
      session,
      tokens: tokensFor(session),
    });
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
    const startedAt = Date.now();
    const versionId = newVideoEditId();

    const videoRefs = compiled.references.filter((r) => r.kind === "video");
    // The compiler treats a pending upload as a warning so the button is not
    // deadlocked. Submission is where it becomes non-negotiable: without the
    // clip attached, this request is "make a new video from a still", which is
    // the exact failure the reference video exists to prevent.
    if (videoRefs.length === 0) {
      const message =
        session.sourceVideoError ??
        "The source clip could not be prepared for reference, so the render would produce a new video rather than editing yours.";
      setState({
        status: "error",
        message,
        errorClass: classifyError(502, message),
      });
      return;
    }
    const imageRefs = compiled.references.filter((r) => r.kind === "image");

    const body = buildMarksRequestBody(session, compiled);

    appendVideoVersion(sessionId, {
      id: versionId,
      createdAt: startedAt,
      parentId: session.versions.at(-1)?.id,
      intent: tokensToPlainText(tokensFor(session), session),
      compiledPrompt: compiled.prompt,
      variant: "A",
      model: session.model,
      // The version records the clip's OWN length, which is what the output
      // will be — storing -1 would put a sentinel in front of the user.
      duration: compiled.duration,
      ratio: "adaptive",
      resolution: session.resolution,
      seed: session.seed,
      audioMode: session.audioMode,
      keyframesSnapshot: session.keyframes.map((k) => ({ ...k })),
      requestBody: body,
      outputs: [],
      status: "pending",
    } satisfies VideoEditVersion);

    setState({ status: "submitting" });

    const fail = (status: number | undefined, message: string) => {
      cleanup();
      patchVideoVersion(sessionId, versionId, {
        status: "failed",
        error: message,
        elapsedMs: Date.now() - startedAt,
      });
      setState({
        status: "error",
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
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (ctrl.signal.aborted) return;
      if (!res.ok || !data.id) {
        return fail(res.status, data.error ?? `Submit failed (${res.status})`);
      }

      patchVideoVersion(sessionId, versionId, { taskId: data.id });
      setState({ status: "polling", elapsedMs: 0 });
      tickRef.current = setInterval(() => {
        setState((prev) =>
          prev.status === "polling"
            ? { ...prev, elapsedMs: Date.now() - startedAt }
            : prev,
        );
      }, 1000);

      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (ctrl.signal.aborted) return;
        const pr = await fetch(`/api/video/${data.id}`, { signal: ctrl.signal });
        const pd = (await pr.json().catch(() => ({}))) as {
          status?: string;
          content?: { video_url?: string };
          error?: { message?: string };
        };
        if (!pr.ok) return fail(pr.status, `Poll failed (${pr.status})`);

        if (pd.status === "succeeded") {
          cleanup();
          const videoUrl = pd.content?.video_url;
          if (!videoUrl) return fail(undefined, "Succeeded without a video URL.");
          const elapsedMs = Date.now() - startedAt;
          patchVideoVersion(sessionId, versionId, {
            status: "done",
            outputs: [{ url: videoUrl }],
            elapsedMs,
          });
          stageGeneratedVideo({
            taskId: data.id,
            videoUrl,
            prompt: compiled.prompt,
            model: session.model,
            ratio: "adaptive",
            duration: compiled.duration,
            resolution: session.resolution,
            seed: session.seed,
            mode: "video-edit:marks",
          });
          setState({ status: "success", videoUrl, elapsedMs });
          return;
        }
        if (pd.status === "failed" || pd.status === "cancelled") {
          return fail(
            undefined,
            pd.error?.message ?? `Task ${pd.status}.`,
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
  }, [sessionId, cleanup, ensureSourceVideo]);

  return { state, render, saveMarks, cancel, ensureSourceVideo };
}

/** Preview without submitting — drives the disclosure and the disabled state. */
export function previewMarksPrompt(session: VideoEditSession) {
  return compileMarksPrompt({ session, tokens: tokensFor(session) });
}

/**
 * The exact request body.
 *
 * Exported and used by BOTH the submit path and the curl disclosure, so the
 * two cannot disagree. A disclosure that rebuilt the body would be describing
 * a request that was never sent — which is worse than no disclosure, because
 * it is believed.
 */
export function buildMarksRequestBody(
  session: VideoEditSession,
  compiled: ReturnType<typeof previewMarksPrompt>,
): Record<string, unknown> {
  const videoRefs = compiled.references.filter((r) => r.kind === "video");
  const imageRefs = compiled.references.filter((r) => r.kind === "image");

  return {
    prompt: compiled.prompt,
    model: session.model,
    // See the note at the submit site: the video-editing task type requires
    // these exact values and rejects anything else.
    duration: EDIT_TASK_DURATION,
    ratio: EDIT_TASK_RATIO,
    resolution: session.resolution,
    audio: session.audioMode === "generate",
    ...(session.seed !== undefined ? { seed: session.seed } : {}),
    ...(videoRefs.length > 0
      ? {
          videos: videoRefs.map((r) => ({
            url: r.url,
            role: "reference_video" as const,
          })),
        }
      : {}),
    ...(imageRefs.length > 0
      ? {
          images: imageRefs.map((r) => ({
            url: r.url,
            role: "reference_image" as const,
          })),
        }
      : {}),
    ...(session.audioRefUrl
      ? { audios: [{ url: session.audioRefUrl, role: "reference_audio" }] }
      : {}),
  };
}
