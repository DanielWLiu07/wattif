import {
  WifiHigh as Wifi,
  Flask as FlaskConical,
  Play,
  Question as HelpCircle,
  MapPin,
} from "@phosphor-icons/react";
import { useStore } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
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
      {/* LEFT — brand */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Logo size="sm" />
        <span className="hidden truncate border-l border-border pl-2.5 text-[11px] text-muted-foreground lg:inline">
          Toronto energy-equity simulator
        </span>
      </div>

      {/* CENTER — live status */}
      <div className="flex flex-1 items-center justify-center gap-2">
        {voicesCount > 0 && (
          <button
            onClick={() => focusVoices("")}
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
      <div className="flex flex-1 items-center justify-end gap-2">
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

        <span className="mx-0.5 h-5 w-px bg-border" />

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
      </div>
    </header>
  );
}
