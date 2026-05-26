import { useRef, useState } from "react";
import { ClipboardCopy, Download, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DecisionMemoPanel() {
  const live = useStore((s) => s.live);
  const persistenceProvider = useStore((s) => s.backendHealth?.persistenceProvider);
  const selectedProposalId = useStore((s) => s.selectedProposalId);
  const proposals = useStore((s) => s.proposals);
  const decisionMemo = useStore((s) => s.decisionMemo);
  const decisionMemoLoading = useStore((s) => s.decisionMemoLoading);
  const decisionMemoError = useStore((s) => s.decisionMemoError);
  const generateDecisionMemo = useStore((s) => s.generateDecisionMemo);

  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const previewRef = useRef<HTMLPreElement>(null);

  const supabaseActive = live && persistenceProvider === "supabase";
  const canGenerate = supabaseActive && !!selectedProposalId;
  const proposalName =
    proposals.find((p) => p.id === selectedProposalId)?.name ?? "proposal";
  const hasReport = !!decisionMemo?.markdown;

  const handleCopy = async () => {
    if (!decisionMemo?.markdown) return;
    try {
      await navigator.clipboard.writeText(decisionMemo.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked */
    }
  };

  const scrollToSection = (sectionId: string, title: string) => {
    setActiveSection(sectionId);
    const pre = previewRef.current;
    if (!pre || !decisionMemo?.markdown) return;
    const needle = `## ${title}`;
    const idx = decisionMemo.markdown.indexOf(needle);
    if (idx >= 0) {
      const lineStart = decisionMemo.markdown.slice(0, idx).split("\n").length - 1;
      const lineHeight = 14;
      pre.scrollTop = Math.max(0, lineStart * lineHeight - 8);
    }
  };

  const slug = proposalName.replace(/[^\w.-]+/g, "_").slice(0, 40);

  return (
    <section className={cn("space-y-2", !canGenerate && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Decision memo
        </div>
        {hasReport && (
          <Badge variant="secondary" className="text-[10px]">
            Draft · {new Date(decisionMemo!.generatedAt).toLocaleString()}
          </Badge>
        )}
      </div>

      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">Decision-support memo only.</span>{" "}
        Summarizes infrastructure, datasets, synthetic concerns, metrics, and operator
        recommendations. Not engineering validation or public consultation.
      </p>

      {!supabaseActive && (
        <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
          Requires Supabase persistence. Configure backend env vars to generate a report.
        </p>
      )}

      {decisionMemoError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {decisionMemoError}
        </p>
      )}

      {decisionMemoLoading && (
        <p className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Collecting proposal data and building report…
        </p>
      )}

      {!hasReport && !decisionMemoLoading && canGenerate && (
        <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] leading-snug text-muted-foreground">
          No decision memo yet. Complete datasets, concerns, operator guidance, and a snapshot
          first — then generate to produce a stakeholder-readable summary.
        </p>
      )}

      <Button
        size="sm"
        className="h-7 w-full gap-1 text-xs"
        disabled={!canGenerate || decisionMemoLoading}
        onClick={() => void generateDecisionMemo()}
      >
        {decisionMemoLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        {decisionMemoLoading ? "Generating…" : hasReport ? "Regenerate memo" : "Generate decision memo"}
      </Button>

      {hasReport && (
        <>
          {decisionMemo!.sections.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {decisionMemo!.sections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => scrollToSection(sec.id, sec.title)}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[9px] transition-colors",
                    activeSection === sec.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {sec.title.replace(/ \/ .*/, "")}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1 text-[10px]"
              disabled={!hasReport}
              onClick={() => void handleCopy()}
            >
              <ClipboardCopy className="h-3 w-3" />
              {copied ? "Copied" : "Copy markdown"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1 text-[10px]"
              disabled={!hasReport}
              onClick={() =>
                downloadText(
                  `${slug}_decision_memo.md`,
                  decisionMemo!.markdown,
                  "text/markdown;charset=utf-8"
                )
              }
            >
              <Download className="h-3 w-3" />
              Download .md
            </Button>
            {decisionMemo!.html && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 gap-1 text-[10px]"
                disabled={!hasReport}
                onClick={() =>
                  downloadText(
                    `${slug}_decision_memo.html`,
                    decisionMemo!.html!,
                    "text/html;charset=utf-8"
                  )
                }
              >
                <Download className="h-3 w-3" />
                Download .html
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-background/50 p-2">
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>Preview</span>
              <span>Generated {new Date(decisionMemo!.generatedAt).toLocaleString()}</span>
            </div>
            <pre
              ref={previewRef}
              className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-foreground/90"
            >
              {decisionMemo!.markdown}
            </pre>
          </div>
        </>
      )}
    </section>
  );
}
