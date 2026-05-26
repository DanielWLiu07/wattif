import { useCallback, useRef, useState } from "react";
import { FileUp, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DATASET_TYPES, type DatasetType, type UploadedDataset } from "@/types";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";

export function DatasetUploadPanel() {
  const live = useStore((s) => s.live);
  const persistenceProvider = useStore((s) => s.backendHealth?.persistenceProvider);
  const supabaseActive = live && persistenceProvider === "supabase";
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const selectedProposalId = useStore((s) => s.selectedProposalId);
  const datasets = useStore((s) => s.datasets);
  const selectedDatasetId = useStore((s) => s.selectedDatasetId);
  const datasetUploading = useStore((s) => s.datasetUploading);
  const datasetError = useStore((s) => s.datasetError);
  const uploadDataset = useStore((s) => s.uploadDataset);
  const loadDatasets = useStore((s) => s.loadDatasets);
  const selectDataset = useStore((s) => s.selectDataset);
  const deleteDataset = useStore((s) => s.deleteDataset);

  const fileRef = useRef<HTMLInputElement>(null);
  const [typeOverride, setTypeOverride] = useState<DatasetType | "">("");

  const selected = datasets.find((d) => d.id === selectedDatasetId);

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      await uploadDataset(file, typeOverride || undefined);
      if (fileRef.current) fileRef.current.value = "";
      setTypeOverride("");
    },
    [uploadDataset, typeOverride]
  );

  const canUpload = supabaseActive && (selectedProjectId || selectedProposalId);

  return (
    <section className={cn("space-y-2", !canUpload && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Datasets
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {datasets.length}
        </Badge>
      </div>

      <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] leading-snug text-muted-foreground">
        Upload CSV, JSON, or GeoJSON as project/proposal context. Uploaded data is
        stored with previews and summaries for the planner — it does{" "}
        <span className="text-foreground">not</span> rebuild the Toronto simulation yet.
      </p>

      {!supabaseActive && (
        <p className="text-[11px] text-muted-foreground">
          Supabase persistence required for dataset upload.
        </p>
      )}

      {datasetError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {datasetError}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <select
          value={typeOverride}
          onChange={(e) => setTypeOverride(e.target.value as DatasetType | "")}
          disabled={!canUpload || datasetUploading}
          className="min-w-0 flex-1 rounded-md border border-border bg-background/70 px-2 py-1 text-[11px] outline-none focus:border-primary"
          title="Optional type override"
        >
          <option value="">Auto-detect type</option>
          {DATASET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,.geojson,text/csv,application/json,application/geo+json"
          className="hidden"
          disabled={!canUpload || datasetUploading}
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        <Button
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={!canUpload || datasetUploading}
          onClick={() => fileRef.current?.click()}
        >
          {datasetUploading ? (
            "Uploading…"
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              Upload
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2"
          disabled={!canUpload || datasetUploading}
          onClick={() => void loadDatasets()}
        >
          <FileUp className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="max-h-28 space-y-1 overflow-y-auto">
        {datasets.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground">No datasets yet.</span> Upload
            Islington CSV/GeoJSON files here — they provide planner context and ground
            synthetic cohort concerns. They do not rebuild the simulation.
          </p>
        ) : (
          datasets.map((d) => (
            <DatasetRow
              key={d.id}
              dataset={d}
              selected={selectedDatasetId === d.id}
              onSelect={() => selectDataset(d.id)}
              onDelete={() => void deleteDataset(d.id)}
              disabled={!supabaseActive}
            />
          ))
        )}
      </div>

      {selected && <DatasetPreview dataset={selected} />}
    </section>
  );
}

function DatasetRow({
  dataset,
  selected,
  onSelect,
  onDelete,
  disabled,
}: {
  dataset: UploadedDataset;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const detected = dataset.metadata?.detectedType as string | undefined;
  const count =
    dataset.featureCount != null
      ? `${dataset.featureCount} features`
      : dataset.rowCount != null
      ? `${dataset.rowCount} rows`
      : null;

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors",
        selected
          ? "border-primary bg-primary/10"
          : "border-border/70 bg-secondary/20"
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate font-medium">{dataset.name}</div>
        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          <span className="capitalize">{dataset.datasetType.replace(/_/g, " ")}</span>
          {detected && detected !== dataset.datasetType && (
            <span>(detected: {detected.replace(/_/g, " ")})</span>
          )}
          {count && <span>· {count}</span>}
        </div>
      </button>
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
  );
}

function DatasetPreview({ dataset }: { dataset: UploadedDataset }) {
  const geomTypes = dataset.metadata?.geometryTypes as string[] | undefined;

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-2 text-[11px]">
      <div className="mb-1 font-medium">Preview</div>
      {dataset.columns.length > 0 && (
        <p className="mb-1 text-muted-foreground">
          Columns: {dataset.columns.slice(0, 12).join(", ")}
          {dataset.columns.length > 12 ? "…" : ""}
        </p>
      )}
      {geomTypes && geomTypes.length > 0 && (
        <p className="mb-1 text-muted-foreground">
          Geometry types: {geomTypes.join(", ")}
        </p>
      )}
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded border border-border/50 bg-secondary/30 p-1.5 text-[10px]">
        {JSON.stringify(dataset.preview.slice(0, 5), null, 2)}
      </pre>
    </div>
  );
}
