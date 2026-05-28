/**
 * Error classifier for Compare render failures.
 *
 * The hook layer (use-image-render, use-video-render) catches any error
 * from the server routes and passes it here. Classification is based on:
 *
 *   1. HTTP status from our server route (preferred when the route
 *      forwards the BytePlus status — see app/api/image/route.ts).
 *   2. Error message string-match (fallback, also catches content-policy
 *      signals that can arrive under any status).
 *
 * Returned `type` drives the error tile in ComparePanel:
 *   · "rate-limit"    → orange banner, "wait 30s" hint, auto-retry after delay
 *   · "moderation"    → red banner, "rewrite prompt" hint, Retry DISABLED
 *   · "timeout"       → yellow banner, Retry enabled
 *   · "task-expired"  → yellow banner, Retry enabled
 *   · "invalid-input" → red banner, Retry DISABLED
 *   · "server"        → orange banner, Retry enabled + auto-retry
 *   · "network"       → orange banner, Retry enabled
 *   · "unknown"       → default, Retry enabled
 *
 * `retryable: false` means "retrying with the SAME input will fail the
 * same way" (moderation, invalid-input). The user must change something.
 * All other classes are transient — retry makes sense.
 *
 * Pure function, no React, no window — safe to test under vitest/happy-dom.
 */

export type ErrorType =
  | "rate-limit"
  | "moderation"
  | "timeout"
  | "task-expired"
  | "invalid-input"
  | "server"
  | "network"
  | "unknown";

export type ErrorClass = {
  type: ErrorType;
  /** Short label shown above the detail. Ten words or fewer. */
  title: string;
  /** One-sentence explanation + suggested action. */
  detail: string;
  /** When false, UI hides the Retry chip — re-running the same input
   *  will reproduce the same error (moderation, invalid-input). */
  retryable: boolean;
  /** Suggested delay before an automatic retry attempt. Undefined means
   *  "don't auto-retry" — the user controls timing. */
  retryAfterMs?: number;
};

// ─────────────────────────── Pattern matchers ───────────────────────────

/** Content-policy signals. BytePlus surfaces several synonyms across its
 *  error taxonomy; catch the common ones case-insensitively. We check the
 *  message first (before status-based dispatch) because moderation can
 *  arrive as 400 / 403 / even 500 depending on how our route wraps it. */
const MODERATION_PATTERNS = [
  /content[\s-]?policy/i,
  /nsfw/i,
  /moderation/i,
  /safety/i,
  /invalidcontent/i,
  /prohibited/i,
  /sensitive/i,
  /forbidden content/i,
];

/** Polling ceiling or socket timeout. Both our own poll-timeout message
 *  and upstream timeouts should fall in this bucket. */
const TIMEOUT_PATTERNS = [
  /timed out/i,
  /timeout/i,
  /polling .*(~|approx)/i,
];

/** Expired task id — polling returned 404 or BytePlus told us the job is
 *  gone. Distinct from timeout because the fix is "start over" not "wait". */
const TASK_EXPIRED_PATTERNS = [
  /task expired/i,
  /task not found/i,
  /no such task/i,
];

/** Transient network failures that our fetch throws before we even get a
 *  status code back. TypeError from `fetch` is the usual culprit. */
const NETWORK_PATTERNS = [
  /network/i,
  /failed to fetch/i,
  /networkerror/i,
  /err_network/i,
];

/** Returns true if `message` contains any of `patterns`. */
function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(message));
}

// ─────────────────────────── Classifier ─────────────────────────────────

/**
 * @param status   HTTP status from the response. May be undefined when the
 *                 fetch itself threw (TypeError → no response). The server
 *                 route today still collapses most failures into 500; once
 *                 §18 updates the routes to pass through BytePlus status,
 *                 status-based dispatch becomes more reliable.
 * @param message  Error-body `error` field or Error.message. Never empty.
 */
