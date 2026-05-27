import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * WattIf button — flat, monochrome, pill by default.
 * No gradients, no drop-shadows: structure comes from fills + 1px borders.
 *   default    → solid ink (black on light / white on dark)
 *   outline    → transparent + hairline border
 *   ghost      → no border, hover fill
 *   secondary  → muted fill
 *   volt       → brand accent (use sparingly — one accent per surface)
 *   destructive→ alert action
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-muted",
        ghost: "bg-transparent text-foreground hover:bg-muted",
        secondary:
          "bg-muted text-foreground hover:bg-muted/70",
        volt: "bg-brand text-brand-ink hover:bg-brand/85",
        accent: "bg-brand text-brand-ink hover:bg-brand/85",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/85",
      },
      size: {
        default: "h-9 px-4 text-sm [&_svg]:size-4",
        sm: "h-7 px-3 text-xs [&_svg]:size-3.5",
        lg: "h-11 px-6 text-base [&_svg]:size-5",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-7 w-7 [&_svg]:size-3.5",
      },
      shape: {
        pill: "rounded-full",
        rounded: "rounded-[var(--radius)]",
      },
    },
    defaultVariants: { variant: "default", size: "default", shape: "pill" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shape, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, shape, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
