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
const CARD_W     = 300;
const CARD_H     = 340;
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
const WHEEL_FACTOR   = 0.35;  // wheel delta → scrub velocity
const WHEEL_FRICTION = 0.92;  // per-frame scrub velocity decay
const WHEEL_MAX      = 45;    // clamp scrub velocity
const AUTO_ADVANCE_FRAMES = 150; // ~2.5s settled on a card before auto-advancing

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

// ── Land area per region (km²), derived from real polygons via the shoelace
//    formula on an equirectangular projection at Toronto's latitude ──────────
const LAT_REF_RAD = ((LAT_MIN + LAT_MAX) / 2) * (Math.PI / 180);
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG = 111.320 * Math.cos(LAT_REF_RAD);

function ringAreaKm2(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[(i + 1) % ring.length];
    sum += (lng1 * KM_PER_DEG_LNG) * (lat2 * KM_PER_DEG_LAT)
         - (lng2 * KM_PER_DEG_LNG) * (lat1 * KM_PER_DEG_LAT);
  }
  return Math.abs(sum) / 2;
}

const areaByRegion: Record<string, number> = {};
let TOTAL_AREA = 0;
for (const z of rawZones) {
  const r = getZoneRegion(z.name, z.centroid);
  let a = 0;
  for (const poly of z.polygon.coordinates) a += ringAreaKm2(poly[0]);
  areaByRegion[r] = (areaByRegion[r] ?? 0) + a;
  TOTAL_AREA += a;
}

function getAreaKm2(name: string) { return name === "All Toronto" ? TOTAL_AREA : (areaByRegion[name] ?? 0); }

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


