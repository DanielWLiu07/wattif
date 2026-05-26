import { useEffect, useState } from "react";
import {
  Sun,
  Wind,
  BatteryCharging,
  Network,
  Warning,
  CaretRight,
  ChartLineUp,
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "@/store";
import type { CityEvent, InfraKind } from "@/types";
import { INFRA_COLOR } from "@/types";
import { cn } from "@/lib/utils";

const KIND_ICON: Partial<Record<string, React.ElementType>> = {
  solar: Sun,
  wind: Wind,
  battery: BatteryCharging,
  microgrid: Network,
};
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

function eventVisual(e: CityEvent): { Icon: React.ElementType; color: string } {
  const ic = KIND_ICON[e.kind];
  if (e.type === "placement" && ic) {
    return { Icon: ic, color: rgb(INFRA_COLOR[e.kind as InfraKind]) };
  }
  return { Icon: Warning, color: "hsl(38 92% 45%)" }; // scenario → amber
}

// signed percentage-points string, e.g. 0.011 → "+1.1"
const pp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;

export function EventsFeed() {
  const events = useStore((s) => s.events);
  const series = useStore((s) => s.eventSeries);
  const traceEvent = useStore((s) => s.traceEvent);
  const loadEvents = useStore((s) => s.loadEvents);
  const [open, setOpen] = useState<string | null>(null);

  // Refresh whenever the tab mounts so freshly-placed/fired events show up.
  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const ordered = [...events].sort((a, b) => b.tick - a.tick); // newest first

  const approvalAt = (tick: number) => {
    let val = series[0]?.approval ?? 0.5;
    for (const s of series) if (s.tick <= tick) val = s.approval;
    return val;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Approval sparkline with a volt dot at each event tick */}
      <div className="shrink-0 border-b border-border p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="label">Approval over time</span>
          <span className="num text-[10px] text-muted-foreground">
            {events.length} events
          </span>
        </div>
        {series.length > 1 ? (
          <ResponsiveContainer width="100%" height={72}>
            <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: -34 }}>
              <defs>
                <linearGradient id="gEvtApp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(212 90% 55%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(212 90% 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="tick" type="number" domain={["dataMin", "dataMax"]} hide />
              <YAxis domain={[0, 1]} hide />
              <RTooltip
                contentStyle={{
                  background: "hsl(0 0% 100%)",
                  border: "1px solid hsl(0 0% 90%)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, ui-monospace, monospace",
                }}
                labelStyle={{ color: "hsl(0 0% 42%)" }}
                formatter={(v: number) => [`${(v * 100).toFixed(0)}%`, "approval"]}
                labelFormatter={(t: number) => `tick ${t}`}
              />
              <Area
                type="monotone"
                dataKey="approval"
                stroke="hsl(212 90% 55%)"
                strokeWidth={2}
                fill="url(#gEvtApp)"
                isAnimationActive={false}
              />
              {events.map((e) => (
                <ReferenceDot
                  key={e.id}
                  x={e.tick}
                  y={approvalAt(e.tick)}
                  r={3.5}
                  fill="hsl(72 95% 45%)"
                  stroke="hsl(0 0% 100%)"
                  strokeWidth={1.5}
                  isFront
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[72px] items-center justify-center text-[11px] text-muted-foreground">
            Sentiment trend appears as the simulation runs.
          </div>
        )}
      </div>

      {/* Event cards (newest first) */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {ordered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <ChartLineUp className="h-7 w-7 text-muted-foreground/50" />
            <p className="max-w-[230px] text-[11px] leading-snug text-muted-foreground">
              No events yet — place infrastructure or fire a scenario to start the
              city's story.
            </p>
          </div>
        ) : (
          ordered.map((e) => {
            const { Icon, color } = eventVisual(e);
            const r = e.reaction;
            const total = Math.max(1, r.support + r.oppose + r.neutral);
            const w = (n: number) => `${(n / total) * 100}%`;
            const da = e.delta.approval;
            const dc = e.delta.coverage;
            const isOpen = open === e.id;
            return (
              <div key={e.id} className="rounded-lg border border-border bg-card p-2.5">
                <button
                  onClick={() => traceEvent(e.zoneIds)}
                  className="flex w-full items-start gap-2 text-left transition-opacity hover:opacity-80"
                  title="Show affected zones on the map"
                >
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                    style={{ background: `${color}22` }}
                  >
                    <Icon weight="bold" className="h-3.5 w-3.5" style={{ color }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{e.label}</span>
                      <span className="num shrink-0 text-[10px] text-muted-foreground">
                        t{e.tick}
                      </span>
                    </span>
                    <span className="num mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px]">
                      <span className={da >= 0 ? "text-data-good" : "text-data-alert"}>
                        {da >= 0 ? "▲" : "▼"} {pp(da)}pp approval
                      </span>
                      <span className={dc >= 0 ? "text-data-good" : "text-data-alert"}>
                        {pp(dc)}pp coverage
                      </span>
                    </span>
                  </span>
                </button>

                {/* support / neutral / oppose bar */}
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="bg-data-good" style={{ width: w(r.support) }} />
                  <div className="bg-muted-foreground/40" style={{ width: w(r.neutral) }} />
                  <div className="bg-data-alert" style={{ width: w(r.oppose) }} />
                </div>

                {e.voices.length > 0 && (
                  <>
                    <button
                      onClick={() => setOpen(isOpen ? null : e.id)}
                      className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <CaretRight
                        className={cn("h-3 w-3 transition-transform duration-150", isOpen && "rotate-90")}
                      />
                      <span className="num">{r.support + r.oppose + r.neutral}</span> reactions
                    </button>
                    {isOpen && (
                      <div className="mt-1 space-y-1 pl-1">
                        {e.voices.slice(0, 3).map((v, i) => (
                          <div
                            key={i}
                            className={cn(
                              "border-l-2 pl-2 text-[10px] leading-snug",
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
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
