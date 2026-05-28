/**
 * In-flight render tracker — module-level so progress survives mount /
 * unmount cycles.
 *
 * Why this exists
 * ---------------
 * Image and Video generators used to keep their "rendering…" pending
 * state in component-local `useState`. Switching tabs (Image ↔ Video)
 * unmounts the inactive panel. The fetch / poll Promise kept running
 * in the background — the data eventually landed in the Library — but
 * the user-facing "rendering" tile vanished, which read as "the render
 * disappeared".
 *
 * Lifting the tracker to a module-level store, exposed via
 * `useSyncExternalStore`, lets multiple component instances see the
 * same queue. Tab switches no longer drop the visual indicator; the
 * pending tile reappears when the panel remounts.
 *
 * Library auto-save remains the persistence destination; this store
 * only carries transient "is X currently rendering" state.
 */

export type InFlightImage = {
  /** Unique per variant fire — `vif_<ts>_<i>`. Used as the React key
   *  for the pending tile. */
  id: string;
  startedAt: number;
  prompt: string;
  model: string;
  size: string;
  seed?: number;
};

export type InFlightVideo = {
  /** BytePlus task id (once submit lands) or a temp `tmp_<ts>` id
   *  during the submit fetch. Reused as the Job.id when the panel
   *  hydrates from this store. */
  id: string;
  /** Mirrors the Job.status enum so the panel can show "queued" /
   *  "running" pills without juggling a separate vocabulary. */
  status: "submitting" | "queued" | "running";
  startedAt: number;
  prompt: string;
  model: string;
  ratio: string;
  duration: number;
  resolution: string;
  mode: string;
  seed?: number;
};

const imageQueue = new Map<string, InFlightImage>();
const videoQueue = new Map<string, InFlightVideo>();

const listeners = new Set<() => void>();
function notify(): void {
  for (const fn of listeners) fn();
}

// Snapshot caches — `useSyncExternalStore` requires the same reference
// between mutations or React thrash-renders. Versioned by mutation
// counter so cache invalidation is one number to bump.
let mutation = 0;
let imageSnapshotKey = -1;
let imageSnapshot: InFlightImage[] = [];
let videoSnapshotKey = -1;
let videoSnapshot: InFlightVideo[] = [];
const EMPTY_IMAGE: InFlightImage[] = [];
const EMPTY_VIDEO: InFlightVideo[] = [];

// ─────────────────────────── Image ──────────────────────────────────────

export function addInFlightImage(task: InFlightImage): void {
  imageQueue.set(task.id, task);
  mutation++;
  notify();
}

export function removeInFlightImage(id: string): void {
  if (!imageQueue.has(id)) return;
  imageQueue.delete(id);
  mutation++;
  notify();
}

export function listInFlightImages(): InFlightImage[] {
  if (imageSnapshotKey === mutation) return imageSnapshot;
  imageSnapshot = Array.from(imageQueue.values()).sort(
    (a, b) => b.startedAt - a.startedAt,
  );
  imageSnapshotKey = mutation;
  return imageSnapshot;
}

// ─────────────────────────── Video ──────────────────────────────────────

export function addInFlightVideo(task: InFlightVideo): void {
  videoQueue.set(task.id, task);
  mutation++;
  notify();
}

/** Update an in-flight video's status (e.g. submitting → queued, then
 *  → running) without rewriting the rest of the record. */
export function patchInFlightVideo(
  id: string,
  patch: Partial<Pick<InFlightVideo, "status" | "id">>,
): void {
  const existing = videoQueue.get(id);
  if (!existing) return;
  // Status flip is the common case; id swap happens once when the
  // submit fetch resolves and we replace the temp id with the real
  // BytePlus task id.
  if (patch.id && patch.id !== id) {
    videoQueue.delete(id);
    videoQueue.set(patch.id, { ...existing, ...patch });
  } else {
    videoQueue.set(id, { ...existing, ...patch });
  }
  mutation++;
  notify();
}

export function removeInFlightVideo(id: string): void {
  if (!videoQueue.has(id)) return;
  videoQueue.delete(id);
  mutation++;
  notify();
}

export function listInFlightVideos(): InFlightVideo[] {
  if (videoSnapshotKey === mutation) return videoSnapshot;
  videoSnapshot = Array.from(videoQueue.values()).sort(
    (a, b) => b.startedAt - a.startedAt,
  );
  videoSnapshotKey = mutation;
  return videoSnapshot;
}

// ─────────────────────────── React glue ────────────────────────────────

export function subscribeInFlight(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** SSR snapshots — empty arrays. The store is browser-only so server
 *  components render the empty state. */
export function getInFlightImagesServerSnapshot(): InFlightImage[] {
  return EMPTY_IMAGE;
}
export function getInFlightVideosServerSnapshot(): InFlightVideo[] {
  return EMPTY_VIDEO;
}
