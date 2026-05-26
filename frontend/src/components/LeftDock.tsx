import { Wrench, Zap, Map as MapIcon, Crosshair, FolderOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BuildTab } from "@/components/BuildTab";
import { ScenarioControls } from "@/components/ScenarioControls";
import { LayersPanel } from "@/components/LayersPanel";
import { LegendContent } from "@/components/LegendContent";
import { BuildPriority } from "@/components/BuildPriority";
import { ProjectsTab } from "@/components/ProjectsTab";

export function LeftDock() {
  return (
    <div className="pointer-events-auto flex h-full w-[300px] flex-col p-3">
      <Card className="glass flex min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs defaultValue="build" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="m-1.5 grid h-auto shrink-0 grid-cols-5 gap-0.5">
            <TabsTrigger value="build" className="flex-col gap-0.5 px-0.5 py-1 text-[10px]">
              <Wrench className="h-3.5 w-3.5" />
              <span className="leading-none">Build</span>
            </TabsTrigger>
            <TabsTrigger value="saved" className="flex-col gap-0.5 px-0.5 py-1 text-[10px]">
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="leading-none">Saved</span>
            </TabsTrigger>
            <TabsTrigger value="events" className="flex-col gap-0.5 px-0.5 py-1 text-[10px]">
              <Zap className="h-3.5 w-3.5" />
              <span className="leading-none">Events</span>
            </TabsTrigger>
            <TabsTrigger value="priority" className="flex-col gap-0.5 px-0.5 py-1 text-[10px]">
              <Crosshair className="h-3.5 w-3.5" />
              <span className="leading-none">Priority</span>
            </TabsTrigger>
            <TabsTrigger value="map" className="flex-col gap-0.5 px-0.5 py-1 text-[10px]">
              <MapIcon className="h-3.5 w-3.5" />
              <span className="leading-none">Map</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="build" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <BuildTab />
          </TabsContent>
          <TabsContent value="saved" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <ProjectsTab />
          </TabsContent>
          <TabsContent value="events" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <ScenarioControls />
          </TabsContent>
          <TabsContent value="priority" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <BuildPriority />
          </TabsContent>
          <TabsContent value="map" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <LayersPanel />
            <div className="border-t border-border/60">
              <div className="px-3 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Legend
              </div>
              <LegendContent />
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