// ── Side-panel stat row ───────────────────────────────────────────────────
function StatItem({ label, value, accent = false, align = "left" }: {
  label: string; value: string; accent?: boolean; align?: "left" | "right";
}) {
  return (
    <div style={{ marginBottom: 16, textAlign: align }}>
      <div style={{
        fontFamily: "monospace", fontSize: 9, letterSpacing: "0.14em",
        textTransform: "uppercase", color: "hsl(var(--foreground) / 0.4)",
        marginBottom: 3,
      }}>
        {label}
      </div>
      {/* key={value} re-mounts on change → the swap animation replays */}
      <div
        key={value}
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: accent ? 30 : 22, fontWeight: 700, lineHeight: 1,
          letterSpacing: "-0.02em",
          color: accent ? "hsl(var(--brand))" : "hsl(var(--foreground) / 0.82)",
          animation: "statSwap 0.34s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function TorontoMap({ active = false }: { active?: boolean }) {
  const setSelectedRegion = useStore((s) => s.setSelectedRegion);

  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  // Index (into ALL_CARDS) of the specific card under the cursor + the centered
  // card. The cursor always wins: hovered card is the selected one, one at a time.
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [centeredIdx, setCenteredIdx] = useState<number>(REGION_CARDS.length);

  // Carousel + speed control refs — all DOM-mutated in rAF for zero-jank
  const trackRef          = useRef<HTMLDivElement>(null);
  const offsetRef         = useRef(0);
  const prevActiveRef     = useRef<string | null>(null);
  const prevCenteredIdxRef = useRef<number>(REGION_CARDS.length);
  const rafRef            = useRef(0);
  const hasInitializedRef = useRef(false); // first-time centering on All Toronto

  // Scroll state
  const wheelVelRef   = useRef(0);     // wheel-driven scrub velocity (decays via friction)
  const hoveringRef   = useRef(false); // hovering a card → pause auto-drift
  const snapTargetRef = useRef<number | null>(null); // keyboard snap-to-card target
  const autoIdleRef   = useRef(0);     // frames settled on a card → drives auto-advance

  useEffect(() => {
    if (active) {
      const t = setTimeout(() => setRevealed(true), 80);
      return () => clearTimeout(t);
    }
    setRevealed(false);
  }, [active]);

  useEffect(() => {
    if (!active) return;

    // On first activation, center the carousel on "All Toronto" (copy 1 for seamless bidirectional scroll)
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const vcx = window.innerWidth / 2;
      const allTorontoAbsIdx = REGION_CARDS.length; // copy 1 of card 0
      const initOffset = allTorontoAbsIdx * CARD_STRIDE + CARD_W / 2 - vcx;
      offsetRef.current = ((initOffset % SET_W) + SET_W) % SET_W;
    }

    const snapToAdjacentCard = (direction: 1 | -1) => {
      const vcx = window.innerWidth / 2;
      const currentIdx = REGION_CARDS.findIndex(c => c.name === prevActiveRef.current);
      if (currentIdx < 0) return;
      const targetIdx = ((currentIdx + direction) + REGION_CARDS.length) % REGION_CARDS.length;
      // Find nearest copy of the target card across all COPIES
      let bestOffset = offsetRef.current;
      let bestDist = Infinity;
      for (let copy = 0; copy < COPIES; copy++) {
        const absIdx = copy * REGION_CARDS.length + targetIdx;
        const neededOffset = absIdx * CARD_STRIDE + CARD_W / 2 - vcx;
        const dist = Math.abs(neededOffset - offsetRef.current);
        if (dist < bestDist) { bestDist = dist; bestOffset = neededOffset; }
      }
      snapTargetRef.current = bestOffset;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === "ArrowRight") snapToAdjacentCard(1);
      if (e.key === "ArrowLeft")  snapToAdjacentCard(-1);
    };
    document.addEventListener("keydown", onKeyDown);

    // Wheel scrubs the cards manually (journey is clamped at scope, so the
    // wheel belongs to the carousel here). Accumulates into a decaying velocity.
    const onWheel = (e: WheelEvent) => {
      wheelVelRef.current = Math.max(
        -WHEEL_MAX,
        Math.min(WHEEL_MAX, wheelVelRef.current + (e.deltaY + e.deltaX) * WHEEL_FACTOR)
      );
    };
    window.addEventListener("wheel", onWheel, { passive: true });

    const tick = () => {
      // ── Snap-to-card override (keyboard nav) ────────────────────────────
      if (snapTargetRef.current !== null) {
        let diff = snapTargetRef.current - offsetRef.current;
        // Prefer shorter path across the wrap boundary
        if (diff > SET_W / 2) diff -= SET_W;
        if (diff < -SET_W / 2) diff += SET_W;
        if (Math.abs(diff) < 0.5) {
          offsetRef.current = ((snapTargetRef.current % SET_W) + SET_W) % SET_W;
          snapTargetRef.current = null;
        } else {
          offsetRef.current += diff * 0.14;
        }
      } else if (!hoveringRef.current) {
        // Wheel scrub; once momentum dies, keep the nearest card snapped to the
        // exact centre, then AUTO-ADVANCE card-by-card (autoscroll) — so it keeps
        // cycling on its own while every resting card stays perfectly centred.
        offsetRef.current += wheelVelRef.current;
        wheelVelRef.current *= WHEEL_FRICTION;
        if (Math.abs(wheelVelRef.current) < 0.05) wheelVelRef.current = 0;
        if (wheelVelRef.current === 0) {
          const vcx = window.innerWidth / 2;
          const nearest = Math.round((offsetRef.current + vcx - CARD_W / 2) / CARD_STRIDE);
          const ideal = nearest * CARD_STRIDE + CARD_W / 2 - vcx;
          offsetRef.current += (ideal - offsetRef.current) * 0.12;
          if (Math.abs(ideal - offsetRef.current) < 1) {
            autoIdleRef.current += 1;
            if (autoIdleRef.current >= AUTO_ADVANCE_FRAMES) {
              // glide to the next card via the snap mechanism (handles wrap)
              snapTargetRef.current = (nearest + 1) * CARD_STRIDE + CARD_W / 2 - vcx;
              autoIdleRef.current = 0;
            }
          }
        } else {
          autoIdleRef.current = 0;
        }
      } else {
        // Hovering a card → carousel FROZEN + wheel momentum killed, so the
        // card under the cursor stays put and stays selected (no matter what).
        wheelVelRef.current = 0;
        autoIdleRef.current = 0;
      }

      if (offsetRef.current >= SET_W) offsetRef.current -= SET_W;
      if (offsetRef.current < 0)      offsetRef.current += SET_W;

      // Apply transform directly — no React re-render per frame
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(${-offsetRef.current}px)`;
      }

      // Center detection: the card nearest the viewport horizontal midpoint.
      // Scan ALL copies so the centered index is the actually-visible card.
      const vcx = window.innerWidth / 2;
      let closest: string | null = null;
      let closestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < ALL_CARDS.length; i++) {
        const cardCx = i * CARD_STRIDE + CARD_W / 2 - offsetRef.current;
        const dist   = Math.abs(cardCx - vcx);
        if (dist < minDist) { minDist = dist; closest = REGION_CARDS[i % REGION_CARDS.length].name; closestIdx = i; }
      }
      if (closest !== prevActiveRef.current) {
        prevActiveRef.current = closest;
        setActiveRegion(closest);
      }
      if (closestIdx !== prevCenteredIdxRef.current) {
        prevCenteredIdxRef.current = closestIdx;
        setCenteredIdx(closestIdx);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
    };
  }, [active]);

  const zonesByRegion = useMemo(() => {
    const map: Record<string, ZoneGeo[]> = {};
    for (const z of processedZones) {
      if (!map[z.region]) map[z.region] = [];
      map[z.region].push(z);
    }
    return map;
  }, []);

  // Hovering a card selects it (overrides the centered card); else the centered card
  const effectiveRegion   = hoveredRegion ?? activeRegion;
  const highlightAll      = effectiveRegion === "All Toronto";
  const highlightedRegion = highlightAll ? null : effectiveRegion;

  // Live area statistics for the flanking panels — all derived from real
  // fixture data, recomputed for whichever region is hovered/centered.
  const statRegion = effectiveRegion ?? "All Toronto";
  const sZones   = getZoneCount(statRegion);
  const sAgents  = getAgentCount(statRegion);
  const sShare   = (sZones / TOTAL_ZONES) * 100;
  const sDensity = sZones > 0 ? Math.round(sAgents / sZones) : 0;
  const sArea    = getAreaKm2(statRegion);
  const sPerKm2  = sArea > 0 ? Math.round(sAgents / sArea) : 0;

  const colDelay = ["0ms", "140ms", "280ms"] as const;

  // Clicking a scope "dives into the city": the whole selector zooms toward the
  // map + fades, then the dashboard mounts (which fades in) — a continuous feel.
  const handleClick = (name: string) => {
    if (launching) return;
    setLaunching(true);
    setHoveredRegion(name); // lock the highlight on the chosen region during the dive
    window.setTimeout(() => {
      setSelectedRegion(name);
      useStore.setState({ showRegionSelector: false });
    }, 620);
  };

  return (
    <>
      <style>{`
        @keyframes statSwap {
          from { opacity: 0; transform: translateY(7px); }
          to   { opacity: 1; transform: translateY(0); }
        }
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
        @keyframes cityCardPulse {
          0%, 100% { box-shadow: 0 -2px 12px hsl(72 95% 50% / 0.12); }
          50%      { box-shadow: 0 -2px 20px hsl(72 95% 50% / 0.26); }
        }
        @keyframes activeCardPulse {
          0%, 100% { box-shadow: 0 -8px 32px hsl(72 95% 50% / 0.25), 0 2px 14px rgba(0,0,0,0.10); }
          50%      { box-shadow: 0 -8px 48px hsl(72 95% 50% / 0.45), 0 2px 18px rgba(0,0,0,0.12); }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[90]"
        style={{
          overflow: "visible",
          // Translucent white wash: a faded white sheet in front of the 3D grid
          // so it reads as a soft hint, not a strong pattern.
          background: "hsl(0 0% 100% / 0.82)",
          // "Dive into the city" on select: zoom toward the map + fade.
          transformOrigin: "50% 42%",
          transform: launching ? "scale(1.45)" : "scale(1)",
          opacity: launching ? 0 : 1,
          transition: launching
            ? "transform 0.62s cubic-bezier(0.7,0,0.84,0), opacity 0.62s ease-in"
            : "none",
        }}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-8 py-4 flex items-baseline gap-4">
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
            // Lift the map just enough to clear the risen centered card
            paddingBottom: RISE - 16,
            overflow: "hidden",
          }}
        >
          {/* (dot-grid removed — the live 3D perspective grid now shows through
              the transparent scope background instead.) */}

          {/* Centre glow */}
          <div aria-hidden style={{
            position: "absolute", top: "50%", left: "55%",
            transform: "translate(-50%, -50%)",
            width: 520, height: 520,
            borderRadius: "50%",
            background: "radial-gradient(circle, hsl(72 95% 50% / 0.1) 0%, transparent 68%)",
            animation: "voltGlowBreathe 5s ease-in-out infinite",
            pointerEvents: "none",
          }} />
          {/* Left margin ambient glow */}
          <div aria-hidden style={{
            position: "absolute", top: "50%", left: 0,
            transform: "translateY(-50%)",
            width: 260, height: 420,
            background: "radial-gradient(ellipse at left center, hsl(72 95% 50% / 0.06) 0%, transparent 72%)",
            pointerEvents: "none",
          }} />
          {/* Right margin ambient glow */}
          <div aria-hidden style={{
            position: "absolute", top: "50%", right: 0,
            transform: "translateY(-50%)",
            width: 260, height: 420,
            background: "radial-gradient(ellipse at right center, hsl(72 95% 50% / 0.06) 0%, transparent 72%)",
            pointerEvents: "none",
          }} />

          {/* ── Left stat panel — fills the flank with live area numbers ── */}
          <div style={{
            position: "absolute", top: "50%", left: "clamp(40px, 5vw, 110px)",
            transform: "translateY(-50%)",
            width: 178, textAlign: "left",
            borderLeft: "1.5px solid hsl(var(--brand) / 0.45)", paddingLeft: 16,
            opacity: revealed ? 1 : 0,
            transition: "opacity 0.55s ease 0.32s",
            pointerEvents: "none", zIndex: 2,
          }}>
            <div style={{
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 16,
              letterSpacing: "-0.015em", color: "hsl(var(--foreground))",
              marginBottom: 16, lineHeight: 1.1,
            }}>
              {statRegion}
            </div>
            <StatItem label="Zones"         value={sZones.toString()}        accent />
            <StatItem label="Land area"     value={`${sArea.toFixed(0)} km²`} />
            <StatItem label="Share of city" value={`${sShare.toFixed(1)}%`} />
          </div>

          {/* ── Right stat panel ── */}
          <div style={{
            position: "absolute", top: "50%", right: "clamp(40px, 5vw, 110px)",
            transform: "translateY(-50%)",
            width: 178, textAlign: "right",
            borderRight: "1.5px solid hsl(var(--brand) / 0.45)", paddingRight: 16,
            opacity: revealed ? 1 : 0,
            transition: "opacity 0.55s ease 0.42s",
            pointerEvents: "none", zIndex: 2,
          }}>
            <div style={{
              fontFamily: "monospace", fontWeight: 600, fontSize: 10,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: "hsl(var(--foreground) / 0.42)",
              marginBottom: 16, lineHeight: 1.1,
            }}>
              Simulation load
            </div>
            <StatItem label="Agents modelled" value={sAgents.toLocaleString()} accent align="right" />
            <StatItem label="Avg / zone"      value={sDensity.toString()}      align="right" />
            <StatItem label="Agents / km²"    value={sPerKm2.toString()}       align="right" />
          </div>

          <div style={{ position: "relative", width: "min(780px, 60%)", aspectRatio: `${SVG_W} / ${SVG_H}` }}>
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
             bottom: -(CARD_H - STRIP_H) = -160 px → only the top STRIP_H=160 px
             of each 320 px card is on-screen. overflow: visible allows the
             centered active card to rise above the strip edge into the map.
             Mouse events on this div drive the speed-scrub logic.
             Slides up by 40px on first reveal (tied to map zone draw-in).
        ─────────────────────────────────────────────────────────────────────── */}
        <div
          role="listbox"
          aria-label="Choose your simulation scope"
          style={{
            position: "absolute",
            bottom: revealed ? -(CARD_H - STRIP_H) : -(CARD_H - STRIP_H) - 40,
            left: 0, right: 0,
            height: CARD_H,
            overflow: "visible",
            zIndex: 10,
            perspective: "1100px",
            perspectiveOrigin: "50% 0%",
            transition: "bottom 0.65s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
          onMouseMove={(e) => {
            // Geometric hover: pick the card whose center is nearest the cursor's
            // X — same formula as the center-detection, so it's immune to the 3D
            // transforms / raised-card overlap that break per-element onMouseEnter.
            const mx = e.clientX;
            let best = 0;
            let bestDist = Infinity;
            for (let i = 0; i < ALL_CARDS.length; i++) {
              const cardCx = i * CARD_STRIDE + CARD_W / 2 - offsetRef.current;
              const d = Math.abs(cardCx - mx);
              if (d < bestDist) { bestDist = d; best = i; }
            }
            hoveringRef.current = true;
            setHoveredIdx(best);
            setHoveredRegion(ALL_CARDS[best].name);
          }}
          onMouseLeave={() => {
            setHoveredRegion(null);
            setHoveredIdx(null);
            hoveringRef.current = false;
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

          {/* (scrub hint removed — the header already explains the controls,
              and it collided with the risen active card.) */}

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
              // The cursor wins: while hovering, only the exact card under the
              // mouse is active; otherwise it's the centered card. One at a time.
              const isActive  = hoveredIdx !== null ? i === hoveredIdx : i === centeredIdx;
              const isCityCard = card.name === "All Toronto";

              // "All Toronto" always gets a faint volt border + background to signal it's special
              const borderColor = isActive
                ? "hsl(var(--brand))"
                : isCityCard
                  ? "hsl(var(--brand) / 0.4)"
                  : "hsl(var(--border) / 0.7)";
              const bgColor = isActive
                ? "linear-gradient(160deg, #fff 0%, hsl(72 95% 97%) 100%)"
                : isCityCard
                  ? "hsl(72 95% 99.2%)"
                  : "white";
              // Active card uses CSS animation for pulsing glow;
              // city card uses a softer version; others use static shadow.
              const shadowOrAnim = isActive
                ? { animation: "activeCardPulse 2.8s ease-in-out infinite" }
                : isCityCard
                  ? { animation: "cityCardPulse 3.5s ease-in-out infinite" }
                  : { boxShadow: "0 -2px 8px rgba(0,0,0,0.05)" };

              return (
                <button
                  key={i}
                  role="option"
                  aria-selected={isActive}
                  aria-label={`${card.name} — ${getZoneCount(card.name)} zones, ${getAgentCount(card.name).toLocaleString()} agents. ${card.desc}`}
                  onClick={() => handleClick(ALL_CARDS[hoveredIdx ?? i].name)}
                  style={{
                    width: CARD_W,
                    height: CARD_H,
                    flexShrink: 0,
                    position: "relative",
                    borderRadius: 16,
                    border: `1.5px solid ${borderColor}`,
                    background: bgColor,
                    padding: "22px 20px 0",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                    ...shadowOrAnim,
                    transform: isActive
                      ? `translateY(-${RISE}px) rotateX(0deg) scale(1.05)`
                      : "rotateX(5deg)",
                    transformOrigin: "bottom center",
                    transition: [
                      "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
                      "border-color 0.2s ease",
                      "background 0.2s ease",
                    ].join(", "),
                    willChange: "transform",
                    pointerEvents: "auto",
                  }}
                >
                  {/* "FULL CITY" badge for All Toronto — always shown */}
                  {isCityCard && (
                    <div style={{
                      position: "absolute", top: 14, right: 14,
                      fontSize: 9, fontFamily: "JetBrains Mono, monospace",
                      letterSpacing: "0.08em", fontWeight: 600,
                      color: isActive ? "hsl(80 60% 20%)" : "hsl(var(--brand) / 0.7)",
                      background: isActive ? "hsl(72 95% 88%)" : "hsl(72 95% 93%)",
                      padding: "2px 7px",
                      borderRadius: 99,
                    }}>
                      FULL CITY
                    </div>
                  )}

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
                    color: isActive ? "hsl(var(--brand))" : isCityCard ? "hsl(var(--brand) / 0.6)" : "#b0b0b0",
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
                    background: isActive || isCityCard ? "hsl(var(--brand) / 0.2)" : "hsl(var(--border) / 0.5)",
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

                  {/* Volt accent stripe at bottom of card face */}
                  <div style={{
                    position: "absolute",
                    bottom: 0, left: 0, right: 0, height: 4,
                    borderRadius: "0 0 15px 15px",
                    background: isActive ? "hsl(var(--brand))" : isCityCard ? "hsl(var(--brand) / 0.35)" : "transparent",
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
