import { MessageSquareQuote, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import type { SyntheticResidentReaction } from "@/types";
import { cn } from "@/lib/utils";

const STANCE_COLORS: Record<string, string> = {
  support: "text-emerald-400",
  oppose: "text-rose-400",
  mixed: "text-amber-400",
  concern: "text-orange-400",
  neutral: "text-muted-foreground",
};

export function SyntheticResidentReactionsPanel() {
  const live = useStore((s) => s.live);
  const persistenceProvider = useStore((s) => s.backendHealth?.persistenceProvider);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const selectedProposalId = useStore((s) => s.selectedProposalId);
  const cohortConcerns = useStore((s) => s.cohortConcerns);
  const syntheticResidentReactions = useStore((s) => s.syntheticResidentReactions);
  const residentReactionsGenerating = useStore((s) => s.residentReactionsGenerating);
  const residentReactionsError = useStore((s) => s.residentReactionsError);
  const residentReactionsWarning = useStore((s) => s.residentReactionsWarning);
  const generateSyntheticResidentReactions = useStore(
    (s) => s.generateSyntheticResidentReactions
  );
  const loadSyntheticResidentReactions = useStore(
    (s) => s.loadSyntheticResidentReactions
  );
  const deleteResidentReaction = useStore((s) => s.deleteResidentReaction);

  const supabaseActive = live && persistenceProvider === "supabase";
  const canGenerate = supabaseActive && !!selectedProjectId && !!selectedProposalId;

  return (
    <section className={cn("space-y-2", !canGenerate && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <MessageSquareQuote className="h-3.5 w-3.5" />
          Synthetic resident reactions
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {syntheticResidentReactions.length}
        </Badge>
      </div>

      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">Synthetic cohort reactions.</span>{" "}
        On-demand LLM-generated decision-support personas — not real residents, not public
        consultation, and not validated survey feedback.
      </p>

      {residentReactionsError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {residentReactionsError}
        </p>
      )}

      {residentReactionsWarning && !residentReactionsError && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
          {residentReactionsWarning}
        </p>
      )}

      <Button
        size="sm"
        className="h-7 w-full gap-1 text-xs"
        disabled={!canGenerate || residentReactionsGenerating}
        onClick={() => void generateSyntheticResidentReactions()}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {residentReactionsGenerating
          ? "Generating…"
          : "Generate synthetic resident reactions"}
      </Button>

      {!selectedProposalId && supabaseActive && (
        <p className="text-[10px] text-muted-foreground">
          Select a proposal to generate and persist reactions for that scenario.
        </p>
      )}

      {cohortConcerns.length === 0 && canGenerate && (
        <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[10px] leading-snug text-muted-foreground">
          Generate synthetic cohort concerns first for richer grounding. Reactions can still
          be generated using proposal context and deterministic fallback.
        </p>
      )}

      <div className="max-h-44 space-y-1.5 overflow-y-auto">
        {syntheticResidentReactions.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground">No reactions yet.</span> Select a
            proposal and click Generate synthetic resident reactions. Ask the operator what
            synthetic residents are reacting to.
          </p>
        ) : (
          syntheticResidentReactions.map((reaction) => (
            <ReactionCard
              key={reaction.id}
              reaction={reaction}
              disabled={!supabaseActive}
              onDelete={() => void deleteResidentReaction(reaction.id)}
            />
          ))
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-full text-[10px]"
        disabled={!canGenerate}
        onClick={() => void loadSyntheticResidentReactions()}
      >
        Refresh reactions
      </Button>
    </section>
  );
}

function ReactionCard({
  reaction,
  disabled,
  onDelete,
}: {
  reaction: SyntheticResidentReaction;
  disabled: boolean;
  onDelete: () => void;
}) {
  const stanceClass = STANCE_COLORS[reaction.stance] ?? STANCE_COLORS.neutral;

  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-2 py-1.5 text-xs">
      <div className="mb-0.5 flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-medium">{reaction.personaLabel ?? "Synthetic cohort"}</span>
            <span className={cn("text-[10px] capitalize", stanceClass)}>
              {reaction.stance}
            </span>
            {reaction.provider && (
              <Badge variant="outline" className="text-[9px] capitalize">
                {reaction.provider}
                {reaction.model ? ` · ${reaction.model}` : ""}
              </Badge>
            )}
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
      <p className="leading-snug">{reaction.summary}</p>
      {reaction.keyConcern && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Key concern: {reaction.keyConcern}
        </p>
      )}
      {reaction.suggestedChange && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Suggested change: {reaction.suggestedChange}
        </p>
      )}
      {reaction.evidence && (
        <p className="mt-0.5 text-[10px] text-sky-400/90">
          Evidence from uploaded dataset: {reaction.evidence}
        </p>
      )}
      <p className="mt-1 text-[9px] leading-snug text-amber-600/90 dark:text-amber-400/90">
        {reaction.caveat}
      </p>
    </div>
  );
}
