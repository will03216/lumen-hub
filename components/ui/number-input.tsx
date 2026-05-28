import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * NumberInput — the styled `<input type="number">` we ship across Studio
 * + Compare. Seed inputs (the dominant case) keep their value as a
 * string in form state so a half-typed value ("12") doesn't get rejected
 * by Number()'s NaN sniffing on every keystroke; consumers parse to
 * number at the boundary where they need the int.
 *
 * Numeric-keyboard hint via `inputMode="numeric"` so mobile keyboards
 * surface digits even when the field is empty (where the browser's own
 * type=number heuristics sometimes default to a full keyboard).
 *
 * Why not also encapsulate clamped numeric inputs (image-generator's
 * Count): those carry bespoke clamp-on-change semantics — the empty
 * state isn't meaningful, the value is a number not a string. Folding
 * them in here would force one of the two consumer shapes to bend.
 */
export const NumberInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="number"
      inputMode="numeric"
      className={cn(
        "h-10 w-full rounded-[10px] border border-border bg-panel px-3 text-[13px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors",
        className,
      )}
      {...props}
    />
  );
});
NumberInput.displayName = "NumberInput";
