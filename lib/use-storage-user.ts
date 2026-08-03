"use client";

/**
 * Subscribed read of "do we know which user's localStorage we're reading?".
 *
 * Exists so a page can tell "this record does not exist" apart from "the
 * scope hasn't resolved yet". Without it, every hard load of a per-user
 * record flashes its not-found state for as long as Clerk takes to answer —
 * and if a store cached that first unscoped miss, the flash never ends (see
 * the note in lib/storage-user.ts).
 *
 * A subscription rather than a plain read because the flip has to re-render:
 * when the record is genuinely missing, the store's own snapshot goes null →
 * null and React is entitled to bail out of re-rendering entirely.
 */

import * as React from "react";
import { isStorageUserResolved, subscribeStorageUser } from "./storage-user";

export function useStorageUserReady(): boolean {
  return React.useSyncExternalStore(
    subscribeStorageUser,
    isStorageUserResolved,
    // Server render: never "ready", so a not-found state cannot be baked into
    // the HTML for a record that is only readable on the client anyway.
    () => false,
  );
}
