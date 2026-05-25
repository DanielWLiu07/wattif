import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "@/store";
import { MapView } from "@/components/MapView";
import { TopBar } from "@/components/TopBar";
import { LeftDock } from "@/components/LeftDock";
import { RightDock } from "@/components/RightDock";
import { Timeline } from "@/components/Timeline";
import { ScenarioBanner } from "@/components/ScenarioBanner";
import { Welcome } from "@/components/Welcome";
import { DemoCaption } from "@/components/DemoCaption";
import { ScenarioFlash } from "@/components/ScenarioFlash";
import { TooltipProvider } from "@/components/ui/tooltip";

function CollapseTab({
  side,
  open,
  onClick,
}: {
  side: "left" | "right";
  open: boolean;
  onClick: () => void;
}) {
  const Icon =
    (side === "left") === open ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      className="pointer-events-auto glass flex h-12 w-5 items-center justify-center rounded-md text-muted-foreground shadow-lg transition-colors hover:text-foreground"
      aria-label={`${open ? "Collapse" : "Expand"} ${side} panel`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function App() {
  const init = useStore((s) => s.init);
  const loaded = useStore((s) => s.loaded);
  const setMode = useStore((s) => s.setMode);
  const setScenarioTargeting = useStore((s) => s.setScenarioTargeting);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const toggleLeft = useStore((s) => s.toggleLeft);
  const toggleRight = useStore((s) => s.toggleRight);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode("select");
        setScenarioTargeting(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setMode, setScenarioTargeting]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative h-full w-full overflow-hidden bg-background">
        {/* Map is the hero */}
        <MapView />

        {/* Subtle vignette so UI panels stay legible over the map */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/25" />

        {/* HUD overlay grid */}
        <div className="pointer-events-none absolute inset-0 flex flex-col">
          <TopBar />
          <ScenarioBanner />
          <div className="flex flex-1 items-stretch justify-between overflow-hidden">
            {/* Left dock + collapse tab */}
            <div className="flex items-stretch">
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  leftOpen ? "w-[300px] opacity-100" : "w-0 opacity-0"
                }`}
              >
                <LeftDock />
              </div>
              <div className="flex items-center self-center pl-1">
                <CollapseTab side="left" open={leftOpen} onClick={toggleLeft} />
              </div>
            </div>

            {/* Right dock + collapse tab */}
            <div className="flex items-stretch">
              <div className="flex items-center self-center pr-1">
                <CollapseTab
                  side="right"
                  open={rightOpen}
                  onClick={toggleRight}
                />
              </div>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  rightOpen ? "w-[330px] opacity-100" : "w-0 opacity-0"
                }`}
              >
                <RightDock />
              </div>
            </div>
          </div>
          <div className="pb-4">
            <Timeline />
          </div>
        </div>

        <ScenarioFlash />
        <DemoCaption />
        <Welcome />

        {!loaded && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">
                Loading Toronto grid…
              </span>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default App;
