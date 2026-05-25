import { useStore } from "@/store";
import type { ActivitySeverity } from "@/types";

const SEV: Record<ActivitySeverity, { dot: string; text: string }> = {
  good: { dot: "bg-emerald-400", text: "text-foreground/90" },
  warn: { dot: "bg-yellow-400", text: "text-foreground/90" },
  bad: { dot: "bg-red-400", text: "text-foreground/90" },
  info: { dot: "bg-slate-400", text: "text-foreground/80" },
};

export function ActivityLog() {
  const activity = useStore((s) => s.activity);
  const metrics = useStore((s) => s.metrics);
  const flashZones = useStore((s) => s.flashZones);
  const flash = new Set(flashZones);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium">What's happening around the city</span>
        <span className="text-[10px] text-muted-foreground">
          tick {metrics?.tick ?? 0} · {metrics?.year ?? 2026}
        </span>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
        {activity.length === 0 && (
          <p className="px-1 py-2 text-xs leading-relaxed text-muted-foreground">
            Nothing yet. Press <b>Step</b> or <b>Play</b> to advance the
            simulation, place infrastructure, or fire a scenario — each change
            gets narrated here, newest first.
          </p>
        )}
        {activity.map((a) => {
          const s = SEV[a.severity];
          return (
            <div
              key={a.id}
              className={`flex gap-2 rounded-md border px-2 py-1.5 ${
                a.zoneId && flash.has(a.zoneId)
                  ? "border-sky-400/60 bg-sky-400/10"
                  : "border-border/50 bg-secondary/20"
              }`}
            >
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
              <div className="min-w-0">
                <p className={`text-xs leading-snug ${s.text}`}>{a.text}</p>
                <span className="text-[9px] text-muted-foreground">
                  tick {a.tick} · {a.year}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
