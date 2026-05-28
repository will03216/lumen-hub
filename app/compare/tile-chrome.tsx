/**
 * Non-success chrome shared by ImageResultTile and VideoResultTile.
 * Co-located so the two tiles can't drift on framing, idle graphic, or
 * error styling — and so ErrorTileBody stays in lockstep with the
 * `ERROR_DISPLAY` source the legend popover also reads from.
 */

import { Chip } from "@/components/ui/chip";
import { CornerTicks } from "@/components/ui/placeholder-tile";
import { cn } from "@/lib/utils";
import type { ErrorClass } from "@/lib/compare/error-class";
import { ERROR_DISPLAY } from "@/lib/compare/error-display";

export function TileFrame({
  ratio,
  shimmer,
  children,
}: {
  ratio: string;
  shimmer?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[12px] border border-border bg-bg-2",
        shimmer && "animate-shimmer",
      )}
      style={{ aspectRatio: ratio }}
    >
      <CornerTicks />
      {children}
    </div>
  );
}

export function EmptyOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      {/* Technical-drawing grid — SVG dots on a 24px lattice, masked to
          fade at the edges so the grid looks like it's BEHIND the
          eyebrow rather than running under the frame. Sits at very low
          opacity so it reads as texture, not content. Pointer-events
          off: it's decoration.

          `mask-image` ensures the grid dots don't crash against the
          rounded frame corners — they dim to nothing before reaching
          the border. CSS mask has wide enough support to ship without
          a fallback; older browsers just see a flat grid, which is
          still fine. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(242,240,232,0.10) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          backgroundPosition: "12px 12px",
          maskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.85) 40%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.85) 40%, transparent 80%)",
        }}
      />
      {/* Concentric crosshair — two faint circles + a plus sign at the
          dead-centre, echoing the `CornerTicks` language already used
          on the frame. Tells the user "this is where the render will
          land" without needing a literal "+ render here" label. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        width="96"
        height="96"
        viewBox="0 0 96 96"
        fill="none"
      >
        <circle
          cx="48"
          cy="48"
          r="36"
          stroke="rgba(242,240,232,0.08)"
          strokeWidth="1"
        />
        <circle
          cx="48"
          cy="48"
          r="20"
          stroke="rgba(242,240,232,0.12)"
          strokeWidth="1"
        />
        {/* Plus sign — 8px arms, centred */}
        <path
          d="M48 40 L48 56 M40 48 L56 48"
          stroke="rgba(242,240,232,0.35)"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
      <div className="relative text-center">
        <div
          className="font-serif italic leading-none pointer-events-none select-none"
          style={{ fontSize: "clamp(48px, 9vw, 96px)", color: "rgba(242,240,232,0.08)" }}
        >
          lumen
        </div>
        <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          {label}
        </div>
      </div>
    </div>
  );
}

export function ErrorTileBody({
  errorClass,
  attempts,
  onReset,
  onRetry,
}: {
  errorClass: ErrorClass;
  attempts: number;
  onReset: () => void;
  /** Undefined when the shell has no snapshot to re-run. We also suppress
   *  Retry when `errorClass.retryable === false` (moderation / invalid-
   *  input) — same input will fail the same way, and showing a Retry chip
   *  that always fails is worse than hiding it. */
  onRetry?: () => void;
}) {
  const accent = ERROR_DISPLAY[errorClass.type];
  const showRetry = Boolean(onRetry) && errorClass.retryable;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
      <div
        className="font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ color: accent.color }}
      >
        {accent.label}
      </div>
      <div className="text-[13px] font-medium leading-tight text-ink">
        {errorClass.title}
      </div>
      <p className="max-w-[320px] text-[12px] leading-relaxed text-ink-dim">
        {errorClass.detail}
      </p>
      {/* attempts === 2 means we silently retried once and still failed —
          mention it so the user knows a bare Retry probably won't help. */}
      {attempts > 1 && (
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim/80">
          Auto-retried · still failed
        </div>
      )}
      <div className="mt-1 flex gap-1.5">
        {showRetry && (
          <Chip accent onClick={onRetry}>
            Retry
          </Chip>
        )}
        <Chip onClick={onReset}>Dismiss</Chip>
      </div>
    </div>
  );
}
