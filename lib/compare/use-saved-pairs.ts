"use client";

/**
 * useSavedPairs — localStorage-backed state for the user's saved (a, b)
 * pair presets, plus the SSR-safe hydrate, cross-tab sync, save (with
 * label prompt), and remove handlers.
 *
 * Lifted out of compare-shell.tsx so the saved-pair concern is one
 * import away from anything that needs it (the chip row, the page
 * shell, future surfaces). The shell stays focused on prompt / refs /
 * render orchestration.
 *
 * `canSave` mirrors `isValidPair(a, b)` and `alreadyPresent` mirrors
 * "is the current (a, b) represented by a chip" — exposing both as
 * derived booleans means the chip row and the ⌘S keyboard shortcut
 * can never disagree about what's savable.
 *
 * Why the label prompt lives inside `save()` rather than getting passed
 * in: every caller (header chip, ⌘S shortcut, future menu actions)
 * wants the same flow — suggest a default, let the user accept or
 * rename, blank → suggested. Centralising it means a future inline-
 * input replacement happens in one place. window.prompt is the
 * placeholder; see shell history for the v2 plan.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type SavedPair,
  defaultPairLabel,
  readSavedPairs,
  removeSavedPair,
  subscribeSavedPairs,
  upsertSavedPair,
  writeSavedPairs,
} from "./saved-pairs";
import { PAIR_PRESETS, isValidPair } from "./pairs";

export function useSavedPairs(a: string, b: string): {
  savedPairs: SavedPair[];
  save: () => void;
  remove: (slug: string) => void;
  /** True when (a, b) passes `isValidPair` — the chip row uses this to
   *  decide whether to render the `＋ save current` affordance, and the
   *  ⌘S handler uses it to gate its no-op. */
  canSave: boolean;
  /** True when (a, b) is already a built-in or saved chip. The chip row
   *  hides the save affordance; ⌘S no-ops. */
  alreadyPresent: boolean;
} {
  // Hydrated on mount (SSR returns []). State is the source of truth
  // during the session; every mutation writes through synchronously so
  // a refresh never diverges from what the UI just showed.
  const [savedPairs, setSavedPairs] = useState<SavedPair[]>([]);

  useEffect(() => {
    // Initial hydrate + cross-tab sync. Another tab saving a pair fires
    // a `storage` event; we re-read the whole list so the chip row
    // updates without a reload. The originating tab doesn't see its own
    // event — state there is already current via the setter.
    setSavedPairs(readSavedPairs());
    return subscribeSavedPairs(() => setSavedPairs(readSavedPairs()));
  }, []);

  const save = useCallback(() => {
    if (!isValidPair(a, b)) return;
    const suggested = defaultPairLabel(a, b);
    // window.prompt is ugly but ships the feature today. A proper
    // inline input is a worthwhile v2 — for now the prompt is one line
    // of code and the label-naming flow is infrequent enough that it's
    // tolerable.
    const input =
      typeof window !== "undefined"
        ? window.prompt("Name this pair:", suggested)
        : null;
    if (input === null) return; // user cancelled
    const label = input.trim() || suggested;
    setSavedPairs((prev) => {
      const next = upsertSavedPair(prev, { a, b, label });
      writeSavedPairs(next);
      return next;
    });
  }, [a, b]);

  const remove = useCallback((slug: string) => {
    setSavedPairs((prev) => {
      const next = removeSavedPair(prev, slug);
      writeSavedPairs(next);
      return next;
    });
  }, []);

  const canSave = useMemo(() => isValidPair(a, b), [a, b]);

  const alreadyPresent = useMemo(
    () =>
      PAIR_PRESETS.some((p) => p.a === a && p.b === b) ||
      savedPairs.some((p) => p.a === a && p.b === b),
    [a, b, savedPairs],
  );

  return { savedPairs, save, remove, canSave, alreadyPresent };
}
