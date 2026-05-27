import { useMemo } from "react";
import zonesRaw from "@/data/zonesFixture.json";
import { landingStats } from "@/data/landingStats";

const THRESHOLD = 0.6;
// Bars fill the right column: 140 × (BAR_W + BAR_GAP) ≈ 945 px at 1440 wide screen
const BAR_W   = 6;
const BAR_GAP = 0.8;
const CHART_H    = 390;
const MAX_BAR_H  = 345;

type ZoneEntry = { id: string; demographics: { energyBurdenIndex: number } };

function burdenColor(v: number): string {
  if (v < THRESHOLD) {
    const t = v / THRESHOLD;
    // slate-300 (#cbd5e1) → amber-400 (#fbbf24)
    const r = Math.round(203 + (251 - 203) * t);
    const g = Math.round(213 + (191 - 213) * t);
    const b = Math.round(225 + (36  - 225) * t);
    return `rgb(${r},${g},${b})`;
  } else {
    const t = (v - THRESHOLD) / (1 - THRESHOLD);
    // amber-400 (#fbbf24) → red-500 (#ef4444)
    const r = Math.round(251 + (239 - 251) * t);
    const g = Math.round(191 + (68  - 191) * t);
    const b = Math.round(36  + (68  - 36)  * t);
    return `rgb(${r},${g},${b})`;
  }
}

interface BurdenChartProps {
  visible: boolean;
}

export function BurdenChart({ visible }: BurdenChartProps) {
  const sorted = useMemo(
    () =>
      (zonesRaw as ZoneEntry[])
        .slice()
        .sort((a, b) => a.demographics.energyBurdenIndex - b.demographics.energyBurdenIndex),
    [],
  );

  const highlightStat = landingStats.find((s) => s.key === "highBurdenZones");
  const renterStat    = landingStats.find((s) => s.key === "renterShare");
  const gridStat      = landingStats.find((s) => s.key === "gridIntensity");

  const thresholdBottom = THRESHOLD * MAX_BAR_H;

  const vis = (delay: number): React.CSSProperties => ({
    opacity:         visible ? 1 : 0,
    transform:       visible ? "translateY(0)" : "translateY(9px)",
    transition:      "opacity 0.42s ease, transform 0.42s ease",
    transitionDelay: visible ? `${delay}ms` : "0ms",
  });

  return (
    <>
      <style>{`
        @keyframes barGrow {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
      `}</style>

      {/* Full-width overlay — same fade/slide as Overlay component */}
      <div
        className="pointer-events-none absolute top-0 left-0 flex h-full w-full items-center px-16"
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? "translateY(0) scale(1)" : "translateY(10px) scale(0.97)",
          filter:     visible ? "blur(0px)" : "blur(3px)",
          transition: "opacity 0.55s ease, transform 0.55s ease, filter 0.55s ease",
          willChange: "opacity, transform, filter",
        }}
      >
        {/* ── Left stat column (28%) ── */}
        <div
          className="flex flex-col gap-8"
          style={{ width: "28%", paddingRight: "3rem", flexShrink: 0 }}
        >
          <div style={vis(0)}>
            <span
              className="label"
              style={{ color: "hsl(var(--data-alert))", display: "block", marginBottom: "0.6rem" }}
            >
              The Problem
            </span>
            <h2
              className="font-display font-bold leading-tight text-foreground"
              style={{ fontSize: "clamp(2.1rem, 2.6vw, 3rem)", letterSpacing: "-0.025em" }}
            >
              Energy burden
              <br />
              isn't evenly
              <br />
              <span style={{ color: "hsl(var(--data-alert))" }}>distributed.</span>
            </h2>
          </div>

          <div
            className="flex flex-col gap-6 border-l-2 border-border pl-5"
            style={vis(180)}
          >
            {[
              {
                value: highlightStat?.value ?? "113",
                unit:  "/140",
                label: highlightStat?.label ?? "high energy-burden areas",
                color: "hsl(var(--data-alert))",
              },
              {
                value: renterStat?.value ?? "46%",
                unit:  "",
                label: renterStat?.label ?? "of households rent",
                color: "hsl(var(--foreground))",
              },
              {
                value: gridStat?.value ?? "38",
                unit:  " gCO₂/kWh",
                label: gridStat?.label ?? "Ontario grid intensity",
                color: "hsl(var(--foreground))",
              },
            ].map(({ value, unit, label, color }) => (
              <div key={label}>
                <div
                  className="font-mono font-semibold leading-none"
                  style={{ fontSize: "2.6rem", color }}
                >
                  {value}
                  <span className="ml-1 text-base text-muted-foreground">{unit}</span>
                </div>
                <div className="label mt-1.5" style={{ color: "hsl(var(--foreground) / 0.5)" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right chart column (flex-1 = fills remaining screen) ── */}
        <div
          className="flex flex-1 flex-col gap-4"
          style={vis(90)}
        >
          {/* Chart */}
          <div style={{ position: "relative", height: CHART_H }}>
            {/* Dashed threshold line */}
            <div
              style={{
                position:   "absolute",
                left:       0,
                right:      0,
                bottom:     thresholdBottom,
                height:     0,
                borderTop:  "1.5px dashed hsl(var(--data-alert) / 0.5)",
                zIndex:     1,
              }}
            />
            {/* Threshold label */}
            <span
              style={{
                position:       "absolute",
                right:          0,
                bottom:         thresholdBottom + 6,
                fontSize:       10,
                fontFamily:     "monospace",
                letterSpacing:  "0.05em",
                textTransform:  "uppercase",
                color:          "hsl(var(--data-alert) / 0.6)",
              }}
            >
              burden threshold ≥ 0.6
            </span>

            {/* Bars */}
            <div
              style={{
                position:    "absolute",
                bottom:      0,
                left:        0,
                display:     "flex",
                alignItems:  "flex-end",
                gap:         BAR_GAP,
              }}
            >
              {sorted.map((z, i) => {
                const v = z.demographics.energyBurdenIndex;
                const h = Math.max(2, v * MAX_BAR_H);
                return (
                  <div
                    key={z.id}
                    style={{
                      width:           BAR_W,
                      height:          h,
                      background:      burdenColor(v),
                      borderRadius:    "1.5px 1.5px 0 0",
                      flexShrink:      0,
                      transformOrigin: "bottom",
                      animation:       visible
                        ? `barGrow 0.4s cubic-bezier(0.34,1.56,0.64,1) ${i * 6}ms both`
                        : "none",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Axis row */}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span
              style={{ fontSize: 11, fontFamily: "monospace", color: "hsl(var(--foreground) / 0.35)" }}
            >
              ← lower burden
            </span>
            <span
              style={{ fontSize: 11, fontFamily: "monospace", color: "hsl(var(--data-alert) / 0.65)" }}
            >
              higher burden →
            </span>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width:      32,
                  height:     8,
                  borderRadius: 2,
                  background: "linear-gradient(to right, #cbd5e1, #fbbf24)",
                }}
              />
              <span
                style={{ fontSize: 11, fontFamily: "monospace", color: "hsl(var(--foreground) / 0.45)" }}
              >
                27 zones — below threshold
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width:      32,
                  height:     8,
                  borderRadius: 2,
                  background: "linear-gradient(to right, #fbbf24, #ef4444)",
                }}
              />
              <span
                style={{ fontSize: 11, fontFamily: "monospace", color: "hsl(var(--data-alert) / 0.75)" }}
              >
                113 zones — high burden
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
