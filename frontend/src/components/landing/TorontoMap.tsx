import { useMemo, useState } from "react";
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

// ── Live zone counts from getZoneRegion ────────────────────────────────────
type RawZone = {
  id: string;
  name: string;
  centroid: [number, number];
  polygon: { type: string; coordinates: number[][][][] };
};

const rawZones = zonesRaw as RawZone[];
const TOTAL_ZONES = rawZones.length;
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

// ── Processed zone data (for SVG) ─────────────────────────────────────────
type ZoneGeo = {
  id: string;
  name: string;
  centroid: [number, number];
  region: string;
  paths: string[];
};

const processedZones: ZoneGeo[] = rawZones.map((z) => ({
  id: z.id,
  name: z.name,
  centroid: z.centroid,
  region: getZoneRegion(z.name, z.centroid),
  paths: z.polygon.coordinates.map((poly) => ringToPath(poly[0], 5)),
}));

// ── Component ───────────────────────────────────────────────────────────────

export function TorontoMap() {
  const setSelectedRegion = useStore((s) => s.setSelectedRegion);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  const handleSelect = (name: string) => {
    setSelectedRegion(name);
    useStore.setState({ showRegionSelector: false });
  };

  const zonesByRegion = useMemo(() => {
    const map: Record<string, ZoneGeo[]> = {};
    for (const z of processedZones) {
      if (!map[z.region]) map[z.region] = [];
      map[z.region].push(z);
    }
    return map;
  }, []);

  const highlightAll = hoveredRegion === "All Toronto";
  const highlightedRegion = highlightAll ? null : hoveredRegion;

  return (
    <div className="fixed inset-0 z-[90] flex bg-background">
      {/* ── Left: 2-col card grid ─────────────────────────────────────── */}
      <aside
        className="flex shrink-0 flex-col border-r border-border bg-background"
        style={{ width: 360 }}
      >
        <div className="border-b border-border px-6 py-5">
          <p className="label" style={{ color: "hsl(var(--brand))" }}>
            Final step
          </p>
          <h2 className="mt-1 font-display text-xl font-bold leading-tight text-foreground">
            Choose your scope.
          </h2>
          <p className="mt-1.5 font-sans text-xs leading-relaxed text-muted-foreground">
            Hover to preview on the map. Click to begin.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2">
            {REGION_CARDS.map((card) => {
              const zones = getZoneCount(card.name);
              const agents = getAgentCount(card.name);
              const isHovered = hoveredRegion === card.name;

              return (
                <button
                  key={card.name}
                  onMouseEnter={() => setHoveredRegion(card.name)}
                  onMouseLeave={() => setHoveredRegion(null)}
                  onClick={() => handleSelect(card.name)}
                  className="group flex flex-col gap-1.5 rounded-xl border bg-white p-3 text-left transition-all duration-150 hover:shadow-md"
                  style={{
                    borderColor: isHovered
                      ? "hsl(var(--brand))"
                      : "hsl(var(--border))",
                    boxShadow: isHovered
                      ? "0 4px 16px hsl(var(--brand) / 0.15)"
                      : undefined,
                    transform: isHovered ? "translateY(-1px)" : undefined,
                  }}
                >
                  <span
                    className="font-display text-sm font-semibold leading-tight text-foreground"
                    style={isHovered ? { color: "hsl(var(--brand-ink, var(--foreground)))" } : {}}
                  >
                    {card.name}
                  </span>
                  <span className="font-sans text-[10px] leading-snug text-muted-foreground line-clamp-2">
                    {card.desc}
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground/70 mt-auto pt-1">
                    {zones} zones · {agents.toLocaleString()} agents
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border px-6 py-4">
          <p className="font-sans text-[10px] text-muted-foreground">
            You can change scope at any time from the dashboard header.
          </p>
        </div>
      </aside>

      {/* ── Right: large SVG map ──────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <div className="relative w-full h-full max-w-[900px] max-h-[600px]">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            style={{ display: "block" }}
            aria-label="Toronto neighbourhood map"
          >
            {/* Background */}
            <rect width={SVG_W} height={SVG_H} fill="#fafafa" rx="4" />

            {/* Zone paths — highlighted by hovered region */}
            {processedZones.map((zone) => {
              const isTarget =
                highlightAll ||
                (highlightedRegion !== null && zone.region === highlightedRegion);
              const fill = isTarget ? "hsl(72 95% 50%)" : "#e8e8e8";
              const stroke = isTarget ? "hsl(72 95% 30%)" : "#cfcfcf";
              return zone.paths.map((d, pi) => (
                <path
                  key={`${zone.id}-${pi}`}
                  d={d}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth="0.5"
                  style={{ transition: "fill 0.2s ease, stroke 0.2s ease" }}
                />
              ));
            })}

            {/* Region centroid labels */}
            {Object.entries(zonesByRegion).map(([region, zones]) => {
              if (zones.length === 0) return null;
              const avgX =
                zones.reduce((s, z) => s + lngToX(z.centroid[0]), 0) /
                zones.length;
              const avgY =
                zones.reduce((s, z) => s + latToY(z.centroid[1]), 0) /
                zones.length;
              const isActive = highlightedRegion === region || highlightAll;
              return (
                <text
                  key={region}
                  x={avgX}
                  y={avgY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="7"
                  fontFamily="Manrope, sans-serif"
                  fontWeight="600"
                  letterSpacing="0.04em"
                  fill={isActive ? "hsl(80 60% 12%)" : "#999"}
                  style={{ textTransform: "uppercase", transition: "fill 0.2s ease" }}
                  pointerEvents="none"
                >
                  {region}
                </text>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
