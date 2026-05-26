import { useEffect, useMemo, useState } from "react";
import { Database, FileJson, Loader2, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DATASET_TYPES, type DatasetType, type UploadedDataset } from "@/types";
import { useStore } from "@/store";
import * as api from "@/api/client";
import { cn } from "@/lib/utils";

type Scope = "project" | "proposal";

export function DataUploadTab() {
  const live = useStore((s) => s.live);
  const backendHealth = useStore((s) => s.backendHealth);
  const projects = useStore((s) => s.projects);
  const proposals = useStore((s) => s.proposals);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const selectedProposalId = useStore((s) => s.selectedProposalId);
  const pushToast = useStore((s) => s.pushToast);

  const [scope, setScope] = useState<Scope>("proposal");
  const [file, setFile] = useState<File | null>(null);
  const [datasetType, setDatasetType] = useState<DatasetType | "auto">("auto");
  const [datasets, setDatasets] = useState<UploadedDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const supabaseActive = live && backendHealth?.persistenceProvider === "supabase";
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedProposal = proposals.find((p) => p.id === selectedProposalId);
  const canUseProposal = !!selectedProposalId;
  const effectiveScope: Scope = scope === "proposal" && canUseProposal ? "proposal" : "project";
  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId) ?? datasets[0];

  const load = async () => {
    if (!supabaseActive) {
      setDatasets([]);
      return;
    }
    const rows =
      effectiveScope === "proposal" && selectedProposalId
        ? await api.listProposalDatasets(selectedProposalId)
        : selectedProjectId
        ? await api.listProjectDatasets(selectedProjectId)
        : null;
    setDatasets(rows ?? []);
    setSelectedDatasetId((prev) =>
      prev && rows?.some((d) => d.id === prev) ? prev : rows?.[0]?.id ?? null
    );
  };

  useEffect(() => {
    let cancelled = false;
    const fetchRows = async () => {
      if (!supabaseActive) return [];
      if (effectiveScope === "proposal" && selectedProposalId) {
        return (await api.listProposalDatasets(selectedProposalId)) ?? [];
      }
      if (selectedProjectId) {
        return (await api.listProjectDatasets(selectedProjectId)) ?? [];
      }
      return [];
    };
    void fetchRows().then((rows) => {
      if (cancelled) return;
      setDatasets(rows);
      setSelectedDatasetId((prev) =>
        prev && rows.some((d) => d.id === prev) ? prev : rows[0]?.id ?? null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [supabaseActive, effectiveScope, selectedProjectId, selectedProposalId]);

  const contextLabel = useMemo(() => {
    if (effectiveScope === "proposal") return selectedProposal?.name ?? "Selected proposal";
    return selectedProject?.name ?? "Selected project";
  }, [effectiveScope, selectedProject?.name, selectedProposal?.name]);

  const upload = async () => {
    if (!file) return;
    if (!selectedProjectId && !selectedProposalId) {
      setStatus("Select or create a project first.");
      return;
    }
    setLoading(true);
    setStatus("Uploading and inspecting dataset...");
    const res = await api.uploadDataset({
      file,
      projectId: selectedProjectId,
      proposalId: effectiveScope === "proposal" ? selectedProposalId : null,
      datasetType,
    });
    setLoading(false);
    if (!res.data) {
      setStatus(res.status === 503 ? "Dataset upload disabled: Supabase is not configured." : res.error ?? "Upload failed.");
      return;
    }
    setFile(null);
    setStatus(`Uploaded ${res.data.name}`);
    pushToast("Dataset uploaded", "good");
    await load();
    setSelectedDatasetId(res.data.id);
  };

  const remove = async (datasetId: string) => {
    setLoading(true);
    const ok = await api.deleteDataset(datasetId);
    setLoading(false);
    if (!ok) {
      setStatus("Could not delete dataset");
      return;
    }
    setStatus("Dataset deleted");
    await load();
  };

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-xl border border-border/60 bg-secondary/20 p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Database className="h-3.5 w-3.5 text-primary" />
            Data upload MVP
          </div>
          <Badge variant={supabaseActive ? "default" : "secondary"} className="text-[10px]">
            {supabaseActive ? "Supabase" : "Disabled"}
          </Badge>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Store CSV, JSON, or GeoJSON metadata, previews, and summaries for planner context.
        </p>
        {!supabaseActive && (
          <p className="mt-2 rounded-lg border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
            Configure backend Supabase env vars to enable dataset upload.
          </p>
        )}
      </div>

      <section className={cn("space-y-2", !supabaseActive && "opacity-60")}>
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Context
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={effectiveScope === "project" ? "default" : "secondary"}
            disabled={!supabaseActive || !selectedProjectId}
            onClick={() => setScope("project")}
          >
            Project
          </Button>
          <Button
            type="button"
            size="sm"
            variant={effectiveScope === "proposal" ? "default" : "secondary"}
            disabled={!supabaseActive || !canUseProposal}
            onClick={() => setScope("proposal")}
          >
            Proposal
          </Button>
        </div>
        <p className="rounded-lg border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
          {selectedProjectId ? contextLabel : "Create or select a project in Saved first."}
        </p>
      </section>

      <section className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Upload
        </div>
        <select
          value={datasetType}
          onChange={(e) => setDatasetType(e.target.value as DatasetType | "auto")}
          disabled={!supabaseActive}
          className="w-full rounded-md border border-border bg-background/70 px-2 py-1 text-xs outline-none focus:border-primary"
        >
          <option value="auto">Auto-detect dataset type</option>
          {DATASET_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          type="file"
          accept=".csv,.json,.geojson,text/csv,application/json,application/geo+json"
          disabled={!supabaseActive}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-[11px] text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:text-foreground"
        />
        <Button
          size="sm"
          className="w-full"
          disabled={!supabaseActive || !file || loading || (!selectedProjectId && !selectedProposalId)}
          onClick={() => void upload()}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload dataset
        </Button>
        {status && (
          <p className="rounded-lg border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
            {status}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Datasets
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {datasets.length}
          </Badge>
        </div>
        <div className="max-h-36 space-y-1 overflow-y-auto">
          {datasets.length === 0 ? (
            <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] text-muted-foreground">
              No uploaded datasets for this context yet.
            </p>
          ) : (
            datasets.map((dataset) => (
              <button
                key={dataset.id}
                onClick={() => setSelectedDatasetId(dataset.id)}
                className={cn(
                  "w-full rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
                  selectedDataset?.id === dataset.id
                    ? "border-primary bg-primary/10"
                    : "border-border/70 bg-secondary/20 hover:border-primary/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{dataset.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {dataset.fileType?.toUpperCase() ?? "DATA"}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {dataset.datasetType.replace(/_/g, " ")} · {dataset.featureCount ?? dataset.rowCount ?? 0}{" "}
                  {dataset.featureCount != null ? "features" : "rows"}
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {selectedDataset && (
        <section className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
              <FileJson className="h-3.5 w-3.5 text-primary" />
              <span className="truncate">{selectedDataset.name}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              disabled={loading}
              onClick={() => void remove(selectedDataset.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {typeof selectedDataset.metadata.summary === "string"
              ? selectedDataset.metadata.summary
              : "Preview stored for planner/operator context."}
          </p>
          {Array.isArray(selectedDataset.metadata.geometryTypes) && (
            <p className="text-[10px] text-muted-foreground">
              Geometry: {selectedDataset.metadata.geometryTypes.join(", ")}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {selectedDataset.columns.slice(0, 10).map((column) => (
              <Badge key={column} variant="outline" className="px-1.5 py-0 text-[9px]">
                {column}
              </Badge>
            ))}
          </div>
          <div className="max-h-40 overflow-auto rounded-lg border border-border/60 bg-background/50 p-2">
            <pre className="whitespace-pre-wrap break-words text-[10px] leading-snug text-muted-foreground">
              {JSON.stringify(selectedDataset.preview.slice(0, 3), null, 2)}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}
