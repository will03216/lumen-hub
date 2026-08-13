/**
 * Video Edit Sessions — local store, modelled on lib/edit/sessions.ts.
 *
 * Same three deviations from stories.ts that file documents (per-id snapshot
 * cache, visible write failures, fine-grained mutators), for the same reasons.
 * Read that file's header first; only what differs is explained here.
 *
 * What differs:
 *
 * · KEYFRAMES ARE KEPT SORTED BY `t`, in the store rather than at each read
 *   site. Every consumer — the rail, the variant selector, the prompt compiler,
 *   the bookend role assignment — depends on chronological order, and a
 *   compiler that silently received them in insertion order would emit a
 *   `Shot 2` that happens before `Shot 1`.
 *
 * · UPSERT IS BY TIMESTAMP, not only by id. Grabbing the same frame twice is a
 *   normal thing to do (mark it, look at it again, mark it differently) and it
 *   must not produce two ledger rows one millisecond apart that then compile
 *   into two identical shots.
 */

import { subscribeStorageUser, userKey } from "@/lib/storage-user";
import {
  MAX_KEYFRAMES,
  VIDEO_EDIT_MODEL,
  MAX_VIDEO_VERSIONS,
  MAX_WINDOW_SECONDS,
  MIN_WINDOW_SECONDS,
  type Keyframe,
  type VideoEditSession,
  type VideoEditSessionMeta,
  type VideoEditVersion,
  type VideoSource,
} from "./types";

const STORAGE_KEY = () => userKey("lumen.videoedit.sessions.v1");

type StoreShape = {
  version: 1;
  sessions: Record<string, VideoEditSession>;
};

const EMPTY_STORE: StoreShape = { version: 1, sessions: {} };

/** Two grabs closer together than this are the same frame. Roughly half a
 *  frame at 24fps — tight enough that adjacent frames stay distinct, loose
 *  enough that re-seeking to "the same place" doesn't duplicate a row. */
const SAME_FRAME_EPSILON = 0.02;

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

let cachedList: VideoEditSessionMeta[] | null = null;
const cachedSessions = new Map<string, VideoEditSession | null>();

function invalidate(): void {
  cachedList = null;
  cachedSessions.clear();
}

if (typeof window !== "undefined") {
  subscribeStorageUser(() => {
    invalidate();
    listeners.forEach((cb) => cb());
  });
}

