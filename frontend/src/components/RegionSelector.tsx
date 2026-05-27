import { MapPin, Zap, Monitor, Cpu, Sparkles } from "lucide-react";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";

export function RegionSelector() {
  const showRegionSelector = useStore((s) => s.showRegionSelector);
  const setSelectedRegion = useStore((s) => s.setSelectedRegion);
  const setRegionCursorMode = useStore((s) => s.setRegionCursorMode);
  const selectedRegion = useStore((s) => s.selectedRegion);

  if (!showRegionSelector) return null;

  const handleSelectMapCursor = () => {
    useStore.setState({ showRegionSelector: false });
    setRegionCursorMode(true);
  };

  const handleSelectRegion = (region: string) => {
    setSelectedRegion(region);
    useStore.setState({ showRegionSelector: false });
  };

  // Coarse stats to make cards look extremely rich and built-in
  const REGION_CARDS = [
    {
      name: "All Toronto",
      desc: "Simulate the entire city map. Recommended for high-end PCs.",
      stats: "44 Zones · ~4,000 Agents",
      load: "Heavy Load",
      color: "text-red-400 border-red-500/20 bg-red-950/10 hover:bg-red-950/20",
      badgeColor: "bg-red-500/20 text-red-300 border-red-500/30",
      icon: <Monitor className="h-5 w-5" />,
    },
    {
      name: "Downtown",
      desc: "Central commercial core, high-density residential and business hubs.",
      stats: "12 Zones · ~1,200 Agents",
      load: "Medium Load",
      color: "text-violet-400 border-violet-500/20 bg-violet-950/10 hover:bg-violet-950/20",
      badgeColor: "bg-violet-500/20 text-violet-300 border-violet-500/30",
      icon: <Cpu className="h-5 w-5" />,
    },
    {
      name: "Midtown",
      desc: "Upscale residential neighborhoods and mixed-use corridors.",
      stats: "5 Zones · ~500 Agents",
      load: "Light Load",
      color: "text-blue-400 border-blue-500/20 bg-blue-950/10 hover:bg-blue-950/20",
      badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      icon: <Zap className="h-5 w-5" />,
    },
    {
      name: "North York",
      desc: "Rapidly growing suburbs, transit hubs, and commercial centers.",
      stats: "4 Zones · ~450 Agents",
      load: "Light Load",
      color: "text-amber-400 border-amber-500/20 bg-amber-950/10 hover:bg-amber-950/20",
      badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      icon: <Sparkles className="h-5 w-5" />,
    },
    {
      name: "Scarborough",
      desc: "Sprawling suburbs with high solar potential and rooftop space.",
      stats: "3 Zones · ~350 Agents",
      load: "Very Light",
      color: "text-emerald-400 border-emerald-500/20 bg-emerald-950/10 hover:bg-emerald-950/20",
      badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      icon: <MapPin className="h-5 w-5" />,
    },
    {
      name: "Etobicoke",
      desc: "Industrial-residential corridors with high wind power potential.",
      stats: "3 Zones · ~350 Agents",
      load: "Very Light",
      color: "text-cyan-400 border-cyan-500/20 bg-cyan-950/10 hover:bg-cyan-950/20",
      badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
      icon: <MapPin className="h-5 w-5" />,
    },
    {
      name: "East Toronto",
      desc: "High-equity burden communities, green spaces, and beaches.",
      stats: "4 Zones · ~400 Agents",
      load: "Very Light",
      color: "text-rose-400 border-rose-500/20 bg-rose-950/10 hover:bg-rose-950/20",
      badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
      icon: <MapPin className="h-5 w-5" />,
    },
    {
      name: "West Toronto",
      desc: "Artistic, creative hubs and transit-oriented corridors.",
      stats: "5 Zones · ~500 Agents",
      load: "Light Load",
      color: "text-indigo-400 border-indigo-500/20 bg-indigo-950/10 hover:bg-indigo-950/20",
      badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
      icon: <MapPin className="h-5 w-5" />,
    },
  ];

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-background/85 backdrop-blur-md overflow-y-auto py-8">
      <div className="glass animate-in fade-in zoom-in-95 mx-4 my-auto w-full max-w-3xl rounded-2xl p-8 shadow-2xl duration-300 border border-border/80 flex flex-col gap-6 max-h-[90vh]">
        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between border-b border-border/40 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📍</span>
              <h1 className="text-xl font-bold tracking-tight">Select Simulation Scope</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              WattIf simulates deep network, agent opinion, and energy flows. 
              Restricting the simulation scope to a specific borough drops zone count and agent arrays by up to <span className="font-semibold text-primary">90%</span>, eliminating all frame lag.
            </p>
          </div>
          
          <Button 
            className="mt-3 md:mt-0 gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20 animate-pulse shrink-0 self-start md:self-center"
            onClick={handleSelectMapCursor}
          >
            <MapPin className="h-4 w-4" />
            Select on Map Cursor
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {REGION_CARDS.map((card) => {
              const isActive = selectedRegion === card.name;
              return (
                <button
                  key={card.name}
                  onClick={() => handleSelectRegion(card.name)}
                  className={`group flex items-start gap-4 rounded-xl border p-4 text-left transition-all duration-300 ${card.color} ${
                    isActive ? "ring-2 ring-primary border-transparent" : "border-border/60"
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/80 text-foreground group-hover:scale-110 transition-transform">
                    {card.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold text-sm group-hover:text-foreground transition-colors">
                        {card.name}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium leading-none ${card.badgeColor}`}>
                        {card.load}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-1 line-clamp-2">
                      {card.desc}
                    </p>
                    <div className="text-[10px] font-medium text-foreground/80 mt-2 flex items-center gap-1.5">
                      <span>📊</span>
                      <span>{card.stats}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedRegion !== "All" && selectedRegion !== "All Toronto" && (
          <div className="flex justify-end border-t border-border/40 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => useStore.setState({ showRegionSelector: false })}
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
