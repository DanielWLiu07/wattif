import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  YAxis,
} from "recharts";
import {
  Zap,
  Leaf,
  Gauge,
  Scale,
  CircleDollarSign,
  TrendingUp,
  Users,
} from "lucide-react";
import { useStore } from "@/store";
import { fmtCad, fmtCompact, pct } from "@/lib/utils";
import type { SimMetrics } from "@/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Metric = {
  key: keyof SimMetrics;
  label: string;
  icon: React.ElementType;
  value: (m: SimMetrics) => string;
  tint: string;
  help: string;
};

const METRICS: Metric[] = [
  {
    key: "coveragePct",
    label: "Coverage",
    icon: Leaf,
    value: (m) => pct(m.coveragePct, 1),
    tint: "text-primary",
    help: "Renewable coverage: share of the city's monthly electricity demand met by clean generation.",
  },
  {
    key: "approvalPct",
    label: "Approval",
    icon: Users,
    value: (m) => pct(m.approvalPct ?? 0, 0),
    tint: "text-sky-300",
    help: "Public approval: how residents feel about the energy plan, aggregated across all zones.",
  },
  {
    key: "equityScore",
    label: "Equity",
    icon: Scale,
    value: (m) => pct(m.equityScore, 0),
    tint: "text-emerald-400",
    help: "Equity score: how well clean infrastructure serves high energy-burden (lower-income) zones, not just wealthy ones.",
  },
  {
    key: "renewableSupplyKwh",
    label: "Clean kWh/mo",
    icon: Zap,
    value: (m) => fmtCompact(m.renewableSupplyKwh),
    tint: "text-accent",
    help: "Clean energy generated per month by all active renewable infrastructure.",
  },
  {
    key: "gridLoadPct",
    label: "Grid load",
    icon: Gauge,
    value: (m) => pct(m.gridLoadPct, 0),
    tint: "text-yellow-400",
    help: "Peak grid load vs capacity — lower is healthier; renewables + storage reduce strain.",
  },
  {
    key: "emissionsTonnes",
    label: "Emissions/mo",
    icon: TrendingUp,
    value: (m) => `${fmtCompact(m.emissionsTonnes)}t`,
    tint: "text-orange-400",
    help: "Tonnes of CO₂ per month from the non-renewable portion of demand.",
  },
  {
    key: "costCumulativeCad",
    label: "Capital",
    icon: CircleDollarSign,
    value: (m) => fmtCad(m.costCumulativeCad),
    tint: "text-sky-400",
    help: "Cumulative capital cost (CAD) of all placed infrastructure.",
  },
];

export function Hud() {
  const metrics = useStore((s) => s.metrics);
  const history = useStore((s) => s.history);
  const generationMix = useStore((s) => s.generationMix);
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
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Simulation
          </span>
          <span className="text-xs text-muted-foreground">
            Tick {metrics.tick} · {metrics.year}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {METRICS.map((m) => {
            const Icon = m.icon;
            return (
              <Tooltip key={m.key as string}>
                <TooltipTrigger asChild>
                  <div className="cursor-help rounded-lg border border-border/60 bg-secondary/30 p-1.5">
                    <div className="flex items-center gap-1">
                      <Icon className={`h-3 w-3 ${m.tint}`} />
                      <span className="truncate text-[9px] text-muted-foreground">
                        {m.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm font-semibold tabular-nums leading-tight">
                      {m.value(metrics)}
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
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis
              tick={{ fontSize: 9, fill: "#64748b" }}
              width={30}
              domain={[0, 100]}
            />
            <RTooltip
              contentStyle={{
                background: "#0b1220",
                border: "1px solid #1e293b",
                borderRadius: 8,
                fontSize: 11,
              }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Area
              type="monotone"
              dataKey="coverage"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#gCov)"
              name="Coverage"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="#38bdf8"
              strokeWidth={1.75}
              fillOpacity={0}
              name="Equity"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="approval"
              stroke="#a78bfa"
              strokeWidth={1.75}
              fillOpacity={0}
              name="Approval"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        {generationMix?.marginalGco2PerKwh != null && (
          <div className="mt-2.5 flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 px-2.5 py-1.5">
            <span className="text-[11px] text-muted-foreground">
              Grid carbon intensity
            </span>
            <span className="text-xs font-semibold tabular-nums text-orange-300">
              {generationMix.marginalGco2PerKwh} gCO₂/kWh
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
