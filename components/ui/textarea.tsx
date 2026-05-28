import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full min-h-[110px] resize-none rounded-[10px] border border-border bg-panel px-3 py-2.5 text-[14px] leading-[1.5] text-ink placeholder:text-ink-mute focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
