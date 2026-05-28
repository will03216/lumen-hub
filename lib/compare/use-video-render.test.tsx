/**
 * Contract tests for `useVideoRender` — same auto-retry discipline as
 * the image hook, but extended across a submit → poll flow. The bugs
 * this suite is designed to catch:
 *
 *   · A moderation rejection surfaced via `pdata.error.message` during
 *     polling (status="failed") must classify as moderation — not
 *     server — and NOT auto-retry.
 *   · A poll-side 404 means "task expired" and should classify
 *     accordingly; the user's fix is "resubmit" not "wait".
 *   · A clean success hits state.status === "success" with a videoUrl.
 *
 * Timing: the hook polls every 3s (`POLL_INTERVAL_MS`). `advanceTimersByTimeAsync`
 * drives the loop — we advance 3000ms per virtual poll iteration.
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
import { useVideoRender } from "./use-video-render";

// ─────────────────────────── Fetch stub helpers ─────────────────────────

function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** URL-aware fetch stub. The video hook hits two different endpoints
 *  (`POST /api/video` to submit, `GET /api/video/:id` to poll), so
 *  matching on URL is cleaner than a positional queue. */
function stubFetch(
  spy: MockInstance,
  handler: (url: string) => { status: number; body: unknown } | { throws: unknown },
) {
  spy.mockImplementation(async (input: unknown) => {
    const url = typeof input === "string" ? input : String(input);
    const out = handler(url);
    if ("throws" in out) throw out.throws;
    return mockResponse(out.status, out.body);
  });
}

// ─────────────────────────── Setup / teardown ───────────────────────────

let fetchSpy: MockInstance;

beforeEach(() => {
  vi.useFakeTimers();
  fetchSpy = vi.spyOn(globalThis, "fetch") as unknown as MockInstance;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ─────────────────────────── Contracts ──────────────────────────────────

describe("useVideoRender — submit + poll", () => {
  it("submits, polls until succeeded, and surfaces the videoUrl", async () => {
    // Two poll ticks return "queued" then "succeeded" — enough to prove
    // the poll loop actually loops (a bug where we exited on first poll
    // would still pass with a one-step script).
    let pollCount = 0;
    stubFetch(fetchSpy, (url) => {
      if (url === "/api/video") {
        return { status: 200, body: { id: "task-xyz" } };
      }
      if (url.startsWith("/api/video/")) {
        pollCount++;
        if (pollCount < 2) {
          return { status: 200, body: { status: "queued" } };
        }
        return {
          status: 200,
          body: {
            status: "succeeded",
            content: { video_url: "https://cdn/vid.mp4" },
          },
        };
      }
      return { status: 404, body: { error: "unknown" } };
    });

    const { result } = renderHook(() => useVideoRender());
    await act(async () => {
      result.current.run({
        prompt: "a cat running",
        model: "dreamina-seedance-2-0-260128",
        mode: "t2v",
        resolution: "720p",
        duration: 5,
        ratio: "16:9",
      });
    });

    // Drain the submit + enter polling. One micro-flush picks up the
    // submit promise + setState to "polling".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.state.status).toBe("polling");

    // Advance 2× POLL_INTERVAL_MS (3s each) — first tick returns
    // queued, second returns succeeded.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // One extra flush to settle the success setState.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.state.status).toBe("success");
    if (result.current.state.status === "success") {
      expect(result.current.state.videoUrl).toBe("https://cdn/vid.mp4");
      expect(result.current.state.taskId).toBe("task-xyz");
    }
  });

  it("routes a polling-side moderation rejection to 'moderation' (no retry)", async () => {
    // BytePlus surfaces NSFW moderation during polling as
    // `{ status: "failed", error: { message: "…content policy…" } }`.
    // The hook must pass pdata.error.message through to classifyError,
    // which then matches the moderation pattern and returns retryable=false.
    stubFetch(fetchSpy, (url) => {
      if (url === "/api/video") {
        return { status: 200, body: { id: "task-nsfw" } };
      }
      return {
        status: 200,
        body: {
          status: "failed",
          error: { message: "content policy violation detected" },
        },
      };
    });

    const { result } = renderHook(() => useVideoRender());
    await act(async () => {
      result.current.run({
        prompt: "bad",
        model: "dreamina-seedance-2-0-260128",
        mode: "t2v",
        resolution: "720p",
        duration: 5,
        ratio: "16:9",
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.state.status).toBe("error");
    if (result.current.state.status === "error") {
      expect(result.current.state.errorClass.type).toBe("moderation");
      expect(result.current.state.errorClass.retryable).toBe(false);
    }
  });

  it("routes a poll 404 to 'task-expired'", async () => {
    // Task id unknown to BytePlus — common when a node reboot drops the
    // task cache. Classifier picks "task-expired" (retryable with a
    // resubmit), which the UI translates to a fresh run.
    stubFetch(fetchSpy, (url) => {
      if (url === "/api/video") {
        return { status: 200, body: { id: "task-expired" } };
      }
      return { status: 404, body: { error: "task not found" } };
    });

    const { result } = renderHook(() => useVideoRender());
    await act(async () => {
      result.current.run({
        prompt: "anything",
        model: "dreamina-seedance-2-0-260128",
        mode: "t2v",
        resolution: "720p",
        duration: 5,
        ratio: "16:9",
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.state.status).toBe("error");
    if (result.current.state.status === "error") {
      // Either "task-expired" classification path works (the message
      // branch OR the 404 status branch) — the point is it's not
      // "server" and the UX is correct.
      expect(result.current.state.errorClass.type).toBe("task-expired");
      expect(result.current.state.errorClass.retryable).toBe(true);
    }
  });
});
