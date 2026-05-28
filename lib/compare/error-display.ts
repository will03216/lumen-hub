/**
 * Display metadata for error categories — short label + accent colour —
 * shared between the error tile (`app/compare/compare-panel.tsx`) and the
 * legend popover (`app/compare/error-legend.tsx`).
 *
 * Why a separate module: the classifier in `error-class.ts` is pure logic
 * and shouldn't care what colour the UI paints. But the label "Blocked"
 * and its red dot DO need to live in exactly one place so the tile's
 * eyebrow tag and the legend row can't drift apart (that would read as a
 * bug to anyone cross-referencing the two surfaces).
 *
 * Colour system:
 *   · red    — user must change the input (retry won't help)
 *   · orange — transient upstream or limiter (auto-retry may fire)
 *   · yellow — time-bound issue (polling ceiling / expired task)
 *   · dim    — unclassified fallback
 *
 * oklch values tuned against the existing tile palette so error states
 * don't visually crash the UI — saturation held moderate, lightness kept
 * legible on the dark theme.
 */

import type { ErrorType } from "./error-class";

export type ErrorDisplay = { label: string; color: string };

export const ERROR_DISPLAY: Record<ErrorType, ErrorDisplay> = {
  moderation: { label: "Blocked", color: "oklch(0.70 0.20 25)" }, // red
  "invalid-input": { label: "Rejected", color: "oklch(0.70 0.20 25)" }, // red
  "rate-limit": { label: "Rate limited", color: "oklch(0.80 0.17 55)" }, // orange
  server: { label: "Upstream", color: "oklch(0.80 0.17 55)" }, // orange
  network: { label: "Network", color: "oklch(0.80 0.17 55)" }, // orange
  timeout: { label: "Timed out", color: "oklch(0.85 0.14 90)" }, // yellow
  "task-expired": { label: "Expired", color: "oklch(0.85 0.14 90)" }, // yellow
  unknown: { label: "Failed", color: "oklch(0.70 0.02 260)" }, // neutral dim
};
