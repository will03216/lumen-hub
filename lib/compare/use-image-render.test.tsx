/**
 * Contract tests for `useImageRender` — the silent-auto-retry state
 * machine is the most foot-gun-prone piece of Compare's hook layer, and
 * these tests lock in the four cases that matter most:
 *
 *   1. 500 (short retry) → silent retry → success on 2nd try
 *   2. 429 (30s retry)   → does NOT silent-retry (exceeds 10s cap)
 *   3. moderation        → does NOT retry (retryable: false)
 *   4. success           → elapsedMs spans the full wait
 *
 * We mock `requestImage` — the hook's transport seam — rather than global
 * fetch. Since image generation went async (submit + poll), one logical
 * attempt is no longer one fetch; `requestImage` hides that and resolves with
 * a single `Response` per attempt, which is exactly the granularity these
 * retry contracts care about. (The submit/poll transport itself is covered by
 * request-image's own path.)
 *
 * Timers: vi.useFakeTimers() so the 3-second server-backoff gap doesn't
 * make tests slow or flaky. `runAllTimersAsync` drains the setTimeout +
 * the microtask that follows.
 */

import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { useImageRender } from "./use-image-render";
import { requestImage } from "./request-image";

vi.mock("./request-image", () => ({ requestImage: vi.fn() }));

// ─────────────────────────── Transport stub helpers ─────────────────────

/** Minimal Response shape the hook touches. We don't use `new Response()`
 *  because happy-dom's implementation doesn't allow re-reading body across
 *  ok/!ok branches cleanly. A plain object with `ok`, `status`, and
 *  `json()` is exactly what the hook consumes. */
function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Script a sequence of requestImage outcomes. Each call peels the next entry
 *  off the queue — lets us express "first attempt fails 500, second succeeds"
 *  without a ton of mock boilerplate per test. */
function scriptRequestImage(
  spy: MockInstance,
  script: Array<{ status: number; body: unknown } | { throws: unknown }>,
) {
  let i = 0;
  spy.mockImplementation(async () => {
    const step = script[i++];
    if (!step) throw new Error(`requestImage called ${i}× but script has no more steps`);
    if ("throws" in step) throw step.throws;
    return mockResponse(step.status, step.body);
  });
}

// ─────────────────────────── Setup / teardown ───────────────────────────

let requestImageSpy: MockInstance;

beforeEach(() => {
  vi.useFakeTimers();
  requestImageSpy = requestImage as unknown as MockInstance;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ─────────────────────────── Contracts ──────────────────────────────────

describe("useImageRender — auto-retry contracts", () => {
  it("silently retries on 500 (short backoff) and surfaces success", async () => {
    // First attempt 500 → classifier returns {server, retryAfterMs: 3000}.
    // 3s ≤ 10s cap → auto-retry fires. Second attempt succeeds.
    scriptRequestImage(requestImageSpy, [
      { status: 500, body: { error: "upstream hiccup" } },
      {
        status: 200,
        body: { data: [{ url: "https://cdn/img.png", size: "1024x1024" }] },
      },
    ]);

    const { result } = renderHook(() => useImageRender());

    await act(async () => {
      result.current.run({
        prompt: "a cat",
        model: "seedream-5-0-lite-260128",
        size: "1024x1024",
      });
    });

    // After the first failure the hook should still read "loading" (the
    // whole point of silent retry is not flashing an error state).
    expect(result.current.state.status).toBe("loading");

    // Advance past the 3s classifier-suggested backoff + let the second
    // fetch + its microtasks settle. One runAll drains both.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(requestImageSpy).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe("success");
    if (result.current.state.status === "success") {
      expect(result.current.state.images[0]?.url).toBe("https://cdn/img.png");
    }
  });

  it("does NOT silently retry on 429 — 30s backoff exceeds the 10s cap", async () => {
    // Even though 429 is "retryable", the classifier's suggested delay
    // (30s) exceeds AUTO_RETRY_MAX_DELAY_MS (10s) and we'd rather show
    // a "waiting" state than freeze a spinner for 30 seconds.
    scriptRequestImage(requestImageSpy, [
      { status: 429, body: { error: "slow down" } },
    ]);

    const { result } = renderHook(() => useImageRender());

    await act(async () => {
      result.current.run({
        prompt: "busy cat",
        model: "seedream-5-0-lite-260128",
        size: "1024x1024",
      });
    });

    // Drain any microtasks; don't advance timers — but even if we did,
    // the hook shouldn't have queued a setTimeout for the retry.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(requestImageSpy).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe("error");
    if (result.current.state.status === "error") {
      expect(result.current.state.errorClass.type).toBe("rate-limit");
      expect(result.current.state.errorClass.retryable).toBe(true);
      expect(result.current.state.attempts).toBe(1);
    }
  });

  it("does NOT retry a moderation rejection, and flags it non-retryable", async () => {
    // Wrapping the NSFW body in a 500 mirrors how our route used to
    // collapse BytePlus failures — moderation must still win via the
    // message-match branch, not fall into the server-retry bucket.
    scriptRequestImage(requestImageSpy, [
      { status: 500, body: { error: "content policy violation" } },
    ]);

    const { result } = renderHook(() => useImageRender());

    await act(async () => {
      result.current.run({
        prompt: "bad prompt",
        model: "seedream-5-0-lite-260128",
        size: "1024x1024",
      });
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(requestImageSpy).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe("error");
    if (result.current.state.status === "error") {
      expect(result.current.state.errorClass.type).toBe("moderation");
      // UI gate — Retry chip must be suppressed. If this flips to true,
      // users will blast the same flagged prompt and burn quota.
      expect(result.current.state.errorClass.retryable).toBe(false);
    }
  });

  it("auto-retry preserves startedAt so elapsedMs spans both attempts", async () => {
    // Freeze wall-clock so we can compute deterministic elapsedMs:
    // startedAt = T0; retry delay = 3s; response = instant; final
    // elapsedMs should read ≥ 3000 — proving the second attempt didn't
    // reset the stopwatch.
    const T0 = 1_700_000_000_000;
    vi.setSystemTime(T0);
    scriptRequestImage(requestImageSpy, [
      { status: 500, body: { error: "upstream hiccup" } },
      {
        status: 200,
        body: { data: [{ url: "https://cdn/img.png", size: "1024x1024" }] },
      },
    ]);

    const { result } = renderHook(() => useImageRender());
    await act(async () => {
      result.current.run({
        prompt: "cat",
        model: "seedream-5-0-lite-260128",
        size: "1024x1024",
      });
    });

    // Advance exactly 3s (the server-class retryAfterMs). Then let all
    // pending promises settle so the success setState resolves.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.state.status).toBe("success");
    if (result.current.state.status === "success") {
      expect(result.current.state.elapsedMs).toBeGreaterThanOrEqual(3000);
    }
  });
});
