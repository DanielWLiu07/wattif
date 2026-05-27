import { useEffect, useMemo, useRef, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartLineUp, TrendUp, TrendDown } from "@phosphor-icons/react";
import { getForecast } from "@/api/client";
import type { Forecast, InfraKind, LngLat } from "@/types";
import { cn } from "@/lib/utils";

// signed percentage-points string, e.g. 0.011 → "+1.1"
const pp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;

type Metric = "approval" | "coverage";
const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: "approval", label: "Approval", color: "hsl(212 90% 55%)" },
  { key: "coverage", label: "Coverage", color: "hsl(var(--data-good))" },
];

/**
 * What-if placement preview. Given a proposed build (kind + position), projects
 * the city's approval & coverage trajectories WITH the build (projected) against
 * WITHOUT it (baseline) over a 12-tick horizon, and headlines the delta.
 *
 * Self-fetches against POST /api/forecast with the `proposed` build; degrades to
 * a graceful loading/empty state when the endpoint isn't live or returns no
 * `projected` series.
 */
export function ForecastPreview({
  kind,
  position,
  ticks = 12,
  className,
}: {
  kind: InfraKind;
  position: LngLat;
  ticks?: number;
  className?: string;
}) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  // Round the position so tiny float jitter doesn't refire the request.
  const posKey = `${position[0].toFixed(4)},${position[1].toFixed(4)}`;
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    void getForecast(ticks, [{ kind, position }]).then((f) => {
      if (id !== reqId.current) return; // a newer request superseded this one
      setForecast(f);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, posKey, ticks]);

  // Merge baseline + projected into per-tick rows the chart can read.
  const data = useMemo(() => {
    if (!forecast?.projected) return [];
    const { baseline, projected } = forecast;
    return projected.map((p, i) => {
      const b = baseline[i];
      return {
        tick: p.tick,
        approval: p.approval,
        coverage: p.coverage,
        baseApproval: b?.approval,
        baseCoverage: b?.coverage,
      };
    });
  }, [forecast]);

  // Headline deltas: end-of-horizon projected minus baseline.
  const deltas = useMemo(() => {
    if (!forecast?.projected || forecast.projected.length === 0) return null;
    const last = forecast.projected.length - 1;
    const p = forecast.projected[last];
    const b = forecast.baseline[last] ?? forecast.baseline[forecast.baseline.length - 1];
    if (!b) return null;
    return {
      approval: p.approval - b.approval,
      coverage: p.coverage - b.coverage,
      horizon: forecast.horizon,
    };
  }, [forecast]);

  if (loading) {
    return (
      <div className={cn("rounded-lg border border-border bg-card p-3", className)}>
        <div className="label mb-2 flex items-center gap-1">
          <ChartLineUp className="h-3 w-3" /> Projected impact
        </div>
        <div className="flex h-[96px] items-center justify-center">
          <div className="h-1 w-24 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    );
  }

  // No projection available (endpoint down, or no measurable change).
  if (!forecast?.projected || !deltas || data.length < 2) {
    return (
      <div className={cn("rounded-lg border border-border bg-card p-3", className)}>
        <div className="label mb-1 flex items-center gap-1">
          <ChartLineUp className="h-3 w-3" /> Projected impact
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Projection unavailable — place this build to see how the city responds
          over time.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-card p-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="label flex items-center gap-1">
          <ChartLineUp className="h-3 w-3" /> Projected impact
        </span>
        <span className="num text-[10px] text-muted-foreground">
          {deltas.horizon} mo horizon
        </span>
      </div>

      {/* Headline delta — approval · coverage over the horizon */}
      <div className="num mb-2 flex items-center gap-2 text-xs">
        <DeltaPill value={deltas.approval} label="approval" />
        <span className="text-muted-foreground">·</span>
        <DeltaPill value={deltas.coverage} label="coverage" />
        <span className="text-[10px] text-muted-foreground">over {deltas.horizon} mo</span>
      </div>

      {/* Two compact trajectories: solid = with build, dashed = baseline */}
      <div className="grid grid-cols-2 gap-2">
        {METRICS.map((m) => (
          <MiniChart key={m.key} data={data} metric={m.key} label={m.label} color={m.color} />
        ))}
      </div>

      <div className="mt-1.5 flex items-center gap-3 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-4 rounded-full bg-foreground/70" />
          with build
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-4 rounded-full border-t border-dashed border-muted-foreground" />
          baseline
        </span>
      </div>
    </div>
  );
}

function DeltaPill({ value, label }: { value: number; label: string }) {
  const good = value >= 0;
  const Icon = good ? TrendUp : TrendDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        good ? "text-data-good" : "text-data-alert"
      )}
      title={`${pp(value)}pp ${label}`}
    >
      <Icon className="h-3 w-3" weight="bold" />
      {pp(value)}pp {label}
    </span>
  );
}

function MiniChart({
  data,
  metric,
  label,
  color,
}: {
  data: Record<string, number | undefined>[];
  metric: Metric;
  label: string;
  color: string;
}) {
  const baseKey = metric === "approval" ? "baseApproval" : "baseCoverage";
  return (
    <div>
      <div className="mb-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <ResponsiveContainer width="100%" height={56}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="tick" type="number" domain={["dataMin", "dataMax"]} hide />
          <YAxis domain={["dataMin - 0.01", "dataMax + 0.01"]} hide />
          <RTooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 11,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            formatter={(v: number, name) => [
              `${(v * 100).toFixed(1)}%`,
              name === baseKey ? "baseline" : "with build",
            ]}
            labelFormatter={(t: number) => `month ${t}`}
          />
          {/* Baseline — dashed, muted */}
          <Line
            type="monotone"
            dataKey={baseKey}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
          />
          {/* With build — solid, metric color */}
          <Line
            type="monotone"
            dataKey={metric}
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
