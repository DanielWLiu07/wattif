import {
  Sun,
  Wind,
  BatteryCharging,
  Network,
  MousePointer2,
  Sparkles,
  Check,
  Hand,
  Bot,
  Footprints,
} from "lucide-react";
import { useStore } from "@/store";
import type { InfraKind, PlacementMode } from "@/types";
import { INFRA_PRESETS, INFRA_COLOR } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, fmtCad } from "@/lib/utils";

const KIND_ICON: Record<InfraKind, React.ElementType> = {
  solar: Sun,
  wind: Wind,
  battery: BatteryCharging,
  microgrid: Network,
};
const KINDS: InfraKind[] = ["solar", "wind", "battery", "microgrid"];
const MODES: {
  key: PlacementMode;
  label: string;
  icon: React.ElementType;
  tip: string;
}[] = [
  { key: "manual", label: "Manual", icon: Hand, tip: "Place infrastructure yourself: pick a kind, then click the map." },
  { key: "auto", label: "AI Auto", icon: Bot, tip: "The AI planner sites a full plan automatically." },
  { key: "step", label: "AI Step", icon: Footprints, tip: "The AI proposes one action at a time — you approve or reject." },
];
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

export function BuildTab() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const placementMode = useStore((s) => s.placementMode);
  const setPlacementMode = useStore((s) => s.setPlacementMode);
  const placeKind = useStore((s) => s.placeKind);
  const setPlaceKind = useStore((s) => s.setPlaceKind);
  const infra = useStore((s) => s.infra);
  const optimizing = useStore((s) => s.optimizing);
  const runOptimize = useStore((s) => s.runOptimize);
  const recommendations = useStore((s) => s.recommendations);
  const acceptRecommendation = useStore((s) => s.acceptRecommendation);
  const clearRecommendations = useStore((s) => s.clearRecommendations);

  return (
    <div className="space-y-3 p-3">
      {/* Mode segmented control */}
      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Mode
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = placementMode === m.key;
            return (
              <Tooltip key={m.key}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setPlacementMode(m.key)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 hover:bg-secondary"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {m.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[200px]">{m.tip}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {placementMode === "manual" ? (
        <>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "select" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("select")}
            >
              <MousePointer2 /> Inspect
            </Button>
            <Button
              size="sm"
              variant={mode === "place" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("place")}
            >
              <MousePointer2 /> Place
            </Button>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Infrastructure
            </div>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => {
                const Icon = KIND_ICON[k];
                const active = mode === "place" && placeKind === k;
                return (
                  <button
                    key={k}
                    onClick={() => setPlaceKind(k)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                        : "border-border hover:border-primary/50 hover:bg-secondary"
                    )}
                  >
                    <Icon className="h-5 w-5" style={{ color: rgb(INFRA_COLOR[k]) }} />
                    <span className="text-xs font-medium">
                      {INFRA_PRESETS[k].label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {INFRA_PRESETS[k].capacityKw} kW · {fmtCad(INFRA_PRESETS[k].costCad)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 px-2.5 py-1.5">
            <span className="text-[11px] text-muted-foreground">
              {mode === "place"
                ? `Click the map to place a ${placeKind}`
                : "Click a unit to inspect / remove"}
            </span>
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {infra.length}
            </Badge>
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-accent/30 bg-accent/5 p-2.5 text-[11px] leading-snug text-muted-foreground">
          The agent is {placementMode === "auto" ? "auto-placing" : "stepping through"}{" "}
          infrastructure. Watch it reason in the <b className="text-foreground">Chat</b>{" "}
          tab — infra appears on the map as it commits each placement.
        </p>
      )}

      {/* Optimizer */}
      <div className="rounded-xl border border-border/60 bg-secondary/20 p-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 text-accent" /> Optimizer
        </div>
        <Button className="w-full" size="sm" onClick={() => runOptimize(5)} disabled={optimizing}>
          <Sparkles />
          {optimizing ? "Optimizing…" : "Recommend sites"}
        </Button>
        {recommendations.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {recommendations.length} candidates
              </span>
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={clearRecommendations}
              >
                clear
              </button>
            </div>
            {recommendations.map((r, i) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <div key={i} className="rounded-lg border border-border bg-secondary/40 p-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium capitalize">
                      <Icon className="h-3.5 w-3.5" style={{ color: rgb(INFRA_COLOR[r.kind]) }} />
                      {r.kind}
                    </span>
                    <Badge variant="accent">{(r.score * 100).toFixed(0)}</Badge>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    {r.rationale}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1.5 h-6 w-full text-[11px]"
                    onClick={() => acceptRecommendation(r)}
                  >
                    <Check /> Place here
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
