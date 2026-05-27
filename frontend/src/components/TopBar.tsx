import {
  WifiHigh as Wifi,
  Flask as FlaskConical,
  Play,
  Question as HelpCircle,
  MapPin,
  Robot as Bot,
  ChatCircle as MessageSquare,
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

function plannerLabel(live: boolean, health: HealthMeta | null): string {
  if (live && health?.realLlm) return "Real LLM planner";
  return "Demo planner";
}

function plannerTooltip(live: boolean, health: HealthMeta | null): string {
  if (live && health?.realLlm) {
    return `Planner uses ${health.realLlm} (Anthropic or Feather gateway).`;
  }
  if (live) {
    return "Backend reachable; planner runs the scripted demo unless LLM API keys are set.";
  }
  return "Offline mock planner — scripted events, no backend.";
}

function voicesLabel(): string {
  return "Template voices";
}

function voicesTooltip(live: boolean, health: HealthMeta | null): string {
  if (live && health?.realLlm) {
    return "Sim tick voices stay template-based. The planner/operator may use a real LLM separately.";
  }
  return "Resident quotes are template-based, not autonomous LLM agents.";
}

function persistenceLabel(
  live: boolean,
  health: HealthMeta | null,
  proposalName?: string
): string {
  if (live && health?.persistenceProvider === "supabase") {
    return proposalName ? `Saving to "${proposalName}"` : "Supabase · no proposal";
  }
  return "In-memory";
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
  const zones = useStore((s) => s.zones);
  const backendHealth = useStore((s) => s.backendHealth);
  const selectedProposalId = useStore((s) => s.selectedProposalId);
  const selectedProposalName = useStore(
    (s) => s.proposals.find((p) => p.id === s.selectedProposalId)?.name
  );
  const voicesCount = useStore((s) => s.voices.length);
  const focusVoices = useStore((s) => s.selectVoiceFromMap);
  const selectedRegion = useStore((s) => s.selectedRegion);
  const mainView = useStore((s) => s.mainView);
  const setMainView = useStore((s) => s.setMainView);
  const openWelcome = () => useStore.setState({ showWelcome: true });
  const openVoices = () => {
    useStore.setState({ rightOpen: true });
    focusVoices("");
  };

  const plannerText = plannerLabel(live, backendHealth);
  const voicesText = voicesLabel();
  const sessionText = persistenceLabel(live, backendHealth, selectedProposalName);
  const realLlmActive = live && !!backendHealth?.realLlm;
  const supabaseActive = live && backendHealth?.persistenceProvider === "supabase";
  const compactPersistenceText = supabaseActive
    ? selectedProposalId
      ? "Saving"
      : "Supabase"
    : "RAM";

  const connection = !loaded ? (
    <Badge variant="secondary" className="gap-1">
      <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
      Connecting…
    </Badge>
  ) : wsReconnecting ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="gap-1">
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
        <Badge variant="good" className="gap-1">
          <Wifi className="h-3 w-3" />
          {wsConnected ? "Live + WS" : "Live API"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Connected to the backend</TooltipContent>
    </Tooltip>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="accent" className="gap-1">
          <FlaskConical className="h-3 w-3" /> Mock data
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Backend offline — running on built-in data</TooltipContent>
    </Tooltip>
  );

  return (
    <header className="pointer-events-auto flex h-[52px] w-full shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
      {/* LEFT — brand (click → back to landing / scope select) */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          onClick={() => useStore.setState({ showRegionSelector: true })}
          className="-mx-1 flex items-center rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-muted"
          aria-label="Back to start"
          title="Back to start"
        >
          <Logo size="sm" />
        </button>
        <span className="hidden truncate border-l border-border pl-2.5 text-[11px] text-muted-foreground lg:inline">
          Toronto energy-equity simulator
        </span>

        {/* Navbar-level view switch */}
        <div className="ml-1.5 flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
          {([
            { v: "map", label: "Simulator" },
            { v: "events", label: "Events" },
          ] as const).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setMainView(v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
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

      {/* CENTER — live status */}
      <div className="flex flex-1 items-center justify-center gap-2">
        {voicesCount > 0 && (
          <button
            onClick={() => {
              // Make sure the Voices feed is actually visible: leave the Events
              // view, open the right dock, then focus the Voices tab.
              useStore.setState({ mainView: "map", rightOpen: true });
              focusVoices("");
            }}
            className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs transition-colors duration-150 hover:bg-secondary"
            title="Open the Voices log"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
            <b className="num">{Math.min(voicesCount, 40)}</b>
            <span className="text-muted-foreground">people talking</span>
          </button>
        )}
        {connection}
      </div>

      {/* RIGHT — controls */}
      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          variant={demo.running ? "secondary" : "default"}
          onClick={() => (demo.running ? stopDemo() : void runGuidedDemo())}
        >
          <Play weight="fill" />
          {demo.running ? "Stop demo" : "Guided demo"}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" onClick={openWelcome}>
              <HelpCircle />
            </Button>
          </TooltipTrigger>
          <TooltipContent>What is WattIf?</TooltipContent>
        </Tooltip>

        <span className="mx-0.5 hidden h-5 w-px bg-border sm:inline-block" />

        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 font-normal"
          onClick={() => useStore.setState({ showRegionSelector: true })}
          title="Change active simulation region"
        >
          <MapPin className="text-brand" />
          <span className="font-semibold">
            {selectedRegion === "All" ? "All Toronto" : selectedRegion}
          </span>
        </Button>

        <Badge variant="outline" className="hidden font-normal num sm:inline-flex">
          {zones.length} zones
        </Badge>
        {loaded && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="hidden gap-1 font-normal lg:inline-flex"
                >
                  <Bot className="h-3 w-3" />
                  {plannerText}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{plannerTooltip(live, backendHealth)}</TooltipContent>
            </Tooltip>

            {voicesCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="hidden h-7 gap-1 border-border/80 bg-secondary/55 text-xs font-normal hover:bg-secondary/80 lg:inline-flex"
                    onClick={openVoices}
                  >
                    <MessageSquare className="h-3 w-3" />
                    <b className="tabular-nums">
                      {Math.min(voicesCount, 40)}
                    </b>{" "}
                    people talking
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open the Voices log</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="hidden gap-1 font-normal lg:inline-flex"
                >
                  <MessageSquare className="h-3 w-3" />
                  {voicesText}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{voicesTooltip(live, backendHealth)}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="hidden gap-1 font-normal xl:inline-flex"
                >
                  <HardDrive className="h-3 w-3" />
                  {sessionText}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {persistenceTooltip(live, backendHealth, selectedProposalName)}
              </TooltipContent>
            </Tooltip>

            {/* Compact honesty strip on md when individual badges hidden */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="font-normal lg:hidden"
                >
                  {realLlmActive ? "Real LLM" : "Demo"} · Template ·{" "}
                  {compactPersistenceText}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {plannerTooltip(live, backendHealth)} {voicesTooltip(live, backendHealth)}{" "}
                {persistenceTooltip(live, backendHealth, selectedProposalName)}
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </header>
  );
}
