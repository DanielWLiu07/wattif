import { useStore } from "@/store";
import type { LayerKey } from "@/store";
import { Switch } from "@/components/ui/switch";

const GROUPS: { title: string; items: { key: LayerKey; label: string }[] }[] = [
  {
    title: "Overlays",
    items: [
      { key: "equity", label: "Energy-equity choropleth" },
      { key: "sentiment", label: "Sentiment + voices" },
      { key: "demand", label: "Demand heatmap" },
      { key: "agents", label: "People (live agents)" },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      { key: "infra", label: "Placed infrastructure" },
      { key: "existing", label: "Existing renewables / EV" },
      { key: "district", label: "District energy (Enwave)" },
      { key: "flows", label: "Energy flows" },
      { key: "recommendations", label: "AI recommendations" },
    ],
  },
  {
    title: "City data",
    items: [
      { key: "buildings", label: "3D buildings" },
      { key: "facilities", label: "Facilities (shelters / hospitals)" },
      { key: "constraints", label: "No-build constraints" },
      { key: "flood", label: "Flood-risk overlay" },
    ],
  },
];

export function LayersPanel() {
  const layers = useStore((s) => s.layers);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const extrude = useStore((s) => s.extrude);
  const toggleExtrude = useStore((s) => s.toggleExtrude);

  return (
    <div className="space-y-3 p-3">
      {/* View options */}
      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          View
        </div>
        <div className="space-y-1.5 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
          <label className="flex cursor-pointer items-center justify-between">
            <span className="text-xs">
              3D demand height
              <span className="ml-1 text-[10px] text-muted-foreground">
                extrude hexbins
              </span>
            </span>
            <Switch checked={extrude} onCheckedChange={toggleExtrude} />
          </label>
        </div>
      </div>

      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {g.title}
          </div>
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
            {g.items.map((it) => (
              <label
                key={it.key}
                className="flex cursor-pointer items-center justify-between"
              >
                <span className="text-xs">{it.label}</span>
                <Switch
                  checked={layers[it.key]}
                  onCheckedChange={() => toggleLayer(it.key)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