export function classifyError(
  status: number | undefined,
  message: string,
): ErrorClass {
  // ── Message-based dispatch (status-agnostic) ────────────────────────
  // These classes are uniquely identifiable from the message alone, and
  // they can arrive under any HTTP status (or none, for client-thrown
  // poll timeouts). Handling them first means the status branches below
  // don't need to re-check them.

  // Moderation. BytePlus NSFW rejection may arrive as 400 / 403 / a
  // wrapped 500 depending on which path threw; the UX is the same (no-
  // retry, rewrite prompt) so classify by message.
  if (matchesAny(message, MODERATION_PATTERNS)) {
    return {
      type: "moderation",
      title: "Prompt flagged by content policy",
      detail:
        "BytePlus refused this prompt. Soften or rephrase the wording and try again.",
      retryable: false,
    };
  }

  // Timeout. Our hook throws "Polling timed out after ~10 min" client-
  // side (no response, no status) — but timeouts can also come from
  // upstream as wrapped 500s. Message-match catches both.
  if (matchesAny(message, TIMEOUT_PATTERNS)) {
    return {
      type: "timeout",
      title: "Render took too long",
      detail:
        "Exceeded the polling ceiling (~10 min). Retry will start a fresh task.",
      retryable: true,
      retryAfterMs: 1000,
    };
  }

  // Task expired — BytePlus garbage-collected the job id we were polling.
  // Retry means resubmit from scratch.
  if (matchesAny(message, TASK_EXPIRED_PATTERNS)) {
    return {
      type: "task-expired",
      title: "Task expired",
      detail: "BytePlus forgot this task. Hit Retry to resubmit from scratch.",
      retryable: true,
      retryAfterMs: 0,
    };
  }

  // Explicit network signal (TypeError strings from fetch failures).
  if (matchesAny(message, NETWORK_PATTERNS)) {
    return {
      type: "network",
      title: "Network hiccup",
      detail:
        "The request couldn't reach the server. Check your connection and retry.",
      retryable: true,
      retryAfterMs: 2000,
    };
  }

  // ── Status-based dispatch ───────────────────────────────────────────
  if (status === 429) {
    return {
      type: "rate-limit",
      title: "Rate-limited by BytePlus",
      detail:
        "Too many requests in a short window. Waiting ~30 seconds before retrying usually clears it.",
      retryable: true,
      retryAfterMs: 30_000,
    };
  }

  // 400 guard in our route + BytePlus 400 InvalidParameter both mean
  // "user changed something": blind retry with same input won't help.
  if (status === 400 || status === 422) {
    return {
      type: "invalid-input",
      title: "Request rejected",
      detail:
        "BytePlus rejected the parameters. Check prompt / size / duration and adjust.",
      retryable: false,
    };
  }

  if (status === 404) {
    // 404 without an explicit task-expired marker is still usually a
    // task-id miss during polling; the resubmit flow handles both.
    return {
      type: "task-expired",
      title: "Task not found",
      detail: "Server couldn't locate the task. Retry resubmits from scratch.",
      retryable: true,
      retryAfterMs: 0,
    };
  }

  if (status !== undefined && status >= 500 && status < 600) {
    return {
      type: "server",
      title: "Upstream hiccup",
      detail:
        "BytePlus or the render proxy coughed. Usually transient — one retry clears it.",
      retryable: true,
      retryAfterMs: 3000,
    };
  }

  // No status AND no matched message pattern → treat as network. Fetch
  // throwing a bare TypeError with an unhelpful message lands here.
  if (status === undefined) {
    return {
      type: "network",
      title: "Network hiccup",
      detail:
        "The request couldn't reach the server. Check your connection and retry.",
      retryable: true,
      retryAfterMs: 2000,
    };
  }

  // Fallback — unrecognised status, let the user retry and see.
  return {
    type: "unknown",
    title: "Render failed",
    detail: message.slice(0, 200),
    retryable: true,
  };
}
