import { useMemo } from "react";
import { useStore } from "@/store";
import { avatarDataUri } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";

const STANCE_STYLE: Record<
  string,
  { ring: string; chip: "default" | "destructive" | "secondary"; label: string }
> = {
  support: { ring: "ring-emerald-400/60", chip: "default", label: "support" },
  oppose: { ring: "ring-red-400/60", chip: "destructive", label: "oppose" },
  neutral: { ring: "ring-slate-400/50", chip: "secondary", label: "neutral" },
};

export function VoicesFeed() {
  const voices = useStore((s) => s.voices);
  const zones = useStore((s) => s.zones);
  const sentiment = useStore((s) => s.sentiment);
  const zoneName = useMemo(
    () => new Map(zones.map((z) => [z.id, z.name])),
    [zones]
  );
  const approval = sentiment?.cityApprovalPct ?? 0.6;

  return (
    <div className="flex h-full flex-col">
      {/* approval thermometer */}
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">City approval</span>
          <span className="font-semibold tabular-nums">
            {(approval * 100).toFixed(0)}%
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gradient-to-r from-red-500/40 via-slate-500/30 to-emerald-500/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-500"
            style={{ width: `${approval * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {voices.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No public chatter yet. Place infrastructure or trigger a scenario.
          </p>
        )}
        {voices.map((v, i) => {
          const st = STANCE_STYLE[v.stance];
          return (
            <div
              key={`${v.agentId}-${i}`}
              className="flex gap-2.5 rounded-lg border border-border/60 bg-secondary/30 p-2.5"
            >
              <img
                src={avatarDataUri(v.avatarSeed)}
                alt=""
                className={`h-8 w-8 shrink-0 rounded-full ring-2 ${st.ring}`}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[11px] font-medium">
                    {v.archetype}
                  </span>
                  <Badge variant={st.chip} className="px-1.5 py-0 text-[9px]">
                    {st.label}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs leading-snug text-foreground/90">
                  {v.text}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {zoneName.get(v.zoneId) ?? v.zoneId} · {v.topic}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
