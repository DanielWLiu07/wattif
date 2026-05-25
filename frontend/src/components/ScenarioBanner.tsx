import { Warning as AlertTriangle, X } from "@phosphor-icons/react";
import { useStore } from "@/store";
import { SCENARIO_PRESETS } from "@/types";

export function ScenarioBanner() {
  const scenarios = useStore((s) => s.scenarios);
  const resetSession = useStore((s) => s.resetSession);
  const lastTargetZoneId = useStore((s) => s.lastTargetZoneId);
  const zones = useStore((s) => s.zones);
  const active = scenarios[scenarios.length - 1];
  if (!active) return null;
  const icon =
    SCENARIO_PRESETS.find((p) => p.type === active.type)?.icon ?? "⚠️";
  const targetName = zones.find((z) => z.id === lastTargetZoneId)?.name;

  return (
    <div className="pointer-events-auto mx-auto mt-1 flex w-fit max-w-[680px] items-center gap-3 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-4 py-1.5">
      <span className="text-lg leading-none">{icon}</span>
      <div className="flex items-center gap-2 text-xs">
        <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
        <b className="text-yellow-200">{active.label}</b>
        {targetName ? (
          <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 text-[11px] text-yellow-100">
            🎯 {targetName}
          </span>
        ) : (
          <span className="rounded-full bg-yellow-400/10 px-2 py-0.5 text-[11px] text-yellow-100/80">
            city-wide
          </span>
        )}
        <span className="hidden max-w-[320px] truncate text-yellow-100/70 sm:inline">
          {active.description}
        </span>
      </div>
      <button
        onClick={resetSession}
        className="ml-1 rounded-full p-0.5 text-yellow-200/60 hover:bg-yellow-400/20 hover:text-yellow-100"
        aria-label="Clear scenario"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
