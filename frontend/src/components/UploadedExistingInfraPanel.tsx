import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/store";

function isActiveStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s.includes("active") ||
    s.includes("operational") ||
    s.includes("available") ||
    s.includes("online")
  );
}

function isUnavailableStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s.includes("unavailable") ||
    s.includes("offline") ||
    s.includes("out of service") ||
    s.includes("inactive") ||
    s.includes("broken")
  );
}

export function UploadedExistingInfraPanel() {
  const live = useStore((s) => s.live);
  const persistenceProvider = useStore((s) => s.backendHealth?.persistenceProvider);
  const selectedProjectId = useStore((s) => s.selectedProjectId);
  const assets = useStore((s) => s.existingInfrastructureAssets);
  const error = useStore((s) => s.existingInfrastructureError);

  const supabaseActive = live && persistenceProvider === "supabase";
  if (!selectedProjectId || !supabaseActive) return null;

  const evChargers = assets.filter((a) => a.assetKind === "ev_charger");
  const withStatus = assets.filter((a) => a.status);
  const activeCount = withStatus.filter((a) => isActiveStatus(a.status)).length;
  const unavailableCount = withStatus.filter((a) => isUnavailableStatus(a.status)).length;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3 w-3" />
          Uploaded existing infrastructure
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {assets.length}
        </Badge>
      </div>

      <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] leading-snug text-muted-foreground">
        Shown as uploaded context; not validated city infrastructure and not proposed
        infrastructure.
      </p>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {error}
        </p>
      )}

      {assets.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Upload an EV charger or grid infrastructure CSV/JSON/GeoJSON with latitude and
          longitude columns to extract map points here.
        </p>
      ) : (
        <div className="rounded-lg border border-border/60 bg-secondary/20 p-2 text-[11px] space-y-1">
          <div>
            <span className="text-muted-foreground">Extracted points:</span>{" "}
            <span className="font-medium">{assets.length}</span>
          </div>
          {evChargers.length > 0 && (
            <div>
              <span className="text-muted-foreground">EV chargers:</span>{" "}
              <span className="font-medium">{evChargers.length}</span>
            </div>
          )}
          {withStatus.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
              {activeCount > 0 && (
                <span>
                  Active: <span className="text-foreground">{activeCount}</span>
                </span>
              )}
              {unavailableCount > 0 && (
                <span>
                  Unavailable: <span className="text-foreground">{unavailableCount}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
