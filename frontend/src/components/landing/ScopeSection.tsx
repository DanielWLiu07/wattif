import { ArrowRight, MapPin, City, Buildings, Tree } from "@phosphor-icons/react";
import { useStore } from "@/store";
import { ContourBackground } from "./ContourBackground";

interface Region {
  name: string;
  key: string;
  icon: React.ElementType;
  desc: string;
  stats: string;
  load: "All zones" | "Light" | "Medium" | "Focused";
}

const REGIONS: Region[] = [
  {
    name: "All Toronto",
    key: "All",
    icon: City,
    desc: "Full simulation — all 140 neighbourhoods, 4,000 agents, complete grid.",
    stats: "140 zones · ~4,000 agents",
    load: "All zones",
  },
  {
    name: "Downtown",
    key: "Downtown",
    icon: Buildings,
    desc: "Dense commercial core and high-rise residential. Highest energy demand.",
    stats: "~12 zones · ~1,200 agents",
    load: "Focused",
  },
  {
    name: "Midtown",
    key: "Midtown",
    icon: Tree,
    desc: "Upscale mixed-use corridors. Good rooftop potential and transit access.",
    stats: "~5 zones · ~500 agents",
    load: "Light",
  },
  {
    name: "North York",
    key: "North York",
    icon: MapPin,
    desc: "Rapidly growing suburbs, transit hubs, and large-footprint commercial.",
    stats: "~4 zones · ~450 agents",
    load: "Light",
  },
];

interface Props {
  onScopeSelected: () => void;
}

export function ScopeSection({ onScopeSelected }: Props) {
  const setSelectedRegion = useStore((s) => s.setSelectedRegion);

  const handleSelect = (key: string) => {
    setSelectedRegion(key);
    useStore.setState({ showRegionSelector: false });
    onScopeSelected();
  };

  return (
    <section
      className="relative flex h-full w-screen shrink-0 items-center overflow-hidden bg-background"
      data-section="scope"
    >
      <ContourBackground className="text-foreground opacity-[0.04]" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-12 px-16">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <span className="label" style={{ color: "hsl(var(--brand))" }}>Step 1 of 1</span>
          <h2
            className="font-display font-bold text-foreground"
            style={{ fontSize: "clamp(2.5rem, 4vw, 3.5rem)", letterSpacing: "-0.025em" }}
          >
            Choose your simulation scope.
          </h2>
          <p className="max-w-xl font-sans text-base leading-relaxed text-muted-foreground">
            Restricting the scope drops zone count and agent arrays by up to{" "}
            <span className="font-semibold text-foreground">90%</span> —
            faster rendering on any machine.
          </p>
        </div>

        {/* Region cards */}
        <div className="grid grid-cols-4 gap-3">
          {REGIONS.map(({ name, key, icon: Icon, desc, stats, load }) => (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              className="group flex flex-col gap-5 rounded-[var(--radius)] border border-border bg-background p-6 text-left transition-all duration-200 hover:border-foreground hover:shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
            >
              {/* Icon + load badge */}
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-foreground transition-colors group-hover:border-foreground group-hover:bg-foreground group-hover:text-background">
                  <Icon weight="regular" className="h-5 w-5" />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground tracking-wide">
                  {load}
                </span>
              </div>

              {/* Name */}
              <div>
                <div className="font-display text-lg font-bold text-foreground">{name}</div>
                <p className="mt-1.5 font-sans text-xs leading-relaxed text-muted-foreground">
                  {desc}
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="font-mono text-[10px] text-muted-foreground">{stats}</span>
                <ArrowRight
                  weight="bold"
                  className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:text-foreground"
                />
              </div>
            </button>
          ))}
        </div>

        <p className="font-sans text-xs text-muted-foreground">
          You can change scope at any time from the dashboard header.
        </p>
      </div>
    </section>
  );
}
