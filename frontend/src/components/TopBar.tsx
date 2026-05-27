import {
  WifiHigh as Wifi,
  Flask as FlaskConical,
  MapPin,
  Robot as Bot,
  HardDrives as HardDrive,
} from "@phosphor-icons/react";
import { useStore } from "@/store";
import type { HealthMeta } from "@/api/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function plannerTooltip(live: boolean, health: HealthMeta | null): string {
  if (live && health?.realLlm) {
    return `Planner uses ${health.realLlm} (Anthropic or Feather gateway).`;
  }
  if (live) {
    return "Backend reachable; planner runs the scripted demo unless LLM API keys are set.";
  }
  return "Offline mock planner — scripted events, no backend.";
}

function persistenceTooltip(
  live: boolean,
  health: HealthMeta | null,
  proposalName?: string
): string {
  if (live && health?.persistenceProvider === "supabase") {
    if (proposalName) {
      return `Placements and manual snapshots persist to "${proposalName}". Live sim ticks still run in-memory.`;
    }
    return "Supabase is connected. Select a proposal in the Saved tab to persist placements and snapshots.";
  }
  if (live) {
    return "No Supabase configured — sessions and sim state are in-memory only.";
  }
  return "Offline mock — no backend persistence.";
}

export function TopBar() {
  const live = useStore((s) => s.live);
  const wsConnected = useStore((s) => s.wsConnected);
  const wsReconnecting = useStore((s) => s.wsReconnecting);
  const loaded = useStore((s) => s.loaded);
  const backendHealth = useStore((s) => s.backendHealth);
  const selectedProposalName = useStore(
    (s) => s.proposals.find((p) => p.id === s.selectedProposalId)?.name
  );
  const selectedRegion = useStore((s) => s.selectedRegion);
  const mainView = useStore((s) => s.mainView);
  const setMainView = useStore((s) => s.setMainView);
  const supabaseActive = live && backendHealth?.persistenceProvider === "supabase";

  const connection = !loaded ? (
    <Badge variant="secondary" className="h-6 gap-1">
      <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
      Connecting…
    </Badge>
  ) : wsReconnecting ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="h-6 gap-1">
          <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
          Reconnecting…
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Lost the live stream — retrying. The app keeps running.
      </TooltipContent>
    </Tooltip>
  ) : live ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="good" className="h-6 gap-1">
          <Wifi className="h-3 w-3" />
          Live
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {wsConnected ? "Connected to the backend and websocket" : "Connected to the backend API"}
      </TooltipContent>
    </Tooltip>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="accent" className="h-6 gap-1">
          <FlaskConical className="h-3 w-3" /> Mock data
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Backend offline — running on built-in data</TooltipContent>
    </Tooltip>
  );

  return (
    <header className="pointer-events-none flex h-[46px] w-full shrink-0 items-start justify-between gap-3 px-4 pt-3">
      {/* LEFT — brand (click → back to landing / scope select) */}
      <div className="pointer-events-auto flex min-w-0 flex-none items-center gap-2.5 rounded-full border border-border bg-card/90 px-2.5 py-1 shadow-sm backdrop-blur">
        <button
          onClick={() => useStore.setState({ showRegionSelector: true })}
          className="-mx-1 flex items-center rounded-full px-1 py-0.5 transition-colors duration-150 hover:bg-muted"
          aria-label="Back to start"
          title="Back to start"
        >
          <Logo size="sm" />
        </button>
        <span className="hidden truncate border-l border-border pl-2.5 text-[11px] text-muted-foreground lg:inline">
          Toronto energy-equity simulator
        </span>

        {/* Navbar-level view switch */}
        <div className="ml-1.5 flex items-center gap-0.5 rounded-full border border-border bg-muted/50 p-0.5">
          {([
            { v: "map", label: "Simulator" },
            { v: "events", label: "Events" },
          ] as const).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setMainView(v)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-150",
                mainView === v
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT — controls */}
      <div className="pointer-events-auto ml-auto flex items-center justify-end">
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-1.5 py-1 shadow-sm backdrop-blur">
          <Button
            size="sm"
            variant="outline"
            className="h-6 rounded-full border-border/80 bg-card px-2.5 text-xs font-normal"
            onClick={() => useStore.setState({ showRegionSelector: true })}
            title="Change active simulation region"
          >
            <MapPin className="text-brand" />
            <span className="font-semibold">
              {selectedRegion === "All" ? "All Toronto" : selectedRegion}
            </span>
          </Button>

          {connection}

          {loaded && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="h-6 gap-1 border-border/80 bg-card px-2.5 font-normal"
                  >
                    <Bot className="h-3 w-3" />
                    LLM
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{plannerTooltip(live, backendHealth)}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="h-6 gap-1 border-border/80 bg-card px-2.5 font-normal"
                  >
                    <HardDrive className="h-3 w-3" />
                    {supabaseActive ? "Supabase" : "In-memory"}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {persistenceTooltip(live, backendHealth, selectedProposalName)}
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
