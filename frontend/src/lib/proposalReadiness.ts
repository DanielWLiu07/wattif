import type { OperatorRecommendation, ProposalReport } from "@/types";
import type { ProposalInfrastructure, SimulationSnapshot } from "@/types";

const OP_REC_STORAGE_PREFIX = "wattif:op-rec:";

export function loadOperatorRecommendationFlag(proposalId: string): boolean {
  try {
    return sessionStorage.getItem(`${OP_REC_STORAGE_PREFIX}${proposalId}`) === "1";
  } catch {
    return false;
  }
}

export function saveOperatorRecommendationFlag(proposalId: string): void {
  try {
    sessionStorage.setItem(`${OP_REC_STORAGE_PREFIX}${proposalId}`, "1");
  } catch {
    /* sessionStorage may be unavailable */
  }
}

export type ReadinessItem = {
  id: string;
  label: string;
  done: boolean;
  hint: string;
};

export type ReviewSummary = {
  projectName: string | null;
  proposalName: string | null;
  infraByKind: Record<string, number>;
  infraTotal: number;
  snapshotStatus: string;
  datasetCount: number;
  concernCount: number;
  hasOperatorRecommendation: boolean;
  hasDecisionMemo: boolean;
  memoGeneratedAt: string | null;
};

export function infraCountsByKind(
  infra: ProposalInfrastructure[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of infra) {
    const k = row.kind || "unknown";
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export function formatInfraSummary(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "None yet";
  return entries.map(([k, n]) => `${k}×${n}`).join(", ");
}

export function snapshotStatusLabel(
  snapshots: SimulationSnapshot[],
  latest: SimulationSnapshot | null
): string {
  const snap = latest ?? snapshots[0] ?? null;
  if (!snap) return "No snapshot saved";
  const when = snap.createdAt
    ? new Date(snap.createdAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return when ? `Tick ${snap.tick} · ${when}` : `Tick ${snap.tick}`;
}

export function computeReviewSummary(input: {
  projectName: string | null;
  proposalName: string | null;
  proposalInfrastructure: ProposalInfrastructure[];
  snapshots: SimulationSnapshot[];
  latestSnapshot: SimulationSnapshot | null;
  datasetCount: number;
  concernCount: number;
  hasOperatorRecommendation: boolean;
  decisionMemo: ProposalReport | null;
}): ReviewSummary {
  const infraByKind = infraCountsByKind(input.proposalInfrastructure);
  return {
    projectName: input.projectName,
    proposalName: input.proposalName,
    infraByKind,
    infraTotal: input.proposalInfrastructure.length,
    snapshotStatus: snapshotStatusLabel(input.snapshots, input.latestSnapshot),
    datasetCount: input.datasetCount,
    concernCount: input.concernCount,
    hasOperatorRecommendation: input.hasOperatorRecommendation,
    hasDecisionMemo: !!input.decisionMemo,
    memoGeneratedAt: input.decisionMemo?.generatedAt ?? null,
  };
}

export function computeReadiness(input: {
  selectedProjectId: string | null;
  selectedProposalId: string | null;
  proposalInfrastructure: ProposalInfrastructure[];
  datasetCount: number;
  concernCount: number;
  hasOperatorRecommendation: boolean;
  snapshots: SimulationSnapshot[];
  decisionMemo: ProposalReport | null;
}): ReadinessItem[] {
  return [
    {
      id: "project",
      label: "Project selected",
      done: !!input.selectedProjectId,
      hint: "Create or select a project above.",
    },
    {
      id: "proposal",
      label: "Proposal selected",
      done: !!input.selectedProposalId,
      hint: "Create or select a proposal for this project.",
    },
    {
      id: "infra",
      label: "Infrastructure placed",
      done: input.proposalInfrastructure.length > 0,
      hint: "Use Build tab to place solar, battery, EV charger, etc.",
    },
    {
      id: "datasets",
      label: "Dataset uploaded",
      done: input.datasetCount > 0,
      hint: "Upload CSV/GeoJSON in Datasets below.",
    },
    {
      id: "concerns",
      label: "Cohort concerns generated",
      done: input.concernCount > 0,
      hint: "Upload datasets, then Generate synthetic cohort concerns.",
    },
    {
      id: "operator",
      label: "Operator recommendation generated",
      done: input.hasOperatorRecommendation,
      hint: 'Open Chat and ask: "Based on synthetic cohort concerns, what should we change?"',
    },
    {
      id: "snapshot",
      label: "Snapshot saved",
      done: input.snapshots.length > 0,
      hint: "Run the sim, then Save a snapshot in Snapshot history.",
    },
    {
      id: "memo",
      label: "Decision memo generated",
      done: !!input.decisionMemo,
      hint: "Generate decision memo after completing the steps above.",
    },
  ];
}

export function noteOperatorRecommendation(
  proposalId: string | null | undefined,
  rec?: OperatorRecommendation | null
): boolean {
  if (!proposalId || !rec?.summary?.trim()) return false;
  saveOperatorRecommendationFlag(proposalId);
  return true;
}

export function markOperatorRecommendationReady(proposalId: string | null | undefined): void {
  if (!proposalId) return;
  saveOperatorRecommendationFlag(proposalId);
}
