import { Crosshair, Scales, Lightning } from "@phosphor-icons/react";
import { useStore } from "@/store";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { fmtCompact } from "@/lib/utils";

export function BuildPriority() {
  const ranked = useStore((s) => s.sitingPriority);
  const equityWeight = useStore((s) => s.equityWeight);
  const setEquityWeight = useStore((s) => s.setEquityWeight);
  const setPrimaryOverlay = useStore((s) => s.setPrimaryOverlay);
  const priorityOn = useStore((s) => s.layers.priority);
  const selectZone = useStore((s) => s.selectZone);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Where to build next — ranked by <b className="text-foreground">unmet
          demand</b> × <b className="text-foreground">energy burden</b>. Priority
          drops as zones get served.
        </p>

        {/* equity-weight slider */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Scales weight="bold" className="h-3 w-3 text-data-good" /> Equity weight
            </span>
            <span className="num font-semibold">
              {(equityWeight * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            value={[equityWeight * 100]}
            max={100}
            step={5}
            onValueChange={(v) => setEquityWeight((v[0] ?? 40) / 100)}
          />
          <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground">
            <span>← unmet demand</span>
            <span>energy equity →</span>
          </div>
        </div>

        <Button
          size="sm"
          variant={priorityOn ? "default" : "outline"}
          className="w-full"
          onClick={() => setPrimaryOverlay(priorityOn ? "none" : "priority")}
        >
          <Crosshair weight="bold" /> {priorityOn ? "Hide map overlay" : "Show on map"}
        </Button>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {ranked.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">
            No priority data yet.
          </p>
        )}
        {ranked.slice(0, 18).map((z, i) => (
          <button
            key={z.zoneId}
            onClick={() => selectZone(z.zoneId)}
            className="block w-full rounded-[var(--radius)] border border-border bg-muted/50 p-2 text-left transition-colors hover:border-fuchsia-400/60 hover:bg-muted"
          >
            <div className="flex items-center gap-1.5">
              <span className="num w-4 shrink-0 text-[10px] font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-xs font-medium">{z.name}</span>
              <span className="num text-[11px] font-semibold text-fuchsia-500">
                {(z.score * 100).toFixed(0)}
              </span>
            </div>
            <div className="mt-1 ml-5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-fuchsia-500"
                style={{ width: `${z.score * 100}%` }}
              />
            </div>
            <div className="num ml-5 mt-1 flex items-center gap-2 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Lightning weight="bold" className="h-2.5 w-2.5" />
                {(z.unmetRatio * 100).toFixed(0)}% unmet
              </span>
              <span>{fmtCompact(z.unmetDemandKwh)} kWh/mo</span>
              <span>burden {(z.energyBurden * 100).toFixed(0)}%</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
