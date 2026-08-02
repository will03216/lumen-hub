"use client";

/**
 * Subscribed read of a single edit session.
 *
 * The story editor reads its project imperatively on mount and re-reads it
 * whenever a generation hook writes behind its back — workable there, and a
 * source of stale-render bugs the moment two surfaces mutate the same record.
 * The edit workspace has several (canvas, prompt bar, version rail, and later
 * the agent), so it subscribes instead.
 *
 * getSnapshot MUST be reference-stable between writes or useSyncExternalStore
 * re-renders forever; getSessionSnapshot() in the store provides that. The
 * useCallback here is what keeps the subscription pinned to one id — without
 * it, every render would hand React a new getSnapshot and defeat the cache.
 */

import * as React from "react";
import {
  getSessionServerSnapshot,
  getSessionSnapshot,
  subscribeEditSessions,
} from "./sessions";
import type { EditSession } from "./types";

export function useEditSession(id: string): EditSession | null {
  const getSnapshot = React.useCallback(() => getSessionSnapshot(id), [id]);
  return React.useSyncExternalStore(
    subscribeEditSessions,
    getSnapshot,
    getSessionServerSnapshot,
  );
}
