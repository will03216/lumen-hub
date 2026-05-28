import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer hover:-translate-y-px",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--line-strong)] bg-transparent text-ink hover:border-ink",
        primary:
          "bg-accent text-accent-ink border border-accent hover:opacity-95",
        ghost: "text-ink hover:bg-[var(--line)]",
        secondary:
          "border border-[var(--line)] bg-panel text-ink hover:border-[var(--line-strong)]",
      },
      size: {
        sm: "h-7 px-2.5 text-[11px]",
        md: "h-10 px-4 text-[13px]",
        lg: "h-12 px-5 text-[14px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
