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
const CARD_W     = 228;
const CARD_H     = 320;
const CARD_GAP   = 18;
const CARD_STRIDE = CARD_W + CARD_GAP;
const COPIES      = 3;
const SET_W       = REGION_CARDS.length * CARD_STRIDE;
const ALL_CARDS   = Array.from({ length: COPIES }, () => REGION_CARDS).flat();

const STRIP_H = Math.round(CARD_H / 2); // 160 px — visible top-half
const RISE    = 80;                      // px the centered card rises above strip

// ── Scroll speed constants ─────────────────────────────────────────────────
// When hovering the strip, mouse position drives scroll speed:
//   center of viewport → near-stop (dead zone)
//   left  → scrolls right-to-left (negative, so cards move rightward)
//   right → scrolls left-to-right (positive, cards move leftward)
// Speed is eased with a lerp so direction changes feel smooth.
const DEFAULT_SPEED = 0.8;   // px/frame when not hovering
const MAX_SCRUB     = 3.5;   // px/frame max when scrubbing
const DEAD_ZONE     = 0.10;  // ±10% of half-width → near-stop
const SPEED_LERP    = 0.055; // how fast speed transitions (lower = smoother)

// ── Live zone counts ────────────────────────────────────────────────────────
type RawZone = {
  id: string;
  name: string;
  centroid: [number, number];
  polygon: { type: string; coordinates: number[][][][] };
};

const rawZones     = zonesRaw as RawZone[];
const TOTAL_ZONES  = rawZones.length;
const TOTAL_AGENTS = 8001;

const zoneCounts: Record<string, number> = {};
for (const z of rawZones) {
  const r = getZoneRegion(z.name, z.centroid);
  zoneCounts[r] = (zoneCounts[r] ?? 0) + 1;
}

function getZoneCount(name: string)  { return name === "All Toronto" ? TOTAL_ZONES : (zoneCounts[name] ?? 0); }
function getAgentCount(name: string) {
  if (name === "All Toronto") return TOTAL_AGENTS;
  return Math.round((getZoneCount(name) / TOTAL_ZONES) * TOTAL_AGENTS);
}

// ── Processed zone data ────────────────────────────────────────────────────
type ZoneGeo = {
  id: string; name: string; centroid: [number, number];
  region: string; paths: string[]; col: 0 | 1 | 2;
};

const processedZones: ZoneGeo[] = rawZones.map((z) => {
  const x = lngToX(z.centroid[0]);
  return {
    id: z.id, name: z.name, centroid: z.centroid,
    region: getZoneRegion(z.name, z.centroid),
    paths: z.polygon.coordinates.map((poly) => ringToPath(poly[0], 5)),
    col: (x < SVG_W / 3 ? 0 : x < (SVG_W * 2) / 3 ? 1 : 2) as 0 | 1 | 2,
  };
});

const twinkleZones = processedZones.filter((_, i) => i % 6 === 0);

// ── Component ───────────────────────────────────────────────────────────────

