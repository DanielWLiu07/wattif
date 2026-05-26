import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Scene3D, SceneEdit } from "@/components/landing/Scene3D";
import { TorontoMap } from "@/components/landing/TorontoMap";
import { landingStats } from "@/data/landingStats";

const EDIT_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("edit");

// ── Stat helper ──────────────────────────────────────────────────────────────

function stat(key: string) {
  return landingStats.find((s) => s.key === key);
}

// ── Overlay — cross-fades the whole station block in/out ──────────────────────
// Scale (0.97↔1) + blur (3px↔0) + opacity makes exits feel like a retreat
// and entries like a sharp focus-pull rather than a plain fade.

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
        transform: visible ? "translateY(0) scale(1)" : "translateY(10px) scale(0.97)",
        filter: visible ? "blur(0px)" : "blur(3px)",
        transition: "opacity 0.55s ease, transform 0.55s ease, filter 0.55s ease",
        willChange: "opacity, transform, filter",
      }}
    >
      {children}
    </div>
  );
}

// ── StaggerChild — sequences child reveals within an overlay ──────────────────
// Enter: transition-delay = index × 72ms so label animates in first, stats last.
// Exit: delay=0 so everything collapses together (clean, fast departure).

interface StaggerChildProps {
  index: number;
  visible: boolean;
  children: React.ReactNode;
}

