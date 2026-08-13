"use client";

/**
 * Subscribed read of a single video-edit session.
 *
 * Same shape and same reasoning as lib/edit/use-edit-session.ts: several
 * surfaces mutate this record (the timeline, the canvas, the keyframe rail, the
 * prompt bar, the render hooks), so they subscribe rather than each reading it
 * imperatively and going stale behind the others.
 *
 * getSnapshot MUST be reference-stable between writes or useSyncExternalStore
 * re-renders forever; the store's per-id cache provides that, and the
 * useCallback is what pins the subscription to one id.
 */

import * as React from "react";
import {
  getVideoSessionServerSnapshot,
  getVideoSessionSnapshot,
  subscribeVideoEditSessions,
} from "./sessions";
import type { VideoEditSession } from "./types";

export function useVideoEditSession(id: string): VideoEditSession | null {
  const getSnapshot = React.useCallback(() => getVideoSessionSnapshot(id), [id]);
  return React.useSyncExternalStore(
    subscribeVideoEditSessions,
    getSnapshot,
    getVideoSessionServerSnapshot,
  );
}