export function subscribeVideoEditSessions(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getVideoEditSessionsSnapshot(): VideoEditSessionMeta[] {
  if (cachedList === null) cachedList = listVideoEditSessions();
  return cachedList;
}

export function getVideoEditSessionsServerSnapshot(): VideoEditSessionMeta[] | null {
  return null;
}

export function getVideoSessionSnapshot(id: string): VideoEditSession | null {
  if (!cachedSessions.has(id)) cachedSessions.set(id, getVideoEditSession(id));
  return cachedSessions.get(id) ?? null;
}

export function getVideoSessionServerSnapshot(): VideoEditSession | null {
  return null;
}

// ─────────────────────────── Read API ─────────────────────────────────────

export function listVideoEditSessions(): VideoEditSessionMeta[] {
  const store = readStore();
  return Object.values(store.sessions)
    .map<VideoEditSessionMeta>((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      coverUrl: s.coverUrl,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getVideoEditSession(id: string): VideoEditSession | null {
  const store = readStore();
  return store.sessions[id] ?? null;
}

export function videoEditStorageBytes(): number {
  if (typeof window === "undefined") return 0;
  try {
    return localStorage.getItem(STORAGE_KEY())?.length ?? 0;
  } catch {
    return 0;
  }
}

// ─────────────────────────── Write API ────────────────────────────────────

export function createVideoEditSession(opts: {
  name?: string;
  source: VideoSource;
  model?: string;
}): VideoEditSession {
  const store = readStore();
  const now = Date.now();
  const id = newVideoEditId();

  // Default the window to the whole clip when it fits, and to the first
  // MAX_WINDOW_SECONDS when it doesn't. Defaulting to the start rather than
  // the middle is the less surprising of the two: the user sees frame 0 in the
  // player and the window they were given matches what they are looking at.
  const end = Math.min(opts.source.duration, MAX_WINDOW_SECONDS);

  const session: VideoEditSession = {
    id,
    name: opts.name?.trim() || "Untitled Video Edit",
    createdAt: now,
    updatedAt: now,
    source: opts.source,
    window: { start: 0, end },
    keyframes: [],
    activeKeyframeId: null,
    intent: "",
    variant: null,
    model: opts.model ?? VIDEO_EDIT_MODEL,
    // Round rather than floor: a 5.6s window is better served by 6s of output
    // than by 5s that drops the end of the beat.
    duration: clampDuration(Math.round(end)),
    ratio: ratioForSize(opts.source.width, opts.source.height),
    resolution: "720p",
    audioMode: "preserve",
    versions: [],
  };

  store.sessions[id] = session;
  writeStore(store);

  // Creation is the one write that must fail loudly — see the note on
  // createEditSession. A failed create navigates to a "not found" page, which
  // reads as data loss rather than a full disk.
  const failure = lastWriteError();
  if (failure) throw new Error(`Could not save the new session — ${failure}`);

  return session;
}

export function updateVideoEditSession(
  id: string,
  patch: Partial<Omit<VideoEditSession, "id" | "createdAt">>,
): VideoEditSession | null {
  return mutate(id, (s) => ({ ...s, ...patch }));
}

export function deleteVideoEditSession(id: string): void {
  const store = readStore();
  if (!store.sessions[id]) return;
  delete store.sessions[id];
  writeStore(store);
}

// ── Keyframes ──────────────────────────────────────────────────────────────

/**
 * Add a keyframe, or return the existing one at the same instant.
 *
 * Returns the keyframe that ended up in the ledger — which may be a
 * pre-existing row. Callers select it either way, so re-grabbing a frame the
 * user already marked lands them back on their own marks rather than on a
 * blank duplicate.
 *
 * Returns null when the cap is reached, so the caller can say so. Silently
 * dropping the add produces a Grab button that does nothing.
 */
export function addKeyframe(
  sessionId: string,
  input: Omit<Keyframe, "id" | "createdAt" | "annotations" | "assetStatus"> &
    Partial<Pick<Keyframe, "annotations">>,
): Keyframe | null {
  const session = getVideoEditSession(sessionId);
  if (!session) return null;

  const existing = session.keyframes.find(
    (k) => Math.abs(k.t - input.t) < SAME_FRAME_EPSILON,
  );
  if (existing) return existing;

  if (session.keyframes.length >= MAX_KEYFRAMES) return null;

  const created: Keyframe = {
    ...input,
    annotations: input.annotations ?? [],
    assetStatus: "none",
    id: newVideoEditId(),
    createdAt: Date.now(),
  };

  mutate(sessionId, (s) => ({
    ...s,
    keyframes: sortByTime([...s.keyframes, created]),
    activeKeyframeId: created.id,
    coverUrl: s.coverUrl ?? created.sourceFrameUrl,
  }));

  return created;
}

export function patchKeyframe(
  sessionId: string,
  keyframeId: string,
  patch: Partial<Keyframe>,
): void {
  mutate(sessionId, (s) => ({
    ...s,
    // Re-sort on every patch: `t` is patchable (a re-grab at a corrected
    // timestamp), and a ledger that is sorted everywhere except after the one
    // mutation that moves a row is worse than one that is never sorted.
    keyframes: sortByTime(
      s.keyframes.map((k) =>
        k.id === keyframeId ? { ...k, ...patch, id: k.id } : k,
      ),
    ),
  }));
}

export function removeKeyframe(sessionId: string, keyframeId: string): void {
  mutate(sessionId, (s) => {
    const keyframes = s.keyframes.filter((k) => k.id !== keyframeId);
    return {
      ...s,
      keyframes,
      activeKeyframeId:
        s.activeKeyframeId === keyframeId
          ? (keyframes[0]?.id ?? null)
          : s.activeKeyframeId,
    };
  });
}

export function setKeyframeAnnotations(
  sessionId: string,
  keyframeId: string,
  annotations: Keyframe["annotations"],
): void {
  patchKeyframe(sessionId, keyframeId, { annotations });
}

/**
 * Add or replace one annotation on a keyframe.
 *
 * Mirrors upsertAnnotation in lib/edit/sessions.ts, including the cap
 * behaviour: an add over the ceiling is refused rather than evicting an older
 * mark, and the boolean lets the caller explain the refusal.
 */
export function upsertKeyframeAnnotation(
  sessionId: string,
  keyframeId: string,
  ann: Keyframe["annotations"][number],
  max: number,
): boolean {
  const kf = getVideoEditSession(sessionId)?.keyframes.find(
    (k) => k.id === keyframeId,
  );
  if (!kf) return false;
  const isNew = !kf.annotations.some((a) => a.id === ann.id);
  if (isNew && kf.annotations.length >= max) return false;

  mutate(sessionId, (s) => ({
    ...s,
    keyframes: s.keyframes.map((k) => {
      if (k.id !== keyframeId) return k;
      const idx = k.annotations.findIndex((a) => a.id === ann.id);
      if (idx >= 0) {
        const annotations = k.annotations.slice();
        annotations[idx] = ann;
        return { ...k, annotations };
      }
      if (k.annotations.length >= max) return k;
      return { ...k, annotations: [...k.annotations, ann] };
    }),
  }));
  return true;
}

export function removeKeyframeAnnotation(
  sessionId: string,
  keyframeId: string,
  annId: string,
): void {
  mutate(sessionId, (s) => ({
    ...s,
    keyframes: s.keyframes.map((k) =>
      k.id === keyframeId
        ? { ...k, annotations: k.annotations.filter((a) => a.id !== annId) }
        : k,
    ),
  }));
}

// ── Versions ───────────────────────────────────────────────────────────────

export function appendVideoVersion(
  sessionId: string,
  version: VideoEditVersion,
): void {
  mutate(sessionId, (s) => ({
    ...s,
    versions: [...s.versions, version].slice(-MAX_VIDEO_VERSIONS),
  }));
}

export function patchVideoVersion(
  sessionId: string,
  versionId: string,
  patch: Partial<VideoEditVersion>,
): void {
  mutate(sessionId, (s) => ({
    ...s,
    versions: s.versions.map((v) =>
      v.id === versionId ? { ...v, ...patch, id: v.id } : v,
    ),
    // Deliberately NOT set from the version's output. That output is an .mp4,
    // and the dashboard card renders coverUrl in an <img> — a video URL there
    // is a permanently broken thumbnail. The first keyframe's still, set when
    // it was grabbed, is the right cover and is already in place.
  }));
}

/**
 * Put the session back into the state that produced a version.
 *
 * Restores the ledger wholesale, not just the settings — a version's output is
 * only reproducible alongside the keyframes that generated it, and the marks
 * on those keyframes are the record of why the edit looked the way it did.
 * The source clip is deliberately NOT restored: a session has exactly one
 * source, and a version cannot have been rendered from a different one.
 */
export function restoreVideoVersion(
  sessionId: string,
  versionId: string,
): boolean {
  const session = getVideoEditSession(sessionId);
  const version = session?.versions.find((v) => v.id === versionId);
  if (!session || !version) return false;

  mutate(sessionId, (s) => ({
    ...s,
    intent: version.intent,
    variant: version.variant,
    model: version.model,
    duration: version.duration,
    ratio: version.ratio,
    resolution: version.resolution,
    seed: version.seed,
    audioMode: version.audioMode,
    keyframes: sortByTime(version.keyframesSnapshot.map((k) => ({ ...k }))),
    activeKeyframeId: version.keyframesSnapshot[0]?.id ?? null,
  }));
  return true;
}

// ─────────────────────────── Helpers ──────────────────────────────────────

function sortByTime(list: Keyframe[]): Keyframe[] {
  return [...list].sort((a, b) => a.t - b.t);
}

/** Seedance takes an integer, floored at 4 and ceilinged at the model's own
 *  output limit. Reads the shared constant rather than repeating the number:
 *  this ceiling and MAX_WINDOW_SECONDS were both literal 15s, so raising the
 *  model's cap in one place would have left a duration the window allowed but
 *  the clamp silently cut back down. */
export function clampDuration(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.min(MAX_WINDOW_SECONDS, Math.max(MIN_WINDOW_SECONDS, Math.round(n)));
}

/**
 * Nearest supported ratio for a source's pixel dimensions.
 *
 * Defaulting the render to the source's own shape is what keeps a spliced seam
 * invisible (PRD R15) — a 9:16 phone clip edited at 16:9 comes back pillarboxed
 * and no longer cuts against its own footage.
 */
export function ratioForSize(width: number, height: number): string {
  if (!width || !height) return "16:9";
  const target = width / height;
  const options: Array<[string, number]> = [
    ["21:9", 21 / 9],
    ["16:9", 16 / 9],
    ["4:3", 4 / 3],
    ["1:1", 1],
    ["3:4", 3 / 4],
    ["9:16", 9 / 16],
  ];
  let best = options[1];
  let bestDelta = Infinity;
  for (const opt of options) {
    const delta = Math.abs(Math.log(target / opt[1]));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = opt;
    }
  }
  return best[0];
}

function mutate(
  id: string,
  fn: (s: VideoEditSession) => VideoEditSession,
): VideoEditSession | null {
  const store = readStore();
  const existing = store.sessions[id];
  if (!existing) return null;
  const next: VideoEditSession = {
    ...fn(existing),
    id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  store.sessions[id] = next;
  writeStore(store);
  return next;
}

export function newVideoEditId(): string {
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
