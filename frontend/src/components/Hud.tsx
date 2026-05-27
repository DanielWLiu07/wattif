import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  YAxis,
} from "recharts";
import {
  Lightning,
  Leaf,
  Gauge,
  Scales,
  CurrencyDollar,
  TrendUp,
  Users,
} from "@phosphor-icons/react";
import { useStore } from "@/store";
import { fmtCad, fmtCompact } from "@/lib/utils";
import { useCountUp } from "@/lib/useCountUp";
import type { SimMetrics } from "@/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Metric = {
  key: keyof SimMetrics;
  label: string;
  icon: React.ComponentType<any>;
  raw: (m: SimMetrics) => number; // tweened value
  format: (n: number) => string; // display
  tint: string;
  help: string;
};

const METRICS: Metric[] = [
  {
    key: "coveragePct",
    label: "Coverage",
    icon: Leaf,
    raw: (m) => m.coveragePct * 100,
    format: (n) => `${n.toFixed(1)}%`,
    tint: "text-data-good",
    help: "Renewable coverage: share of the city's monthly electricity demand met by clean generation.",
  },
  {
    key: "approvalPct",
    label: "Approval",
    icon: Users,
    raw: (m) => (m.approvalPct ?? 0) * 100,
    format: (n) => `${n.toFixed(0)}%`,
    tint: "text-data-info",
    help: "Public approval: how residents feel about the energy plan, aggregated across all zones.",
  },
  {
    key: "equityScore",
    label: "Equity",
    icon: Scales,
    raw: (m) => m.equityScore * 100,
    format: (n) => `${n.toFixed(0)}%`,
    tint: "text-data-good",
    help: "Equity score: how well clean infrastructure serves high energy-burden (lower-income) zones, not just wealthy ones.",
  },
  {
    key: "renewableSupplyKwh",
    label: "Clean kWh/mo",
    icon: Lightning,
    raw: (m) => m.renewableSupplyKwh,
    format: (n) => fmtCompact(n),
    tint: "text-brand",
    help: "Clean energy generated per month by all active renewable infrastructure.",
  },
  {
    key: "gridLoadPct",
    label: "Grid load",
    icon: Gauge,
    raw: (m) => m.gridLoadPct * 100,
    format: (n) => `${n.toFixed(0)}%`,
    tint: "text-data-warn",
    help: "Peak grid load vs capacity — lower is healthier; renewables + storage reduce strain.",
  },
  {
    key: "emissionsTonnes",
    label: "Emissions/mo",
    icon: TrendUp,
    raw: (m) => m.emissionsTonnes,
    format: (n) => `${fmtCompact(n)}t`,
    tint: "text-data-alert",
    help: "Tonnes of CO₂ per month from the non-renewable portion of demand.",
  },
  {
    key: "costCumulativeCad",
    label: "Capital",
    icon: CurrencyDollar,
    raw: (m) => m.costCumulativeCad,
    format: (n) => fmtCad(n),
    tint: "text-muted-foreground",
    help: "Cumulative capital cost (CAD) of all placed infrastructure.",
  },
];

// Tweened metric value (count-up).
function MetricValue({
  raw,
  format,
}: {
  raw: number;
  format: (n: number) => string;
}) {
  const v = useCountUp(raw);
  return <>{format(v)}</>;
}

export function Hud() {
  const metrics = useStore((s) => s.metrics);
  const history = useStore((s) => s.history);
  const generationMix = useStore((s) => s.generationMix);
  const sbei = useStore((s) => s.sbei);
  if (!metrics) return null;

  const chartData = history.map((h) => ({
    tick: h.tick,
    coverage: +(h.coveragePct * 100).toFixed(1),
    equity: +(h.equityScore * 100).toFixed(1),
    approval: +((h.approvalPct ?? 0) * 100).toFixed(1),
  }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="label">Simulation</span>
          <span className="num text-xs text-muted-foreground">
            Tick {metrics.tick} · {metrics.year}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {METRICS.map((m) => {
            const Icon = m.icon;
            return (
              <Tooltip key={m.key as string}>
                <TooltipTrigger asChild>
                  <div className="cursor-help rounded-[var(--radius)] border border-border bg-muted p-1.5">
                    <div className="flex items-center gap-1">
                      <Icon weight="bold" className={`h-3 w-3 ${m.tint}`} />
                      <span className="truncate text-[9px] text-muted-foreground">
                        {m.label}
                      </span>
                    </div>
                    <div className="num mt-0.5 text-sm font-semibold leading-tight">
                      <MetricValue raw={m.raw(metrics)} format={m.format} />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px]">{m.help}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="mb-1 mt-2.5 flex items-center justify-between">
          <span className="text-[11px] font-medium">
            Coverage · Equity · Approval
          </span>
          <span className="text-[9px] text-muted-foreground">% over time</span>
        </div>
        <ResponsiveContainer width="100%" height={92}>
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 4, bottom: 0, left: -30 }}
          >
            <defs>
              <linearGradient id="gCov" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(152 58% 42%)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(152 58% 42%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis
              tick={{ fontSize: 9, fill: "hsl(0 0% 55%)" }}
              width={30}
              domain={[0, 100]}
            />
            <RTooltip
              contentStyle={{
                background: "hsl(0 0% 100%)",
                border: "1px solid hsl(0 0% 90%)",
                borderRadius: 6,
                fontSize: 11,
                fontFamily: "JetBrains Mono, ui-monospace, monospace",
              }}
              labelStyle={{ color: "hsl(0 0% 42%)" }}
            />
            <Area
              type="monotone"
              dataKey="coverage"
              stroke="hsl(152 58% 42%)"
              strokeWidth={2}
              fill="url(#gCov)"
              name="Coverage"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="hsl(212 90% 55%)"
              strokeWidth={1.75}
              fillOpacity={0}
              name="Equity"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="approval"
              stroke="hsl(262 83% 68%)"
              strokeWidth={1.75}
              fillOpacity={0}
              name="Approval"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        {generationMix?.marginalGco2PerKwh != null && (
          <div className="mt-2.5 flex items-center justify-between rounded-[var(--radius)] border border-border bg-muted px-2.5 py-1.5">
            <span className="text-[11px] text-muted-foreground">
              Grid carbon intensity
            </span>
            <span className="num text-xs font-semibold text-data-alert">
              {generationMix.marginalGco2PerKwh} gCO₂/kWh
            </span>
          </div>
        )}

        {sbei?.communityWideMtCO2e != null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mt-2 cursor-help rounded-[var(--radius)] border border-border bg-muted px-2.5 py-2">
                <div className="label">Toronto context</div>
                <div className="mt-0.5 text-xs leading-snug">
                  <b className="num text-data-alert">
                    {sbei.communityWideMtCO2e} Mt CO₂e/yr
                  </b>
                  {sbei.sectorSharePct?.buildings != null && (
                    <>
                      {" · "}buildings{" "}
                      <b className="num">{sbei.sectorSharePct.buildings}%</b>
                    </>
                  )}
                  {" · net-zero by 2040"}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px]">
              {sbei.note ??
                "City-wide emissions — buildings are the biggest lever, complementing the clean grid."}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
