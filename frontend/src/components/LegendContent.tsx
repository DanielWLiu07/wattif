import { useStore } from "@/store";
import { INFRA_COLOR, FACILITY_META } from "@/types";

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-3 shrink-0 rounded-sm"
      style={{ background: color }}
    />
  );
}
function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

export function LegendContent() {
  const layers = useStore((s) => s.layers);
  return (
    <div className="space-y-3 p-3 text-[11px]">
      <div>
        <div className="mb-1 text-muted-foreground">Approval / sentiment (per zone)</div>
        <div className="flex items-center gap-1">
          <span className="text-red-400">low</span>
          <span className="h-2 flex-1 rounded-full bg-gradient-to-r from-red-500 via-slate-400 to-emerald-400" />
          <span className="text-emerald-400">high</span>
        </div>
        <div className="mt-0.5 text-[9px] text-muted-foreground">
          red ≈ oppose · grey ≈ neutral (0.5) · green ≈ support
        </div>
      </div>
      <div>
        <div className="mb-1 text-muted-foreground">Energy burden</div>
        <div className="flex items-center gap-1">
          <span className="text-emerald-400">low</span>
          <span className="h-2 flex-1 rounded-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500" />
          <span className="text-red-400">high</span>
        </div>
      </div>
      <div>
        <div className="mb-1 text-muted-foreground">Infrastructure</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <span className="flex items-center gap-1.5">
            <Swatch color={rgb(INFRA_COLOR.solar)} /> Solar
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch color={rgb(INFRA_COLOR.wind)} /> Wind
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch color={rgb(INFRA_COLOR.battery)} /> Battery
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch color={rgb(INFRA_COLOR.microgrid)} /> Microgrid
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch color={rgb(INFRA_COLOR.ev_charger)} /> EV charger
          </span>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          hollow rings = existing (real) renewables / EV
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Swatch color="rgba(45,212,191,0.5)" /> existing district energy (Enwave)
        </div>
      </div>
      <div>
        <div className="mb-1 text-muted-foreground">Facilities</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {["cooling_centre", "shelter", "hospital"].map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span>{FACILITY_META[k].icon}</span> {FACILITY_META[k].label}
            </span>
          ))}
        </div>
      </div>
      {layers.demand && (
        <div>
          <div className="mb-1 text-muted-foreground">Demand heat</div>
          <div className="flex items-center gap-1">
            <span>low</span>
            <span className="h-2 flex-1 rounded-full bg-gradient-to-r from-blue-700 via-cyan-400 to-orange-600" />
            <span>high</span>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Dot color="#34d399" /> lit / resilient
        </span>
        <span className="flex items-center gap-1.5">
          <Dot color="#0a0e1a" /> outage
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-4 rounded-full bg-primary" /> energy flow
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch color="rgba(220,38,38,0.5)" /> no-build
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch color="rgba(56,132,255,0.6)" /> flood risk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-yellow-400" />{" "}
          scenario target
        </span>
      </div>
      <div className="border-t border-border/40 pt-2">
        <div className="mb-1 text-muted-foreground">Climate vulnerability</div>
        <div className="flex items-center gap-1">
          <span>low</span>
          <span className="h-2 flex-1 rounded-full bg-gradient-to-r from-slate-500 via-orange-400 to-red-500" />
          <span>high</span>
        </div>
        <div className="mt-0.5 text-[9px] text-muted-foreground">
          heat-vulnerability (HVI) &amp; flood risk — high-HVI zones suffer most
          in a heatwave; flood zones tint blue.
        </div>
      </div>
      <p className="border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
        Hover a neighbourhood for its energy burden, approval, green score,
        pollution, heat-vulnerability &amp; flood risk.
      </p>
    </div>
  );
}
