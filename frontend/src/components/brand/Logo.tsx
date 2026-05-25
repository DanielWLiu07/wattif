import { cn } from "@/lib/utils";

/**
 * WattIf brand identity.
 * Mark = a custom "volt" energy bolt (brand-owned, not a Phosphor glyph).
 * Wordmark = Space Grotesk, with the volt bolt crossing the "t"s of Watt.
 * One accent at a time — the bolt carries the only color.
 */

const SIZES = {
  sm: { box: "h-5 w-5", text: "text-base", gap: "gap-1.5" },
  md: { box: "h-7 w-7", text: "text-xl", gap: "gap-2" },
  lg: { box: "h-10 w-10", text: "text-3xl", gap: "gap-2.5" },
} as const;

type Size = keyof typeof SIZES;

/** The bare volt bolt — currentColor by default so it adapts to context. */
export function VoltBolt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      {/* off-axis lightning bolt — sharper than the generic glyph */}
      <path d="M13.8 1.5 4.2 13.2a.9.9 0 0 0 .69 1.48h5.04l-1.62 7.5a.45.45 0 0 0 .8.36l9.78-11.82a.9.9 0 0 0-.69-1.48h-5.1l1.62-7.32a.45.45 0 0 0-.8-.36Z" />
    </svg>
  );
}

/** Mark = bolt in a rounded ink tile (or volt tile). Use alone as an app icon. */
export function LogoMark({
  size = "md",
  tone = "ink",
  className,
}: {
  size?: Size;
  tone?: "ink" | "volt" | "bare";
  className?: string;
}) {
  const s = SIZES[size];
  if (tone === "bare") {
    return <VoltBolt className={cn(s.box, "text-brand", className)} />;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius)]",
        tone === "ink" ? "bg-primary" : "bg-brand",
        s.box,
        className
      )}
    >
      <VoltBolt
        className={cn(
          "h-[68%] w-[68%]",
          tone === "ink" ? "text-brand" : "text-brand-ink"
        )}
      />
    </span>
  );
}

/** Full lockup — mark + "WattIf" wordmark in Space Grotesk. */
export function Logo({
  size = "md",
  tone = "ink",
  showWordmark = true,
  className,
}: {
  size?: Size;
  tone?: "ink" | "volt" | "bare";
  showWordmark?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-center", s.gap, className)}>
      <LogoMark size={size} tone={tone} />
      {showWordmark && (
        <span
          className={cn(
            "font-display font-bold leading-none tracking-tight text-foreground",
            s.text
          )}
        >
          Watt<span className="text-muted-foreground">If</span>
        </span>
      )}
    </span>
  );
}

export default Logo;
