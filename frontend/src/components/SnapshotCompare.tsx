import { useStore } from "@/store";
import { metricsFromSnapshotRecord, type SimMetrics } from "@/types";
import { cn } from "@/lib/utils";

type CompareRow = {
  key: keyof SimMetrics;
  label: string;
  format: (v: number) => string;
  deltaUnit: string;
  scale?: number;
  lowerIsBetter?: boolean;
};

const ROWS: CompareRow[] = [
  { key: "coveragePct", label: "Coverage", format: (v) => `${v.toFixed(1)}%`, deltaUnit: "pp", scale: 100 },
  { key: "approvalPct", label: "Approval", format: (v) => `${v.toFixed(1)}%`, deltaUnit: "pp", scale: 100 },
  { key: "equityScore", label: "Equity", format: (v) => `${v.toFixed(1)}%`, deltaUnit: "pp", scale: 100 },
  {
    key: "emissionsTonnes",
    label: "Emissions",
    format: (v) => `${v.toFixed(1)} t`,
    deltaUnit: "t",
    lowerIsBetter: true,
  },
  { key: "gridLoadPct", label: "Grid load", format: (v) => `${v.toFixed(1)}%`, deltaUnit: "pp", scale: 100 },
  {
    key: "costCumulativeCad",
    label: "Cost",
    format: (v) => `$${(v / 1_000_000).toFixed(2)}M`,
    deltaUnit: "M",
    scale: 1 / 1_000_000,
    lowerIsBetter: true,
  },
];

function DeltaChip({
  delta,
  unit,
  lowerIsBetter,
}: {
  delta: number;
  unit: string;
  lowerIsBetter?: boolean;
}) {
  if (Math.abs(delta) < 0.005) {
    return <span className="text-[10px] text-muted-foreground">±0</span>;
  }
  const up = delta > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span
      className={cn(
        "text-[10px] font-semibold tabular-nums",
        good ? "text-emerald-400" : "text-red-400"
      )}
    >
      {up ? "+" : ""}
      {delta.toFixed(unit === "M" ? 2 : 1)}
      {unit === "pp" ? "" : unit}
    </span>
  );
}

function formatSnapshotTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function snapshotMetricSummary(metrics: Record<string, unknown>): string {
  const parsed = metricsFromSnapshotRecord(metrics);
  const parts: string[] = [];
  if (typeof parsed.coveragePct === "number") {
    parts.push(`${(parsed.coveragePct * 100).toFixed(0)}% cov`);
  }
  if (typeof parsed.approvalPct === "number") {
    parts.push(`${(parsed.approvalPct * 100).toFixed(0)}% app`);
  }
  return parts.join(" · ") || "—";
}

export function SnapshotHistory() {
  const live = useStore((s) => s.live);
  const backendHealth = useStore((s) => s.backendHealth);
  const snapshots = useStore((s) => s.snapshots);
  const compareSnapshotId = useStore((s) => s.compareSnapshotId);
  const selectedProposalId = useStore((s) => s.selectedProposalId);
  const restoringSnapshot = useStore((s) => s.restoringSnapshot);
  const saveSnapshot = useStore((s) => s.saveSnapshot);
  const restoreSnapshot = useStore((s) => s.restoreSnapshot);
  const selectCompareSnapshot = useStore((s) => s.selectCompareSnapshot);

  const supabaseActive = live && backendHealth?.persistenceProvider === "supabase";

  if (!selectedProposalId) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Snapshot history
        </div>
        <ButtonSave
          disabled={!supabaseActive || restoringSnapshot}
          onClick={() => void saveSnapshot()}
        />
      </div>
      {!supabaseActive ? (
        <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
          Snapshot history requires Supabase persistence.
        </p>
      ) : snapshots.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
          No snapshots yet. Save one to capture the current live sim state.
        </p>
      ) : (
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {snapshots.map((snap) => {
            const selected = compareSnapshotId === snap.id;
            return (
              <div
                key={snap.id}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border/70 bg-secondary/20"
                )}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => selectCompareSnapshot(snap.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Tick {snap.tick}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatSnapshotTime(snap.createdAt)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {snapshotMetricSummary(snap.metrics)} · {snap.infrastructure.length} assets
                  </div>
                </button>
                <div className="mt-1.5 flex gap-1">
                  <button
                    type="button"
                    disabled={restoringSnapshot}
                    onClick={() => void restoreSnapshot(snap.id)}
                    className="rounded-md border border-border/70 bg-background/60 px-2 py-0.5 text-[10px] font-medium hover:border-primary/50 disabled:opacity-50"
                  >
                    Restore
                  </button>
                  <span className="self-center text-[9px] text-muted-foreground">
                    Live sim only
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ButtonSave({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[10px] font-medium text-primary-foreground disabled:opacity-50"
    >
      Save
    </button>
  );
}

export function SnapshotCompare() {
  const live = useStore((s) => s.live);
  const backendHealth = useStore((s) => s.backendHealth);
  const metrics = useStore((s) => s.metrics);
  const snapshots = useStore((s) => s.snapshots);
  const compareSnapshotId = useStore((s) => s.compareSnapshotId);
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const selectedProposalId = useStore((s) => s.selectedProposalId);

  const supabaseActive = live && backendHealth?.persistenceProvider === "supabase";
  const target =
    snapshots.find((s) => s.id === compareSnapshotId) ?? latestSnapshot ?? null;

  if (!selectedProposalId) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-2.5">
      <div className="mb-2 text-xs font-medium">Live vs snapshot</div>
      {!supabaseActive ? (
        <p className="text-[11px] text-muted-foreground">
          Snapshot comparison requires Supabase persistence.
        </p>
      ) : !target ? (
        <p className="text-[11px] text-muted-foreground">
          Save a snapshot to compare metrics against the live sim.
        </p>
      ) : !metrics ? (
        <p className="text-[11px] text-muted-foreground">Waiting for live metrics…</p>
      ) : (
        <>
          <p className="mb-2 text-[10px] text-muted-foreground">
            Live sim vs tick {target.tick}
            {target.createdAt ? ` · ${formatSnapshotTime(target.createdAt)}` : ""}
          </p>
          <div className="space-y-1">
            {ROWS.map((row) => {
              const liveRaw = metrics[row.key];
              const snapRaw = metricsFromSnapshotRecord(target.metrics)[row.key];
              if (typeof liveRaw !== "number" || typeof snapRaw !== "number") return null;
              const scale = row.scale ?? 1;
              const liveVal = liveRaw * scale;
              const snapVal = snapRaw * scale;
              const delta = liveVal - snapVal;
              return (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-2 py-1"
                >
                  <span className="text-[10px] text-muted-foreground">{row.label}</span>
                  <div className="flex items-center gap-2 text-[11px] tabular-nums">
                    <span>{row.format(liveVal)}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span className="text-muted-foreground">{row.format(snapVal)}</span>
                    <DeltaChip
                      delta={delta}
                      unit={row.deltaUnit}
                      lowerIsBetter={row.lowerIsBetter}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
