import { ArrowRight, Lightning } from "@phosphor-icons/react";
import { ContourBackground } from "./ContourBackground";
import { WindTurbine } from "./WindTurbine";

interface Props {
  onEnter: () => void;
  visible: boolean;
}

export function HeroSection({ onEnter, visible }: Props) {
  return (
    <section className="relative flex h-full w-screen shrink-0 items-center overflow-hidden bg-background">
      {/* Contour-line texture — energy theme connective tissue */}
      <ContourBackground className="text-foreground opacity-[0.05]" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center gap-16 px-16">
        {/* Left: identity + CTA */}
        <div className="flex flex-1 flex-col gap-8">
          {/* Live badge */}
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-brand" />
            <span className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Toronto Energy Digital Twin
            </span>
          </div>

          {/* Hero wordmark */}
          <div>
            <h1
              className="font-display font-bold leading-none text-foreground"
              style={{ fontSize: "clamp(5rem, 10vw, 9rem)", letterSpacing: "-0.03em" }}
            >
              Watt
              <span className="text-brand">If</span>
              <span className="text-brand">.</span>
            </h1>
            <p
              className="mt-4 font-display font-semibold text-muted-foreground"
              style={{ fontSize: "clamp(1.1rem, 2vw, 1.6rem)" }}
            >
              Simulate renewable energy siting
              <br />
              across Toronto — neighbourhood by neighbourhood.
            </p>
          </div>

          {/* Supporting copy */}
          <p className="max-w-lg font-sans text-base leading-relaxed text-muted-foreground">
            An agent-based 3D city twin that finds where solar, wind, and battery
            infrastructure can reach the residents who need it most.
          </p>

          {/* CTA row */}
          <div className="flex items-center gap-4">
            <button
              onClick={onEnter}
              className="group flex items-center gap-2.5 rounded-full bg-foreground px-7 py-3.5 font-sans text-sm font-semibold text-background transition-all duration-200 hover:gap-4 hover:bg-brand hover:text-brand-ink"
            >
              Choose your scope
              <ArrowRight
                weight="bold"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </button>

            <button
              className="flex items-center gap-2 rounded-full border border-border px-6 py-3.5 font-sans text-sm font-semibold text-foreground transition-colors duration-200 hover:border-foreground"
              onClick={() => {
                const el = document.querySelector("[data-section='approach']");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <Lightning weight="fill" className="h-4 w-4 text-brand" />
              How it works
            </button>
          </div>

          {/* Micro-stats row */}
          <div className="flex items-center gap-8 border-t border-border pt-6">
            {[
              { num: "140", label: "neighbourhoods" },
              { num: "2.73M", label: "residents" },
              { num: "419k", label: "buildings" },
            ].map(({ num, label }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="font-mono text-xl font-medium text-foreground">{num}</span>
                <span className="label">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: 3D turbine model */}
        <div className="flex flex-1 items-center justify-center">
          <div
            className={`transition-all duration-1000 ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <WindTurbine />
          </div>
        </div>
      </div>

      {/* Scroll hint — bottom center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground/50">
        <span className="font-mono text-[10px] tracking-widest uppercase">Scroll to explore</span>
        <svg width="16" height="24" viewBox="0 0 16 24" fill="none" aria-hidden>
          <rect x="5" y="1" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="5" r="1.5" fill="currentColor">
            <animate attributeName="cy" values="5;9;5" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </section>
  );
}
