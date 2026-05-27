import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * WattIf brand identity.
 * Mark = a flat-top hexagon "node" tile holding a volt energy bolt, a faint
 *        circuit grid on the left, and three circuit nodes branching right —
 *        the grid being sited, energized.
 * Wordmark = Space Grotesk, "Watt" in ink + "If" in volt.
 * One accent at a time — the bolt + nodes carry the only colour.
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
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M13.8 1.5 4.2 13.2a.9.9 0 0 0 .69 1.48h5.04l-1.62 7.5a.45.45 0 0 0 .8.36l9.78-11.82a.9.9 0 0 0-.69-1.48h-5.1l1.62-7.32a.45.45 0 0 0-.8-.36Z" />
    </svg>
  );
}

/**
 * Mark = the hexagon node tile. Use alone as an app icon.
 * `tone="bare"` falls back to just the volt bolt (no tile) for tight spaces.
 */
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
  const gid = useId().replace(/:/g, "");

  if (tone === "bare") {
    return <VoltBolt className={cn(s.box, "text-brand", className)} />;
  }

  const tile = tone === "volt" ? "hsl(var(--brand))" : "#101014";
  const boltStart = tone === "volt" ? "#101014" : "hsl(72 95% 56%)";
  const boltEnd   = tone === "volt" ? "#23310a" : "hsl(140 68% 52%)";
  const node      = tone === "volt" ? "#101014" : "#4ade80";
  const grid      = tone === "volt" ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.16)";

  return (
    <svg viewBox="0 0 64 64" className={cn(s.box, className)} aria-hidden>
      <defs>
        <linearGradient id={`bolt-${gid}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={boltStart} />
          <stop offset="100%" stopColor={boltEnd} />
        </linearGradient>
      </defs>

      {/* Hexagon tile — flat-top, rounded via a round-joined stroke */}
      <polygon
        points="5,32 18.5,8.6 45.5,8.6 59,32 45.5,55.4 18.5,55.4"
        fill={tile}
        stroke={tile}
        strokeWidth="6"
        strokeLinejoin="round"
      />

      {/* Faint circuit grid on the left */}
      <g stroke={grid} strokeWidth="1.4">
        <line x1="16" y1="15" x2="16" y2="49" />
        <line x1="24" y1="15" x2="24" y2="49" />
        <line x1="11" y1="23" x2="29" y2="23" />
        <line x1="11" y1="41" x2="29" y2="41" />
      </g>
      <g fill={tone === "volt" ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.85)"}>
        <circle cx="16" cy="23" r="1.9" />
        <circle cx="24" cy="41" r="1.9" />
      </g>

      {/* Circuit traces + nodes branching right from the bolt */}
      <g stroke={node} strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M37 30 L46 22" />
        <path d="M38 33 L50 33" />
        <path d="M37 37 L46 44" />
      </g>
      <g fill={node}>
        <circle cx="47.5" cy="21" r="3" />
        <circle cx="51.5" cy="33" r="3" />
        <circle cx="47.5" cy="45" r="3" />
      </g>

      {/* Volt energy bolt, centred */}
      <path
        d="M35 13 L22 35 L31 35 L28 51 L42 28 L33 28 Z"
        fill={`url(#bolt-${gid})`}
        stroke={tile}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
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
          Watt<span className="text-brand">If?</span>
        </span>
      )}
    </span>
  );
}

export default Logo;
