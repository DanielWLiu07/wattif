import {
  Sun,
  Wind,
  BatteryCharging,
  Network,
  CursorClick as MousePointer2,
  Sparkle as Sparkles,
  Check,
  Hand,
  Robot as Bot,
  Footprints,
  Trash as Trash2,
} from "@phosphor-icons/react";
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
import { ForecastPreview } from "@/components/ForecastPreview";
import { getZoneRegion } from "@/store";
import type { LngLat } from "@/types";
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
  const zones = useStore((s) => s.zones);
  const removeInfra = useStore((s) => s.removeInfra);
  const flyToInfra = useStore((s) => s.flyToInfra);
  const selectedRegion = useStore((s) => s.selectedRegion);
  const optimizing = useStore((s) => s.optimizing);
  const runOptimize = useStore((s) => s.runOptimize);
  const recommendations = useStore((s) => s.recommendations);
  const acceptRecommendation = useStore((s) => s.acceptRecommendation);
  const clearRecommendations = useStore((s) => s.clearRecommendations);

  const zoneName = (id?: string) => zones.find((z) => z.id === id)?.name;
  const spent = infra.reduce((sum, i) => sum + (i.costCad ?? 0), 0);

  // Representative site for the what-if projection while the user is choosing a
  // kind (before they click the map): the centroid of the selected region's
  // zones, or all of Toronto. Lets the preview answer "what would building this
  // do?" up-front; the map click later refines the exact spot.
  const previewPosition: LngLat | null = (() => {
    if (!zones.length) return null;
    const inScope =
      selectedRegion === "All"
        ? zones
        : zones.filter((z) => getZoneRegion(z.name, z.centroid) === selectedRegion);
    const pick = inScope.length ? inScope : zones;
    const lng = pick.reduce((s, z) => s + z.centroid[0], 0) / pick.length;
    const lat = pick.reduce((s, z) => s + z.centroid[1], 0) / pick.length;
    return [lng, lat];
  })();

  return (
    <div className="flex min-h-full flex-col gap-3 p-3">
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
                      "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] transition-colors duration-150",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 hover:bg-muted"
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
                      "flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors duration-150",
                      active
                        ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                        : "border-border hover:border-primary/50 hover:bg-muted"
                    )}
                  >
                    <Icon className="h-5 w-5" style={{ color: rgb(INFRA_COLOR[k]) }} />
                    <span className="text-xs font-medium">
                      {INFRA_PRESETS[k].label}
                    </span>
                    <span className="num text-[10px] text-muted-foreground">
                      {INFRA_PRESETS[k].capacityKw} kW · {fmtCad(INFRA_PRESETS[k].costCad)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-2.5 py-1.5">
            <span className="text-[11px] text-muted-foreground">
              {mode === "place"
                ? `Click the map to place a ${placeKind}`
                : "Click a unit to inspect / remove"}
            </span>
            <Badge variant="secondary" className="num px-1.5 py-0 text-[10px]">
              {infra.length}
            </Badge>
          </div>

          {/* What-if projection for the selected kind at the in-scope site. */}
          {mode === "place" && previewPosition && (
            <ForecastPreview kind={placeKind} position={previewPosition} />
          )}
        </>
      ) : (
        <p className="rounded-lg border border-brand/30 bg-brand/5 p-2.5 text-[11px] leading-snug text-muted-foreground">
          The agent is {placementMode === "auto" ? "auto-placing" : "stepping through"}{" "}
          infrastructure. Watch it reason in the <b className="text-foreground">Chat</b>{" "}
          tab — infra appears on the map as it commits each placement.
        </p>
      )}

      {/* Optimizer */}
      <div className="rounded-xl border border-border bg-muted/50 p-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 text-brand" /> Optimizer
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
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                onClick={clearRecommendations}
              >
                clear
              </button>
            </div>
            {recommendations.map((r, i) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <div key={i} className="rounded-lg border border-border bg-card p-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium capitalize">
                      <Icon className="h-3.5 w-3.5" style={{ color: rgb(INFRA_COLOR[r.kind]) }} />
                      {r.kind}
                    </span>
                    <Badge variant="accent" className="num">{(r.score * 100).toFixed(0)}</Badge>
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

      {/* Session quick-stats — reads as intentional chrome, always present */}
      <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border bg-muted/40">
        {[
          { label: "Scope", value: selectedRegion === "All" ? "All Toronto" : selectedRegion, mono: false },
          { label: "Placed", value: String(infra.length), mono: true },
          { label: "Spent", value: infra.length ? fmtCad(spent) : "—", mono: true },
        ].map((s) => (
          <div key={s.label} className="px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {s.label}
            </div>
            <div className={cn("truncate text-xs font-semibold", s.mono && "num")}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Placed infrastructure — grows to fill the dock; empty-state hint otherwise */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Placed infrastructure
          </span>
          {infra.length > 0 && (
            <span className="num text-[10px] text-muted-foreground">{infra.length}</span>
          )}
        </div>

        {infra.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center">
            <p className="max-w-[220px] text-[11px] leading-snug text-muted-foreground">
              No infrastructure placed yet — pick a type above and{" "}
              <b className="text-foreground">Place</b> it on the map.
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {infra.map((i) => {
              const Icon = KIND_ICON[i.kind];
              const zn = zoneName(i.zoneId);
              return (
                <div
                  key={i.id}
                  className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 pr-1 transition-colors hover:border-primary/40"
                >
                  <button
                    onClick={() => flyToInfra(i.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 p-2 text-left"
                    title="Fly to this unit"
                  >
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: rgb(INFRA_COLOR[i.kind]) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-xs font-medium">
                        {INFRA_PRESETS[i.kind].label}
                        {i.placedBy === "ai" && (
                          <span className="rounded bg-brand/15 px-1 text-[8px] font-semibold uppercase text-foreground">
                            AI
                          </span>
                        )}
                      </span>
                      <span className="num block truncate text-[10px] text-muted-foreground">
                        {zn ? `${zn} · ` : ""}
                        {i.capacityKw} kW
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => removeInfra(i.id)}
                    aria-label="Remove unit"
                    title="Remove"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-data-alert"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
