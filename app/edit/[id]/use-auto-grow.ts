"use client";

/**
 * A textarea that grows with its content, up to a ceiling, then scrolls.
 *
 * Both prompt boxes in the editor take instructions long enough to matter —
 * "replace the tabletop with dark walnut, keep the candle and the existing
 * lighting and shadows" is an ordinary one — and a fixed-height box hides
 * everything above the last line while you are still writing it. You cannot
 * check what you wrote before sending, which is exactly when checking counts.
 *
 * Two details that look optional and are not:
 *
 * · Height is reset to `auto` BEFORE reading scrollHeight. Without it the box
 *   only ever grows: scrollHeight is measured against the height already set,
 *   so deleting text leaves the old size behind forever.
 *
 * · useLayoutEffect, not useEffect. The measure-then-set happens before paint,
 *   so the box never renders one frame at the wrong height — which reads as a
 *   flicker on every keystroke that crosses a line boundary.
 */

import * as React from "react";

export function useAutoGrow<T extends HTMLTextAreaElement>(
  value: string,
  maxPx: number,
): React.RefObject<T | null> {
  const ref = React.useRef<T | null>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${next}px`;
    // Only scroll once there is genuinely more than fits; a permanent
    // scrollbar on a two-line box is noise.
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, [value, maxPx]);

  return ref;
}

/**
 * Enter sends, Shift+Enter starts a new line.
 *
 * `isComposing` is the one that gets forgotten: while an IME candidate window
 * is open — every CJK input method — Enter CONFIRMS the candidate. Submitting
 * on it sends a half-typed word and clears the box, which makes the product
 * feel broken in Chinese and fine in English.
 */
export function isSubmitKey(e: React.KeyboardEvent): boolean {
  if (e.key !== "Enter" || e.shiftKey) return false;
  const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
  return !native.isComposing;
}
