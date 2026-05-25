import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useStore } from "@/store";
import { avatarDataUri } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STANCE_STYLE: Record<
  string,
  { ring: string; chip: "default" | "destructive" | "secondary"; label: string }
> = {
  support: { ring: "ring-emerald-400/60", chip: "default", label: "support" },
  oppose: { ring: "ring-red-400/60", chip: "destructive", label: "oppose" },
  neutral: { ring: "ring-slate-400/50", chip: "secondary", label: "neutral" },
};

const FILTERS = ["all", "support", "oppose", "neutral"] as const;

// voice.trigger is now "placement:<kind>" | "program:<name>" | scenario-type | null
function triggerLabel(t?: string | null): string | null {
  if (!t) return null;
  if (t.startsWith("placement:")) return `a new ${t.slice(10)}`;
  if (t.startsWith("program:")) return t.slice(8).replace(/_/g, " ");
  if (t === "ai-plan") return "the AI plan";
  return t.replace(/_/g, " ");
}

export function VoicesFeed() {
  const voices = useStore((s) => s.voices);
  const zones = useStore((s) => s.zones);
  const sentiment = useStore((s) => s.sentiment);
  const selectedVoiceId = useStore((s) => s.selectedVoiceId);
  const selectVoiceFromLog = useStore((s) => s.selectVoiceFromLog);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const zoneName = useMemo(
    () => new Map(zones.map((z) => [z.id, z.name])),
    [zones]
  );
  const approval = sentiment?.cityApprovalPct ?? 0.6;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return voices.filter((v) => {
      if (filter !== "all" && v.stance !== filter) return false;
      if (!needle) return true;
      return (
        v.text.toLowerCase().includes(needle) ||
        (zoneName.get(v.zoneId) ?? "").toLowerCase().includes(needle) ||
        v.archetype.toLowerCase().includes(needle) ||
        (v.topic ?? "").toLowerCase().includes(needle)
      );
    });
  }, [voices, q, filter, zoneName]);

  // scroll the selected entry into view when it changes
  const selRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedVoiceId]);

  return (
    <div className="flex h-full flex-col">
      {/* approval thermometer */}
      <div className="border-b border-border px-3 py-2">
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

      {/* search + filter */}
      <div className="space-y-1.5 border-b border-border px-2.5 py-2">
        <div className="flex items-center gap-1.5 rounded-md border border-input bg-secondary/40 px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search neighbourhood, keyword…"
            className="w-full bg-transparent py-1.5 text-xs outline-none"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] capitalize transition-colors",
                filter === f
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-secondary/30 hover:bg-secondary"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {shown.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {voices.length === 0
              ? "No public chatter yet. Place infrastructure or fire a scenario."
              : "No voices match your search."}
          </p>
        )}
        {shown.map((v) => {
          const st = STANCE_STYLE[v.stance];
          const selected = v.id === selectedVoiceId;
          return (
            <div
              key={v.id}
              ref={selected ? selRef : undefined}
              onClick={() => v.id && selectVoiceFromLog(v.id)}
              className={cn(
                "flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-secondary/30 hover:border-primary/40"
              )}
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
                {triggerLabel(v.trigger) && (
                  <div className="mt-0.5 text-[9px] text-accent/90">
                    ↳ reacting to {triggerLabel(v.trigger)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
