import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

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

const CHIPS: { key: OverlayKey; label: string }[] = [
  ...OVERLAYS.map((o) => ({ key: o.key, label: o.label })),
  { key: "none", label: "None" },
];

export function OverlayLegendPanel({ className }: { className?: string }) {
  const layers = useStore((s) => s.layers);
  const setPrimaryOverlay = useStore((s) => s.setPrimaryOverlay);

  const active =
    (["equity", "sentiment", "demand", "flood", "priority"] as OverlayKey[]).find(
      (k) => layers[k as keyof typeof layers]
    ) ?? "none";
  const meta = OVERLAYS.find((o) => o.key === active);

  return (
    <Card className={cn("glass px-3 py-2.5", className)}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label">Map overlay</span>
        <span className="text-xs font-semibold">{meta ? meta.label : "None"}</span>
      </div>

      {meta ? (
        <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="w-12 text-left">{meta.low}</span>
          <span className={cn("h-2 flex-1 rounded-full bg-gradient-to-r", meta.ramp)} />
          <span className="w-12 text-right">{meta.high}</span>
        </div>
      ) : (
        <p className="mb-2 text-[10px] text-muted-foreground">
          No overlay — pick one to colour the zones.
        </p>
      )}

      <div className="grid grid-cols-3 gap-1">
        {CHIPS.map((o) => (
          <button
            key={o.key}
            onClick={() => setPrimaryOverlay(o.key)}
            className={cn(
              "truncate rounded-md border px-1.5 py-1 text-center text-[10px] transition-colors duration-150",
              active === o.key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border bg-muted hover:bg-secondary"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

/**
 * Bottom-left drawer: a tab flush with the viewport bottom toggles the overlay
 * switcher, which slides up from the bottom edge of the screen.
 */
export function OverlayLegend() {
  const [open, setOpen] = useState(false);
  const mainView = useStore((s) => s.mainView);

  if (mainView === "events") return null;

  return (
    <div className="pointer-events-none fixed bottom-0 left-4 z-30 flex w-[280px] flex-col items-stretch">
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          open
            ? "pointer-events-auto max-h-[220px] translate-y-0 opacity-100"
            : "pointer-events-none max-h-0 translate-y-2 opacity-0"
        )}
        aria-hidden={!open}
      >
        <OverlayLegendPanel className="rounded-b-none border-b-0 shadow-lg" />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Hide map overlay menu" : "Show map overlay menu"}
        className="pointer-events-auto glass flex h-6 w-full items-center justify-center rounded-t-md border border-b-0 text-muted-foreground shadow-lg transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