export function TorontoMap({ active = false }: { active?: boolean }) {
  const setSelectedRegion = useStore((s) => s.setSelectedRegion);

  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Carousel + speed control refs — all DOM-mutated in rAF for zero-jank
  const trackRef      = useRef<HTMLDivElement>(null);
  const offsetRef     = useRef(0);
  const prevActiveRef = useRef<string | null>(null);
  const rafRef        = useRef(0);

  // Speed scrub state
  const currentSpeedRef = useRef(DEFAULT_SPEED); // actual lerped speed this frame
  const mouseXRef       = useRef(0);             // last known mouse X in viewport
  const isOverStripRef  = useRef(false);         // is mouse over the card strip?

  useEffect(() => {
    if (active) {
      const t = setTimeout(() => setRevealed(true), 80);
      return () => clearTimeout(t);
    }
    setRevealed(false);
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const tick = () => {
      // ── Compute target speed from mouse position ────────────────────────
      let targetSpeed: number;
      if (isOverStripRef.current) {
        const vcx  = window.innerWidth / 2;
        const norm = (mouseXRef.current - vcx) / vcx; // -1 (left) → 0 (center) → 1 (right)
        const sign = norm < 0 ? -1 : 1;
        const abs  = Math.abs(norm);
        // Dead zone at center → near-stop; outside → ramp up to MAX_SCRUB
        targetSpeed = abs < DEAD_ZONE
          ? 0
          : sign * ((abs - DEAD_ZONE) / (1 - DEAD_ZONE)) * MAX_SCRUB;
      } else {
        targetSpeed = DEFAULT_SPEED;
      }

      // Ease current speed toward target
      currentSpeedRef.current += (targetSpeed - currentSpeedRef.current) * SPEED_LERP;

      // Advance offset (bidirectional — negative offset allowed for leftward scroll)
      offsetRef.current += currentSpeedRef.current;
      if (offsetRef.current >= SET_W) offsetRef.current -= SET_W;
      if (offsetRef.current < 0)      offsetRef.current += SET_W;

      // Apply transform directly — no React re-render per frame
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(${-offsetRef.current}px)`;
      }

      // Center detection: the card nearest the viewport horizontal midpoint
      const vcx = window.innerWidth / 2;
      let closest: string | null = null;
      let minDist = Infinity;
      for (let i = 0; i < REGION_CARDS.length * 2; i++) {
        const cardCx = i * CARD_STRIDE + CARD_W / 2 - offsetRef.current;
        const dist   = Math.abs(cardCx - vcx);
        if (dist < minDist) { minDist = dist; closest = REGION_CARDS[i % REGION_CARDS.length].name; }
      }
      if (closest !== prevActiveRef.current) {
        prevActiveRef.current = closest;
        setActiveRegion(closest);
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

  // Map highlight follows the centered card (no hover override — scrub to choose)
  const effectiveRegion   = activeRegion;
  const highlightAll      = effectiveRegion === "All Toronto";
  const highlightedRegion = highlightAll ? null : effectiveRegion;

  const colDelay = ["0ms", "140ms", "280ms"] as const;

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

      <div
        className="fixed inset-0 z-[90] bg-background"
        style={{ overflow: "visible" }}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="border-b border-border px-8 py-4 flex items-baseline gap-4">
          <div>
            <p className="label inline" style={{ color: "hsl(var(--brand))" }}>Final step — </p>
            <span className="font-display text-lg font-bold text-foreground">Choose your scope.</span>
          </div>
          <span className="font-sans text-xs text-muted-foreground">
            Hover near center to slow · scrub left/right · click to begin
          </span>
        </div>

        {/* ── Map ─────────────────────────────────────────────────────────── */}
        <div
          className="relative flex flex-1 items-center justify-center"
          style={{
            position: "absolute",
            top: 53,
            left: 0, right: 0,
            bottom: STRIP_H,
            overflow: "hidden",
          }}
        >
          <div aria-hidden style={{
            position: "absolute", inset: 0,
            backgroundImage: "radial-gradient(circle, hsl(72 95% 50%) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            opacity: 0.07,
            animation: "dotGridDrift 22s linear infinite",
          }} />

          <div aria-hidden style={{
            position: "absolute", top: "50%", left: "55%",
            transform: "translate(-50%, -50%)",
            width: 520, height: 520,
            borderRadius: "50%",
            background: "radial-gradient(circle, hsl(72 95% 50% / 0.1) 0%, transparent 68%)",
            animation: "voltGlowBreathe 5s ease-in-out infinite",
            pointerEvents: "none",
          }} />

          <div style={{ position: "relative", width: "min(840px, 90%)", aspectRatio: `${SVG_W} / ${SVG_H}` }}>
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              width="100%" height="100%"
              preserveAspectRatio="xMidYMid meet"
              style={{ display: "block", overflow: "visible" }}
              aria-label="Toronto neighbourhood map"
            >
              <rect width={SVG_W} height={SVG_H} fill="transparent" />

              {processedZones.map((zone) => {
                const isTarget = highlightAll || (highlightedRegion !== null && zone.region === highlightedRegion);
                const fill   = isTarget ? "hsl(72 95% 50%)" : "#e8e8e8";
                const stroke = isTarget ? "hsl(72 95% 30%)" : "#cfcfcf";
                return zone.paths.map((d, pi) => (
                  <path key={`${zone.id}-${pi}`} d={d} fill={fill} stroke={stroke} strokeWidth="0.5"
                    style={{
                      transition: "fill 0.25s ease, stroke 0.25s ease",
                      opacity: revealed ? 1 : 0,
                      animation: revealed ? "zoneDrawIn 0.55s ease both" : "none",
                      animationDelay: revealed ? colDelay[zone.col] : "0ms",
                    }}
                  />
                ));
              })}

              {revealed && twinkleZones.map((z, i) => {
                const cx = lngToX(z.centroid[0]).toFixed(1);
                const cy = latToY(z.centroid[1]).toFixed(1);
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
                if (!zones.length) return null;
                const avgX    = zones.reduce((s, z) => s + lngToX(z.centroid[0]), 0) / zones.length;
                const avgY    = zones.reduce((s, z) => s + latToY(z.centroid[1]), 0) / zones.length;
                const isActive = highlightedRegion === region || highlightAll;
                return (
                  <text key={region} x={avgX} y={avgY}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="7" fontFamily="Manrope, sans-serif" fontWeight="600" letterSpacing="0.04em"
                    fill={isActive ? "hsl(80 60% 12%)" : "#999"}
                    style={{ textTransform: "uppercase", transition: "fill 0.25s ease", opacity: revealed ? 1 : 0 }}
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
             bottom: -(CARD_H - STRIP_H) = -140 px → only the top STRIP_H=140 px
             of each 280 px card is on-screen. overflow: visible allows the
             centered active card to rise above the strip edge into the map.
             Mouse events on this div drive the speed-scrub logic.
        ─────────────────────────────────────────────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            bottom: -(CARD_H - STRIP_H),
            left: 0, right: 0,
            height: CARD_H,
            overflow: "visible",
            zIndex: 10,
            perspective: "1100px",
            perspectiveOrigin: "50% 0%",
          }}
          onMouseMove={(e) => {
            mouseXRef.current    = e.clientX;
            isOverStripRef.current = true;
          }}
          onMouseLeave={() => {
            isOverStripRef.current = false;
          }}
        >
          {/* Top hairline */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1,
            background: "linear-gradient(to right, transparent, hsl(var(--border) / 0.6) 20%, hsl(var(--border) / 0.6) 80%, transparent)",
            zIndex: 4, pointerEvents: "none",
          }} />

          {/* Edge fades — clipped to visible strip height */}
          <div aria-hidden style={{
            position: "absolute", top: 0, left: 0, width: 88, height: STRIP_H,
            background: "linear-gradient(to right, hsl(var(--background)), transparent)",
            zIndex: 3, pointerEvents: "none",
          }} />
          <div aria-hidden style={{
            position: "absolute", top: 0, right: 0, width: 88, height: STRIP_H,
            background: "linear-gradient(to left, hsl(var(--background)), transparent)",
            zIndex: 3, pointerEvents: "none",
          }} />

          {/* Speed-scrub hint — always visible above the strip */}
          <div style={{
            position: "absolute", top: -22, left: "50%",
            transform: "translateX(-50%)",
            fontFamily: "monospace", fontSize: 10,
            color: "hsl(var(--muted-foreground) / 0.4)",
            pointerEvents: "none", zIndex: 5,
            whiteSpace: "nowrap",
          }}>
            ← scrub · center = slow · click to begin →
          </div>

          {/* Track */}
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
              const isActive = activeRegion === card.name;

              return (
                <button
                  key={i}
                  onClick={() => handleClick(card.name)}
                  style={{
                    width: CARD_W,
                    height: CARD_H,
                    flexShrink: 0,
                    borderRadius: 16,
                    border: `1.5px solid ${isActive ? "hsl(var(--brand))" : "hsl(var(--border) / 0.7)"}`,
                    background: isActive
                      ? "linear-gradient(160deg, #fff 0%, hsl(72 95% 97%) 100%)"
                      : "white",
                    padding: "22px 20px 0",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                    boxShadow: isActive
                      ? "0 -8px 32px hsl(var(--brand) / 0.25), 0 2px 14px rgba(0,0,0,0.1)"
                      : "0 -2px 8px rgba(0,0,0,0.05)",
                    // Active: stands upright + rises above strip (into map area)
                    // Inactive: lean back at rotateX to suggest cards-on-table depth
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
                    pointerEvents: "auto",
                  }}
                >
                  {/* Region name */}
                  <span style={{
                    fontSize: 18, fontWeight: 700, lineHeight: 1.15,
                    fontFamily: "Space Grotesk, sans-serif",
                    color: isActive ? "hsl(var(--foreground))" : "#1a1a1a",
                    letterSpacing: "-0.015em",
                    transition: "color 0.2s ease",
                    display: "block",
                    marginBottom: 8,
                  }}>
                    {card.name}
                  </span>

                  {/* Zone + agent counts — above the fold */}
                  <span style={{
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                    color: isActive ? "hsl(var(--brand))" : "#b0b0b0",
                    transition: "color 0.2s ease",
                    display: "block",
                    marginBottom: 10,
                    letterSpacing: "0.02em",
                  }}>
                    {getZoneCount(card.name)} zones · {getAgentCount(card.name).toLocaleString()} agents
                  </span>

                  {/* Hairline divider */}
                  <div style={{
                    height: 1,
                    background: isActive ? "hsl(var(--brand) / 0.2)" : "hsl(var(--border) / 0.5)",
                    marginBottom: 10,
                    transition: "background 0.2s ease",
                  }} />

                  {/* Description */}
                  <span style={{
                    fontSize: 11, lineHeight: 1.55, color: "#8a8a8a",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {card.desc}
                  </span>

                  {/* Volt accent stripe at bottom of card face (below fold normally) */}
                  <div style={{
                    position: "absolute",
                    bottom: 0, left: 0, right: 0, height: 4,
                    borderRadius: "0 0 15px 15px",
                    background: isActive ? "hsl(var(--brand))" : "transparent",
                    transition: "background 0.2s ease",
                  }} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
