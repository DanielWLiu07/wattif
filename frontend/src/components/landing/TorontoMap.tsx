import { useMemo, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { useStore, getZoneRegion } from "@/store";
import zonesRaw from "@/data/zonesFixture.json";

// ── SVG map projection ─────────────────────────────────────────────────────
// Bounds padded slightly beyond the zone data
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

/** Convert one polygon ring to SVG path data, sampling every Nth point. */
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

// ── Region definitions ──────────────────────────────────────────────────────
// Zone counts derived from getZoneRegion logic applied to zonesFixture.json
const REGIONS = [
  { name: "All Toronto",  key: "All",          zones: 140, agents: "8,001"  },
  { name: "Etobicoke",    key: "Etobicoke",    zones: 30,  agents: "~1,715" },
  { name: "North York",   key: "North York",   zones: 27,  agents: "~1,543" },
  { name: "Scarborough",  key: "Scarborough",  zones: 25,  agents: "~1,429" },
  { name: "West Toronto", key: "West Toronto", zones: 22,  agents: "~1,257" },
  { name: "East Toronto", key: "East Toronto", zones: 14,  agents: "~800"   },
  { name: "Downtown",     key: "Downtown",     zones: 12,  agents: "~686"   },
  { name: "Midtown",      key: "Midtown",      zones: 10,  agents: "~571"   },
];

// ── Processed zone data (memoized outside component) ───────────────────────
type ZoneGeo = {
  id: string;
  name: string;
  centroid: [number, number];
  region: string;
  paths: string[];
};

// Raw type expected from zonesFixture.json
type RawZone = {
  id: string;
  name: string;
  centroid: [number, number];
  polygon: { type: string; coordinates: number[][][][] };
};

const processedZones: ZoneGeo[] = (zonesRaw as RawZone[]).map((z) => ({
  id: z.id,
  name: z.name,
  centroid: z.centroid,
  region: getZoneRegion(z.name, z.centroid),
  // Only outer ring of each polygon face, sampled
  paths: z.polygon.coordinates.map((poly) => ringToPath(poly[0], 5)),
}));

// ── Component ───────────────────────────────────────────────────────────────

export function TorontoMap() {
  const setSelectedRegion = useStore((s) => s.setSelectedRegion);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  const handleSelect = (key: string) => {
    setSelectedRegion(key);
    useStore.setState({ showRegionSelector: false });
  };

  // Group zones by region for SVG coloring
  const zonesByRegion = useMemo(() => {
    const map: Record<string, ZoneGeo[]> = {};
    for (const z of processedZones) {
      if (!map[z.region]) map[z.region] = [];
      map[z.region].push(z);
    }
    return map;
  }, []);

  // For "All Toronto" hover, highlight everything
  const highlightedRegion = hoveredRegion === "All" ? null : hoveredRegion;
  const highlightAll = hoveredRegion === "All";

  return (
    <div className="fixed inset-0 z-[90] flex bg-background">
      {/* Left: region list */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-background">
        <div className="border-b border-border px-6 py-5">
          <p
            className="label"
            style={{ color: "hsl(var(--brand))" }}
          >
            Final step
          </p>
          <h2 className="mt-1 font-display text-xl font-bold leading-tight text-foreground">
            Choose your scope.
          </h2>
          <p className="mt-1.5 font-sans text-xs leading-relaxed text-muted-foreground">
            Hover to preview on the map. Click to begin.
          </p>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          {REGIONS.map(({ name, key, zones, agents }) => {
            const isHovered = hoveredRegion === key;
            return (
              <button
                key={key}
                onMouseEnter={() => setHoveredRegion(key)}
                onMouseLeave={() => setHoveredRegion(null)}
                onClick={() => handleSelect(key)}
                className="group flex items-center justify-between gap-3 border-b border-border px-6 py-4 text-left transition-colors duration-150 hover:bg-muted/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-display text-sm font-semibold text-foreground">
                    {name}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {key === "All"
                      ? `${zones} zones · ${agents} agents`
                      : `${zones} zones · ${agents} agents`}
                  </div>
                </div>
                <ArrowRight
                  weight="bold"
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
                  style={isHovered ? { color: "hsl(var(--brand))", opacity: 1 } : {}}
                />
              </button>
            );
          })}
        </div>

        <div className="border-t border-border px-6 py-4">
          <p className="font-sans text-[10px] text-muted-foreground">
            You can change scope at any time from the dashboard header.
          </p>
        </div>
      </aside>

      {/* Right: Toronto SVG map */}
      <div className="flex flex-1 items-center justify-center bg-background">
        <div className="relative" style={{ width: SVG_W, height: SVG_H }}>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width={SVG_W}
            height={SVG_H}
            style={{ display: "block" }}
            aria-label="Toronto neighbourhood map"
          >
            {/* Background */}
            <rect width={SVG_W} height={SVG_H} fill="#fafafa" />

            {/* Zone paths — colored by region on hover */}
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

            {/* Region centroids as labels */}
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
