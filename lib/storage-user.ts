/**
 * Runtime user ID for scoping localStorage keys.
 *
 * Set by StorageUserInit (a client component in the root layout) as soon as
 * Clerk resolves the session. Until then, keys fall back to unscoped.
 *
 * ── That window is NOT harmless, and stores must subscribe ────────────────
 *
 * The old note here said the pre-hydration window only affected SSR, where
 * localStorage reads return null anyway. That is wrong for anything reading
 * during the FIRST CLIENT RENDER. Clerk needs a moment to resolve, and
 * StorageUserInit sets the id from an effect — effects run after render, and
 * child effects run before the root layout's. So the first read on a hard
 * page load happens while `_userId` is still null: it hits the UNSCOPED key,
 * finds nothing, and any store that caches that miss (they all do, because
 * useSyncExternalStore requires a reference-stable snapshot) serves "not
 * found" forever. On /edit/[id] that was a session that opened fine by
 * client-side navigation and reported "Session not found" on refresh.
 *
 * Hence the notification: when the scope changes, every read taken before it
 * was against a different bucket and must be discarded. Stores with a cache
 * subscribe and invalidate.
 */

let _userId: string | null = null
/** False until Clerk has actually answered. Distinct from `_userId === null`,
 *  which is also what a signed-out user looks like — a reader needs to tell
 *  "no user" apart from "don't know yet" or it renders an empty state during
 *  the gap. */
let _resolved = false

type Listener = () => void
const listeners = new Set<Listener>()

export function setStorageUser(id: string | null): void {
  // Notify on an actual change, or on the first resolution even if the answer
  // is "signed out" — readers waiting to find out need that edge. Repeat
  // calls with the same id are ignored: StorageUserInit's effect re-runs on
  // unrelated Clerk transitions and would otherwise clear caches for nothing.
  const changed = id !== _userId || !_resolved
  _userId = id
  _resolved = true
  if (changed) listeners.forEach((cb) => cb())
}

/** Whether the scope is known yet. Read it before showing an empty state. */
export function isStorageUserResolved(): boolean {
  return _resolved
}

/**
 * Called when the localStorage scope changes — i.e. every key a store built
 * with `userKey()` now points somewhere else. Returns an unsubscribe.
 */
export function subscribeStorageUser(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Returns `u_<userId>:<base>` when signed in, otherwise just `<base>`. */
export function userKey(base: string): string {
  return _userId ? `u_${_userId}:${base}` : base
}
