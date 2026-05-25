import { useState } from "react";
import { Shuffle, RotateCcw, Crosshair, Zap, Globe } from "lucide-react";
import { useStore } from "@/store";
import { SCENARIO_PRESETS } from "@/types";
import type { ScenarioType } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ScenarioControls() {
  const triggerScenario = useStore((s) => s.triggerScenario);
  const resetSession = useStore((s) => s.resetSession);
  const targeting = useStore((s) => s.scenarioTargeting);
  const setScenarioTargeting = useStore((s) => s.setScenarioTargeting);
  const pendingType = useStore((s) => s.pendingScenarioType);
  const [city, setCity] = useState(false);

  const onEvent = (type: ScenarioType | "random") => {
    if (city || type === "random") {
      void triggerScenario(type); // city-wide, immediate
    } else {
      // point-and-click: arm targeting; banner + crosshair guide the click
      setScenarioTargeting(true, type);
    }
  };

  return (
    <div className="space-y-3 p-3">
      <p className="text-[11px] leading-snug text-muted-foreground">
        Click an event to fire it. By default you then{" "}
        <b className="text-foreground">click a neighbourhood</b> on the map to
        strike it there — or switch to city-wide.
      </p>

      {/* scope toggle */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => {
            setCity(false);
            if (targeting) setScenarioTargeting(true, pendingType);
          }}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
            !city
              ? "border-yellow-400/60 bg-yellow-400/10 text-yellow-200"
              : "border-border hover:bg-secondary"
          )}
        >
          <Crosshair className="h-3.5 w-3.5" /> Click a zone
        </button>
        <button
          onClick={() => {
            setCity(true);
            setScenarioTargeting(false);
          }}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
            city
              ? "border-primary bg-primary/10 text-primary"
              : "border-border hover:bg-secondary"
          )}
        >
          <Globe className="h-3.5 w-3.5" /> City-wide
        </button>
      </div>

      {targeting && (
        <p className="flex items-center gap-1 rounded-md border border-yellow-400/40 bg-yellow-400/10 px-2 py-1.5 text-[11px] text-yellow-100">
          <Zap className="h-3 w-3 shrink-0" /> Crosshair active — click a
          neighbourhood to strike it. Esc to cancel.
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {SCENARIO_PRESETS.map((p) => {
          const armed = targeting && pendingType === p.type;
          return (
            <button
              key={p.type}
              onClick={() => onEvent(p.type)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors",
                armed
                  ? "border-yellow-400/60 bg-yellow-400/10 ring-1 ring-yellow-400/40"
                  : "border-border bg-secondary/30 hover:border-yellow-400/50 hover:bg-yellow-400/10"
              )}
            >
              <span>{p.icon}</span>
              <span className="truncate">{p.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => void triggerScenario("random")}
        >
          <Shuffle /> Random
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          onClick={() => resetSession()}
        >
          <RotateCcw /> Reset
        </Button>
      </div>
    </div>
  );
}
