/**
 * Runtime user ID for scoping localStorage keys.
 *
 * Set by StorageUserInit (a client component in the root layout) as soon as
 * Clerk resolves the session. Until then, keys fall back to unscoped — this
 * only affects the brief window before hydration, which is fine because reads
 * during SSR always return null from localStorage anyway.
 */

let _userId: string | null = null

export function setStorageUser(id: string | null): void {
  _userId = id
}

/** Returns `u_<userId>:<base>` when signed in, otherwise just `<base>`. */
export function userKey(base: string): string {
  return _userId ? `u_${_userId}:${base}` : base
}
