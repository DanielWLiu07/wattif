import { Wrench, Zap, Map as MapIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BuildTab } from "@/components/BuildTab";
import { ScenarioControls } from "@/components/ScenarioControls";
import { LayersPanel } from "@/components/LayersPanel";
import { LegendContent } from "@/components/LegendContent";

export function LeftDock() {
  return (
    <div className="pointer-events-auto flex h-full w-[300px] flex-col p-3">
      <Card className="glass flex min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs defaultValue="build" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="m-2 grid grid-cols-3">
            <TabsTrigger value="build" className="gap-1 text-xs">
              <Wrench className="h-3.5 w-3.5" /> Build
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-1 text-xs">
              <Zap className="h-3.5 w-3.5" /> Events
            </TabsTrigger>
            <TabsTrigger value="map" className="gap-1 text-xs">
              <MapIcon className="h-3.5 w-3.5" /> Map
            </TabsTrigger>
          </TabsList>
          <TabsContent value="build" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <BuildTab />
          </TabsContent>
          <TabsContent value="events" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <ScenarioControls />
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
