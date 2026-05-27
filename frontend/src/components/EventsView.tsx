import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsLeftRight, TrendUp, TrendDown } from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore } from "@/store";
import { getForecast } from "@/api/client";
import type { CityEvent, Forecast } from "@/types";
import { cn } from "@/lib/utils";
import { EventDetail, eventVisual, pp } from "@/components/EventDetail";

/**
 * Full-page, navbar-level Events surface. A spacious two-pane dashboard: a large
 * "Approval over time" chart + a scrollable event timeline on the LEFT, and the
 * selected event's full detail (deltas, aftermath, interactions, resident
 * voices) on the RIGHT.
 */
export function EventsView() {
  const events = useStore((s) => s.events);
  const series = useStore((s) => s.eventSeries);
  const traceEvent = useStore((s) => s.traceEvent);
  const loadEvents = useStore((s) => s.loadEvents);
  const [selected, setSelected] = useState<string | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Refresh whenever the view mounts so freshly-placed/fired events show up.
  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // Projected continuation — degrades silently if /api/forecast isn't live.
  useEffect(() => {
    let alive = true;
    void getForecast(12).then((f) => {
      if (alive) setForecast(f);
    });
    return () => {
      alive = false;
    };
  }, [events.length]);

  const ordered = useMemo(
    () => [...events].sort((a, b) => b.tick - a.tick),
    [events]
  ); // newest first

  // Default selection to the newest event whenever the set changes & selection
  // is empty or stale.
  useEffect(() => {
    if (ordered.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((cur) =>
      cur && events.some((e) => e.id === cur) ? cur : ordered[0].id
    );
  }, [ordered, events]);

  // Stitch historical (solid) + projected (dashed) into one dataset.
  const chartData = useMemo(() => {
    const rows: { tick: number; approval?: number; proj?: number }[] =
      series.map((s) => ({ tick: s.tick, approval: s.approval }));
    const lastTick = series.length ? series[series.length - 1].tick : null;
    const baseline = forecast?.baseline ?? [];
    if (lastTick != null && baseline.length) {
      const lastApproval = series[series.length - 1].approval;
      rows[rows.length - 1] = { ...rows[rows.length - 1], proj: lastApproval };
      for (let i = 1; i < baseline.length; i++) {
        rows.push({ tick: lastTick + i, proj: baseline[i].approval });
      }
    }
    return rows;
  }, [series, forecast]);

  const projDelta = useMemo(() => {
    const b = forecast?.baseline;
    if (!b || b.length < 2) return null;
    return b[b.length - 1].approval - b[0].approval;
  }, [forecast]);

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

  const select = (id: string) => {
    setSelected(id);
    requestAnimationFrame(() =>
      rowRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    );
  };

  const selectedEvent = events.find((e) => e.id === selected) ?? null;

  return (
    <div className="pointer-events-auto flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Page header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          City events
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every placement and scenario — the reactions it triggered, how
          sentiment evolved afterward, and how events ripple into one another.
        </p>
      </div>

      {/* Two-pane body */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT — chart + timeline */}
        <div className="flex min-h-0 basis-[58%] flex-col border-r border-border">
          {/* Big approval chart */}
          <div className="shrink-0 border-b border-border p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Approval over time</span>
              <div className="flex items-center gap-3">
                {projDelta !== null && (
                  <span
                    className="num inline-flex items-center gap-1 text-xs"
                    title="Projected change over the next 12 ticks"
                  >
                    {projDelta >= 0 ? (
                      <TrendUp className="h-3.5 w-3.5 text-data-good" weight="bold" />
                    ) : (
                      <TrendDown className="h-3.5 w-3.5 text-data-alert" weight="bold" />
                    )}
                    <span className={projDelta >= 0 ? "text-data-good" : "text-data-alert"}>
                      {pp(projDelta)}pp projected
                    </span>
                  </span>
                )}
                <span className="num text-xs text-muted-foreground">
                  {events.length} events
                </span>
              </div>
            </div>
            {series.length > 1 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id="gEvtAppBig" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#gEvtAppBig)"
                    isAnimationActive={false}
                  />
                  {/* Projected continuation — dashed volt line. */}
                  {chartData.some((d) => d.proj != null) && (
                    <Line
                      type="monotone"
                      dataKey="proj"
                      stroke="hsl(var(--brand))"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                  {/* Marker for the currently-selected event */}
                  {selectedEvent && (
                    <ReferenceLine
                      x={selectedEvent.tick}
                      stroke="hsl(72 95% 42%)"
                      strokeDasharray="3 3"
                    />
                  )}
                  {events.map((e) => (
                    <ReferenceDot
                      key={e.id}
                      x={e.tick}
                      y={approvalAt(e.tick)}
                      r={e.id === selected ? 6 : 4}
                      fill="hsl(72 95% 45%)"
                      stroke="hsl(0 0% 100%)"
                      strokeWidth={2}
                      onClick={() => select(e.id)}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                Sentiment trend appears as the simulation runs.
              </div>
            )}
          </div>

          {/* Event timeline */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {ordered.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                No events yet — place infrastructure or fire a scenario.
              </div>
            ) : (
              <div className="space-y-1.5">
                {ordered.map((e) => {
                  const { Icon, color } = eventVisual(e);
                  const r = e.reaction;
                  const total = Math.max(1, r.support + r.oppose + r.neutral);
                  const w = (n: number) => `${(n / total) * 100}%`;
                  const da = e.delta.approval;
                  const dc = e.delta.coverage;
                  const isSel = selected === e.id;
                  const related = interactions[e.id] ?? [];
                  return (
                    <button
                      key={e.id}
                      ref={(el) => {
                        rowRefs.current[e.id] = el;
                      }}
                      onClick={() => select(e.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                        isSel
                          ? "border-brand/60 bg-muted/50"
                          : "border-transparent hover:bg-muted/40"
                      )}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                        style={{ background: `${color}22` }}
                      >
                        <Icon weight="bold" size={16} style={{ color }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{e.label}</span>
                          <span className="num shrink-0 text-xs text-muted-foreground">
                            t{e.tick}
                          </span>
                        </span>
                        <span className="num mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                          <span className={da >= 0 ? "text-data-good" : "text-data-alert"}>
                            {da >= 0 ? "▲" : "▼"} {pp(da)}pp appr
                          </span>
                          <span className={dc >= 0 ? "text-data-good" : "text-data-alert"}>
                            {pp(dc)}pp cov
                          </span>
                          {related.length > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-muted-foreground"
                              title={`${related.length} event(s) touch the same zones`}
                            >
                              <ArrowsLeftRight className="h-3 w-3" />
                              {related.length}
                            </span>
                          )}
                        </span>
                        <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
                          <span className="bg-data-good" style={{ width: w(r.support) }} />
                          <span className="bg-muted-foreground/40" style={{ width: w(r.neutral) }} />
                          <span className="bg-data-alert" style={{ width: w(r.oppose) }} />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — selected event detail */}
        <div className="min-h-0 basis-[42%]">
          <EventDetail
            event={selectedEvent}
            series={series}
            related={selectedEvent ? interactions[selectedEvent.id] ?? [] : []}
            onSelect={select}
            onTrace={traceEvent}
          />
        </div>
      </div>
    </div>
  );
}
