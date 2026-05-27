import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { ContourBackground } from "@/components/landing/ContourBackground";
import { validationStats } from "./slideStats";

const SLIDE_COUNT = 6;
const TEAM = ["Sardul", "Sujal", "Daniel", "Sakib"] as const;

const PROBLEM_ITEMS = [
  {
    emoji: "1️⃣",
    title: "Renewable Siting & Demand Matching",
    body: "Identify where renewable installations will be most effective by combining energy potential + local demand",
  },
  {
    emoji: "2️⃣",
    title: "DER Capacity & Grid Stability",
    body: "Understand how much DERs (solar, EVs, batteries) the grid can support without overload",
  },
] as const;

const TECH_STACK = [
  "React 19, Vite, TypeScript, Tailwind, Zustand",
  "Mapbox / MapLibre + deck.gl 3D planning map",
  "FastAPI simulation backend + WebSocket live ticks",
  "Supabase Postgres for proposals, placements, snapshots",
  "Anthropic / Featherless planner with scripted fallback",
] as const;

const FEATURES = [
  "140 Toronto neighbourhoods with demand, equity, risk, constraints, and clean-asset overlays",
  "Manual, optimizer, or AI-assisted placement for solar, wind, batteries, microgrids, and EV chargers",
  "Monthly simulation metrics: coverage, equity, approval, emissions, grid load, cost",
  "16+ stress scenarios including blackout, heatwave, ice storm, flood, EV surge, and gas spike",
  "Snapshots, comparisons, and exportable decision-support memo",
] as const;

const BIG_TICKETS = [
  "Equity-weighted optimizer ranks sites by renewable potential and energy burden, not cost alone",
  "Real Toronto data lane: open data, Census signals, OSM buildings, PVGIS solar, city clean assets",
  "~8,000 simulated residents and template voices for zone-by-zone sentiment",
  "Honesty badges show Live vs Mock API, LLM vs Demo planner, Supabase vs in-memory",
  "Hackathon-safe offline mode when backend, keys, or network are unavailable",
] as const;

const STAT_TONE = {
  brand: { text: "text-brand", fill: "bg-brand", border: "border-brand/50" },
  warn: { text: "text-data-warn", fill: "bg-data-warn", border: "border-data-warn/50" },
  alert: { text: "text-data-alert", fill: "bg-data-alert", border: "border-data-alert/50" },
  info: { text: "text-data-info", fill: "bg-data-info", border: "border-data-info/50" },
} as const;

function SlideChrome({
  index,
  showHackathonAccent,
}: {
  index: number;
  showHackathonAccent: boolean;
}) {
  return (
    <>
      {showHackathonAccent && (
        <p className="animate-fade-in absolute left-10 top-10 font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
          Seneca Energy Hackathon
        </p>
      )}
      <p className="animate-fade-in absolute right-10 top-10 font-mono text-xs tabular-nums text-muted-foreground">
        {String(index + 1).padStart(2, "0")} / {String(SLIDE_COUNT).padStart(2, "0")}
      </p>
    </>
  );
}

