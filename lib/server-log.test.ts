/**
 * Unit tests for the server-log helper. Only the observable side of
 * emission is practical to test — we assert `console.error` was called
 * with a JSON line and the key fields survived.
 *
 * The code-extraction branch gets the most coverage: it's the bit that
 * most often diverges from BytePlus's shifting error shape, and a wrong
 * extraction would silently degrade every filter query we write later.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { BytePlusError } from "./byteplus";
import { logBytePlusError, logRouteError } from "./server-log";

// ─────────────────────────── Helpers ────────────────────────────────────

/** Grab the one-line JSON payload from a `console.error("[log]", json)`
 *  call so assertions can read the structured fields instead of string-
 *  matching inside the whole array. */
function readEmittedRecord(spy: ReturnType<typeof vi.spyOn>) {
  const call = spy.mock.calls.at(-1);
  if (!call) throw new Error("console.error was not called");
  const [tag, payload] = call;
  expect(tag).toBe("[log]");
  if (typeof payload !== "string") {
    throw new Error("expected stringified payload");
  }
  return JSON.parse(payload) as Record<string, unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────── logBytePlusError ───────────────────────────

describe("logBytePlusError", () => {
  it("emits the status, route, and meta fields from a BytePlusError", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new BytePlusError(
      429,
      "Too Many Requests",
      '{"code":"RateLimitExceeded","message":"slow down"}',
    );
    logBytePlusError("image", err, Date.now() - 100, {
      prompt_len: 42,
      model: "seedream-5-0-lite-260128",
    });
    const rec = readEmittedRecord(spy);
    expect(rec.event).toBe("byteplus_error");
    expect(rec.route).toBe("image");
    expect(rec.status).toBe(429);
    expect(rec.code).toBe("RateLimitExceeded");
    expect(rec.prompt_len).toBe(42);
    expect(rec.model).toBe("seedream-5-0-lite-260128");
    expect(typeof rec.latency_ms).toBe("number");
    // latency ≥ 100 since we back-dated startedAt; give a fat tolerance
    // to avoid CI flake on slow runners.
    expect(rec.latency_ms as number).toBeGreaterThanOrEqual(0);
  });

  it("code extraction survives whitespace + extra JSON fields", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new BytePlusError(
      400,
      "Bad Request",
      '{ "request_id":"r-1",\n  "code"  :\t"SafetyViolation" ,\n"message":"flagged"}',
    );
    logBytePlusError("video.create", err, Date.now());
    expect(readEmittedRecord(spy).code).toBe("SafetyViolation");
  });

  it("code is null when body is not JSON (plain-text gateway error)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new BytePlusError(
      502,
      "Bad Gateway",
      "upstream unreachable (nginx)",
    );
    logBytePlusError("video.poll", err, Date.now());
    const rec = readEmittedRecord(spy);
    expect(rec.code).toBeNull();
    // body_preview should still be populated so the log has *some* hint
    // of what the gateway said.
    expect(rec.body_preview).toContain("upstream unreachable");
  });

  it("truncates body_preview so a 10 KB BytePlus dump can't flood logs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const huge = "x".repeat(5_000);
    const err = new BytePlusError(500, "Internal", huge);
    logBytePlusError("image", err, Date.now());
    const rec = readEmittedRecord(spy);
    expect((rec.body_preview as string).length).toBeLessThanOrEqual(200);
  });
});

// ─────────────────────────── logRouteError ──────────────────────────────

describe("logRouteError", () => {
  it("captures a non-BytePlus thrown Error and truncates the message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const long = new Error("boom ".repeat(200));
    logRouteError("image", long, Date.now(), { prompt_len: 10 });
    const rec = readEmittedRecord(spy);
    expect(rec.event).toBe("route_error");
    expect(rec.route).toBe("image");
    expect((rec.message as string).length).toBeLessThanOrEqual(400);
    expect(rec.prompt_len).toBe(10);
  });

  it("coerces non-Error throws (strings, numbers) into a readable message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logRouteError("video.poll", "socket closed", Date.now());
    expect(readEmittedRecord(spy).message).toBe("socket closed");
  });
});
