import { useMemo } from "react";
import zonesRaw from "@/data/zonesFixture.json";
import { landingStats } from "@/data/landingStats";

const THRESHOLD = 0.6;
const BAR_W = 3.8;
const BAR_GAP = 1.4;
const CHART_H = 220;
const MAX_BAR_H = 185;

type ZoneEntry = { id: string; demographics: { energyBurdenIndex: number } };

function burdenColor(v: number): string {
  if (v < THRESHOLD) {
    const t = v / THRESHOLD;
    // slate-300 (#cbd5e1) → amber-400 (#fbbf24)
    const r = Math.round(203 + (251 - 203) * t);
    const g = Math.round(213 + (191 - 213) * t);
    const b = Math.round(225 + (36 - 225) * t);
    return `rgb(${r},${g},${b})`;
  } else {
    const t = (v - THRESHOLD) / (1 - THRESHOLD);
    // amber-400 (#fbbf24) → red-500 (#ef4444)
    const r = Math.round(251 + (239 - 251) * t);
    const g = Math.round(191 + (68 - 191) * t);
    const b = Math.round(36 + (68 - 36) * t);
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
  const renterStat = landingStats.find((s) => s.key === "renterShare");
  const gridStat = landingStats.find((s) => s.key === "gridIntensity");

  const thresholdBottom = THRESHOLD * MAX_BAR_H;

  const vis = (delay: number) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(9px)",
    transition: "opacity 0.42s ease, transform 0.42s ease",
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

      <div
        className="pointer-events-none absolute top-0 left-0 flex h-full w-full items-center px-16"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0) scale(1)" : "translateY(10px) scale(0.97)",
          filter: visible ? "blur(0px)" : "blur(3px)",
          transition: "opacity 0.55s ease, transform 0.55s ease, filter 0.55s ease",
          willChange: "opacity, transform, filter",
        }}
      >
        {/* Left column */}
        <div
          className="flex flex-col gap-6"
          style={{ width: "38%", paddingRight: "4rem", flexShrink: 0 }}
        >
          <div style={vis(0)}>
            <span
              className="label"
              style={{
                color: "hsl(var(--data-alert))",
                display: "block",
                marginBottom: "0.5rem",
              }}
            >
              The Problem
            </span>
            <h2
              className="font-display font-bold leading-tight text-foreground"
              style={{
                fontSize: "clamp(2rem, 3vw, 2.75rem)",
                letterSpacing: "-0.02em",
              }}
            >
              Energy burden
              <br />
              isn't evenly
              <br />
              <span style={{ color: "hsl(var(--data-alert))" }}>distributed.</span>
            </h2>
          </div>

          <div
            className="flex flex-col gap-5 border-l-2 border-border pl-5"
            style={vis(160)}
          >
            {[
              {
                value: highlightStat?.value ?? "113",
                unit: "/140",
                label: highlightStat?.label ?? "high energy-burden areas",
                color: "hsl(var(--data-alert))",
              },
              {
                value: renterStat?.value ?? "46%",
                unit: "",
                label: renterStat?.label ?? "of households rent",
                color: "hsl(var(--foreground))",
              },
              {
                value: gridStat?.value ?? "38",
                unit: " gCO₂/kWh",
                label: gridStat?.label ?? "Ontario grid intensity",
                color: "hsl(var(--foreground))",
              },
            ].map(({ value, unit, label, color }) => (
              <div key={label}>
                <div
                  className="font-mono font-semibold leading-none"
                  style={{ fontSize: "2.5rem", color }}
                >
                  {value}
                  <span className="ml-1 text-base text-muted-foreground">{unit}</span>
                </div>
                <div
                  className="label mt-1"
                  style={{ color: "hsl(var(--foreground) / 0.55)" }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column — bar chart */}
        <div
          className="flex flex-1 flex-col gap-3"
          style={vis(80)}
        >
          {/* Chart */}
          <div style={{ position: "relative", height: CHART_H }}>
            {/* Dashed threshold */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: thresholdBottom,
                height: 0,
                borderTop: "1.5px dashed hsl(var(--data-alert) / 0.55)",
                zIndex: 1,
              }}
            />
            <span
              style={{
                position: "absolute",
                right: 0,
                bottom: thresholdBottom + 5,
                fontSize: 10,
                fontFamily: "monospace",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "hsl(var(--data-alert) / 0.65)",
              }}
            >
              burden threshold ≥ 0.6
            </span>

            {/* Bars */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                display: "flex",
                alignItems: "flex-end",
                gap: BAR_GAP,
              }}
            >
              {sorted.map((z, i) => {
                const v = z.demographics.energyBurdenIndex;
                const h = Math.max(2, v * MAX_BAR_H);
                return (
                  <div
                    key={z.id}
                    style={{
                      width: BAR_W,
                      height: h,
                      background: burdenColor(v),
                      borderRadius: "1px 1px 0 0",
                      flexShrink: 0,
                      transformOrigin: "bottom",
                      animation: visible
                        ? `barGrow 0.38s cubic-bezier(0.34,1.56,0.64,1) ${i * 7}ms both`
                        : "none",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Axis labels */}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "hsl(var(--foreground) / 0.35)",
              }}
            >
              ← lower burden
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "hsl(var(--data-alert) / 0.65)",
              }}
            >
              higher burden →
            </span>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div
                style={{
                  width: 28,
                  height: 7,
                  borderRadius: 2,
                  background: "linear-gradient(to right, #cbd5e1, #fbbf24)",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "hsl(var(--foreground) / 0.5)",
                }}
              >
                27 zones below threshold
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div
                style={{
                  width: 28,
                  height: 7,
                  borderRadius: 2,
                  background: "linear-gradient(to right, #fbbf24, #ef4444)",
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "hsl(var(--data-alert) / 0.75)",
                }}
              >
                113 high-burden zones
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
