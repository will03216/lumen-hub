/**
 * Edit Sessions — local store for the image editor.
 *
 * Follows lib/story/stories.ts: localStorage under a versioned, user-scoped
 * key, plus a useSyncExternalStore-compatible subscribe/snapshot façade and
 * a module-level cache so React's identity check never fires spuriously.
 *
 * Three deliberate deviations from that file, each with a reason:
 *
 * 1. PER-ID SNAPSHOT CACHE. stories.ts caches only the meta *list*; the story
 *    editor reads getStory(id) imperatively on mount. The edit canvas instead
 *    needs a *subscribed* single session, so a second cache keyed by id lives
 *    alongside cachedList and is invalidated by the same writeStore.
 *
 * 2. WRITE FAILURES ARE VISIBLE. stories.ts swallows quota errors — correct
 *    for a 2 KB story, data loss for a mask someone spent five minutes
 *    painting. writeStore returns a boolean and records lastWriteError, which
 *    the workspace surfaces as a persistent banner.
 *
 * 3. FINE-GRAINED MUTATORS. The canvas mutates one annotation at a time, from
 *    a gesture handler that has no business round-tripping the whole session
 *    through React state first. addRef/upsertAnnotation/appendVersion/etc.
 *    read-modify-write inside the store, under one read, so two handlers
 *    firing in the same tick can't clobber each other.
 *
 * Hot-path rule the callers must honour: an in-progress brush stroke never
 * touches this module. Points accumulate in a ref and the Konva line is
 * mutated imperatively; upsertAnnotation fires once, on gesture end. Writing
 * on pointermove would JSON.stringify a multi-hundred-KB session at 60 Hz.
 */

import { userKey } from "@/lib/storage-user";
import { DEFAULT_IMAGE_MODEL_ID } from "@/lib/studio/models";
import {
  MAX_ANNOTATIONS_PER_REF,
  MAX_VERSIONS,
  type Annotation,
  type EditLayer,
  type EditReference,
  type EditSession,
  type EditSessionMeta,
  type EditVersion,
  type LayerSet,
} from "./types";

const STORAGE_KEY = () => userKey("lumen.edit.sessions.v1");

type StoreShape = {
  version: 1;
  sessions: Record<string, EditSession>;
};

const EMPTY_STORE: StoreShape = { version: 1, sessions: {} };

// ─────────────────────────── Storage I/O ──────────────────────────────────

function readStore(): StoreShape {
  if (typeof window === "undefined") return EMPTY_STORE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY());
    if (!raw) return { version: 1, sessions: {} };
    const parsed = JSON.parse(raw) as StoreShape;
    if (parsed.version !== 1 || !parsed.sessions) return EMPTY_STORE;
    return parsed;
  } catch {
    return EMPTY_STORE;
  }
}

/** Set when a write fails — almost always QuotaExceededError. Cleared on the
 *  next successful write. Read via lastWriteError() for the banner. */
let _lastWriteError: string | null = null;

export function lastWriteError(): string | null {
  return _lastWriteError;
}

function writeStore(store: StoreShape): boolean {
  if (typeof window === "undefined") return false;
  let ok = true;
  try {
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(store));
    _lastWriteError = null;
  } catch (err) {
    // Unlike stories.ts we do NOT swallow this. A failed write here means
    // the user's annotations are not being saved, and they need to know
    // before they keep working.
    ok = false;
    _lastWriteError =
      err instanceof Error ? err.message : "Local storage write failed";
  }
  invalidate();
  listeners.forEach((cb) => cb());
  return ok;
}

// ─────────────────────── Subscription / cache ─────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

let cachedList: EditSessionMeta[] | null = null;

/**
 * Per-session snapshot cache, keyed by id.
 *
 * A single slot would be smaller and is a trap: the moment two components
 * subscribe to different sessions in the same tree — a version-restore
 * preview, a compare panel, the agent panel — they evict each other on every
 * render pass, useSyncExternalStore sees a new object identity on each
 * consistency check, and React re-renders forever. The symptom is a frozen
 * tab with no error, and the cause is nowhere near the component that
 * triggered it. A Map costs one entry per session actually opened.
 */
const cachedSessions = new Map<string, EditSession | null>();

function invalidate(): void {
  cachedList = null;
  cachedSessions.clear();
}

