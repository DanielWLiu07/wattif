import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Scene3D } from "@/components/landing/Scene3D";
import { TorontoMap } from "@/components/landing/TorontoMap";
import { landingStats } from "@/data/landingStats";

// ── Stat helper ──────────────────────────────────────────────────────────────

function stat(key: string) {
  return landingStats.find((s) => s.key === key);
}

// ── Text overlays ─────────────────────────────────────────────────────────────
// Each overlay is absolutely positioned over the Canvas and opacity-transitions
// in/out based on the current scroll station.

interface OverlayProps {
  visible: boolean;
  children: React.ReactNode;
  side?: "left" | "center";
}

function Overlay({ visible, children, side = "left" }: OverlayProps) {
  return (
    <div
      className="pointer-events-none absolute top-0 flex h-full flex-col justify-center px-16"
      style={{
        width: side === "left" ? "42%" : "100%",
        left: 0,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      {children}
    </div>
  );
}

// ── Road progress indicator ───────────────────────────────────────────────────

const STATION_LABELS = ["Intro", "The Problem", "Infrastructure", "Scope"];
const STATION_THRESHOLDS = [0, 0.25, 0.55, 0.86];

function stationFromProgress(p: number) {
  let s = 0;
  for (let i = 1; i < STATION_THRESHOLDS.length; i++) {
    if (p >= STATION_THRESHOLDS[i]) s = i;
  }
  return s;
}

function RoadProgress({
  progress,
  onDotClick,
}: {
  progress: number;
  onDotClick: (idx: number) => void;
}) {
  const station = stationFromProgress(progress);

  return (
    <div className="fixed bottom-7 left-1/2 z-[85] -translate-x-1/2 flex flex-col items-center gap-2.5">
      <span
        key={station}
        className="label"
        style={{ color: "hsl(var(--foreground) / 0.45)" }}
      >
        {STATION_LABELS[station]}
      </span>
      <div className="flex items-center" style={{ width: 180 }}>
        <div className="relative flex w-full items-center" style={{ height: 2 }}>
          {/* Rail */}
          <div className="absolute inset-0 rounded-full bg-foreground/12" />
          {/* Fill */}
          <div
            className="absolute left-0 h-full rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: "hsl(var(--brand))",
              transition: "width 0.08s ease",
            }}
          />
          {/* Dots */}
          {STATION_THRESHOLDS.map((threshold, i) => {
            const isCurrent = station === i;
            return (
              <button
                key={i}
                onClick={() => onDotClick(i)}
                aria-label={STATION_LABELS[i]}
                className="absolute -translate-x-1/2 -translate-y-1/2 top-1/2"
                style={{ left: `${(threshold / 1) * 100}%` }}
              >
                <span
                  className="block rounded-full transition-all duration-200"
                  style={{
                    width: isCurrent ? 10 : 6,
                    height: isCurrent ? 10 : 6,
                    background: isCurrent
                      ? "hsl(var(--brand))"
                      : progress >= threshold
                      ? "hsl(var(--brand) / 0.55)"
                      : "hsl(var(--foreground) / 0.2)",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main landing component ────────────────────────────────────────────────────

export function Landing() {
  const [progress, setProgress] = useState(0);
  const targetRef = useRef(0);
  const currentRef = useRef(0);

  // Self-managed scroll. Wheel on EITHER axis (vertical wheel or horizontal
  // trackpad swipe / shift+scroll) advances a clamped 0..1 journey value, lerped
  // smoothly each frame, driving both the 3D camera (via the progress prop) and
  // the HTML overlays. Replaces drei <ScrollControls> — its offset bridge didn't
  // track the scroll reliably here (container scrolled but offset stayed 0).
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = (e.deltaY + e.deltaX) / 4200; // sensitivity
      targetRef.current = Math.max(0, Math.min(1, targetRef.current + delta));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    let raf = 0;
    const tick = () => {
      currentRef.current += (targetRef.current - currentRef.current) * 0.1;
      setProgress((prev) =>
        Math.abs(prev - currentRef.current) > 0.0004 ? currentRef.current : prev
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(raf);
    };
  }, []);

  const station = stationFromProgress(progress);

  // Jump to a station by easing the journey target to its threshold.
  const goToStation = useCallback((idx: number) => {
    targetRef.current = STATION_THRESHOLDS[idx];
  }, []);

  const highlightStat = stat("highBurdenZones");
  const renterStat = stat("renterShare");
  const gridStat = stat("gridIntensity");
  const buildingsStat = stat("buildings");
  const agentsStat = stat("agents");

  const atScope = progress > 0.86;

  return (
    <div className="fixed inset-0 z-[80] bg-white" data-journey-progress={progress.toFixed(3)}>
      {/* ── 3D Canvas ─────────────────────────────────────────────────── */}
      <Canvas
        shadows
        camera={{ position: [0, 5, 20], fov: 52, near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 1.5]}
        className="absolute inset-0"
      >
        <Suspense fallback={null}>
          <Scene3D progress={progress} />
        </Suspense>
      </Canvas>

      {/* ── HTML overlays ─────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-10">

        {/* Station 0: Hero */}
        <Overlay visible={station === 0 && !atScope}>
          <div className="flex flex-col gap-6">
            {/* Live badge */}
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: "hsl(var(--brand))" }}
              />
              <span className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Toronto Energy Digital Twin
              </span>
            </div>

            {/* Wordmark */}
            <h1
              className="font-display font-bold leading-none text-foreground"
              style={{ fontSize: "clamp(4.5rem, 8vw, 8rem)", letterSpacing: "-0.03em" }}
            >
              Watt
              <span style={{ color: "hsl(var(--brand))" }}>If</span>
              <span style={{ color: "hsl(var(--brand))" }}>.</span>
            </h1>

            <p className="max-w-md font-sans text-base leading-relaxed text-muted-foreground">
              Site solar, wind, and battery across Toronto's 140 neighbourhoods —
              and simulate who benefits first.
            </p>

            <button
              className="pointer-events-auto flex w-fit items-center gap-2.5 rounded-full px-7 py-3.5 font-sans text-sm font-semibold transition-all duration-200"
              style={{
                background: "hsl(var(--foreground))",
                color: "hsl(var(--primary-foreground))",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "hsl(var(--brand))";
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--brand-ink))";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "hsl(var(--foreground))";
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--primary-foreground))";
              }}
              onClick={() => goToStation(3)}
            >
              Start simulating
            </button>

            {/* Key stats row */}
            <div className="flex items-center gap-8 border-t border-border pt-6">
              {[
                { n: "140", l: "neighbourhoods" },
                { n: "2.73M", l: "residents" },
                { n: "419k", l: "buildings" },
              ].map(({ n, l }) => (
                <div key={l} className="flex flex-col gap-0.5">
                  <span className="font-mono text-xl font-medium text-foreground">{n}</span>
                  <span className="label">{l}</span>
                </div>
              ))}
            </div>
          </div>
        </Overlay>

        {/* Station 1: Problem */}
        <Overlay visible={station === 1 && !atScope}>
          <div className="flex flex-col gap-6">
            <span className="label" style={{ color: "hsl(var(--data-alert))" }}>
              The Problem
            </span>
            <h2
              className="font-display font-bold leading-tight text-foreground"
              style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", letterSpacing: "-0.02em" }}
            >
              Toronto's energy burden
              <br />
              isn't evenly
              <br />
              <span style={{ color: "hsl(var(--data-alert))" }}>distributed.</span>
            </h2>

            {/* Big stat callouts */}
            <div className="flex flex-col gap-5 border-l-2 border-border pl-5">
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
                    style={{ fontSize: "2.8rem", color }}
                  >
                    {value}
                    <span className="ml-1 text-base text-muted-foreground">{unit}</span>
                  </div>
                  <div className="label mt-1" style={{ color: "hsl(var(--foreground) / 0.55)" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </Overlay>

        {/* Station 2: Infrastructure */}
        <Overlay visible={station === 2 && !atScope}>
          <div className="flex flex-col gap-6">
            <span className="label">How WattIf Works</span>
            <h2
              className="font-display font-bold leading-tight text-foreground"
              style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", letterSpacing: "-0.02em" }}
            >
              An AI that sites
              <br />
              the grid — live.
            </h2>
            <p className="max-w-sm font-sans text-sm leading-relaxed text-muted-foreground">
              Multi-agent system proposes solar, wind, battery, and microgrid
              placements — optimising for coverage, equity, and budget.
            </p>

            {/* Stats */}
            <div className="flex flex-col gap-4 border-l-2 pl-5" style={{ borderColor: "hsl(var(--brand))" }}>
              {[
                { value: buildingsStat?.value ?? "419,582", label: "buildings mapped (OSM)" },
                { value: agentsStat?.value ?? "8,001",      label: "simulated residents" },
                { value: "583",                              label: "cooling & relief sites" },
                { value: "182",                              label: "existing clean-energy assets" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <span className="font-mono text-2xl font-medium text-foreground">{value}</span>
                  <div className="label mt-0.5" style={{ color: "hsl(var(--foreground) / 0.55)" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </Overlay>
      </div>

      {/* ── Scroll hint ──────────────────────────────────────────────── */}
      {station === 0 && (
        <div
          className="pointer-events-none fixed bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          style={{ color: "hsl(var(--muted-foreground) / 0.5)", zIndex: 85 }}
        >
          <span className="font-mono text-[10px] tracking-widest uppercase">Scroll to explore</span>
          <svg width="14" height="22" viewBox="0 0 14 22" fill="none" aria-hidden>
            <rect x="4" y="1" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="7" cy="5" r="1.5" fill="currentColor">
              <animate attributeName="cy" values="5;8;5" dur="1.8s" repeatCount="indefinite" />
            </circle>
          </svg>
        </div>
      )}

      {/* ── Road progress ─────────────────────────────────────────────── */}
      {!atScope && (
        <RoadProgress progress={progress} onDotClick={goToStation} />
      )}

      {/* ── Toronto Map scope selector ─────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 90,
          opacity: atScope ? 1 : 0,
          pointerEvents: atScope ? "auto" : "none",
          transition: "opacity 0.6s ease",
        }}
      >
        <TorontoMap />
      </div>
    </div>
  );
}
