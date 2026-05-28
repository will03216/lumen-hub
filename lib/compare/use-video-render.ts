"use client";

/**
 * useVideoRender — headless Seedance render hook for Compare.
 *
 * Flow:
 *   1. POST /api/video → task id
 *   2. Poll GET /api/video/{id} every 3 s until status ∈ {succeeded, failed,
 *      cancelled} or the try limit trips.
 *
 * AbortController semantics: each `run()` call cancels the prior in-flight
 * submission AND the prior polling loop. A panel that fires on every
 * `renderTick` bump is safe from races — only the newest task survives.
 *
 * Error handling parallels `useImageRender`: catches route through
 * `classifyError`, short-delay transient failures are auto-retried ONCE
 * before surfacing. Any failure phase (submit / poll / timeout) restarts
 * the whole flow — BytePlus doesn't let us resume a failed task, and
 * resubmitting is cheap for silent-retry purposes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoMode, VideoRatio, VideoResolution } from "@/lib/studio/models";
import { classifyError, type ErrorClass } from "./error-class";

export type VideoRenderParams = {
  prompt: string;
  model: string;
  mode: VideoMode; // t2v | i2v (Phase 2)
  resolution: VideoResolution;
  duration: number;
  ratio: VideoRatio;
  seed?: number;
  camerafixed?: boolean;
  audio?: boolean;
  /** i2v only — data URI or URL of the starting frame. */
  startFrame?: string;
};

export type VideoRenderState =
  | { status: "idle" }
  | { status: "submitting"; startedAt: number }
  | {
      status: "polling";
      startedAt: number;
      taskId: string;
      elapsedMs: number;
    }
  | {
      status: "success";
      videoUrl: string;
      elapsedMs: number;
      ratio: string;
      taskId: string;
    }
  | {
      status: "error";
      message: string;
      errorClass: ErrorClass;
      elapsedMs: number;
      /** 1 = first try, 2 = after one auto-retry. */
      attempts: number;
    };

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200; // ~10 min ceiling — matches Studio polling
/** Silent auto-retry ceiling + short-delay cap; mirrors use-image-render. */
const MAX_AUTO_RETRIES = 1;
const AUTO_RETRY_MAX_DELAY_MS = 10_000;

