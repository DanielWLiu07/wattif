import { useState } from "react";
import { Check, Database, FolderPlus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CohortConcernsPanel } from "@/components/CohortConcernsPanel";
import { SyntheticResidentReactionsPanel } from "@/components/SyntheticResidentReactionsPanel";
import { UploadedEvidencePanel } from "@/components/UploadedEvidencePanel";
import { DecisionMemoPanel } from "@/components/DecisionMemoPanel";
import { DatasetUploadPanel } from "@/components/DatasetUploadPanel";
import { UploadedExistingInfraPanel } from "@/components/UploadedExistingInfraPanel";
import { ProposalReviewPanel } from "@/components/ProposalReviewPanel";
import { SnapshotCompare, SnapshotHistory } from "@/components/SnapshotCompare";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";

export function ProjectsTab() {
  const live = useStore((s) => s.live);
  const backendHealth = useStore((s) => s.backendHealth);
  const projects = useStore((s) => s.projects);
  const proposals = useStore((s) => s.proposals);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const selectedProposalId = useStore((s) => s.selectedProposalId);
  const proposalInfrastructure = useStore((s) => s.proposalInfrastructure);
  const persistenceMode = useStore((s) => s.persistenceMode);
  const persistenceLoading = useStore((s) => s.persistenceLoading);
  const persistenceError = useStore((s) => s.persistenceError);
  const restoringSnapshot = useStore((s) => s.restoringSnapshot);
  const createProject = useStore((s) => s.createProject);
  const selectProject = useStore((s) => s.selectProject);
  const createProposal = useStore((s) => s.createProposal);
  const selectProposal = useStore((s) => s.selectProposal);

  const [projectName, setProjectName] = useState("");
  const [proposalName, setProposalName] = useState("");
  const supabaseActive = live && backendHealth?.persistenceProvider === "supabase";
  const selectedProposal = proposals.find((p) => p.id === selectedProposalId);

  const modeText =
    persistenceMode === "supabase-proposal"
      ? `Persisting to "${selectedProposal?.name ?? "selected proposal"}"`
      : persistenceMode === "supabase-no-proposal"
      ? "Supabase ready - no proposal selected"
      : "In-memory mode";

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-xl border border-border/60 bg-secondary/20 p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Database className="h-3.5 w-3.5 text-primary" />
            Saved proposals
          </div>
          <Badge variant={supabaseActive ? "default" : "secondary"} className="text-[10px]">
            {supabaseActive ? "Supabase" : "Memory"}
          </Badge>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{modeText}</p>
        {!supabaseActive && (
          <p className="mt-2 rounded-lg border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
            Configure backend Supabase env vars to create and persist proposals.
          </p>
        )}
        {persistenceError && (
          <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
            {persistenceError}
          </p>
        )}
      </div>

      <section className={cn("space-y-2", !supabaseActive && "opacity-60")}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Projects
          </div>
          {persistenceLoading && (
            <span className="text-[10px] text-muted-foreground">Loading...</span>
          )}
          {restoringSnapshot && (
            <span className="text-[10px] text-muted-foreground">Restoring...</span>
          )}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void createProject(projectName);
            setProjectName("");
          }}
        >
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            disabled={!supabaseActive}
            placeholder="New project name"
            className="min-w-0 flex-1 rounded-md border border-border bg-background/70 px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <Button size="sm" className="h-7 px-2" disabled={!supabaseActive}>
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </form>
        <div className="max-h-32 space-y-1 overflow-y-auto">
          {projects.length === 0 && supabaseActive ? (
            <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
              No projects yet. Create one above to start saving proposals.
            </p>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                onClick={() => void selectProject(project.id)}
                disabled={!supabaseActive}
                className={cn(
                  "w-full rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
                  selectedProjectId === project.id
                    ? "border-primary bg-primary/10"
                    : "border-border/70 bg-secondary/20 hover:border-primary/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{project.name}</span>
                  {selectedProjectId === project.id && <Check className="h-3 w-3" />}
                </div>
                <div className="text-[10px] text-muted-foreground">{project.city}</div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className={cn("space-y-2", !selectedProjectId && "opacity-60")}>
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Proposals
        </div>
        {!selectedProjectId ? (
          <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
            Select a project first, then create or choose a proposal to review.
          </p>
        ) : (
          <>
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void createProposal(proposalName);
                setProposalName("");
              }}
            >
              <input
                value={proposalName}
                onChange={(e) => setProposalName(e.target.value)}
                disabled={!supabaseActive || !selectedProjectId}
                placeholder="New proposal name"
                className="min-w-0 flex-1 rounded-md border border-border bg-background/70 px-2 py-1 text-xs outline-none focus:border-primary"
              />
              <Button
                size="sm"
                className="h-7 px-2"
                disabled={!supabaseActive || !selectedProjectId}
              >
                Create
              </Button>
            </form>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {proposals.length === 0 ? (
                <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
                  No proposals yet. Create one to persist infrastructure and export a memo.
                </p>
              ) : (
                proposals.map((proposal) => (
                  <button
                    key={proposal.id}
                    onClick={() => void selectProposal(proposal.id)}
                    disabled={!supabaseActive}
                    className={cn(
                      "w-full rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
                      selectedProposalId === proposal.id
                        ? "border-primary bg-primary/10"
                        : "border-border/70 bg-secondary/20 hover:border-primary/50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{proposal.name}</span>
                      {selectedProposalId === proposal.id && <Save className="h-3 w-3" />}
                    </div>
                    <div className="text-[10px] capitalize text-muted-foreground">
                      {proposal.status}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </section>

      {selectedProjectId && <ProposalReviewPanel />}

      {selectedProjectId && <DatasetUploadPanel />}
      {selectedProjectId && <UploadedEvidencePanel />}
      {selectedProjectId && <UploadedExistingInfraPanel />}
      {selectedProjectId && <CohortConcernsPanel />}
      {selectedProjectId && <SyntheticResidentReactionsPanel />}

      {selectedProposalId && (
        <section className="space-y-3">
          <SnapshotHistory />
          <SnapshotCompare />
          <DecisionMemoPanel />

          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Persisted placements
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {proposalInfrastructure.length}
            </Badge>
          </div>
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {proposalInfrastructure.length === 0 ? (
              <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
                No persisted infrastructure yet. Select this proposal, then place assets from
                the Build tab — they will appear here automatically.
              </p>
            ) : (
              proposalInfrastructure.map((infra) => (
                <div
                  key={infra.id}
                  className="rounded-lg border border-border/70 bg-secondary/20 px-2 py-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="capitalize">{infra.kind}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {infra.capacityKw ?? "?"} kW
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {infra.zoneId ?? "No zone recorded"}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

