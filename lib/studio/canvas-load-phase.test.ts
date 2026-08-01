/**
 * The rule that keeps a Studio canvas from 404-ing on a project that exists.
 *
 * Background: the canvas chunk is lazy (`ssr: false`) and can render before
 * Clerk resolves. Until it does, localStorage keys are NOT user-scoped
 * (lib/storage-user.ts), so `getProject()` reads the wrong bucket and finds
 * nothing. The canvas used to treat that miss as 404 in a one-shot `useState`
 * initializer with no subscription, so when hydrateFromCloud() delivered the
 * project moments later nothing re-read and the 404 stuck.
 *
 * A store miss is only meaningful once hydration has settled. These tests pin
 * that decision rule and the ordering that produces it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { setStorageUser, userKey } from "@/lib/storage-user";

type Phase = "loading" | "missing" | "ready";

/** Mirrors the phase decision in app/studio/studio-canvas.tsx. */
function decidePhase(found: boolean, cloudHydrated: boolean): Phase {
  if (found) return "ready";
  return cloudHydrated ? "missing" : "loading";
}

describe("canvas load phase", () => {
  it("is ready whenever the project is in the store", () => {
    expect(decidePhase(true, false)).toBe("ready");
    expect(decidePhase(true, true)).toBe("ready");
  });

  it("waits instead of 404-ing when hydration has not settled", () => {
    // The regression: this used to be "missing" and stick forever.
    expect(decidePhase(false, false)).toBe("loading");
  });

  it("commits to 404 only once hydration has settled", () => {
    expect(decidePhase(false, true)).toBe("missing");
  });

  it("never reports missing before hydration, for any store state", () => {
    for (const found of [true, false]) {
      expect(decidePhase(found, false)).not.toBe("missing");
    }
  });
});

describe("storage key scoping race", () => {
  beforeEach(() => setStorageUser(null));

  it("reads a different key before and after the user resolves", () => {
    const base = "lumen.studio.projects.v2";
    const beforeClerk = userKey(base);
    setStorageUser("user_3EiQ8dHJFlOFqp3OLSB3REeexw4");
    const afterClerk = userKey(base);

    // Two different buckets — which is exactly why an early read misses.
    expect(beforeClerk).toBe(base);
    expect(afterClerk).toBe(`u_user_3EiQ8dHJFlOFqp3OLSB3REeexw4:${base}`);
    expect(beforeClerk).not.toBe(afterClerk);
  });

  it("a project written under the scoped key is invisible unscoped", () => {
    const base = "lumen.studio.projects.v2";
    setStorageUser("user_abc");
    localStorage.setItem(userKey(base), JSON.stringify({ projects: { p1: {} } }));

    setStorageUser(null); // the pre-Clerk window
    expect(localStorage.getItem(userKey(base))).toBeNull();

    setStorageUser("user_abc");
    expect(localStorage.getItem(userKey(base))).not.toBeNull();
  });
});

describe("hydration settles exactly once and always notifies", () => {
  beforeEach(() => vi.resetModules());

  it("markCloudHydrated flips the flag and wakes subscribers", async () => {
    const m = await import("@/lib/studio/projects");
    const listener = vi.fn();
    const unsubscribe = m.subscribeProjects(listener);

    expect(m.isCloudHydrated()).toBe(false);
    m.markCloudHydrated();

    expect(m.isCloudHydrated()).toBe(true);
    // Without this wake-up a waiting canvas would never re-check.
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("is idempotent — a second call does not re-notify", async () => {
    const m = await import("@/lib/studio/projects");
    m.markCloudHydrated();
    const listener = vi.fn();
    const unsubscribe = m.subscribeProjects(listener);

    m.markCloudHydrated();

    expect(listener).not.toHaveBeenCalled();
    expect(m.isCloudHydrated()).toBe(true);
    unsubscribe();
  });

  it("a canvas waiting on hydration resolves to missing when it settles empty", async () => {
    const m = await import("@/lib/studio/projects");
    let phase = decidePhase(false, m.isCloudHydrated());
    expect(phase).toBe("loading");

    const unsubscribe = m.subscribeProjects(() => {
      phase = decidePhase(false, m.isCloudHydrated());
    });
    m.markCloudHydrated();

    expect(phase).toBe("missing");
    unsubscribe();
  });
});
