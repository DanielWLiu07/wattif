import { Check, Circle, ClipboardList, LayoutDashboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/store";
import {
  computeReadiness,
  computeReviewSummary,
  formatInfraSummary,
} from "@/lib/proposalReadiness";
import { cn } from "@/lib/utils";

function StatusPill({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/50 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "truncate text-[11px] font-medium",
          ok === true && "text-emerald-400",
          ok === false && "text-muted-foreground"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function ProposalReviewPanel() {
  const projects = useStore((s) => s.projects);
  const proposals = useStore((s) => s.proposals);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const selectedProposalId = useStore((s) => s.selectedProposalId);
  const proposalInfrastructure = useStore((s) => s.proposalInfrastructure);
  const snapshots = useStore((s) => s.snapshots);
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const datasets = useStore((s) => s.datasets);
  const cohortConcerns = useStore((s) => s.cohortConcerns);
  const decisionMemo = useStore((s) => s.decisionMemo);
  const operatorRecommendationReady = useStore((s) => s.operatorRecommendationReady);

  const project = projects.find((p) => p.id === selectedProjectId);
  const proposal = proposals.find((p) => p.id === selectedProposalId);

  const hasOperatorRecommendation =
    operatorRecommendationReady ||
    !!decisionMemo?.hasOperatorRecommendation;

  const summary = computeReviewSummary({
    projectName: project?.name ?? null,
    proposalName: proposal?.name ?? null,
    proposalInfrastructure,
    snapshots,
    latestSnapshot,
    datasetCount: datasets.length,
    concernCount: cohortConcerns.length,
    hasOperatorRecommendation,
    decisionMemo,
  });

  const readiness = computeReadiness({
    selectedProjectId,
    selectedProposalId,
    proposalInfrastructure,
    datasetCount: datasets.length,
    concernCount: cohortConcerns.length,
    hasOperatorRecommendation,
    snapshots,
    decisionMemo,
  });

  const doneCount = readiness.filter((r) => r.done).length;

  if (!selectedProjectId) return null;

  return (
    <section className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
          Proposal review
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {doneCount}/{readiness.length}
        </Badge>
      </div>

      {selectedProposalId ? (
        <>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2 py-1.5 text-[11px]">
            <div className="font-medium text-foreground">
              {summary.proposalName ?? "Proposal"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {summary.projectName ?? "Project"}
              {proposal?.status ? ` · ${proposal.status}` : ""}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <StatusPill
              label="Infrastructure"
              value={formatInfraSummary(summary.infraByKind)}
              ok={summary.infraTotal > 0}
            />
            <StatusPill
              label="Latest snapshot"
              value={summary.snapshotStatus}
              ok={snapshots.length > 0}
            />
            <StatusPill
              label="Datasets"
              value={`${summary.datasetCount} uploaded`}
              ok={summary.datasetCount > 0}
            />
            <StatusPill
              label="Concerns"
              value={`${summary.concernCount} generated`}
              ok={summary.concernCount > 0}
            />
            <StatusPill
              label="Operator rec."
              value={summary.hasOperatorRecommendation ? "On file" : "Not yet"}
              ok={summary.hasOperatorRecommendation}
            />
            <StatusPill
              label="Decision memo"
              value={
                summary.hasDecisionMemo
                  ? summary.memoGeneratedAt
                    ? new Date(summary.memoGeneratedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Generated"
                  : "Not yet"
              }
              ok={summary.hasDecisionMemo}
            />
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-border/60 bg-background/40 p-2 text-[11px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">No proposal selected.</span>{" "}
          Create or select a proposal below to review infrastructure, snapshots, and export
          a decision memo.
        </p>
      )}

      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <ClipboardList className="h-3 w-3" />
          Proposal readiness
        </div>
        <ul className="space-y-0.5">
          {readiness.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex items-start gap-1.5 rounded-md px-1 py-0.5 text-[11px]",
                !item.done && "text-muted-foreground"
              )}
            >
              {item.done ? (
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
              ) : (
                <Circle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
              )}
              <span>
                <span className={item.done ? "text-foreground" : undefined}>
                  {item.label}
                </span>
                {!item.done && (
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                    → {item.hint}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[9px] leading-snug text-muted-foreground">
        Demo guidance only — synthetic concerns and memos are decision-support artifacts,
        not public consultation or engineering validation.
      </p>
    </section>
  );
}
