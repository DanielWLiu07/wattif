import { Warning, HouseSimple, Lightning } from "@phosphor-icons/react";
import { ContourBackground } from "./ContourBackground";
import { heroStats } from "@/data/landingStats";

export function ProblemSection() {
  // Pick the most impactful "problem" stats
  const burdenStat = heroStats.find((s) => s.key === "highBurdenZones")!;
  const renterStat = { value: "46%", label: "households rent", detail: "Core of the energy-equity story — renters can't install their own solar." };
  const emissionsStat = heroStats.find((s) => s.key === "gridIntensity") ?? heroStats[0];

  return (
    <section
      className="relative flex h-full w-screen shrink-0 items-center overflow-hidden bg-background"
      data-section="problem"
    >
      <ContourBackground className="text-foreground opacity-[0.04]" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center gap-16 px-16">
        {/* Section label */}
        <div className="flex items-center gap-3">
          <Warning weight="bold" className="h-5 w-5" style={{ color: "hsl(var(--data-alert))" }} />
          <span className="label" style={{ color: "hsl(var(--data-alert))" }}>The Problem</span>
        </div>

        {/* Big headline */}
        <div className="max-w-3xl">
          <h2
            className="font-display font-bold leading-tight text-foreground"
            style={{ fontSize: "clamp(2.5rem, 5vw, 4.5rem)", letterSpacing: "-0.02em" }}
          >
            Toronto's energy
            <br />
            burden isn't evenly
            <br />
            <span className="text-data-alert">distributed.</span>
          </h2>
        </div>

        {/* Stat callout row */}
        <div className="grid grid-cols-3 gap-px border border-border bg-border">
          {/* Big burden stat */}
          <div className="flex flex-col gap-3 bg-background p-8">
            <HouseSimple weight="regular" className="h-6 w-6 text-muted-foreground" />
            <div>
              <div
                className="font-mono font-semibold text-data-alert"
                style={{ fontSize: "4.5rem", lineHeight: 1, letterSpacing: "-0.04em" }}
              >
                {burdenStat.value}
              </div>
              <div className="mt-2 font-display text-lg font-semibold text-foreground">
                {burdenStat.label}
              </div>
            </div>
            <p className="font-sans text-sm text-muted-foreground leading-relaxed">
              {burdenStat.detail}
            </p>
          </div>

          {/* Renter share */}
          <div className="flex flex-col gap-3 bg-background p-8">
            <Lightning weight="regular" className="h-6 w-6 text-muted-foreground" />
            <div>
              <div
                className="font-mono font-semibold text-foreground"
                style={{ fontSize: "4.5rem", lineHeight: 1, letterSpacing: "-0.04em" }}
              >
                {renterStat.value}
              </div>
              <div className="mt-2 font-display text-lg font-semibold text-foreground">
                {renterStat.label}
              </div>
            </div>
            <p className="font-sans text-sm text-muted-foreground leading-relaxed">
              {renterStat.detail}
            </p>
          </div>

          {/* Grid intensity */}
          <div className="flex flex-col gap-3 bg-background p-8">
            <div className="h-6 w-6 rounded-full bg-brand" />
            <div>
              <div
                className="font-mono font-semibold text-foreground"
                style={{ fontSize: "4.5rem", lineHeight: 1, letterSpacing: "-0.04em" }}
              >
                {emissionsStat.value}
                {emissionsStat.unit && (
                  <span className="ml-2 text-2xl text-muted-foreground">
                    {emissionsStat.unit}
                  </span>
                )}
              </div>
              <div className="mt-2 font-display text-lg font-semibold text-foreground">
                {emissionsStat.label}
              </div>
            </div>
            <p className="font-sans text-sm text-muted-foreground leading-relaxed">
              {emissionsStat.detail}
            </p>
          </div>
        </div>

        <p className="font-sans text-base text-muted-foreground max-w-xl">
          Low-income renters in high-burden zones pay the highest share of income on energy —
          yet they're last in line for clean-energy investment. WattIf shows planners exactly
          where to act first.
        </p>
      </div>
    </section>
  );
}
