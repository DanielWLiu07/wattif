import {
  Sun,
  Wind,
  BatteryCharging,
  Network,
  Sparkle as Sparkles,
  Check,
  X,
  Users,
  Leaf,
  Scales as Scale,
} from "@phosphor-icons/react";
import { useStore } from "@/store";
import type { InfraKind, Recommendation } from "@/types";
import { INFRA_PRESETS, INFRA_COLOR } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/utils";

const KIND_ICON: Record<InfraKind, React.ElementType> = {
  solar: Sun,
  wind: Wind,
  battery: BatteryCharging,
  microgrid: Network,
};
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

export function RecommendationImpact({
  rec,
  pinned,
  onClose,
}: {
  rec: Recommendation;
  pinned?: boolean;
  onClose?: () => void;
}) {
  const zones = useStore((s) => s.zones);
  const accept = useStore((s) => s.acceptRecommendation);
  const Icon = KIND_ICON[rec.kind];
  const color = rgb(INFRA_COLOR[rec.kind]);

  // nearest zone to the recommended site (for name + population)
  let zone = zones[0];
  let best = Infinity;
  for (const z of zones) {
    const d =
      (z.centroid[0] - rec.position[0]) ** 2 +
      (z.centroid[1] - rec.position[1]) ** 2;
    if (d < best) {
      best = d;
      zone = z;
    }
  }
  const capacityKw = INFRA_PRESETS[rec.kind].capacityKw;
  // approx people newly served by this site, capped at the neighbourhood pop
  const served = Math.min(
    zone?.demographics.population ?? Infinity,
    Math.round(capacityKw * 5)
  );

  return (
    <div className="glass w-[260px] rounded-xl p-3">
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: `${color}22` }}
          >
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5 text-sm font-semibold capitalize">
              Recommend {rec.kind}
              <Badge variant="accent" className="px-1.5 py-0 text-[9px]">
                score {(rec.score * 100).toFixed(0)}
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {zone?.name ?? "Toronto"} · {capacityKw} kW
            </div>
          </div>
        </div>
        {pinned && onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* impact stats */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-1.5">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <Users className="h-3 w-3 text-sky-300" /> served
          </div>
          <div className="mt-0.5 text-sm font-semibold num">
            ~{fmt(served)}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-1.5">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <Leaf className="h-3 w-3 text-primary" /> coverage
          </div>
          <div className="mt-0.5 text-sm font-semibold num text-primary">
            +{(rec.expectedCoverageGain * 100).toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-secondary/30 p-1.5">
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <Scale className="h-3 w-3 text-emerald-400" /> equity
          </div>
          <div className="mt-0.5 text-sm font-semibold num text-emerald-400">
            +{(rec.equityGain * 100).toFixed(1)}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-foreground/90">
        {rec.rationale}
      </p>

      {pinned && (
        <Button
          size="sm"
          className="mt-2 h-7 w-full text-[11px]"
          onClick={() => {
            void accept(rec);
            onClose?.();
          }}
        >
          <Check /> Place {rec.kind} here
        </Button>
      )}
      {!pinned && (
        <div className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-accent" /> click the marker to pin +
          place
        </div>
      )}
    </div>
  );
}