function StatCard({
  stat,
  delayMs,
  visible,
}: {
  stat: (typeof validationStats)[number];
  delayMs: number;
  visible: boolean;
}) {
  const tone = STAT_TONE[stat.tone];

  return (
    <article
      className={`flex min-h-[17rem] flex-col gap-4 border bg-background p-5 transition-all duration-700 ${tone.border}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transitionDelay: `${delayMs}ms`,
      }}
    >
      <div
        className={`font-mono font-semibold ${tone.text}`}
        style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)", lineHeight: 1, letterSpacing: "-0.04em" }}
      >
        {stat.value}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${tone.fill} transition-[width] duration-1000 ease-out`}
          style={{ width: visible ? `${stat.intensity}%` : "0%" }}
        />
      </div>
      <h3 className="font-display text-lg font-semibold leading-tight text-foreground">{stat.label}</h3>
      <p className="font-sans text-sm leading-relaxed text-muted-foreground">{stat.detail}</p>
      {stat.sourceUrl ? (
        <a
          className="mt-auto font-mono text-[10px] leading-snug text-muted-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
          href={stat.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {stat.source}
        </a>
      ) : (
        <p className="mt-auto font-mono text-[10px] leading-snug text-muted-foreground/80">{stat.source}</p>
      )}
    </article>
  );
}

export function DemoSlideshow() {
  const [index, setIndex] = useState(0);
  const [entered, setEntered] = useState(false);

  const go = useCallback((delta: number) => {
    setEntered(false);
    setIndex((i) => Math.max(0, Math.min(SLIDE_COUNT - 1, i + delta)));
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Home") {
        setIndex(0);
      } else if (e.key === "End") {
        setIndex(SLIDE_COUNT - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const progress = ((index + 1) / SLIDE_COUNT) * 100;

  return (
    <div className="relative flex h-full min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <ContourBackground className="pointer-events-none text-foreground opacity-[0.04]" />

      <div className="relative z-10 flex flex-1 flex-col">
        {/* Slide 1 — Title */}
        {index === 0 && (
          <section className="relative flex flex-1 flex-col items-center justify-center px-16 pb-24 pt-20">
            <SlideChrome index={index} showHackathonAccent />
            <div
              className="flex max-w-3xl flex-col items-center gap-8 text-center transition-all duration-700"
              style={{
                opacity: entered ? 1 : 0,
                transform: entered ? "scale(1)" : "scale(0.96)",
              }}
            >
              <h1
                className="font-display font-bold leading-none"
                style={{ fontSize: "clamp(4rem, 12vw, 7rem)", letterSpacing: "-0.03em" }}
              >
                Watt<span className="text-brand">If</span>
              </h1>
              <p className="max-w-xl font-display text-xl font-medium text-muted-foreground md:text-2xl">
                An AI-assisted clean-energy planning simulator for equitable renewable siting.
              </p>
              <p className="font-mono text-sm tracking-wide text-muted-foreground">
                {TEAM.join(" · ")}
              </p>
              <p className="rounded-full border border-border px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] text-foreground">
                Team Velocity
              </p>
            </div>
          </section>
        )}

        {/* Slide 2 — Validation stats */}
        {index === 1 && (
          <section className="relative flex flex-1 flex-col justify-center px-10 pb-24 pt-16 md:px-16">
            <SlideChrome index={index} showHackathonAccent={false} />
            <div
              className="mb-8 grid items-end gap-8 transition-all duration-500 lg:grid-cols-[0.85fr_1.15fr]"
              style={{ opacity: entered ? 1 : 0, transform: entered ? "none" : "translateY(12px)" }}
            >
              <div>
                <p className="label text-brand">Why now</p>
                <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold leading-tight md:text-5xl">
                  Clean-energy planning is bottlenecked before shovels hit the ground.
                </h2>
              </div>
              <p className="max-w-xl font-sans text-base leading-relaxed text-muted-foreground">
                WattIf compresses the early planning loop: match siting potential with demand,
                equity, community risk, and grid capacity before a proposal turns into sunk cost.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {validationStats.map((stat, i) => (
                <StatCard key={stat.label} stat={stat} delayMs={i * 100} visible={entered} />
              ))}
            </div>
          </section>
        )}

        {/* Slide 3 — Problem */}
        {index === 2 && (
          <section className="relative flex flex-1 flex-col justify-center px-10 pb-24 pt-16 md:px-20">
            <SlideChrome index={index} showHackathonAccent={false} />
            <p
              className="label mb-4 text-data-alert transition-opacity duration-500"
              style={{ opacity: entered ? 1 : 0 }}
            >
              Challenge set 1 · Theme 1
            </p>
            <h2
              className="mb-12 max-w-3xl font-display text-3xl font-bold leading-tight md:text-5xl"
              style={{
                opacity: entered ? 1 : 0,
                transform: entered ? "none" : "translateY(16px)",
                transition: "all 0.6s ease",
              }}
            >
              The problem we&apos;re targeting
            </h2>
            <div className="grid max-w-5xl gap-8 md:grid-cols-2">
              {PROBLEM_ITEMS.map((item, i) => (
                <div
                  key={item.title}
                  className="border-l-4 border-brand pl-6 transition-all duration-700"
                  style={{
                    opacity: entered ? 1 : 0,
                    transform: entered ? "none" : "translateX(-20px)",
                    transitionDelay: `${200 + i * 150}ms`,
                  }}
                >
                  <span className="text-2xl">{item.emoji}</span>
                  <h3 className="mt-3 font-display text-xl font-semibold md:text-2xl">{item.title}</h3>
                  <p className="mt-3 font-sans text-base leading-relaxed text-muted-foreground md:text-lg">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Slide 4 — Product demo */}
        {index === 3 && (
          <section className="relative flex flex-1 flex-col items-center justify-center gap-8 px-10 pb-24 pt-16">
            <SlideChrome index={index} showHackathonAccent={false} />
            <h2
              className="font-display text-4xl font-bold md:text-5xl"
              style={{ opacity: entered ? 1 : 0, transition: "opacity 0.5s" }}
            >
              Product demo
            </h2>
            <div
              className="relative w-full max-w-5xl overflow-hidden rounded-lg border border-border shadow-2xl transition-all duration-700"
              style={{
                opacity: entered ? 1 : 0,
                transform: entered ? "scale(1)" : "scale(0.98)",
              }}
            >
              <img
                src="/demo-wattif-map.png"
                alt="WattIf 3D Toronto map with infrastructure placement and metrics"
                className="aspect-video w-full object-cover object-top bg-muted"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  const fallback = el.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.classList.remove("hidden");
                }}
              />
              <div className="hidden flex aspect-video w-full flex-col items-center justify-center gap-3 bg-muted p-8 text-center">
                <p className="font-display text-lg font-semibold">Add your screenshot</p>
                <p className="max-w-md font-mono text-xs text-muted-foreground">
                  Save a capture of the live app as{" "}
                  <code className="text-foreground">frontend/public/demo-wattif-map.png</code>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Slide 5 — Tech stack */}
        {index === 4 && (
          <section className="relative flex flex-1 flex-col justify-center px-10 pb-24 pt-14 md:px-16">
            <SlideChrome index={index} showHackathonAccent={false} />
            <h2
              className="mb-10 font-display text-3xl font-bold md:text-4xl"
              style={{ opacity: entered ? 1 : 0 }}
            >
              Tech stack · Features · Highlights
            </h2>
            <div className="grid gap-10 lg:grid-cols-3">
              {[
                { title: "Tech stack", items: TECH_STACK },
                { title: "Features", items: FEATURES },
                { title: "Big ticket items", items: BIG_TICKETS },
              ].map((col, colIdx) => (
                <div
                  key={col.title}
                  className="transition-all duration-700"
                  style={{
                    opacity: entered ? 1 : 0,
                    transform: entered ? "none" : "translateY(20px)",
                    transitionDelay: `${colIdx * 120}ms`,
                  }}
                >
                  <h3 className="mb-4 border-b border-border pb-2 font-mono text-xs uppercase tracking-widest text-brand">
                    {col.title}
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {col.items.map((line) => (
                      <li
                        key={line}
                        className="flex gap-2 font-sans text-sm leading-snug text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Slide 6 — Thank you */}
        {index === 5 && (
          <section className="relative flex flex-1 flex-col items-center justify-center px-10 pb-24 pt-16 text-center">
            <SlideChrome index={index} showHackathonAccent={false} />
            <div
              className="flex max-w-4xl flex-col items-center gap-8 transition-all duration-700"
              style={{
                opacity: entered ? 1 : 0,
                transform: entered ? "translateY(0) scale(1)" : "translateY(20px) scale(0.98)",
              }}
            >
              <p className="label text-brand">Velocity · Seneca Energy Hackathon</p>
              <h2
                className="font-display font-bold leading-none"
                style={{ fontSize: "clamp(3.5rem, 9vw, 6.5rem)", letterSpacing: "-0.04em" }}
              >
                Thank you.
              </h2>
              <p className="max-w-2xl font-display text-xl font-medium leading-relaxed text-muted-foreground md:text-2xl">
                We appreciate the opportunity to share WattIf and the future we imagine for
                faster, fairer clean-energy planning.
              </p>
              <a
                className="rounded-full border border-border px-6 py-3 font-mono text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:border-brand hover:text-brand"
                href="https://github.com/DanielWLiu07/wattif"
                target="_blank"
                rel="noreferrer"
              >
                github.com/DanielWLiu07/wattif
              </a>
            </div>
          </section>
        )}
      </div>

      {/* Nav + progress */}
      <div className="relative z-20 border-t border-border bg-background/90 backdrop-blur-sm">
        <div
          className="h-1 bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={SLIDE_COUNT}
        />
        <div className="flex items-center justify-between px-6 py-3">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <p className="font-mono text-xs text-muted-foreground">
            ← → or Space to advance · {index + 1} / {SLIDE_COUNT}
          </p>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index === SLIDE_COUNT - 1}
            className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
