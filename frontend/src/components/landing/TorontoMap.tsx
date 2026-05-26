import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, getZoneRegion } from "@/store";
import zonesRaw from "@/data/zonesFixture.json";

// ── SVG map projection ─────────────────────────────────────────────────────
const LNG_MIN = -79.66;
const LNG_MAX = -79.10;
const LAT_MIN = 43.565;
const LAT_MAX = 43.865;

const SVG_W = 520;
const SVG_H = 272;

function lngToX(lng: number) {
  return ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * SVG_W;
}
function latToY(lat: number) {
  return ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * SVG_H;
}

function ringToPath(ring: number[][], step = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < ring.length; i += step) {
    const [lng, lat] = ring[i];
    const x = lngToX(lng).toFixed(1);
    const y = latToY(lat).toFixed(1);
    pts.push(`${i === 0 ? "M" : "L"}${x},${y}`);
  }
  return pts.join(" ") + " Z";
}

// ── Region cards — canonical names must match RegionSelector exactly ───────
const REGION_CARDS = [
  { name: "All Toronto",  desc: "Simulate the entire city map. Recommended for high-end PCs." },
  { name: "Downtown",     desc: "Central commercial core, high-density residential and business hubs." },
  { name: "Midtown",      desc: "Upscale residential neighborhoods and mixed-use corridors." },
  { name: "North York",   desc: "Rapidly growing suburbs, transit hubs, and commercial centers." },
  { name: "Scarborough",  desc: "Sprawling suburbs with high solar potential and rooftop space." },
  { name: "Etobicoke",    desc: "Industrial-residential corridors with high wind power potential." },
  { name: "East Toronto", desc: "High-equity burden communities, green spaces, and beaches." },
  { name: "West Toronto", desc: "Artistic, creative hubs and transit-oriented corridors." },
];

// ── Carousel geometry — playing-card proportions (0.714 ratio) ────────────
//
// Cards are taller than they are wide, like poker cards (2.5:3.5).
// The strip is anchored at the screen bottom and only the top half of each
// card is visible (bottom half goes below the fold). The strip has
// overflow: visible so the centered active card can rise above the strip edge.

const CARD_W     = 200;  // card width px
const CARD_H     = 280;  // card height px (200 × 3.5/2.5 = 280)
const CARD_GAP   = 18;
const CARD_STRIDE = CARD_W + CARD_GAP;              // 218 px
const COPIES      = 3;
const SET_W       = REGION_CARDS.length * CARD_STRIDE; // 8 × 218 = 1744 px
const ALL_CARDS   = Array.from({ length: COPIES }, () => REGION_CARDS).flat();

const STRIP_H = Math.round(CARD_H / 2); // 140 px — visible top-half strip height
const RISE    = 72;  // px the centered card rises above the strip top

// ── Live zone counts ────────────────────────────────────────────────────────
type RawZone = {
  id: string;
  name: string;
  centroid: [number, number];
  polygon: { type: string; coordinates: number[][][][] };
};

const rawZones = zonesRaw as RawZone[];
const TOTAL_ZONES  = rawZones.length;
const TOTAL_AGENTS = 8001;

const zoneCounts: Record<string, number> = {};
for (const z of rawZones) {
  const r = getZoneRegion(z.name, z.centroid);
  zoneCounts[r] = (zoneCounts[r] ?? 0) + 1;
}

function getZoneCount(name: string) {
  return name === "All Toronto" ? TOTAL_ZONES : (zoneCounts[name] ?? 0);
}
function getAgentCount(name: string) {
  if (name === "All Toronto") return TOTAL_AGENTS;
  return Math.round((getZoneCount(name) / TOTAL_ZONES) * TOTAL_AGENTS);
}

// ── Processed zone data ────────────────────────────────────────────────────
type ZoneGeo = {
  id: string;
  name: string;
  centroid: [number, number];
  region: string;
  paths: string[];
  col: 0 | 1 | 2;
};