export function subscribeEditSessions(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getEditSessionsSnapshot(): EditSessionMeta[] {
  if (cachedList === null) cachedList = listEditSessions();
  return cachedList;
}

export function getEditSessionsServerSnapshot(): EditSessionMeta[] | null {
  return null;
}

/**
 * Stable-identity read of one session. useSyncExternalStore compares the
 * result by reference on every render, so this MUST return the same object
 * until something actually writes — hence the cache rather than a bare
 * getEditSession(id).
 */
export function getSessionSnapshot(id: string): EditSession | null {
  if (!cachedSessions.has(id)) cachedSessions.set(id, getEditSession(id));
  return cachedSessions.get(id) ?? null;
}

export function getSessionServerSnapshot(): EditSession | null {
  return null;
}

// ─────────────────────────── Read API ─────────────────────────────────────

export function listEditSessions(): EditSessionMeta[] {
  const store = readStore();
  return Object.values(store.sessions)
    .map<EditSessionMeta>((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      coverUrl: s.coverUrl,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getEditSession(id: string): EditSession | null {
  const store = readStore();
  return store.sessions[id] ?? null;
}

/** Rough footprint of this store's key, for the quota HUD. */
export function editStorageBytes(): number {
  if (typeof window === "undefined") return 0;
  try {
    return localStorage.getItem(STORAGE_KEY())?.length ?? 0;
  } catch {
    return 0;
  }
}

// ─────────────────────────── Write API ────────────────────────────────────

export function createEditSession(
  opts: {
    name?: string;
    baseRef?: Omit<EditReference, "id" | "annotations" | "role">;
    model?: string;
    instruction?: string;
  } = {},
): EditSession {
  const store = readStore();
  const now = Date.now();
  const id = newEditId();

  const refs: EditReference[] = opts.baseRef
    ? [{ ...opts.baseRef, id: newEditId(), role: "base", annotations: [] }]
    : [];

  const session: EditSession = {
    id,
    name: opts.name?.trim() || "Untitled Edit",
    createdAt: now,
    updatedAt: now,
    coverUrl: opts.baseRef?.url,
    refs,
    activeRefId: refs[0]?.id ?? null,
    instruction: opts.instruction ?? "",
    model: opts.model ?? DEFAULT_IMAGE_MODEL_ID,
    aspectRatio: "source",
    qualityId: "2k",
    versions: [],
    layerSets: [],
    view: { scale: 1, x: 0, y: 0 },
  };

  store.sessions[id] = session;
  writeStore(store);

  // Creation is the one write that must fail loudly. Every other mutator can
  // report through the workspace's quota banner, because the session is on
  // screen to carry it. A failed *create* has nothing to render: the caller
  // would navigate to /edit/<id> and land on "Session not found", which reads
  // as data loss rather than a full disk. Throwing lets the caller say why.
  const failure = lastWriteError();
  if (failure) throw new Error(`Could not save the new session — ${failure}`);

  return session;
}

export function updateEditSession(
  id: string,
  patch: Partial<Omit<EditSession, "id" | "createdAt">>,
): EditSession | null {
  return mutate(id, (s) => ({ ...s, ...patch }));
}

export function deleteEditSession(id: string): void {
  const store = readStore();
  if (!store.sessions[id]) return;
  delete store.sessions[id];
  writeStore(store);
}

/**
 * Versions and layer sets are the quota hogs, so a duplicate drops them by
 * default — the common case is "branch from this image", not "clone the
 * whole history".
 */
export function duplicateEditSession(
  id: string,
  opts: { withHistory?: boolean } = {},
): EditSession | null {
  const src = getEditSession(id);
  if (!src) return null;

  const store = readStore();
  const now = Date.now();
  const nextId = newEditId();

  // Ref ids are regenerated, so any structure keyed by ref id has to be
  // remapped rather than cloned. Annotation snapshots inside versions are
  // keyed by ref id, which is exactly why withHistory is off by default.
  const next: EditSession = {
    ...structuredClone(src),
    id: nextId,
    name: `${src.name} (copy)`,
    createdAt: now,
    updatedAt: now,
    refs: structuredClone(src.refs).map((r) => ({ ...r, id: newEditId() })),
    versions: opts.withHistory ? structuredClone(src.versions) : [],
    layerSets: [],
  };
  next.activeRefId = next.refs[0]?.id ?? null;

  store.sessions[nextId] = next;
  writeStore(store);
  return next;
}

// ── Fine-grained mutators ──────────────────────────────────────────────────

export function addRef(
  sessionId: string,
  ref: Omit<EditReference, "id" | "annotations">,
): EditReference | null {
  const created: EditReference = {
    ...ref,
    id: newEditId(),
    annotations: [],
  };
  const next = mutate(sessionId, (s) => ({
    ...s,
    refs: [...s.refs, created],
    activeRefId: s.activeRefId ?? created.id,
    coverUrl: s.coverUrl ?? created.url,
  }));
  return next ? created : null;
}

export function removeRef(sessionId: string, refId: string): void {
  mutate(sessionId, (s) => {
    const refs = s.refs.filter((r) => r.id !== refId);
    return {
      ...s,
      refs,
      activeRefId: s.activeRefId === refId ? (refs[0]?.id ?? null) : s.activeRefId,
    };
  });
}

export function patchRef(
  sessionId: string,
  refId: string,
  patch: Partial<EditReference>,
): void {
  mutate(sessionId, (s) => ({
    ...s,
    refs: s.refs.map((r) => (r.id === refId ? { ...r, ...patch, id: r.id } : r)),
  }));
}

export function setAnnotations(
  sessionId: string,
  refId: string,
  list: Annotation[],
): void {
  mutate(sessionId, (s) => ({
    ...s,
    refs: s.refs.map((r) =>
      r.id === refId
        ? { ...r, annotations: list.slice(0, MAX_ANNOTATIONS_PER_REF) }
        : r,
    ),
  }));
}

/**
 * Add or replace one annotation. The cap is enforced here rather than in the
 * UI so every caller — canvas, preset, agent tool — hits the same ceiling.
 * An add that would exceed it is dropped rather than evicting an older mark,
 * because silently deleting someone's work is worse than refusing the new one.
 *
 * Returns false when the add was refused, so the caller can say so. Without
 * that, the user drags a box, nothing appears, and there is no explanation
 * anywhere — and the caller goes on to select an id that was never stored.
 */
export function upsertAnnotation(
  sessionId: string,
  refId: string,
  ann: Annotation,
): boolean {
  const ref = getEditSession(sessionId)?.refs.find((r) => r.id === refId);
  const isNew = ref ? !ref.annotations.some((a) => a.id === ann.id) : false;
  if (ref && isNew && ref.annotations.length >= MAX_ANNOTATIONS_PER_REF) {
    return false;
  }

  mutate(sessionId, (s) => ({
    ...s,
    refs: s.refs.map((r) => {
      if (r.id !== refId) return r;
      const idx = r.annotations.findIndex((a) => a.id === ann.id);
      if (idx >= 0) {
        const annotations = r.annotations.slice();
        annotations[idx] = ann;
        return { ...r, annotations };
      }
      if (r.annotations.length >= MAX_ANNOTATIONS_PER_REF) return r;
      return { ...r, annotations: [...r.annotations, ann] };
    }),
  }));
  return true;
}

export function removeAnnotation(
  sessionId: string,
  refId: string,
  annId: string,
): void {
  mutate(sessionId, (s) => ({
    ...s,
    refs: s.refs.map((r) =>
      r.id === refId
        ? { ...r, annotations: r.annotations.filter((a) => a.id !== annId) }
        : r,
    ),
  }));
}

export function appendVersion(sessionId: string, version: EditVersion): void {
  mutate(sessionId, (s) => ({
    ...s,
    // FIFO — oldest drops out first. Bounded here, not in the UI, for the
    // same reason as the annotation cap.
    versions: [...s.versions, version].slice(-MAX_VERSIONS),
    coverUrl: version.outputs[0]?.url ?? s.coverUrl,
  }));
}

export function patchVersion(
  sessionId: string,
  versionId: string,
  patch: Partial<EditVersion>,
): void {
  mutate(sessionId, (s) => ({
    ...s,
    versions: s.versions.map((v) =>
      v.id === versionId ? { ...v, ...patch, id: v.id } : v,
    ),
  }));
}

export function upsertLayerSet(sessionId: string, set: LayerSet): void {
  mutate(sessionId, (s) => {
    const idx = s.layerSets.findIndex((l) => l.id === set.id);
    if (idx < 0) return { ...s, layerSets: [...s.layerSets, set] };
    const layerSets = s.layerSets.slice();
    layerSets[idx] = set;
    return { ...s, layerSets };
  });
}

export function patchLayer(
  sessionId: string,
  setId: string,
  layerId: string,
  patch: Partial<EditLayer>,
): void {
  mutate(sessionId, (s) => ({
    ...s,
    layerSets: s.layerSets.map((set) =>
      set.id !== setId
        ? set
        : {
            ...set,
            layers: set.layers.map((l) =>
              l.id === layerId ? { ...l, ...patch, id: l.id } : l,
            ),
          },
    ),
  }));
}

// ─────────────────────────── Helpers ──────────────────────────────────────

/**
 * The single read-modify-write path. Every mutator goes through here so the
 * store is read once, the id and createdAt are pinned, and updatedAt is
 * stamped in exactly one place.
 */
function mutate(
  id: string,
  fn: (s: EditSession) => EditSession,
): EditSession | null {
  const store = readStore();
  const existing = store.sessions[id];
  if (!existing) return null;
  const next: EditSession = {
    ...fn(existing),
    id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  store.sessions[id] = next;
  writeStore(store);
  return next;
}

export function newEditId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/** Clears the key and every cache. Tests only. */
export function __resetForTests(): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY());
    } catch {
      // ignore
    }
  }
  _lastWriteError = null;
  invalidate();
}
