"use client";

/**
 * useCompareShortcuts — page-global keyboard handlers for the Compare
 * surface. Bound at document level so they fire regardless of which
 * field has focus (the prompt textarea no longer carries its own ⌘↵
 * binding; this is the single source).
 *
 *   · ⌘↵  / Ctrl+↵   → render both (matches the header hint and the
 *                      "Render both ↵" button label)
 *   · ⌘S  / Ctrl+S   → save current pair (preventDefault to block the
 *                      browser's "Save Page As…" dialog; no-op when
 *                      `canSave` is false or `alreadyPresent` is true)
 *   · ⌘⇧L / Ctrl+⇧L → copy link (⌘L is reserved by browsers for the
 *                      address bar, so the Compare variant requires
 *                      Shift)
 *
 * Lifted out of compare-shell.tsx so the shell stays focused on
 * orchestration; the hook owns the document listener lifecycle and
 * the shortcut → gate → action wiring in one place. Adding a new
 * shortcut means touching this file rather than threading another
 * dep through the shell's already-busy useEffect array.
 */

import { useEffect } from "react";

export function useCompareShortcuts(opts: {
  /** True when the Render-both button would be enabled. The handler
   *  no-ops otherwise so ⌘↵ never fires a render the button itself
   *  wouldn't accept. */
  canRender: boolean;
  onRender: () => void;
  /** True when the current (a, b) is a valid, savable pair. */
  canSave: boolean;
  /** True when the pair is already represented as a chip — ⌘S no-ops
   *  here so the shortcut doesn't spawn a label prompt for nothing. */
  alreadyPresent: boolean;
  onSave: () => void;
  onCopyLink: () => void | Promise<void>;
}): void {
  const { canRender, onRender, canSave, alreadyPresent, onSave, onCopyLink } =
    opts;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (canRender) onRender();
        return;
      }
      // e.key is "S" under Shift; lowercase for a stable comparison.
      // Gate on shiftKey separately to distinguish ⌘S vs ⌘⇧S, ⌘L vs ⌘⇧L.
      const key = e.key.toLowerCase();
      if (key === "s" && !e.shiftKey) {
        e.preventDefault();
        if (canSave && !alreadyPresent) onSave();
        return;
      }
      if (key === "l" && e.shiftKey) {
        e.preventDefault();
        void onCopyLink();
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canRender, onRender, canSave, alreadyPresent, onSave, onCopyLink]);
}