function StaggerChild({ index, visible, children }: StaggerChildProps) {
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(9px)",
        transition: "opacity 0.42s ease, transform 0.42s ease",
        transitionDelay: visible ? `${index * 72}ms` : "0ms",
        willChange: "opacity, transform",
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
      {/* Label re-mounts on station change → CSS animation fires */}
      <span
        key={station}
        className="label"
        style={{
          color: "hsl(var(--foreground) / 0.45)",
          animation: "labelSlideUp 0.32s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        {STATION_LABELS[station]}
      </span>
      <div className="flex items-center" style={{ width: 180 }}>
        <div className="relative flex w-full items-center" style={{ height: 2 }}>
          <div className="absolute inset-0 rounded-full bg-foreground/12" />
          <div
            className="absolute left-0 h-full rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: "hsl(var(--brand))",
              transition: "width 0.06s linear",
            }}
          />
          {STATION_THRESHOLDS.map((threshold, i) => {
            const isCurrent = station === i;
            return (
              <button
                key={i}
                onClick={() => onDotClick(i)}
                aria-label={STATION_LABELS[i]}
                className="absolute -translate-x-1/2 -translate-y-1/2 top-1/2"
                style={{ left: `${threshold * 100}%` }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: isCurrent ? 10 : 6,
                    height: isCurrent ? 10 : 6,
                    background: isCurrent
                      ? "hsl(var(--brand))"
                      : progress >= threshold
                      ? "hsl(var(--brand) / 0.55)"
                      : "hsl(var(--foreground) / 0.2)",
                    boxShadow: isCurrent
                      ? "0 0 0 3px hsl(var(--brand) / 0.2)"
                      : "none",
                    transition: "all 0.28s cubic-bezier(0.34,1.56,0.64,1)",
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

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = (e.deltaY + e.deltaX) / 4200;
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

  const goToStation = useCallback((idx: number) => {
    targetRef.current = STATION_THRESHOLDS[idx];
  }, []);

  const highlightStat = stat("highBurdenZones");
  const renterStat = stat("renterShare");
  const gridStat = stat("gridIntensity");
  const buildingsStat = stat("buildings");
  const agentsStat = stat("agents");

  const atScope = progress > 0.86;

  // Per-overlay visibility flags
  const s0 = station === 0 && !atScope;
  const s1 = station === 1 && !atScope;
  const s2 = station === 2 && !atScope;

  return (
    <>
      {/* Keyframe for station label swap */}
      <style>{`
        @keyframes labelSlideUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

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
            {EDIT_MODE ? <SceneEdit /> : <Scene3D progress={progress} />}
          </Suspense>
        </Canvas>

        {/* ── HTML overlays (hidden in edit mode) ───────────────────────── */}
        <div className="pointer-events-none absolute inset-0 z-10" style={{ display: EDIT_MODE ? "none" : undefined }}>

          {/* Station 0: Hero */}
          <Overlay visible={s0}>
            <div className="flex flex-col gap-6">
              <StaggerChild index={0} visible={s0}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--brand))" }} />
                  <span className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Toronto Energy Digital Twin
                  </span>
                </div>
              </StaggerChild>

              <StaggerChild index={1} visible={s0}>
                <h1
                  className="font-display font-bold leading-none text-foreground"
                  style={{ fontSize: "clamp(4.5rem, 8vw, 8rem)", letterSpacing: "-0.03em" }}
                >
                  Watt
                  <span style={{ color: "hsl(var(--brand))" }}>If</span>
                  <span style={{ color: "hsl(var(--brand))" }}>.</span>
                </h1>
              </StaggerChild>

              <StaggerChild index={2} visible={s0}>
                <p className="max-w-md font-sans text-base leading-relaxed text-muted-foreground">
                  Site solar, wind, and battery across Toronto's 140 neighbourhoods —
                  and simulate who benefits first.
                </p>
              </StaggerChild>

              <StaggerChild index={3} visible={s0}>
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
                  onClick={() => {
                    // Jump straight to the scope screen (atScope = progress > 0.86)
                    targetRef.current = 1;
                  }}
                >
                  Start simulating
                </button>
              </StaggerChild>

              <StaggerChild index={4} visible={s0}>
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
              </StaggerChild>
            </div>
          </Overlay>

          {/* Station 1: Problem */}
          <Overlay visible={s1}>
            <div className="flex flex-col gap-6">
              <StaggerChild index={0} visible={s1}>
                <span className="label" style={{ color: "hsl(var(--data-alert))" }}>
                  The Problem
                </span>
              </StaggerChild>

              <StaggerChild index={1} visible={s1}>
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
              </StaggerChild>

              <StaggerChild index={2} visible={s1}>
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
                      <div className="label mt-1" style={{ color: "hsl(var(--foreground) / 0.55)" }}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </StaggerChild>
            </div>
          </Overlay>

          {/* Station 2: Infrastructure */}
          <Overlay visible={s2}>
            <div className="flex flex-col gap-6">
              <StaggerChild index={0} visible={s2}>
                <span className="label">How WattIf Works</span>
              </StaggerChild>

              <StaggerChild index={1} visible={s2}>
                <h2
                  className="font-display font-bold leading-tight text-foreground"
                  style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", letterSpacing: "-0.02em" }}
                >
                  An AI that sites
                  <br />
                  the grid — live.
                </h2>
              </StaggerChild>

              <StaggerChild index={2} visible={s2}>
                <p className="max-w-sm font-sans text-sm leading-relaxed text-muted-foreground">
                  Multi-agent system proposes solar, wind, battery, and microgrid
                  placements — optimising for coverage, equity, and budget.
                </p>
              </StaggerChild>

              <StaggerChild index={3} visible={s2}>
                <div className="flex flex-col gap-4 border-l-2 pl-5" style={{ borderColor: "hsl(var(--brand))" }}>
                  {[
                    { value: buildingsStat?.value ?? "419,582", label: "buildings mapped (OSM)" },
                    { value: agentsStat?.value ?? "8,001",      label: "simulated residents" },
                    { value: "583",                              label: "cooling & relief sites" },
                    { value: "182",                              label: "existing clean-energy assets" },
                  ].map(({ value, label }) => (
                    <div key={label}>
                      <span className="font-mono text-2xl font-medium text-foreground">{value}</span>
                      <div className="label mt-0.5" style={{ color: "hsl(var(--foreground) / 0.55)" }}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </StaggerChild>
            </div>
          </Overlay>
        </div>

        {/* ── Scroll hint ──────────────────────────────────────────────── */}
        {!EDIT_MODE && station === 0 && (
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
        {!EDIT_MODE && !atScope && (
          <RoadProgress progress={progress} onDotClick={goToStation} />
        )}

        {/* ── Toronto Map scope selector ─────────────────────────────── */}
        {!EDIT_MODE && <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            opacity: atScope ? 1 : 0,
            pointerEvents: atScope ? "auto" : "none",
            transition: "opacity 0.6s ease",
          }}
        >
          <TorontoMap active={atScope} />
        </div>}
      </div>
    </>
  );
}
