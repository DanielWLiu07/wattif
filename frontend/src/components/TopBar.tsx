import { Zap, Wifi, FlaskConical, Play, HelpCircle } from "lucide-react";
import { useStore } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function TopBar() {
  const live = useStore((s) => s.live);
  const wsConnected = useStore((s) => s.wsConnected);
  const wsReconnecting = useStore((s) => s.wsReconnecting);
  const loaded = useStore((s) => s.loaded);
  const zones = useStore((s) => s.zones);
  const demo = useStore((s) => s.demo);
  const runGuidedDemo = useStore((s) => s.runGuidedDemo);
  const stopDemo = useStore((s) => s.stopDemo);
  const voicesCount = useStore((s) => s.voices.length);
  const focusVoices = useStore((s) => s.selectVoiceFromMap);
  const selectedRegion = useStore((s) => s.selectedRegion);
  const openWelcome = () => useStore.setState({ showWelcome: true });

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

      <div className="glass flex items-center gap-2 rounded-xl px-2.5 py-1.5 shadow-lg">
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

        <span className="mx-0.5 h-5 w-px bg-border" />

        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1 font-normal text-xs border border-border/80 bg-secondary/55 hover:bg-secondary/80 transition-all active:scale-95"
          onClick={() => useStore.setState({ showRegionSelector: true })}
          title="Change active simulation region"
        >
          <span>📍</span>
          <span className="font-semibold text-primary">{selectedRegion === "All" ? "All Toronto" : selectedRegion}</span>
        </Button>

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
      </div>
    </div>
  );
}
