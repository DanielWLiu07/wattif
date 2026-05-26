import { Zap, Play, MousePointerClick, Sparkles, Scale } from "lucide-react";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";

export function Welcome() {
  const showWelcome = useStore((s) => s.showWelcome);
  const dismissWelcome = useStore((s) => s.dismissWelcome);
  if (!showWelcome) return null;

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div className="glass animate-in fade-in zoom-in-95 mx-4 w-full max-w-md rounded-2xl p-6 shadow-2xl duration-300">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-none">WattIf</h1>
            <p className="text-xs text-muted-foreground">
              Toronto energy-equity simulator
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-foreground/90">
          Plan renewable infrastructure across Toronto and watch coverage, cost,
          public approval, and <b>energy equity</b> play out in 3D — by hand or
          with an AI planning agent.
        </p>

        <div className="my-4 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-2">
            <Scale className="mx-auto mb-1 h-4 w-4 text-emerald-400" />
            Equity overlays
          </div>
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-2">
            <Sparkles className="mx-auto mb-1 h-4 w-4 text-accent" />
            AI site planner
          </div>
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-2">
            <Play className="mx-auto mb-1 h-4 w-4 text-primary" />
            Live scenarios
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button className="w-full" onClick={dismissWelcome}>
            <MousePointerClick /> Explore on my own
          </Button>
        </div>
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Works fully on built-in data — no backend or API key required.
        </p>
      </div>
    </div>
  );
}