export function useVideoRender() {
  const [state, setState] = useState<VideoRenderState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  // Ticks every second during polling so UI can redraw the elapsed clock
  // without the poll loop itself having to setState on every tick.
  const pollTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Auto-retry bookkeeping (see use-image-render.ts for rationale).
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  const cleanupTick = useCallback(() => {
    if (pollTickRef.current) {
      clearInterval(pollTickRef.current);
      pollTickRef.current = null;
    }
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const runInternal = useCallback(
    async (
      params: VideoRenderParams,
      opts: { isAutoRetry: boolean; startedAt: number },
    ) => {
      abortRef.current?.abort();
      cleanupTick();
      clearRetryTimer();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // startedAt spans the full user-perceived wait across any auto-
      // retry gap so "12.4s" matches the user's stopwatch, not the hook's
      // internal retry choreography.
      setState({ status: "submitting", startedAt: opts.startedAt });

      const body: Record<string, unknown> = {
        prompt: params.prompt,
        model: params.model,
        resolution: params.resolution,
        duration: params.duration,
        ratio: params.ratio,
        seed: params.seed,
        camerafixed: params.camerafixed,
        audio: params.audio,
      };
      if (params.mode === "i2v" && params.startFrame) {
        body.images = [{ url: params.startFrame }];
      }

      /** Closure over params/opts; all failure paths funnel here so
       *  classification + auto-retry logic lives in one place. */
      const handleFailure = (
        status: number | undefined,
        message: string,
      ) => {
        cleanupTick();
        const errorClass = classifyError(status, message);
        const canAutoRetry =
          errorClass.retryable &&
          errorClass.retryAfterMs !== undefined &&
          errorClass.retryAfterMs <= AUTO_RETRY_MAX_DELAY_MS &&
          attemptRef.current < MAX_AUTO_RETRIES;

        if (canAutoRetry) {
          attemptRef.current += 1;
          retryTimerRef.current = setTimeout(
            () => {
              void runInternal(params, {
                isAutoRetry: true,
                startedAt: opts.startedAt,
              });
            },
            errorClass.retryAfterMs ?? 2000,
          );
          // Leave state as-is (submitting/polling) during the gap so the
          // UI shows a continuous "working" state; the next attempt will
          // re-setState to submitting at the top of runInternal.
          return;
        }

        setState({
          status: "error",
          message,
          errorClass,
          elapsedMs: Date.now() - opts.startedAt,
          attempts: attemptRef.current + 1,
        });
      };

      let submitStatus: number | undefined;
      try {
        // ── submit ───────────────────────────────────────────────────────
        const res = await fetch("/api/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        submitStatus = res.status;
        const data = await res.json();
        if (!res.ok) {
          return handleFailure(
            res.status,
            data.error ?? `Submit failed (${res.status})`,
          );
        }
        const taskId = data.id as string;
        if (!taskId) {
          return handleFailure(undefined, "Missing task id from /api/video");
        }

        // Enter polling state; start a 1s tick just for elapsed display.
        setState({
          status: "polling",
          startedAt: opts.startedAt,
          taskId,
          elapsedMs: Date.now() - opts.startedAt,
        });
        pollTickRef.current = setInterval(() => {
          setState((prev) =>
            prev.status === "polling"
              ? { ...prev, elapsedMs: Date.now() - prev.startedAt }
              : prev,
          );
        }, 1000);

        // ── poll ─────────────────────────────────────────────────────────
        for (let tries = 0; tries < POLL_MAX_TRIES; tries++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          if (ctrl.signal.aborted) return;

          const pr = await fetch(`/api/video/${taskId}`, {
            signal: ctrl.signal,
          });
          const pdata = await pr.json();
          if (!pr.ok) {
            return handleFailure(
              pr.status,
              pdata.error ?? `Poll failed (${pr.status})`,
            );
          }
          const status = pdata.status as string | undefined;
          if (status === "succeeded") {
            cleanupTick();
            const videoUrl = pdata.content?.video_url as string | undefined;
            if (!videoUrl) {
              return handleFailure(undefined, "Succeeded without video_url");
            }
            setState({
              status: "success",
              videoUrl,
              elapsedMs: Date.now() - opts.startedAt,
              ratio: String(params.ratio),
              taskId,
            });
            attemptRef.current = 0;
            return;
          }
          if (status === "failed" || status === "cancelled") {
            // BytePlus surfaces moderation rejections in pdata.error here —
            // passing the message through lets classifyError pick it up.
            return handleFailure(
              undefined,
              pdata.error?.message ??
                (status === "cancelled" ? "Task cancelled" : "Task failed"),
            );
          }
          // still queued/running — loop
        }
        return handleFailure(undefined, "Polling timed out after ~10 min");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          cleanupTick();
          return;
        }
        const message = e instanceof Error ? e.message : String(e);
        // `submitStatus` is set if the fetch completed; undefined if fetch
        // itself threw (network error) — classifier handles both paths.
        handleFailure(submitStatus, message);
      }
    },
    [cleanupTick, clearRetryTimer],
  );

  const run = useCallback(
    (params: VideoRenderParams) => {
      attemptRef.current = 0;
      return runInternal(params, {
        isAutoRetry: false,
        startedAt: Date.now(),
      });
    },
    [runInternal],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    cleanupTick();
    clearRetryTimer();
    attemptRef.current = 0;
    setState({ status: "idle" });
  }, [cleanupTick, clearRetryTimer]);

  // Belt-and-suspenders: if the consumer unmounts mid-poll, drop the timers.
  useEffect(
    () => () => {
      cleanupTick();
      clearRetryTimer();
    },
    [cleanupTick, clearRetryTimer],
  );

  return { state, run, reset };
}
