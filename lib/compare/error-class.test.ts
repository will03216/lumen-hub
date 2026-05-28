/**
 * Unit tests for classifyError — the switchboard that decides what kind
 * of error UI Compare shows and whether auto-retry fires.
 *
 * The classifier sees two inputs (status, message) and emits a labelled
 * category. Most of the value in these tests is guarding the ORDERING:
 * a moderation rejection wrapped in a 500 must land in "moderation",
 * not "server" — otherwise auto-retry would loop forever sending the
 * same flagged prompt.
 */

import { describe, expect, it } from "vitest";
import { classifyError } from "./error-class";

// ────────────────────────── Message-based precedence ────────────────────

describe("classifyError — message-based (status-agnostic)", () => {
  it("classifies content-policy strings as moderation regardless of status", () => {
    // Server route may wrap a BytePlus 400 SafetyViolation in its own 500.
    // Moderation must still win — retrying a flagged prompt will fail the
    // same way and auto-retry would waste quota.
    const cases: Array<[number | undefined, string]> = [
      [500, "BytePlus 400 Bad Request: content policy violation"],
      [403, "NSFW content detected"],
      [400, "moderation failure"],
      [undefined, "prompt contains prohibited terms"],
      [500, "SafetyViolation: sensitive content"],
    ];
    for (const [status, msg] of cases) {
      const cls = classifyError(status, msg);
      expect(cls.type).toBe("moderation");
      expect(cls.retryable).toBe(false);
    }
  });

  it("classifies poll-timeout as timeout even with no status", () => {
    // Hook throws `new Error("Polling timed out after ~10 min")` client-
    // side so status is undefined. Without the message-first branch this
    // would fall into "network", hiding the real cause.
    const cls = classifyError(undefined, "Polling timed out after ~10 min");
    expect(cls.type).toBe("timeout");
    expect(cls.retryable).toBe(true);
    expect(cls.retryAfterMs).toBeGreaterThan(0);
  });

  it("classifies task-expired keywords", () => {
    const cls = classifyError(undefined, "Task expired on upstream");
    expect(cls.type).toBe("task-expired");
    expect(cls.retryable).toBe(true);
  });

  it("classifies explicit network errors", () => {
    const cls = classifyError(undefined, "Failed to fetch");
    expect(cls.type).toBe("network");
    expect(cls.retryable).toBe(true);
  });
});

// ────────────────────────── Status-based dispatch ───────────────────────

describe("classifyError — status-based", () => {
  it("429 → rate-limit with a long retry delay", () => {
    const cls = classifyError(429, "Too many requests");
    expect(cls.type).toBe("rate-limit");
    expect(cls.retryable).toBe(true);
    // ~30 s is the standard BytePlus cooldown. Cheaper backoffs just
    // bounce off the same limiter.
    expect(cls.retryAfterMs).toBeGreaterThanOrEqual(10_000);
  });

  it("400 → invalid-input, retryable=false", () => {
    const cls = classifyError(400, "prompt is required");
    expect(cls.type).toBe("invalid-input");
    expect(cls.retryable).toBe(false);
  });

  it("422 → invalid-input (unprocessable entity)", () => {
    const cls = classifyError(422, "Bad params");
    expect(cls.type).toBe("invalid-input");
    expect(cls.retryable).toBe(false);
  });

  it("404 → task-expired", () => {
    const cls = classifyError(404, "Not found");
    expect(cls.type).toBe("task-expired");
    expect(cls.retryable).toBe(true);
  });

  it("500 / 502 / 503 → server, retryable", () => {
    for (const s of [500, 502, 503, 504]) {
      const cls = classifyError(s, "Internal error");
      expect(cls.type).toBe("server");
      expect(cls.retryable).toBe(true);
    }
  });
});

// ────────────────────────── Fallback / no-status ────────────────────────

describe("classifyError — fallback", () => {
  it("undefined status + unrecognised message → network (catch-all for fetch failures)", () => {
    const cls = classifyError(undefined, "Something weird");
    expect(cls.type).toBe("network");
    expect(cls.retryable).toBe(true);
  });

  it("unknown status + unrecognised message → unknown, retryable", () => {
    const cls = classifyError(418, "I am a teapot");
    expect(cls.type).toBe("unknown");
    expect(cls.retryable).toBe(true);
  });

  it("detail is truncated so a 10 KB BytePlus dump can't blow up the UI", () => {
    const huge = "x".repeat(5_000);
    const cls = classifyError(418, huge);
    expect(cls.detail.length).toBeLessThanOrEqual(200);
  });
});
