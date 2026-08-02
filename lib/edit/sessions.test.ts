/**
 * Edit session store — the invariants that are expensive to get wrong.
 *
 * Three of these protect against bugs that don't look like store bugs when
 * they surface:
 *
 * · SNAPSHOT IDENTITY. useSyncExternalStore compares getSnapshot()'s result
 *   by reference on every render. If the store returns a fresh array or a
 *   fresh session object each call, React re-renders forever and the symptom
 *   is a frozen tab, not a failing assertion. The cache has to hold identity
 *   between writes and drop it on write — both directions are tested.
 *
 * · CAP OVERFLOW DIRECTION. When a ref is at MAX_ANNOTATIONS_PER_REF, adding
 *   another must drop the NEW mark, not evict an old one. Silently deleting
 *   work someone already did is a worse failure than refusing the addition,
 *   and the difference is one line in the store.
 *
 * · WRITE FAILURES ARE VISIBLE. The story store swallows quota errors, which
 *   is fine for a 2 KB story and data loss for a painted mask. A failed write
 *   here must report itself so the workspace can warn before the user keeps
 *   working against a store that isn't saving.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  addRef,
  appendVersion,
  createEditSession,
  deleteEditSession,
  duplicateEditSession,
  getEditSession,
  getEditSessionsSnapshot,
  getSessionSnapshot,
  lastWriteError,
  listEditSessions,
  removeAnnotation,
  subscribeEditSessions,
  updateEditSession,
  upsertAnnotation,
} from "./sessions";
import {
  MAX_ANNOTATIONS_PER_REF,
  MAX_VERSIONS,
  MARKER_COLOR,
  type Annotation,
  type EditVersion,
} from "./types";

function point(id: string): Annotation {
  return {
    id,
    kind: "point",
    label: `Mark ${id}`,
    color: MARKER_COLOR,
    createdAt: 0,
    at: { x: 10, y: 20 },
  };
}

function version(id: string): EditVersion {
  return {
    id,
    createdAt: 0,
    instruction: "make it walnut",
    compiledPrompt: "make it walnut",
    model: "dola-seedream-5-0-pro-260628",
    size: "2048x1536",
    refIds: [],
    annotationsSnapshot: {},
    outputs: [{ url: `https://cdn.example/${id}.png` }],
    status: "done",
  };
}

beforeEach(() => __resetForTests());
afterEach(() => {
  __resetForTests();
  vi.restoreAllMocks();
  // restoreAllMocks does NOT undo useFakeTimers. Without this, a failing
  // assertion inside a fake-timer test leaks frozen time into every test
  // that runs after it — and those failures point at the wrong file.
  vi.useRealTimers();
});

describe("CRUD", () => {
  it("round-trips a session", () => {
    const s = createEditSession({ name: "Candle" });
    expect(getEditSession(s.id)?.name).toBe("Candle");
    expect(listEditSessions()).toHaveLength(1);

    deleteEditSession(s.id);
    expect(getEditSession(s.id)).toBeNull();
    expect(listEditSessions()).toHaveLength(0);
  });

  it("seeds a base ref and makes it active", () => {
    const s = createEditSession({
      baseRef: { url: "/library-cache/a.png", width: 1024, height: 768 },
    });
    expect(s.refs).toHaveLength(1);
    expect(s.refs[0].role).toBe("base");
    expect(s.activeRefId).toBe(s.refs[0].id);
    // The cover is what the dashboard card renders.
    expect(s.coverUrl).toBe("/library-cache/a.png");
  });

  it("pins id and createdAt through a patch, and moves updatedAt", () => {
    vi.useFakeTimers();
    const s = createEditSession({ name: "One" });
    vi.advanceTimersByTime(1000);

    const next = updateEditSession(s.id, {
      name: "Two",
      // Legal to pass, but the mutator re-stamps it — a caller must not be
      // able to freeze or backdate updatedAt and break the dashboard sort.
      updatedAt: 0,
    })!;

    expect(next.id).toBe(s.id);
    expect(next.createdAt).toBe(s.createdAt);
    expect(next.name).toBe("Two");
    expect(next.updatedAt).toBeGreaterThan(s.updatedAt);
    vi.useRealTimers();
  });

  it("returns null when patching a session that does not exist", () => {
    expect(updateEditSession("nope", { name: "x" })).toBeNull();
  });

  it("sorts the list by updatedAt, newest first", () => {
    vi.useFakeTimers();
    const a = createEditSession({ name: "A" });
    vi.advanceTimersByTime(1000);
    const b = createEditSession({ name: "B" });
    vi.advanceTimersByTime(1000);
    updateEditSession(a.id, { name: "A2" });

    expect(listEditSessions().map((s) => s.id)).toEqual([a.id, b.id]);
    vi.useRealTimers();
  });
});

describe("snapshot identity", () => {
  it("returns the same list reference until a write", () => {
    createEditSession({ name: "A" });
    const first = getEditSessionsSnapshot();
    expect(getEditSessionsSnapshot()).toBe(first);

    createEditSession({ name: "B" });
    expect(getEditSessionsSnapshot()).not.toBe(first);
  });

  it("returns the same session reference until a write", () => {
    const s = createEditSession({ name: "A" });
    const first = getSessionSnapshot(s.id);
    expect(getSessionSnapshot(s.id)).toBe(first);

    updateEditSession(s.id, { instruction: "hello" });
    const second = getSessionSnapshot(s.id);
    expect(second).not.toBe(first);
    expect(second?.instruction).toBe("hello");
  });

  it("re-reads when the requested id changes, and back again", () => {
    const a = createEditSession({ name: "A" });
    const b = createEditSession({ name: "B" });

    // Single-slot cache: alternating ids must not serve a stale hit.
    expect(getSessionSnapshot(a.id)?.name).toBe("A");
    expect(getSessionSnapshot(b.id)?.name).toBe("B");
    expect(getSessionSnapshot(a.id)?.name).toBe("A");
  });

  it("notifies subscribers on write and stops after unsubscribe", () => {
    const cb = vi.fn();
    const unsub = subscribeEditSessions(cb);

    const s = createEditSession({ name: "A" });
    expect(cb).toHaveBeenCalledTimes(1);

    updateEditSession(s.id, { name: "B" });
    expect(cb).toHaveBeenCalledTimes(2);

    unsub();
    updateEditSession(s.id, { name: "C" });
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe("annotation caps", () => {
  it("drops the NEW annotation at the cap rather than evicting an old one", () => {
    const s = createEditSession({
      baseRef: { url: "/a.png", width: 100, height: 100 },
    });
    const refId = s.refs[0].id;

    for (let i = 0; i < MAX_ANNOTATIONS_PER_REF; i++) {
      upsertAnnotation(s.id, refId, point(`a${i}`));
    }
    upsertAnnotation(s.id, refId, point("overflow"));

    const anns = getEditSession(s.id)!.refs[0].annotations;
    expect(anns).toHaveLength(MAX_ANNOTATIONS_PER_REF);
    // The first mark placed is still there; the rejected one is not.
    expect(anns[0].id).toBe("a0");
    expect(anns.some((a) => a.id === "overflow")).toBe(false);
  });

  it("replaces by id instead of appending a duplicate", () => {
    const s = createEditSession({
      baseRef: { url: "/a.png", width: 100, height: 100 },
    });
    const refId = s.refs[0].id;

    upsertAnnotation(s.id, refId, point("m1"));
    upsertAnnotation(s.id, refId, { ...point("m1"), note: "edited" });

    const anns = getEditSession(s.id)!.refs[0].annotations;
    expect(anns).toHaveLength(1);
    expect(anns[0].note).toBe("edited");
  });

  it("removes by id", () => {
    const s = createEditSession({
      baseRef: { url: "/a.png", width: 100, height: 100 },
    });
    const refId = s.refs[0].id;
    upsertAnnotation(s.id, refId, point("m1"));
    upsertAnnotation(s.id, refId, point("m2"));

    removeAnnotation(s.id, refId, "m1");
    const anns = getEditSession(s.id)!.refs[0].annotations;
    expect(anns.map((a) => a.id)).toEqual(["m2"]);
  });

  it("leaves other refs untouched", () => {
    const s = createEditSession({
      baseRef: { url: "/a.png", width: 100, height: 100 },
    });
    const second = addRef(s.id, {
      url: "/b.png",
      width: 50,
      height: 50,
      role: "style",
    })!;

    upsertAnnotation(s.id, s.refs[0].id, point("m1"));

    const after = getEditSession(s.id)!;
    expect(after.refs[0].annotations).toHaveLength(1);
    expect(after.refs.find((r) => r.id === second.id)!.annotations).toHaveLength(
      0,
    );
  });
});

describe("versions", () => {
  it("keeps the newest MAX_VERSIONS and drops the oldest", () => {
    const s = createEditSession({ name: "A" });
    for (let i = 0; i < MAX_VERSIONS + 5; i++) {
      appendVersion(s.id, version(`v${i}`));
    }
    const vs = getEditSession(s.id)!.versions;
    expect(vs).toHaveLength(MAX_VERSIONS);
    expect(vs[0].id).toBe("v5");
    expect(vs.at(-1)!.id).toBe(`v${MAX_VERSIONS + 4}`);
  });

  it("advances the cover to the latest output", () => {
    const s = createEditSession({
      baseRef: { url: "/base.png", width: 10, height: 10 },
    });
    expect(s.coverUrl).toBe("/base.png");
    appendVersion(s.id, version("v1"));
    expect(getEditSession(s.id)!.coverUrl).toBe("https://cdn.example/v1.png");
  });
});

describe("duplicate", () => {
  it("drops history by default and regenerates ref ids", () => {
    const s = createEditSession({
      baseRef: { url: "/a.png", width: 100, height: 100 },
    });
    appendVersion(s.id, version("v1"));

    const copy = duplicateEditSession(s.id)!;
    expect(copy.id).not.toBe(s.id);
    expect(copy.name).toBe("Untitled Edit (copy)");
    expect(copy.versions).toHaveLength(0);
    // Ref ids must be fresh, or the two sessions alias each other's marks.
    expect(copy.refs[0].id).not.toBe(s.refs[0].id);
    expect(copy.refs[0].url).toBe("/a.png");
    expect(copy.activeRefId).toBe(copy.refs[0].id);
  });

  it("keeps history when explicitly asked", () => {
    const s = createEditSession({ name: "A" });
    appendVersion(s.id, version("v1"));
    const copy = duplicateEditSession(s.id, { withHistory: true })!;
    expect(copy.versions.map((v) => v.id)).toEqual(["v1"]);
  });

  it("returns null for a missing source", () => {
    expect(duplicateEditSession("nope")).toBeNull();
  });
});

describe("write failures", () => {
  it("surfaces a quota error instead of swallowing it", () => {
    const s = createEditSession({ name: "A" });
    expect(lastWriteError()).toBeNull();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("exceeded the quota", "QuotaExceededError");
    });
    updateEditSession(s.id, { instruction: "big" });

    expect(lastWriteError()).toMatch(/quota/i);
  });

  it("throws on create rather than returning an unsaved session", () => {
    // The caller navigates to /edit/<id> on success. If a failed create
    // returned normally, that navigation would land on "Session not found",
    // which reads as data loss instead of a full disk.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("exceeded the quota", "QuotaExceededError");
    });
    expect(() => createEditSession({ name: "A" })).toThrow(/could not save/i);
  });

  it("clears the error once a write succeeds again", () => {
    const s = createEditSession({ name: "A" });
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("exceeded the quota", "QuotaExceededError");
      });
    updateEditSession(s.id, { instruction: "big" });
    expect(lastWriteError()).not.toBeNull();

    spy.mockRestore();
    updateEditSession(s.id, { instruction: "small" });
    expect(lastWriteError()).toBeNull();
  });
});
