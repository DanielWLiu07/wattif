import { useState } from "react";
import { FileSearch, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";

export function UploadedEvidencePanel() {
  const live = useStore((s) => s.live);
  const persistenceProvider = useStore((s) => s.backendHealth?.persistenceProvider);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const evidenceChunks = useStore((s) => s.evidenceChunks);
  const evidenceSearchResults = useStore((s) => s.evidenceSearchResults);
  const evidenceLoading = useStore((s) => s.evidenceLoading);
  const evidenceError = useStore((s) => s.evidenceError);
  const loadEvidenceChunks = useStore((s) => s.loadEvidenceChunks);
  const searchEvidence = useStore((s) => s.searchEvidence);

  const [query, setQuery] = useState("");
  const supabaseActive = live && persistenceProvider === "supabase";
  const canUse = supabaseActive && !!selectedProjectId;

  const typeCounts: Record<string, number> = {};
  for (const c of evidenceChunks) {
    const t = c.datasetType || "generic";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  const displayRows =
    evidenceSearchResults.length > 0
      ? evidenceSearchResults.map((r) => ({
          id: r.id,
          text: r.chunkText,
          dtype: r.datasetType,
          field: r.sourceField,
          rowIdx: r.sourceRowIndex,
          score: r.score,
        }))
      : evidenceChunks.slice(0, 5).map((c) => ({
          id: c.id,
          text: c.chunkText,
          dtype: c.datasetType,
          field: c.sourceField,
          rowIdx: c.sourceRowIndex,
          score: null as number | null,
        }));

  return (
    <section className={cn("space-y-2", !canUse && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <FileSearch className="h-3.5 w-3.5" />
          Uploaded evidence snippets
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {evidenceChunks.length}
        </Badge>
      </div>

      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] leading-snug text-muted-foreground">
        Evidence snippets are extracted from uploaded datasets and may be incomplete. They
        are decision-support context, not validated public consultation.
      </p>

      {evidenceError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {evidenceError}
        </p>
      )}

      {Object.keys(typeCounts).length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Types:{" "}
          {Object.entries(typeCounts)
            .slice(0, 4)
            .map(([t, n]) => `${t.replace(/_/g, " ")} (${n})`)
            .join(" · ")}
        </p>
      )}

      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          void searchEvidence(query);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!canUse || evidenceLoading}
          placeholder="Search: charger, parking, heatwave…"
          className="min-w-0 flex-1 rounded-md border border-border bg-background/70 px-2 py-1 text-[11px] outline-none focus:border-primary"
        />
        <Button
          type="submit"
          size="sm"
          className="h-7 px-2"
          disabled={!canUse || evidenceLoading || !query.trim()}
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
      </form>

      <div className="max-h-36 space-y-1 overflow-y-auto">
        {displayRows.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
            Upload CSV/GeoJSON with text fields (comments, feedback, status) to extract
            evidence snippets.
          </p>
        ) : (
          displayRows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-border/70 bg-background/40 px-2 py-1.5 text-[11px]"
            >
              <div className="mb-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                <span className="capitalize">{(row.dtype || "dataset").replace(/_/g, " ")}</span>
                {row.field && <span>· {row.field}</span>}
                {row.rowIdx != null && <span>· row {row.rowIdx}</span>}
                {row.score != null && row.score > 0 && (
                  <Badge variant="outline" className="text-[9px]">
                    score {row.score.toFixed(1)}
                  </Badge>
                )}
              </div>
              <p className="line-clamp-3 leading-snug">{row.text}</p>
            </div>
          ))
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-full text-[10px]"
        disabled={!canUse}
        onClick={() => void loadEvidenceChunks()}
      >
        Refresh evidence
      </Button>
    </section>
  );
}
