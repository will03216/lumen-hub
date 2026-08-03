"use client";

/**
 * useImageRender — headless hook wrapping POST /api/image.
 *
 * Extracted from components/image-generator.tsx so both Studio and Compare
 * can share the render loop without duplicating the error/state plumbing.
 *
 * Error handling: catches are routed through `classifyError` so the
 * consumer gets a typed category (rate-limit / moderation / server / …)
 * instead of a raw string. Short-delay transient failures (network,
 * server) are auto-retried ONCE with the classifier-suggested backoff
 * before surfacing as a user-visible error — most "wiggle through once"
 * noise (cold-start 503, flaky Wi-Fi) clears without the user even
 * seeing an error tile.
 */

import { useCallback, useRef, useState } from "react";
import { classifyError, type ErrorClass } from "./error-class";
import { requestImage } from "./request-image";

export type RenderedImage = { url: string; size?: string };

export type ImageRenderParams = {
  prompt: string;
  model: string;
  size: string;
  seed?: number;
  /** URL or base64 data URI — string for single-ref I2I, array for multi-ref. */
  image?: string | string[];
  /** Turn on Seedream sequential_image_generation. */
  sequential?: boolean;
  /** Frames to generate when sequential is on (1–15; caller enforces cap). */
  max_images?: number;
};

export type ImageRenderState =
  | { status: "idle" }
  | { status: "loading"; startedAt: number }
  | { status: "success"; images: RenderedImage[]; elapsedMs: number }
  | {
      status: "error";
      message: string;
      errorClass: ErrorClass;
      elapsedMs: number;
      /** 1 = first try, 2 = after one auto-retry. Exposed so the UI can
       *  label "Retried once and still failed" when helpful. */
      attempts: number;
    };

/** Auto-retry ceiling. One free attempt, total of two tries; anything
 *  past that and we let the user decide. Keeping it at 1 keeps us from
 *  hammering a broken upstream during an outage. */
const MAX_AUTO_RETRIES = 1;
/** Cap on classifier-suggested backoff for silent auto-retry. 30s for
 *  rate-limit is too long to absorb silently — better to surface the
 *  "waiting to retry" state. 10s is long enough to ride out typical
 *  transient server wobbles. */
const AUTO_RETRY_MAX_DELAY_MS = 10_000;

export function useImageRender() {
  const [state, setState] = useState<ImageRenderState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const runInternal = useCallback(
    async (
      params: ImageRenderParams,
      opts: { isAutoRetry: boolean; startedAt: number },
    ) => {
      // Each new attempt cancels the prior in-flight request. Belt-and-
      // suspenders: also clear any pending auto-retry timer.
      abortRef.current?.abort();
      clearRetryTimer();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // `startedAt` is threaded through so elapsedMs spans the full
      // user-perceived wait (first attempt + retry gap + retry), not
      // just the second attempt. Counting from scratch would lie.
      setState({ status: "loading", startedAt: opts.startedAt });

      let responseStatus: number | undefined;
      try {
        const res = await requestImage(params, ctrl.signal);
        responseStatus = res.status;
        const data = await res.json();
        if (!res.ok) {
          const message = data.error ?? `Request failed (${res.status})`;
          return handleFailure(res.status, message);
        }
        const images: RenderedImage[] = (data.data ?? [])
          .filter((d: { url?: string }) => d.url)
          .map((d: { url: string; size?: string }) => ({
            url: d.url,
            size: d.size,
          }));
        setState({
          status: "success",
          images,
          elapsedMs: Date.now() - opts.startedAt,
        });
        attemptRef.current = 0;
      } catch (e) {
        // AbortError is the "user clicked again" case — swallow it.
        if (e instanceof DOMException && e.name === "AbortError") return;
        const message = e instanceof Error ? e.message : String(e);
        handleFailure(responseStatus, message);
      }

      /** Decide: auto-retry silently, or surface as a user-visible error?
       *  Closure over `params` + `opts` so both branches have the context
       *  they need without rethreading through arguments. */
      function handleFailure(status: number | undefined, message: string) {
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
          // State stays "loading" during the gap — user sees a longer
          // spinner, not an error flash that self-heals a second later.
          return;
        }

        setState({
          status: "error",
          message,
          errorClass,
          elapsedMs: Date.now() - opts.startedAt,
          attempts: attemptRef.current + 1,
        });
      }
    },
    [clearRetryTimer],
  );

  const run = useCallback(
    (params: ImageRenderParams) => {
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
    clearRetryTimer();
    attemptRef.current = 0;
    setState({ status: "idle" });
  }, [clearRetryTimer]);

  return { state, run, reset };
}
