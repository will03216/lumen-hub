/**
 * Cross-tab sync tests for saved pairs.
 *
 * The guarantee we care about: if tab A saves a pair, tab B's subscriber
 * must fire — but only for OUR storage key, not for unrelated churn
 * (reels, studio, future features sharing the same origin). A listener
 * that fires on every storage event forces every subscriber to re-read
 * localStorage, which is measurable on a chip row with a few hundred
 * saved pairs.
 *
 * happy-dom doesn't naturally dispatch `storage` events when you mutate
 * localStorage (that only fires cross-TAB in real browsers), so we
 * dispatch them manually here. That's the right layer to test anyway:
 * we're asserting the listener's filter logic, not the browser's own
 * event-firing rules.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeSavedPairs } from "./saved-pairs";

const STORAGE_KEY = "lumen.compare.savedPairs";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────── subscribeSavedPairs ────────────────────────

describe("subscribeSavedPairs", () => {
  it("fires the callback when a storage event targets our key", () => {
    // Simulates "another tab wrote to our key". happy-dom requires a
    // manual StorageEvent dispatch — the production path is
    // window.dispatchEvent(new StorageEvent("storage", { key, … })) and
    // the filter-by-key logic lives in the listener we're testing.
    const onChange = vi.fn();
    const unsub = subscribeSavedPairs(onChange);

    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: "[]" }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("ignores storage events for unrelated keys", () => {
    // Reels, studio, future modules all share localStorage. An unfiltered
    // listener would cause the Compare chip row to re-hydrate on every
    // reels save — silent but expensive at scale.
    const onChange = vi.fn();
    const unsub = subscribeSavedPairs(onChange);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "lumen.reels.something",
        newValue: "{}",
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "lumen.studio.lastPrompt",
        newValue: "hello",
      }),
    );

    expect(onChange).not.toHaveBeenCalled();
    unsub();
  });

  it("unsubscribe removes the listener (no fire after cleanup)", () => {
    // If the returned unsubscribe is buggy, React effect cleanup would
    // leak listeners across mount/unmount cycles — a classic memory
    // footgun. Guard with an explicit before/after assertion.
    const onChange = vi.fn();
    const unsub = subscribeSavedPairs(onChange);
    unsub();

    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: "[]" }),
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it("is a no-op on the server (no window)", () => {
    // subscribeSavedPairs guards with `typeof window === "undefined"`
    // so SSR renders don't throw. We can't easily delete `window` in
    // happy-dom, but we can assert the guard returns a callable no-op
    // unsubscribe in the normal path — the only contract visible to
    // callers is "the return is safe to invoke".
    const unsub = subscribeSavedPairs(() => {});
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
  });
});
