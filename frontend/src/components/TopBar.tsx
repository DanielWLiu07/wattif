import {
  Zap,
  Wifi,
  FlaskConical,
  Play,
  HelpCircle,
  Bot,
  MessageSquare,
  HardDrive,
} from "lucide-react";
import { useStore } from "@/store";
import type { HealthMeta } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function voicesLabel(live: boolean, health: HealthMeta | null): string {
  if (live && health?.realLlm) return "LLM voices";
  return "Template voices";
}

function voicesTooltip(live: boolean, health: HealthMeta | null): string {
  if (live && health?.realLlm) {
    return "REST voice posts can be LLM-enriched. Sim ticks still use templates.";
  }
  return "Resident quotes are template-based, not autonomous LLM agents.";
}

function persistenceLabel(live: boolean, health: HealthMeta | null): string {
  if (live && health?.persistenceProvider === "supabase") return "Supabase";
  return "In-memory";
}

function persistenceTooltip(live: boolean, health: HealthMeta | null): string {
  if (live && health?.persistenceProvider === "supabase") {
    return "Projects and proposals can persist in Supabase Postgres (backend writer only). Live sim state is still in-memory.";
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
  const demo = useStore((s) => s.demo);
  const backendHealth = useStore((s) => s.backendHealth);
  const runGuidedDemo = useStore((s) => s.runGuidedDemo);
  const stopDemo = useStore((s) => s.stopDemo);
  const voicesCount = useStore((s) => s.voices.length);
  const focusVoices = useStore((s) => s.selectVoiceFromMap);
  const openWelcome = () => useStore.setState({ showWelcome: true });

  const plannerText = plannerLabel(live, backendHealth);
  const voicesText = voicesLabel(live, backendHealth);
  const sessionText = persistenceLabel(live, backendHealth);
  const realLlmActive = live && !!backendHealth?.realLlm;
  const supabaseActive = live && backendHealth?.persistenceProvider === "supabase";

  return (
    <div className="pointer-events-auto flex items-center justify-between px-4 py-3">
      <div className="glass flex items-center gap-2.5 rounded-xl px-3.5 py-2 shadow-lg">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            WattIf
            <span className="hidden text-[10px] font-normal text-muted-foreground sm:inline">
              Toronto energy-equity simulator
            </span>
          </div>
        </div>
      </div>

      {voicesCount > 0 && (
        <button
          onClick={() => focusVoices("")}
          className="glass pointer-events-auto hidden items-center gap-1.5 rounded-xl px-3 py-2 text-xs shadow-lg transition-colors hover:text-foreground md:flex"
          title="Open the Voices log"
        >
          <span className="animate-pulse">💬</span>
          <b className="tabular-nums">{Math.min(voicesCount, 40)}</b> people talking
        </button>
      )}

      <div className="glass flex max-w-[min(100vw-2rem,42rem)] flex-wrap items-center justify-end gap-1.5 rounded-xl px-2.5 py-1.5 shadow-lg">
        <Button
          size="sm"
          variant={demo.running ? "secondary" : "default"}
          className="h-7"
          onClick={() => (demo.running ? stopDemo() : void runGuidedDemo())}
        >
          <Play className="h-3.5 w-3.5" />
          {demo.running ? "Stop demo" : "Guided demo"}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={openWelcome}
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>What is WattIf?</TooltipContent>
        </Tooltip>

        <span className="mx-0.5 hidden h-5 w-px bg-border sm:inline-block" />

        <Badge variant="secondary" className="hidden font-normal sm:inline-flex">
          {zones.length} zones
        </Badge>

        {!loaded ? (
          <Badge variant="secondary" className="gap-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
            Connecting…
          </Badge>
        ) : wsReconnecting ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="gap-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
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
              <Badge variant="default" className="gap-1">
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
            <TooltipContent>
              Backend offline — running on built-in data
            </TooltipContent>
          </Tooltip>
        )}

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
                {persistenceTooltip(live, backendHealth)}
              </TooltipContent>
            </Tooltip>

            {/* Compact honesty strip on md when individual badges hidden */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="font-normal lg:hidden"
                >
                  {realLlmActive ? "LLM" : "Demo"} · Template ·{" "}
                  {supabaseActive ? "Supabase" : "RAM"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {plannerTooltip(live, backendHealth)} {voicesTooltip(live, backendHealth)}{" "}
                {persistenceTooltip(live, backendHealth)}
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
