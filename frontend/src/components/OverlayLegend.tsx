import { useStore } from "@/store";
import { cn } from "@/lib/utils";

type OverlayKey = "equity" | "sentiment" | "demand" | "flood" | "priority" | "none";

const OVERLAYS: {
  key: OverlayKey;
  label: string;
  low: string;
  high: string;
  ramp: string;
}[] = [
  {
    key: "sentiment",
    label: "Approval",
    low: "oppose",
    high: "support",
    ramp: "from-red-500 via-slate-400 to-emerald-400",
  },
  {
    key: "equity",
    label: "Energy burden",
    low: "low",
    high: "high",
    ramp: "from-emerald-500 via-yellow-400 to-red-500",
  },
  {
    key: "demand",
    label: "Demand",
    low: "low",
    high: "high",
    ramp: "from-blue-700 via-cyan-400 to-orange-600",
  },
  {
    key: "flood",
    label: "Flood risk",
    low: "low",
    high: "high",
    ramp: "from-slate-600 via-sky-500 to-blue-500",
  },
  {
    key: "priority",
    label: "Build priority",
    low: "low",
    high: "build here",
    ramp: "from-slate-700 via-fuchsia-600 to-fuchsia-400",
  },
];

export function OverlayLegend() {
  const layers = useStore((s) => s.layers);
  const setPrimaryOverlay = useStore((s) => s.setPrimaryOverlay);

  // Active overlay = highest-priority toggled-on choropleth.
  const active =
    (["equity", "sentiment", "demand", "flood", "priority"] as OverlayKey[]).find(
      (k) => layers[k as keyof typeof layers]
    ) ?? "none";
  const meta = OVERLAYS.find((o) => o.key === active);

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-30 w-[230px]">
      <div className="glass rounded-xl px-3 py-2.5 shadow-xl">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Map overlay
          </span>
          <span className="text-xs font-semibold">
            {meta ? meta.label : "None"}
          </span>
        </div>

        {meta ? (
          <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{meta.low}</span>
            <span className={cn("h-2 flex-1 rounded-full bg-gradient-to-r", meta.ramp)} />
            <span>{meta.high}</span>
          </div>
        ) : (
          <p className="mb-2 text-[10px] text-muted-foreground">
            No overlay — pick one to colour the zones.
          </p>
        )}

        <div className="flex flex-wrap gap-1">
          {OVERLAYS.map((o) => (
            <button
              key={o.key}
              onClick={() => setPrimaryOverlay(o.key)}
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[10px] transition-colors",
                active === o.key
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-secondary/30 hover:bg-secondary"
              )}
            >
              {o.label}
            </button>
          ))}
          <button
            onClick={() => setPrimaryOverlay("none")}
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[10px] transition-colors",
              active === "none"
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-secondary/30 hover:bg-secondary"
            )}
          >
            None
          </button>
        </div>
      </div>
    </div>
  );
}
