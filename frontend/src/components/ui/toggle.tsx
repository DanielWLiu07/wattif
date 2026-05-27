import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Flat toggle button — pressed state fills ink; volt variant for brand state. */
const toggleVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-border bg-transparent text-muted-foreground hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-transparent",
        volt:
          "border border-border bg-transparent text-muted-foreground hover:bg-muted data-[state=on]:bg-brand data-[state=on]:text-brand-ink data-[state=on]:border-transparent",
      },
      size: {
        sm: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
        md: "h-9 px-3 text-sm [&_svg]:size-4",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-7 w-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
);

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
    VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(toggleVariants({ variant, size, className }))}
    {...props}
  />
));
Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };
