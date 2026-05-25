import { useMemo } from "react";
import { Sun, Wind, BatteryCharging, Network, Crosshair, Trash2, Bot, User } from "lucide-react";
import { useStore } from "@/store";
import type { InfraKind } from "@/types";
import { INFRA_COLOR } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubjectSentiment } from "@/components/SubjectSentiment";
import { cn, fmtCompact } from "@/lib/utils";

const KIND_ICON: Record<InfraKind, React.ElementType> = {
  solar: Sun,
  wind: Wind,
  battery: BatteryCharging,
  microgrid: Network,
};
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

export function InfrastructureInspector() {
  const infra = useStore((s) => s.infra);
  const zones = useStore((s) => s.zones);
  const metrics = useStore((s) => s.metrics);
  const selectedInfraId = useStore((s) => s.selectedInfraId);
  const flyToInfra = useStore((s) => s.flyToInfra);
  const removeInfra = useStore((s) => s.removeInfra);
  const flows = useStore((s) => s.flows);

  const zoneName = useMemo(
    () => new Map(zones.map((z) => [z.id, z.name])),
    [zones]
  );
  const totalCapacity = infra.reduce((s, i) => s + i.capacityKw, 0);
  const coverageByInfra = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of flows) {
      m.set(f.fromInfraId, (m.get(f.fromInfraId) ?? 0) + f.powerKwh);
    }
    return m;
  }, [flows]);
  const totalSupply = metrics?.renewableSupplyKwh ?? 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          {infra.length} assets · {fmtCompact(totalCapacity)} kW
        </span>
      </div>
      <div className="px-2.5 pt-2.5">
        <SubjectSentiment />
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {infra.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">
            No infrastructure placed yet.
          </p>
        )}
        {infra.map((i) => {
          const Icon = KIND_ICON[i.kind];
          const contrib = coverageByInfra.get(i.id) ?? 0;
          const contribPct = totalSupply ? (contrib / totalSupply) * 100 : 0;
          const selected = i.id === selectedInfraId;
          return (
            <div
              key={i.id}
              className={cn(
                "rounded-lg border p-2 transition-colors",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-secondary/20 hover:border-primary/40"
              )}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className="h-4 w-4 shrink-0"
                  style={{ color: rgb(INFRA_COLOR[i.kind]) }}
                />
                <span className="flex-1 truncate text-xs font-medium capitalize">
                  {i.kind}
                  <span className="ml-1 font-normal text-muted-foreground">
                    {zoneName.get(i.zoneId ?? "") ?? "—"}
                  </span>
                </span>
                {i.status === "damaged" ? (
                  <Badge variant="destructive" className="px-1.5 py-0 text-[9px]">
                    damaged
                  </Badge>
                ) : (
                  <Badge
                    variant={i.status === "active" ? "default" : "secondary"}
                    className="px-1.5 py-0 text-[9px]"
                  >
                    {i.status}
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  {i.capacityKw} kW · {contribPct.toFixed(1)}% of supply
                </span>
                <span className="flex items-center gap-1">
                  {i.placedBy === "ai" ? (
                    <>
                      <Bot className="h-3 w-3 text-accent" /> AI
                    </>
                  ) : (
                    <>
                      <User className="h-3 w-3" /> You
                    </>
                  )}
                </span>
              </div>
              <div className="mt-1.5 flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 flex-1 text-[10px]"
                  onClick={() => flyToInfra(i.id)}
                >
                  <Crosshair /> Fly to
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                  onClick={() => removeInfra(i.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
