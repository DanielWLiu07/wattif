import {
  Sun,
  Wind,
  BatteryCharging,
  Network,
  Warning,
  ArrowsLeftRight,
  TrendUp,
  TrendDown,
  ChatCircle,
} from "@phosphor-icons/react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { CityEvent, EventPoint, InfraKind } from "@/types";
import { INFRA_COLOR } from "@/types";
import { cn } from "@/lib/utils";

const KIND_ICON: Partial<Record<string, React.ComponentType<any>>> = {
  solar: Sun,
  wind: Wind,
  battery: BatteryCharging,
  microgrid: Network,
};
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

export function eventVisual(e: CityEvent): { Icon: React.ComponentType<any>; color: string } {
  const ic = KIND_ICON[e.kind];
  if (e.type === "placement" && ic) {
    return { Icon: ic, color: rgb(INFRA_COLOR[e.kind as InfraKind]) };
  }
  return { Icon: Warning, color: "hsl(38 92% 45%)" }; // scenario → amber
}

// signed percentage-points string, e.g. 0.011 → "+1.1"
export const pp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;

/** Mini approval trajectory from an event tick onward — "how it evolved after". */
function Aftermath({ data, color }: { data: EventPoint[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <XAxis dataKey="tick" type="number" domain={["dataMin", "dataMax"]} hide />
        <YAxis domain={["dataMin - 0.02", "dataMax + 0.02"]} hide />
        <Line
          type="monotone"
          dataKey="approval"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 2, fill: color }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

type Props = {
  event: CityEvent | null;
  series: EventPoint[];
  related: CityEvent[];
  onSelect: (id: string) => void;
  onTrace: (zoneIds: string[]) => void;
};

export function EventDetail({ event, series, related, onSelect, onTrace }: Props) {
  if (!event) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <ChatCircle className="h-8 w-8 text-muted-foreground/40" />
        <p className="max-w-[260px] text-sm leading-snug text-muted-foreground">
          No events yet — place infrastructure or fire a scenario to start the
          city's story.
        </p>
      </div>
    );
  }

  const { Icon, color } = eventVisual(event);
  const r = event.reaction;
  const total = Math.max(1, r.support + r.oppose + r.neutral);
  const w = (n: number) => `${(n / total) * 100}%`;
  const da = event.delta.approval;
  const dc = event.delta.coverage;

  // Sentiment trajectory after this event (this tick onward).
  const aftermath = series.filter((s) => s.tick >= event.tick);
  const net =
    aftermath.length >= 2
      ? aftermath[aftermath.length - 1].approval - aftermath[0].approval
      : null;
  const span =
    aftermath.length >= 2
      ? aftermath[aftermath.length - 1].tick - aftermath[0].tick
      : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <button
        onClick={() => onTrace(event.zoneIds)}
        className="flex shrink-0 items-start gap-3 border-b border-border p-5 text-left transition-opacity hover:opacity-80"
        title="Show affected zones on the map"
      >
        <span
          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${color}22` }}
        >
          <Icon weight="bold" size={24} style={{ color }} />
        </span>
        <span className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold leading-tight tracking-tight text-foreground">
            {event.label}
          </h2>
          <span className="num mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>t{event.tick}</span>
            <span className="text-border">·</span>
            <span className="capitalize">{event.type}</span>
            {event.kind && (
              <>
                <span className="text-border">·</span>
                <span className="capitalize">{event.kind}</span>
              </>
            )}
          </span>
        </span>
      </button>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {/* Big delta readouts */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <span className="label">Approval Δ</span>
            <p
              className={cn(
                "num mt-1 text-2xl font-medium",
                da >= 0 ? "text-data-good" : "text-data-alert"
              )}
            >
              {pp(da)}
              <span className="ml-0.5 text-sm">pp</span>
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <span className="label">Coverage Δ</span>
            <p
              className={cn(
                "num mt-1 text-2xl font-medium",
                dc >= 0 ? "text-data-good" : "text-data-alert"
              )}
            >
              {pp(dc)}
              <span className="ml-0.5 text-sm">pp</span>
            </p>
          </div>
        </div>

        {/* Reaction split */}
        <div>
          <div className="num mb-1.5 flex items-center justify-between text-xs">
            <span className="text-data-good">{r.support} support</span>
            {r.neutral > 0 && (
              <span className="text-muted-foreground">{r.neutral} neutral</span>
            )}
            <span className="text-data-alert">{r.oppose} oppose</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="bg-data-good" style={{ width: w(r.support) }} />
            <div className="bg-muted-foreground/40" style={{ width: w(r.neutral) }} />
            <div className="bg-data-alert" style={{ width: w(r.oppose) }} />
          </div>
        </div>

        {/* Sentiment aftermath */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="label flex items-center gap-1.5">
              {net !== null && net >= 0 ? (
                <TrendUp className="h-3.5 w-3.5 text-data-good" />
              ) : (
                <TrendDown className="h-3.5 w-3.5 text-data-alert" />
              )}
              Sentiment aftermath
            </span>
            {net !== null && (
              <span
                className={cn(
                  "num text-xs font-medium",
                  net >= 0 ? "text-data-good" : "text-data-alert"
                )}
              >
                {pp(net)}pp over {span} ticks
              </span>
            )}
          </div>
          {aftermath.length >= 2 ? (
            <Aftermath
              data={aftermath}
              color={net !== null && net >= 0 ? "hsl(152 58% 42%)" : "hsl(0 72% 51%)"}
            />
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Run the sim to watch how this event plays out.
            </p>
          )}
        </div>

        {/* Interacts with */}
        {related.length > 0 && (
          <div>
            <span className="label flex items-center gap-1.5">
              <ArrowsLeftRight className="h-3.5 w-3.5" /> Interacts with
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {related.map((rel) => {
                const shared = rel.zoneIds.filter((z) =>
                  event.zoneIds.includes(z)
                ).length;
                return (
                  <button
                    key={rel.id}
                    onClick={() => onSelect(rel.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs transition-colors hover:border-brand/60 hover:bg-muted"
                    title={`${shared} shared zone(s) · jump to this event`}
                  >
                    <span className="max-w-[140px] truncate">{rel.label}</span>
                    <span className="num text-muted-foreground">t{rel.tick}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Reactions from residents */}
        {event.voices.length > 0 && (
          <div>
            <span className="label">Reactions from residents</span>
            <div className="mt-2 space-y-2.5">
              {event.voices.map((v, i) => (
                <div
                  key={i}
                  className={cn(
                    "border-l-2 py-0.5 pl-3 text-sm leading-relaxed",
                    v.stance === "support"
                      ? "border-data-good"
                      : v.stance === "oppose"
                      ? "border-data-alert"
                      : "border-border"
                  )}
                >
                  <span className="text-foreground">“{v.text}”</span>
                  <span className="text-muted-foreground"> — {v.archetype}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
