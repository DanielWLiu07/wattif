import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sun,
  Wind,
  BatteryCharging,
  Network,
  Warning,
  CaretRight,
  ChartLineUp,
  ArrowsLeftRight,
  TrendUp,
  TrendDown,
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "@/store";
import { getForecast } from "@/api/client";
import type { CityEvent, EventPoint, Forecast, InfraKind } from "@/types";
import { INFRA_COLOR } from "@/types";
import { cn } from "@/lib/utils";

const KIND_ICON: Partial<Record<string, React.ComponentType<any>>> = {
  solar: Sun,
  wind: Wind,
  battery: BatteryCharging,
  microgrid: Network,
};
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

function eventVisual(e: CityEvent): { Icon: React.ComponentType<any>; color: string } {
  const ic = KIND_ICON[e.kind];
  if (e.type === "placement" && ic) {
    return { Icon: ic, color: rgb(INFRA_COLOR[e.kind as InfraKind]) };
  }
  return { Icon: Warning, color: "hsl(38 92% 45%)" }; // scenario → amber
}

// signed percentage-points string, e.g. 0.011 → "+1.1"
const pp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;

/** Mini approval trajectory from an event tick onward — "how it evolved after". */
function Aftermath({ data, color }: { data: EventPoint[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={44}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <XAxis dataKey="tick" type="number" domain={["dataMin", "dataMax"]} hide />
        <YAxis domain={["dataMin - 0.02", "dataMax + 0.02"]} hide />
        <Line
          type="monotone"
          dataKey="approval"
          stroke={color}
          strokeWidth={1.75}
          dot={{ r: 1.5, fill: color }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function EventsFeed() {
  const events = useStore((s) => s.events);
  const series = useStore((s) => s.eventSeries);
  const traceEvent = useStore((s) => s.traceEvent);
  const loadEvents = useStore((s) => s.loadEvents);
  const [open, setOpen] = useState<string | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Refresh whenever the tab mounts so freshly-placed/fired events show up.
  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // City-wide projected continuation — where sentiment is heading. No `proposed`
  // build, so we use the `baseline` series. Degrades silently if /api/forecast
  // isn't live yet (forecast stays null → no dashed line, chart unchanged).
  useEffect(() => {
    let alive = true;
    void getForecast(12).then((f) => {
      if (alive) setForecast(f);
    });
    return () => {
      alive = false;
    };
  }, [events.length]);

  // Stitch historical (solid) + projected (dashed) into one dataset keyed by
  // tick. Historical points carry `approval`; projected points carry `proj`.
  // The seam point carries both so the two lines visually connect.
  const chartData = useMemo(() => {
    const rows: { tick: number; approval?: number; proj?: number }[] = series.map(
      (s) => ({ tick: s.tick, approval: s.approval })
    );
    const lastTick = series.length ? series[series.length - 1].tick : null;
    const baseline = forecast?.baseline ?? [];
    if (lastTick != null && baseline.length) {
      // Forecast t0 == "now"; align it onto the end of the historical line so
      // the projection continues from the latest measured point.
      const lastApproval = series[series.length - 1].approval;
      rows[rows.length - 1] = { ...rows[rows.length - 1], proj: lastApproval };
      for (let i = 1; i < baseline.length; i++) {
        rows.push({ tick: lastTick + i, proj: baseline[i].approval });
      }
    }
    return rows;
  }, [series, forecast]);

  // Net projected change over the horizon, for a compact "→ projected" label.
  const projDelta = useMemo(() => {
    const b = forecast?.baseline;
    if (!b || b.length < 2) return null;
    return b[b.length - 1].approval - b[0].approval;
  }, [forecast]);

  const ordered = useMemo(
    () => [...events].sort((a, b) => b.tick - a.tick),
    [events]
  ); // newest first

  // Map of event.id → events that touch at least one of the same zones.
  const interactions = useMemo(() => {
    const m: Record<string, CityEvent[]> = {};
    for (const e of events) {
      const zset = new Set(e.zoneIds);
      m[e.id] = events
        .filter((o) => o.id !== e.id && o.zoneIds.some((z) => zset.has(z)))
        .sort((a, b) => b.tick - a.tick);
    }
    return m;
  }, [events]);

  const approvalAt = (tick: number) => {
    let val = series[0]?.approval ?? 0.5;
    for (const s of series) if (s.tick <= tick) val = s.approval;
    return val;
  };

  const openEvent = (id: string) => {
    setOpen(id);
    requestAnimationFrame(() =>
      cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Approval sparkline with a volt dot at each event tick */}
      <div className="shrink-0 border-b border-border p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="label">Approval over time</span>
          <div className="flex items-center gap-2">
            {projDelta !== null && (
              <span
                className="num inline-flex items-center gap-1 text-[10px]"
                title="Projected change over the next 12 ticks"
              >
                {projDelta >= 0 ? (
                  <TrendUp className="h-3 w-3 text-data-good" weight="bold" />
                ) : (
                  <TrendDown className="h-3 w-3 text-data-alert" weight="bold" />
                )}
                <span
                  className={projDelta >= 0 ? "text-data-good" : "text-data-alert"}
                >
                  {pp(projDelta)}pp projected
                </span>
              </span>
            )}
            <span className="num text-[10px] text-muted-foreground">
              {events.length} events
            </span>
          </div>
        </div>
        {series.length > 1 ? (
          <ResponsiveContainer width="100%" height={72}>
            <AreaChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: -34 }}>
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
                formatter={(v) => [`${(Number(v ?? 0) * 100).toFixed(0)}%`, "approval"]}
                labelFormatter={(t) => `tick ${Number(t ?? 0)}`}
              />
              <Area
                type="monotone"
                dataKey="approval"
                stroke="hsl(212 90% 55%)"
                strokeWidth={2}
                fill="url(#gEvtApp)"
                isAnimationActive={false}
              />
              {/* Projected continuation — dashed volt line, no fill. Reads as
                  "where the city is heading". connectNulls bridges the seam. */}
              {chartData.some((d) => d.proj != null) && (
                <Line
                  type="monotone"
                  dataKey="proj"
                  stroke="hsl(var(--brand))"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {/* Marker for the currently-open event */}
              {open && events.find((e) => e.id === open) && (
                <ReferenceLine
                  x={events.find((e) => e.id === open)!.tick}
                  stroke="hsl(72 95% 42%)"
                  strokeDasharray="2 2"
                />
              )}
              {events.map((e) => (
                <ReferenceDot
                  key={e.id}
                  x={e.tick}
                  y={approvalAt(e.tick)}
                  r={e.id === open ? 5 : 3.5}
                  fill="hsl(72 95% 45%)"
                  stroke="hsl(0 0% 100%)"
                  strokeWidth={1.5}
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

            // Sentiment trajectory after this event (this tick onward).
            const aftermath = series.filter((s) => s.tick >= e.tick);
            const net =
              aftermath.length >= 2
                ? aftermath[aftermath.length - 1].approval - aftermath[0].approval
                : null;
            const span =
              aftermath.length >= 2
                ? aftermath[aftermath.length - 1].tick - aftermath[0].tick
                : 0;
            const related = interactions[e.id] ?? [];

            return (
              <div
                key={e.id}
                ref={(el) => {
                  cardRefs.current[e.id] = el;
                }}
                className={cn(
                  "rounded-lg border bg-card p-2.5 transition-colors",
                  isOpen ? "border-brand/60" : "border-border"
                )}
              >
                <button
                  onClick={() => traceEvent(e.zoneIds)}
                  className="flex w-full items-start gap-2 text-left transition-opacity hover:opacity-80"
                  title="Show affected zones on the map"
                >
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                    style={{ background: `${color}22` }}
                  >
                    <Icon weight="bold" size={14} style={{ color }} />
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
                      {related.length > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 text-muted-foreground"
                          title={`${related.length} event(s) touch the same zones`}
                        >
                          <ArrowsLeftRight className="h-2.5 w-2.5" />
                          {related.length}
                        </span>
                      )}
                    </span>
                  </span>
                </button>

                {/* reaction split — counts + support/neutral/oppose bar */}
                <div className="num mt-2 flex items-center justify-between text-[10px]">
                  <span className="text-data-good">{r.support} support</span>
                  {r.neutral > 0 && (
                    <span className="text-muted-foreground">{r.neutral} neutral</span>
                  )}
                  <span className="text-data-alert">{r.oppose} oppose</span>
                </div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted">
                  <div className="bg-data-good" style={{ width: w(r.support) }} />
                  <div className="bg-muted-foreground/40" style={{ width: w(r.neutral) }} />
                  <div className="bg-data-alert" style={{ width: w(r.oppose) }} />
                </div>

                <button
                  onClick={() => setOpen(isOpen ? null : e.id)}
                  className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <CaretRight
                    className={cn("h-3 w-3 transition-transform duration-150", isOpen && "rotate-90")}
                  />
                  Aftermath, {total} reactions
                  {related.length > 0 && ` · ${related.length} linked`}
                </button>

                {isOpen && (
                  <div className="mt-2 space-y-2.5">
                    {/* ── How it evolved: approval trajectory after the event ── */}
                    <div className="rounded-md bg-muted/40 p-2">
                      <div className="mb-0.5 flex items-center justify-between">
                        <span className="label flex items-center gap-1">
                          {net !== null && net >= 0 ? (
                            <TrendUp className="h-3 w-3 text-data-good" />
                          ) : (
                            <TrendDown className="h-3 w-3 text-data-alert" />
                          )}
                          Sentiment aftermath
                        </span>
                        {net !== null && (
                          <span
                            className={cn(
                              "num text-[10px]",
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
                          color={net !== null && net >= 0 ? "hsl(142 71% 40%)" : "hsl(0 72% 51%)"}
                        />
                      ) : (
                        <p className="py-2 text-center text-[10px] text-muted-foreground">
                          Run the sim to watch how this event plays out.
                        </p>
                      )}
                    </div>

                    {/* ── How events interact: shared-zone links ── */}
                    {related.length > 0 && (
                      <div>
                        <span className="label flex items-center gap-1">
                          <ArrowsLeftRight className="h-3 w-3" /> Interacts with
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {related.slice(0, 5).map((rel) => {
                            const shared = rel.zoneIds.filter((z) =>
                              e.zoneIds.includes(z)
                            ).length;
                            return (
                              <button
                                key={rel.id}
                                onClick={() => {
                                  traceEvent(rel.zoneIds);
                                  openEvent(rel.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] transition-colors hover:border-brand/60 hover:bg-muted"
                                title={`${shared} shared zone(s) · jump to this event`}
                              >
                                <span className="truncate max-w-[120px]">{rel.label}</span>
                                <span className="num text-muted-foreground">t{rel.tick}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Related chats: every voice tied to this event ── */}
                    {e.voices.length > 0 && (
                      <div>
                        <span className="label">Reactions from residents</span>
                        <div className="mt-1 max-h-44 space-y-1 overflow-y-auto pr-1">
                          {e.voices.map((v, i) => (
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
