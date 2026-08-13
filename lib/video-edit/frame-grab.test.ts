import { describe, expect, it, vi } from "vitest";
import {
  clampToClip,
  filmstripTimes,
  roundT,
  seekToFrame,
  supportsFrameCallback,
} from "./frame-grab";

/**
 * A minimal fake video element. Enough to exercise the seek contract without a
 * decoder: the point of these tests is WHICH timestamp comes back, not what the
 * pixels look like.
 */
/** Drive a listener the fake registered, standing in for dispatchEvent. */
function fire(el: HTMLVideoElement, type: string) {
  (el as unknown as { __fire: (t: string) => void }).__fire(type);
}

function fakeVideo(opts: {
  /** What the decoder actually lands on, vs. what was asked for. */
  landsAt?: (requested: number) => number;
  withRVFC: boolean;
  /** Model a stalled decoder: assigning currentTime settles nothing. */
  neverSettles?: boolean;
}) {
  const listeners: Record<string, Array<() => void>> = {};
  let current = 0;

  const el = {
    get currentTime() {
      return current;
    },
    set currentTime(t: number) {
      current = opts.landsAt ? opts.landsAt(t) : t;
      if (opts.neverSettles) return;
      // Decoders settle asynchronously.
      queueMicrotask(() => {
        (listeners.seeked ?? []).forEach((cb) => cb());
        if (opts.withRVFC && rvfcCb) {
          const cb = rvfcCb;
          rvfcCb = null;
          cb(0, { mediaTime: current });
        }
      });
    },
    addEventListener(type: string, cb: () => void) {
      (listeners[type] ??= []).push(cb);
    },
    removeEventListener(type: string, cb: () => void) {
      listeners[type] = (listeners[type] ?? []).filter((c) => c !== cb);
    },
    __fire(type: string) {
      (listeners[type] ?? []).slice().forEach((cb) => cb());
    },
  } as unknown as HTMLVideoElement;

  let rvfcCb: ((now: number, m: { mediaTime: number }) => void) | null = null;
  if (opts.withRVFC) {
    (el as unknown as Record<string, unknown>).requestVideoFrameCallback = (
      cb: (now: number, m: { mediaTime: number }) => void,
    ) => {
      rvfcCb = cb;
      return 1;
    };
    (el as unknown as Record<string, unknown>).cancelVideoFrameCallback = () => {
      rvfcCb = null;
    };
  }

  return el;
}

describe("seekToFrame", () => {
  it("reports the frame the decoder actually presented, not the time requested", async () => {
    // THE bug this whole module exists to prevent. Asking for 3.2s on a
    // sparsely-keyed clip lands on 3.166; storing 3.2 gives a ledger whose
    // timestamps disagree with its own pixels, and nothing downstream can tell.
    const video = fakeVideo({ withRVFC: true, landsAt: () => 3.166 });
    const out = await seekToFrame(video, 3.2);
    expect(out.t).toBe(3.166);
    expect(out.approximate).toBe(false);
  });

  it("falls back to currentTime and flags the result as approximate", async () => {
    const video = fakeVideo({ withRVFC: false, landsAt: () => 3.166 });
    const out = await seekToFrame(video, 3.2);
    expect(out.t).toBe(3.166);
    expect(out.approximate).toBe(true);
  });

  it("rejects with a readable message when the clip cannot be decoded", async () => {
    const video = fakeVideo({ withRVFC: false, neverSettles: true });
    const promise = seekToFrame(video, 1);
    fire(video, "error");
    await expect(promise).rejects.toThrow(/could not be decoded/i);
  });

  it("does not resolve twice when both seeked and rVFC fire", async () => {
    // Both paths are wired at once; whichever lands first wins and the other
    // must be a no-op. A double settle would resolve the promise with the
    // approximate timestamp after the accurate one had already been returned.
    const video = fakeVideo({ withRVFC: true, landsAt: () => 2.5 });
    const out = await seekToFrame(video, 2.5);
    expect(out.approximate).toBe(false);
    expect(out.t).toBe(2.5);
  });
});

describe("supportsFrameCallback", () => {
  it("detects the capability rather than assuming it", () => {
    expect(supportsFrameCallback(fakeVideo({ withRVFC: true }))).toBe(true);
    expect(supportsFrameCallback(fakeVideo({ withRVFC: false }))).toBe(false);
  });
});

describe("roundT", () => {
  it("pins timestamps to milliseconds so comparisons survive float dust", () => {
    expect(roundT(3.2000000000001)).toBe(3.2);
    expect(roundT(0.1 + 0.2)).toBe(0.3);
    expect(roundT(1 / 3)).toBe(0.333);
  });
});

describe("filmstripTimes", () => {
  it("samples midpoints, avoiding the black first and last frames", () => {
    expect(filmstripTimes(10, 5)).toEqual([1, 3, 5, 7, 9]);
  });

  it("never samples at or past the end", () => {
    const times = filmstripTimes(8, 12);
    expect(Math.max(...times)).toBeLessThan(8);
    expect(Math.min(...times)).toBeGreaterThan(0);
  });

  it("returns nothing for a degenerate clip rather than NaNs", () => {
    expect(filmstripTimes(0, 5)).toEqual([]);
    expect(filmstripTimes(10, 0)).toEqual([]);
    expect(filmstripTimes(Number.NaN, 5)).toEqual([]);
  });
});

describe("clampToClip", () => {
  it("backs off the very end, where most decoders present nothing", () => {
    expect(clampToClip(10, 10)).toBeLessThan(10);
    expect(clampToClip(99, 10)).toBeLessThan(10);
  });

  it("floors at zero and survives garbage", () => {
    expect(clampToClip(-5, 10)).toBe(0);
    expect(clampToClip(Number.NaN, 10)).toBe(0);
  });
});
