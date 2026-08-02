/**
 * Tiny structured-log helper for the App Router routes.
 *
 * Vercel's log aggregator picks up stdout/stderr and will parse a JSON
 * line into a searchable record. Emitting the shape below means we can
 * filter on `event:"byteplus_error"` + `status:429` in production to
 * answer "are we getting rate-limited?" without plumbing in an APM.
 *
 * Privacy stance: we log METADATA only — status, BytePlus error code,
 * route name, rough latency, prompt LENGTH. Never the prompt itself,
 * never user-uploaded images, never the API key. Logs survive longer
 * than the user's session, and a prompt is often PII-adjacent ("draft
 * email to …").
 */

import { BytePlusError } from "./byteplus";
import { FalError } from "./fal";
import { MinimaxError } from "./minimax";

/** Routes that can emit upstream errors — one token per log site so the
 *  Vercel filter can target "all image route errors" without grepping. */
export type RouteTag =
  | "image"
  | "video.create"
  | "video.poll"
  | "video.analyze-style"
  | "video.enhance-prompt"
  | "audio"
  | "audio.upload"
  | "caption"
  | "story.generate-prompts"
  | "story.generate-shots"
  | "compose-prompt"
  | "video.stitch"
  | "video.enhance"
  | "video.enhance.poll"
  | "article-to-prompt"
  | "optimize-prompt"
  | "user-keys.lookup"
  | "story.breakdown"
  | "story.upload-reference";

/** One-line structured emit. JSON per line so `vercel logs | jq` works,
 *  but we fall back to `console.error` with a space-separated fallback
 *  for local `next dev` readability when stdout is a TTY. */
function emit(record: Record<string, unknown>) {
  // stringify the whole record as one line so Vercel captures it atomically.
  // Pre-pending "[log] " makes grep-in-terminal nicer during local dev.
  // Using `console.error` routes it to stderr, which Vercel categorizes as
  // "error severity" — exactly what we want for failures.
  try {
    console.error("[log]", JSON.stringify(record));
  } catch {
    // Circular refs or BigInt etc. shouldn't happen here, but if they
    // do, fall back to a flat format so we don't lose the signal.
    console.error("[log]", record);
  }
}

/**
 * Log a BytePlus failure with enough structure to answer "how often and
 * why are renders failing?" from log search alone.
 *
 * @param route       Which app route surfaced the error.
 * @param err         The caught BytePlusError.
 * @param startedAt   `Date.now()` captured at the top of the handler —
 *                    gives upstream round-trip latency, useful for
 *                    distinguishing a fast 429 from a slow 504.
 * @param meta        Extra route-specific fields (e.g. prompt length,
 *                    model). Never pass raw prompts or images.
 */
export function logBytePlusError(
  route: RouteTag,
  err: BytePlusError,
  startedAt: number,
  meta: Record<string, unknown> = {},
) {
  emit({
    event: "byteplus_error",
    route,
    status: err.status,
    status_text: err.statusText,
    // BytePlus responses are JSON with a "code" field ("SafetyViolation",
    // "InvalidParameter", "RateLimitExceeded", …). Cheap regex beats a
    // full parse and handles the "plain text error" edge case gracefully.
    code: extractBytePlusCode(err.body),
    body_preview: err.body.slice(0, 200),
    latency_ms: Date.now() - startedAt,
    ...meta,
    ts: new Date().toISOString(),
  });
}

/**
 * fal.ai counterpart to logBytePlusError. Same metadata-only stance,
 * separate `event` so the Vercel filter can distinguish providers.
 * fal doesn't ship a structured `code` field — body_preview is the
 * best we have.
 */
export function logFalError(
  route: RouteTag,
  err: FalError,
  startedAt: number,
  meta: Record<string, unknown> = {},
) {
  emit({
    event: "fal_error",
    route,
    status: err.status,
    status_text: err.statusText,
    body_preview: err.body.slice(0, 200),
    latency_ms: Date.now() - startedAt,
    ...meta,
    ts: new Date().toISOString(),
  });
}

/**
 * Minimax counterpart to logBytePlusError / logFalError. Same metadata-
 * only stance, separate `event` so the Vercel filter can distinguish
 * providers. Minimax sometimes returns 200 + `base_resp.status_code != 0`
 * for logical failures — the adapter promotes those to MinimaxError with
 * an HTTP-ish status, so this helper sees them like any other upstream
 * fail.
 */
export function logMinimaxError(
  route: RouteTag,
  err: MinimaxError,
  startedAt: number,
  meta: Record<string, unknown> = {},
) {
  emit({
    event: "minimax_error",
    route,
    status: err.status,
    status_text: err.statusText,
    body_preview: err.body.slice(0, 200),
    latency_ms: Date.now() - startedAt,
    ...meta,
    ts: new Date().toISOString(),
  });
}

/**
 * Log a non-BytePlus exception from a route (fetch throw, JSON parse
 * bail, etc.). Separate shape so the Vercel filter can distinguish
 * "upstream said no" from "our code bailed".
 */
export function logRouteError(
  route: RouteTag,
  err: unknown,
  startedAt: number,
  meta: Record<string, unknown> = {},
) {
  const message = err instanceof Error ? err.message : String(err);
  emit({
    event: "route_error",
    route,
    // Never log a stack — can contain absolute paths and leak build info.
    // The message alone is enough to spot a repeating class of failure.
    message: message.slice(0, 400),
    latency_ms: Date.now() - startedAt,
    ...meta,
    ts: new Date().toISOString(),
  });
}

/** Pull a BytePlus `code` field out of a JSON error body. Defensive:
 *  some upstream errors (CDN timeouts, gateway bails) aren't JSON, so
 *  a failed match just returns null — log search can still lean on
 *  `status` + `body_preview`. */
function extractBytePlusCode(body: string): string | null {
  // Non-greedy, tolerates whitespace. Matches the first `"code": "…"`
  // pair — BytePlus error bodies only contain one. Regex beats JSON.parse
  // here because a malformed body would throw and we'd lose the log.
  const m = /"code"\s*:\s*"([^"]+)"/.exec(body);
  return m ? m[1] : null;
}
