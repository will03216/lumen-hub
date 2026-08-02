/**
 * The refresh bug: a session that opens fine by navigation, "Session not
 * found" on reload.
 *
 * Mechanism. localStorage keys are user-scoped (lib/storage-user.ts) and the
 * scope is published from an effect once Clerk resolves. A hard load renders
 * before any effect, so the first read of the edit store hits the UNSCOPED
 * key and misses. getSessionSnapshot has to be reference-stable for
 * useSyncExternalStore, so it caches that miss like any other result — and
 * nothing invalidated it when the scope arrived. The page then said "not
 * found" for as long as it stayed open.
 *
 * Studio hit the same race and solved half of it with a "don't commit to 404
 * until hydration settles" rule (lib/studio/canvas-load-phase.test.ts). The
 * other half is this: the cached miss must be dropped and subscribers woken,
 * or waiting longer just means waiting longer.
 *
 * Each test re-imports the modules so the module-level scope and caches start
 * clean — they are process-global by design.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditSession } from "./types";

const USER = "user_abc";
const BASE = "lumen.edit.sessions.v1";

function seed(id: string, key: string): void {
  const session = {
    id,
    name: "Seeded",
    createdAt: 1,
    updatedAt: 1,
    model: "m",
    aspectRatio: "source",
    qualityId: "source",
    instruction: "",
    refs: [],
    activeRefId: null,
    versions: [],
  } as unknown as EditSession;
  localStorage.setItem(
    key,
    JSON.stringify({ version: 1, sessions: { [id]: session } }),
  );
}

describe("localStorage scope resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("drops a miss cached before the user resolved, and wakes subscribers", async () => {
    const storage = await import("@/lib/storage-user");
    const store = await import("./sessions");
    seed("sess-1", `u_${USER}:${BASE}`);

    // The pre-Clerk read: wrong bucket, and the miss goes into the cache.
    expect(store.getSessionSnapshot("sess-1")).toBeNull();

    let woken = 0;
    store.subscribeEditSessions(() => {
      woken += 1;
    });

    storage.setStorageUser(USER);

    // Both halves matter. Without the notify React never looks again; without
    // the invalidate it looks and is handed the same cached null.
    expect(woken).toBe(1);
    expect(store.getSessionSnapshot("sess-1")?.id).toBe("sess-1");
  });

  it("reports the scope as unresolved until Clerk answers", async () => {
    const storage = await import("@/lib/storage-user");
    expect(storage.isStorageUserResolved()).toBe(false);
    storage.setStorageUser(null); // signed out — an answer, not an absence
    expect(storage.isStorageUserResolved()).toBe(true);
  });

  it("notifies on the first resolution even when the answer is signed-out", async () => {
    // Otherwise a signed-out load waits forever for an edge that never comes,
    // because null happens to be the initial value too.
    const storage = await import("@/lib/storage-user");
    let woken = 0;
    storage.subscribeStorageUser(() => {
      woken += 1;
    });
    storage.setStorageUser(null);
    expect(woken).toBe(1);
  });

  it("ignores repeat calls with the same id", async () => {
    // StorageUserInit's effect re-runs on unrelated Clerk transitions; each
    // one would otherwise clear every cache and re-read the whole store.
    const storage = await import("@/lib/storage-user");
    storage.setStorageUser(USER);
    let woken = 0;
    storage.subscribeStorageUser(() => {
      woken += 1;
    });
    storage.setStorageUser(USER);
    storage.setStorageUser(USER);
    expect(woken).toBe(0);
  });

  it("the list snapshot recovers too, not just single sessions", async () => {
    const storage = await import("@/lib/storage-user");
    const store = await import("./sessions");
    seed("sess-2", `u_${USER}:${BASE}`);

    expect(store.getEditSessionsSnapshot()).toEqual([]);
    storage.setStorageUser(USER);
    expect(store.getEditSessionsSnapshot().map((s) => s.id)).toEqual(["sess-2"]);
  });

  it("switching users does not serve the previous user's sessions", async () => {
    const storage = await import("@/lib/storage-user");
    const store = await import("./sessions");
    seed("mine", `u_${USER}:${BASE}`);

    storage.setStorageUser(USER);
    expect(store.getSessionSnapshot("mine")?.id).toBe("mine");

    storage.setStorageUser("user_someone_else");
    expect(store.getSessionSnapshot("mine")).toBeNull();
  });
});