const processedZones: ZoneGeo[] = rawZones.map((z) => {
  const x = lngToX(z.centroid[0]);
  return {
    id: z.id,
    name: z.name,
    centroid: z.centroid,
    region: getZoneRegion(z.name, z.centroid),
    paths: z.polygon.coordinates.map((poly) => ringToPath(poly[0], 5)),
    col: (x < SVG_W / 3 ? 0 : x < (SVG_W * 2) / 3 ? 1 : 2) as 0 | 1 | 2,
  };
});

const twinkleZones = processedZones.filter((_, i) => i % 6 === 0);

// ── Component ───────────────────────────────────────────────────────────────

export function TorontoMap({ active = false }: { active?: boolean }) {
  const setSelectedRegion = useStore((s) => s.setSelectedRegion);

  const [activeRegion,  setActiveRegion]  = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Carousel refs — DOM-mutated directly in rAF for zero-jank scrolling
  const trackRef      = useRef<HTMLDivElement>(null);
  const offsetRef     = useRef(0);
  const pausedRef     = useRef(false);
  const prevActiveRef = useRef<string | null>(null);
  const rafRef        = useRef(0);

  // Draw-in: flip `revealed` 80ms after scope becomes active; reset on hide
  useEffect(() => {
    if (active) {
      const t = setTimeout(() => setRevealed(true), 80);
      return () => clearTimeout(t);
    }
    setRevealed(false);
  }, [active]);

  // rAF carousel — advances offset, wraps at SET_W, detects center card
  useEffect(() => {
    if (!active) return;

    const SPEED = 0.85; // px per frame at 60 fps

    const tick = () => {
      if (!pausedRef.current) {
        offsetRef.current += SPEED;
        if (offsetRef.current >= SET_W) offsetRef.current -= SET_W;
      }

      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(${-offsetRef.current}px)`;
      }

      // Center detection: the SINGLE card nearest the viewport horizontal midpoint
      if (!pausedRef.current) {
        const vcx = window.innerWidth / 2;
        let closest: string | null = null;
        let minDist = Infinity;
        for (let i = 0; i < REGION_CARDS.length * 2; i++) {
          const cardCx = i * CARD_STRIDE + CARD_W / 2 - offsetRef.current;
          const dist = Math.abs(cardCx - vcx);
          if (dist < minDist) {
            minDist = dist;
            closest = REGION_CARDS[i % REGION_CARDS.length].name;
          }
        }
        if (closest !== prevActiveRef.current) {
          prevActiveRef.current = closest;
          setActiveRegion(closest);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  const zonesByRegion = useMemo(() => {
    const map: Record<string, ZoneGeo[]> = {};
    for (const z of processedZones) {
      if (!map[z.region]) map[z.region] = [];
      map[z.region].push(z);
    }
    return map;
  }, []);

  const effectiveRegion  = hoveredRegion ?? activeRegion;
  const highlightAll     = effectiveRegion === "All Toronto";
  const highlightedRegion = highlightAll ? null : effectiveRegion;

  const colDelay = ["0ms", "140ms", "280ms"] as const;

  const handleMouseEnter = (name: string) => {
    pausedRef.current = true;
    setHoveredRegion(name);
  };
  const handleMouseLeave = () => {
    pausedRef.current = false;
    setHoveredRegion(null);
  };
  const handleClick = (name: string) => {
    setSelectedRegion(name);
    useStore.setState({ showRegionSelector: false });
  };

  return (
    <>
      <style>{`
        @keyframes zoneDrawIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotGridDrift {
          from { background-position: 0 0; }
          to   { background-position: 28px 28px; }
        }
        @keyframes voltGlowBreathe {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.08); }
        }
      `}</style>

      {/* ── Main container — overflow: visible so active cards can rise above strip ── */}
      <div
        className="fixed inset-0 z-[90] bg-background"
        style={{ overflow: "visible" }}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border px-8 py-4 flex items-baseline gap-4">
          <div>
            <p className="label inline" style={{ color: "hsl(var(--brand))" }}>Final step — </p>
            <span className="font-display text-lg font-bold text-foreground">Choose your scope.</span>
          </div>
          <span className="font-sans text-xs text-muted-foreground">
            Cards scroll automatically · hover to preview · click to begin
          </span>
        </div>

        {/* ── Map — fills space above the card strip ──────────────────────── */}
        <div
          className="relative flex flex-1 items-center justify-center"
          style={{
            position: "absolute",
            top: 53, // approximate header height
            left: 0, right: 0,
            bottom: STRIP_H, // leave room for visible card strip
            overflow: "hidden",
          }}
        >
          {/* Drifting volt dot-grid */}
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0,
              backgroundImage: "radial-gradient(circle, hsl(72 95% 50%) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              opacity: 0.07,
              animation: "dotGridDrift 22s linear infinite",
            }}
          />

          {/* Breathing radial volt glow */}
          <div
            aria-hidden
            style={{
              position: "absolute", top: "50%", left: "55%",
              transform: "translate(-50%, -50%)",
              width: 520, height: 520,
              borderRadius: "50%",
              background: "radial-gradient(circle, hsl(72 95% 50% / 0.1) 0%, transparent 68%)",
              animation: "voltGlowBreathe 5s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />

          {/* SVG map */}
          <div style={{ position: "relative", width: "min(840px, 90%)", aspectRatio: `${SVG_W} / ${SVG_H}` }}>
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid meet"
              style={{ display: "block", overflow: "visible" }}
              aria-label="Toronto neighbourhood map"
            >
              <rect width={SVG_W} height={SVG_H} fill="transparent" />

              {processedZones.map((zone) => {
                const isTarget =
                  highlightAll ||
                  (highlightedRegion !== null && zone.region === highlightedRegion);
                const fill   = isTarget ? "hsl(72 95% 50%)"     : "#e8e8e8";
                const stroke = isTarget ? "hsl(72 95% 30%)"     : "#cfcfcf";
                return zone.paths.map((d, pi) => (
                  <path
                    key={`${zone.id}-${pi}`}
                    d={d}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth="0.5"
                    style={{
                      transition: "fill 0.2s ease, stroke 0.2s ease",
                      opacity: revealed ? 1 : 0,
                      animation: revealed ? "zoneDrawIn 0.55s ease both" : "none",
                      animationDelay: revealed ? colDelay[zone.col] : "0ms",
                    }}
                  />
                ));
              })}

              {revealed &&
                twinkleZones.map((z, i) => {
                  const cx  = lngToX(z.centroid[0]).toFixed(1);
                  const cy  = latToY(z.centroid[1]).toFixed(1);
                  const dur = `${2.4 + (i % 5) * 0.6}s`;
                  const beg = `${(i % 7) * 0.4}s`;
                  return (
                    <circle key={z.id} cx={cx} cy={cy} r="2" fill="hsl(72 95% 50%)">
                      <animate attributeName="opacity" values="0;0.75;0" dur={dur} begin={beg} repeatCount="indefinite" />
                      <animate attributeName="r"       values="1.5;2.8;1.5" dur={dur} begin={beg} repeatCount="indefinite" />
                    </circle>
                  );
                })}

              {Object.entries(zonesByRegion).map(([region, zones]) => {
                if (zones.length === 0) return null;
                const avgX    = zones.reduce((s, z) => s + lngToX(z.centroid[0]), 0) / zones.length;
                const avgY    = zones.reduce((s, z) => s + latToY(z.centroid[1]), 0) / zones.length;
                const isActive = highlightedRegion === region || highlightAll;
                return (
                  <text
                    key={region}
                    x={avgX} y={avgY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="7"
                    fontFamily="Manrope, sans-serif"
                    fontWeight="600"
                    letterSpacing="0.04em"
                    fill={isActive ? "hsl(80 60% 12%)" : "#999"}
                    style={{ textTransform: "uppercase", transition: "fill 0.2s ease", opacity: revealed ? 1 : 0 }}
                    pointerEvents="none"
                  >
                    {region}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>

        {/* ── Playing-card carousel strip ──────────────────────────────────────
             Positioned so only the top STRIP_H px of each card is on-screen.
             overflow: visible allows the centered active card to rise above the
             strip's top edge into the map area without being clipped.
        ─────────────────────────────────────────────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            bottom: -(CARD_H - STRIP_H), // = -140px — only top half on screen
            left: 0,
            right: 0,
            height: CARD_H,
            overflow: "visible",
            zIndex: 10,
            perspective: "1100px",
            perspectiveOrigin: "50% 0%",
          }}
        >
          {/* Top hairline — visual separation between map and card tops */}
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0,
              height: 1,
              background: "linear-gradient(to right, transparent, hsl(var(--border) / 0.6) 20%, hsl(var(--border) / 0.6) 80%, transparent)",
              zIndex: 4,
              pointerEvents: "none",
            }}
          />

          {/* Left edge fade */}
          <div
            aria-hidden
            style={{
              position: "absolute", top: 0, left: 0,
              width: 88, height: STRIP_H,
              background: "linear-gradient(to right, hsl(var(--background)), transparent)",
              zIndex: 3, pointerEvents: "none",
            }}
          />
          {/* Right edge fade */}
          <div
            aria-hidden
            style={{
              position: "absolute", top: 0, right: 0,
              width: 88, height: STRIP_H,
              background: "linear-gradient(to left, hsl(var(--background)), transparent)",
              zIndex: 3, pointerEvents: "none",
            }}
          />

          {/* Track — transformed by rAF */}
          <div
            ref={trackRef}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: CARD_GAP,
              paddingInline: CARD_GAP,
              willChange: "transform",
              transformStyle: "preserve-3d",
              position: "absolute",
              top: 0, left: 0,
            }}
          >
            {ALL_CARDS.map((card, i) => {
              const isHovered     = hoveredRegion === card.name;
              const isCenterActive = !hoveredRegion && activeRegion === card.name;
              const isActive      = isHovered || isCenterActive;

              return (
                <button
                  key={i}
                  onMouseEnter={() => handleMouseEnter(card.name)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => handleClick(card.name)}
                  style={{
                    // Playing card dimensions
                    width: CARD_W,
                    height: CARD_H,
                    flexShrink: 0,

                    // Card face styling
                    borderRadius: 14,
                    border: `1.5px solid ${isActive ? "hsl(var(--brand))" : "hsl(var(--border) / 0.7)"}`,
                    background: isActive
                      ? "linear-gradient(160deg, #fff 0%, hsl(72 95% 98%) 100%)"
                      : "white",
                    padding: "20px 18px 0",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,

                    // Shadow — volt glow for active, subtle lift for inactive
                    boxShadow: isActive
                      ? "0 -6px 28px hsl(var(--brand) / 0.22), 0 2px 12px rgba(0,0,0,0.1)"
                      : "0 -2px 8px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.04)",

                    // 3D transforms:
                    // Inactive: slight rotateX tilt — like cards lying on a table
                    // Active: stands upright and rises above the strip into map area
                    transform: isActive
                      ? `translateY(-${RISE}px) rotateX(0deg) scale(1.05)`
                      : "rotateX(5deg)",
                    transformOrigin: "bottom center",
                    transition: [
                      "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
                      "border-color 0.2s ease",
                      "box-shadow 0.2s ease",
                      "background 0.2s ease",
                    ].join(", "),
                    willChange: "transform",

                    // Only pointer-events on the visible strip portion
                    pointerEvents: "auto",
                  }}
                >
                  {/* Region name */}
                  <span
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      fontFamily: "Space Grotesk, sans-serif",
                      color: isActive ? "hsl(var(--foreground))" : "#1a1a1a",
                      letterSpacing: "-0.01em",
                      transition: "color 0.2s ease",
                    }}
                  >
                    {card.name}
                  </span>

                  {/* Description — 2-line clamp */}
                  <span
                    style={{
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: "#9a9a9a",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {card.desc}
                  </span>

                  {/* Zone & agent counts — stays in top half */}
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                      color: isActive ? "hsl(var(--brand) / 0.8)" : "#c0c0c0",
                      marginTop: "auto",
                      paddingBottom: 16,
                      transition: "color 0.2s ease",
                    }}
                  >
                    {getZoneCount(card.name)} zones · {getAgentCount(card.name).toLocaleString()} agents
                  </span>

                  {/* Volt accent stripe — decorative bottom-of-card element (below fold) */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0, left: 0, right: 0,
                      height: 4,
                      borderRadius: "0 0 13px 13px",
                      background: isActive ? "hsl(var(--brand))" : "transparent",
                      transition: "background 0.2s ease",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
