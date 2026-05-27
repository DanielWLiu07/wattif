import { Robot, Graph, MapTrifold, Cpu } from "@phosphor-icons/react";
import { ContourBackground } from "./ContourBackground";
import { landingStats } from "@/data/landingStats";

const steps = [
  {
    icon: MapTrifold,
    num: "01",
    title: "Real city geometry",
    body: "419,582 building footprints from OpenStreetMap. Every neighbourhood, road, and flood-risk polygon — no synthetic data.",
  },
  {
    icon: Robot,
    num: "02",
    title: "Agent-based simulation",
    body: "8,000+ simulated residents, each with income, tenure, and energy profile. Agents form opinions, react to outages, and adopt solar.",
  },
  {
    icon: Cpu,
    num: "03",
    title: "AI planning engine",
    body: "A multi-agent system proposes where to site solar, wind, battery, and microgrids — optimising for coverage, equity, and budget.",
  },
  {
    icon: Graph,
    num: "04",
    title: 'Counterfactual "what-if"',
    body: "Trigger blackouts, heatwaves, ice storms. Watch which zones hold — and use that to prioritise resilient infrastructure investment.",
  },
];

export function ApproachSection() {
  const buildingsStat = landingStats.find((s) => s.key === "buildings")!;
  const agentsStat = landingStats.find((s) => s.key === "agents")!;

  return (
    <section
      className="relative flex h-full w-screen shrink-0 items-center overflow-hidden bg-background"
      data-section="approach"
    >
      <ContourBackground className="text-foreground opacity-[0.04]" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center gap-20 px-16">
        {/* Left: headline + big numbers */}
        <div className="flex w-[38%] shrink-0 flex-col gap-8">
          <span className="label">The Approach</span>

          <h2
            className="font-display font-bold leading-tight text-foreground"
            style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", letterSpacing: "-0.02em" }}
          >
            A 3D digital twin
            <br />
            of the whole city.
          </h2>

          <p className="font-sans text-base leading-relaxed text-muted-foreground">
            WattIf combines real geospatial data, agent-based social dynamics, and
            an AI planning engine into a single interactive model — so energy planners
            can simulate policy before committing infrastructure.
          </p>

          {/* Key stats */}
          <div className="flex flex-col gap-4 border-l-2 border-brand pl-5">
            {[buildingsStat, agentsStat].map((s) => (
              <div key={s.key}>
                <div className="font-mono text-3xl font-medium text-foreground">
                  {s.value}
                </div>
                <div className="label mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: step cards */}
        <div className="flex flex-1 flex-col gap-px border border-border bg-border">
          {steps.map(({ icon: Icon, num, title, body }) => (
            <div
              key={num}
              className="group flex items-start gap-5 bg-background p-6 transition-colors duration-150 hover:bg-muted/60"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                <Icon weight="regular" className="h-5 w-5 text-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-muted-foreground">{num}</span>
                  <span className="font-display text-base font-semibold text-foreground">
                    {title}
                  </span>
                </div>
                <p className="mt-1.5 font-sans text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
