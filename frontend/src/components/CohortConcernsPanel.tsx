import { Sparkles, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import type { CohortConcern, CohortProfile } from "@/types";
import { cn } from "@/lib/utils";

const STANCE_COLORS: Record<string, string> = {
  support: "text-emerald-400",
  oppose: "text-rose-400",
  mixed: "text-amber-400",
  neutral: "text-muted-foreground",
};

const SEVERITY_VARIANT: Record<string, "secondary" | "default" | "destructive"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
};

export function CohortConcernsPanel() {
  const live = useStore((s) => s.live);
  const persistenceProvider = useStore((s) => s.backendHealth?.persistenceProvider);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const datasets = useStore((s) => s.datasets);
  const cohorts = useStore((s) => s.cohorts);
  const cohortConcerns = useStore((s) => s.cohortConcerns);
  const cohortGenerating = useStore((s) => s.cohortGenerating);
  const cohortError = useStore((s) => s.cohortError);
  const generateCohortConcerns = useStore((s) => s.generateCohortConcerns);
  const loadCohortConcerns = useStore((s) => s.loadCohortConcerns);
  const deleteCohortConcern = useStore((s) => s.deleteCohortConcern);

  const supabaseActive = live && persistenceProvider === "supabase";
  const canGenerate = supabaseActive && !!selectedProjectId;

  const datasetNameById = Object.fromEntries(datasets.map((d) => [d.id, d.name]));
  const cohortById = Object.fromEntries(cohorts.map((c) => [c.id, c]));

  return (
    <section className={cn("space-y-2", !canGenerate && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Cohort concerns
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {cohortConcerns.length}
        </Badge>
      </div>

      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">Dataset-grounded synthetic cohorts.</span>{" "}
        Generated from uploaded dataset previews/summaries. Not real residents and not a
        substitute for public consultation.
      </p>

      {cohortError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {cohortError}
        </p>
      )}

      <Button
        size="sm"
        className="h-7 w-full gap-1 text-xs"
        disabled={!canGenerate || cohortGenerating || datasets.length === 0}
        onClick={() => void generateCohortConcerns()}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {cohortGenerating ? "Generating…" : "Generate resident concerns"}
      </Button>

      {datasets.length === 0 && supabaseActive && (
        <p className="text-[10px] text-muted-foreground">Upload datasets first.</p>
      )}

      <div className="max-h-24 space-y-1 overflow-y-auto">
        {cohorts.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No cohorts yet.</p>
        ) : (
          cohorts.map((c) => <CohortCard key={c.id} cohort={c} />)
        )}
      </div>

      <div className="max-h-36 space-y-1.5 overflow-y-auto">
        {cohortConcerns.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
            No concerns generated yet.
          </p>
        ) : (
          cohortConcerns.map((concern) => (
            <ConcernRow
              key={concern.id}
              concern={concern}
              cohort={cohortById[concern.cohortId]}
              datasetNameById={datasetNameById}
              disabled={!supabaseActive}
              onDelete={() => void deleteCohortConcern(concern.id)}
            />
          ))
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-full text-[10px]"
        disabled={!canGenerate}
        onClick={() => void loadCohortConcerns()}
      >
        Refresh concerns
      </Button>
    </section>
  );
}

function CohortCard({ cohort }: { cohort: CohortProfile }) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20 px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{cohort.name}</span>
        {cohort.confidence != null && (
          <span className="text-[10px] text-muted-foreground">
            {Math.round(cohort.confidence * 100)}% conf.
          </span>
        )}
      </div>
      <div className="text-[10px] capitalize text-muted-foreground">
        {cohort.cohortType.replace(/_/g, " ")}
      </div>
      {cohort.priorities.length > 0 && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          Priorities: {cohort.priorities.slice(0, 3).join(", ")}
        </div>
      )}
    </div>
  );
}

function ConcernRow({
  concern,
  cohort,
  datasetNameById,
  disabled,
  onDelete,
}: {
  concern: CohortConcern;
  cohort?: CohortProfile;
  datasetNameById: Record<string, string>;
  disabled: boolean;
  onDelete: () => void;
}) {
  const stanceClass = STANCE_COLORS[concern.stance] ?? STANCE_COLORS.neutral;
  const sev = SEVERITY_VARIANT[concern.severity] ?? "secondary";
  const dsNames = concern.relatedDatasetIds
    .map((id) => datasetNameById[id])
    .filter(Boolean);

  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-2 py-1.5 text-xs">
      <div className="mb-0.5 flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant={sev} className="text-[9px] capitalize">
              {concern.severity}
            </Badge>
            <span className={cn("text-[10px] capitalize", stanceClass)}>
              {concern.stance}
            </span>
            <span className="text-[10px] text-muted-foreground">{concern.topic}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {cohort?.name ?? "Cohort"}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 shrink-0 p-0"
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <p className="leading-snug">{concern.summary}</p>
      {dsNames.length > 0 && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          From: {dsNames.join(", ")}
        </p>
      )}
      {concern.evidence.length > 0 && (
        <p className="mt-0.5 line-clamp-2 text-[10px] italic text-muted-foreground">
          {concern.evidence[0]}
        </p>
      )}
    </div>
  );
}
