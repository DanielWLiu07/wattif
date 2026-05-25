import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  useControl as useMaplibreControl,
} from "react-map-gl/maplibre";
import type { MapRef as MaplibreRef } from "react-map-gl/maplibre";
import {
  Map as MapboxMap,
  useControl as useMapboxControl,
} from "react-map-gl/mapbox";
import type { MapRef as MapboxMapRef } from "react-map-gl/mapbox";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapboxOverlayProps } from "@deck.gl/mapbox";
import { Tile3DLayer } from "@deck.gl/geo-layers";
import { Tiles3DLoader } from "@loaders.gl/3d-tiles";
import {
  LightingEffect,
  AmbientLight,
  DirectionalLight,
} from "@deck.gl/core";
import type { Layer, PickingInfo } from "@deck.gl/core";
import maplibregl from "maplibre-gl";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Compass } from "lucide-react";
import { useStore } from "@/store";
import { buildLayers } from "@/map/layers";
import type { Infra, LngLat } from "@/types";

const INITIAL_VIEW_STATE = {
  longitude: -79.38,
  latitude: 43.65,
  zoom: 12.4,
  pitch: 52,
  bearing: -18,
};

const MAPLIBRE_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const MAPBOX_STYLE = "mapbox://styles/mapbox/standard";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const USE_MAPBOX = !!MAPBOX_TOKEN;

// Scene lighting so the glTF infra models read with depth / PBR shading.
const LIGHTING = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.5 }),
  sun: new DirectionalLight({
    color: [255, 245, 225],
    intensity: 2.0,
    direction: [-0.6, -0.9, -1.2],
  }),
  fill: new DirectionalLight({
    color: [180, 200, 255],
    intensity: 1.0,
    direction: [0.8, 0.5, -0.4],
  }),
});
const EFFECTS = [LIGHTING];

type Hover = { x: number; y: number; html: string } | null;

// Tiny unicode sparkline from a per-zone approval trend (0..1).
const SPARK = "▁▂▃▄▅▆▇█";
function sparkline(series: number[] | undefined): string {
  if (!series || series.length < 2) return "";
  const tail = series.slice(-16);
  return tail
    .map((v) => SPARK[Math.max(0, Math.min(7, Math.round(v * 7)))])
    .join("");
}

// Two overlay wrappers — useControl is provider-specific (maplibre vs mapbox).
function MaplibreOverlay(props: MapboxOverlayProps) {
  const overlay = useMaplibreControl(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}
function MapboxDeckOverlay(props: MapboxOverlayProps) {
  const overlay = useMapboxControl(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

export function MapView() {
  const zones = useStore((s) => s.zones);
  const agents = useStore((s) => s.agents);
  const infra = useStore((s) => s.infra);
  const recommendations = useStore((s) => s.recommendations);
  const layerToggles = useStore((s) => s.layers);
  const mode = useStore((s) => s.mode);
  const placeKind = useStore((s) => s.placeKind);
  const selectedZoneId = useStore((s) => s.selectedZoneId);
  const selectedInfraId = useStore((s) => s.selectedInfraId);
  const sentiment = useStore((s) => s.sentiment);
  const flows = useStore((s) => s.flows);
  const outageZones = useStore((s) => s.outageZones);
  const adoptionByZone = useStore((s) => s.adoptionByZone);
  const voices = useStore((s) => s.voices);
  const facilities = useStore((s) => s.facilities);
  const existingInfra = useStore((s) => s.existingInfra);
  const constraints = useStore((s) => s.constraints);
  const scenarioTargeting = useStore((s) => s.scenarioTargeting);
  const setTargetZone = useStore((s) => s.setTargetZone);
  const fireScenarioAtZone = useStore((s) => s.fireScenarioAtZone);
  const gatheringZones = useStore((s) => s.gatheringZones);
  const targetZoneId = useStore((s) => s.targetZoneId);
  const flashZones = useStore((s) => s.flashZones);
  const approvalDeltas = useStore((s) => s.approvalDeltas);
  const approvalHistory = useStore((s) => s.approvalHistory);
  const extrude = useStore((s) => s.extrude);
  const environment = useStore((s) => s.environment);
  const flyTo = useStore((s) => s.flyTo);
  const addInfraAt = useStore((s) => s.addInfraAt);
  const selectInfra = useStore((s) => s.selectInfra);
  const selectZone = useStore((s) => s.selectZone);

  const [hover, setHover] = useState<Hover>(null);
  const mapRef = useRef<MaplibreRef | MapboxMapRef | null>(null);

  // ---- animation clock (drives flows / turbine spin / battery pulse) ----
  const [time, setTime] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let last = 0;
    const loop = () => {
      const now = performance.now() - start;
      if (now - last >= 33) {
        // ~30fps — enough for smooth flows/spin without 60fps React churn
        last = now;
        setTime(now);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- fly-to (inspector click) ----
  useEffect(() => {
    if (!flyTo) return;
    const map = mapRef.current?.getMap();
    map?.flyTo({
      center: flyTo.target,
      zoom: flyTo.zoom ?? 15,
      ...(flyTo.pitch != null ? { pitch: flyTo.pitch } : {}),
      ...(flyTo.bearing != null ? { bearing: flyTo.bearing } : {}),
      duration: 1500,
      curve: 1.4,
      essential: true,
    });
  }, [flyTo]);

  const onInfraClick = useCallback(
    (i: Infra) => {
      selectInfra(i.id);
    },
    [selectInfra]
  );

  const layers = useMemo<Layer[]>(() => {
    const base = buildLayers({
      zones,
      agents,
      infra,
      recommendations,
      layers: layerToggles,
      selectedZoneId,
      selectedInfraId,
      sentiment,
      flows,
      outageZones,
      adoptionByZone,
      voices,
      facilities,
      existingInfra,
      constraints,
      scenarioTargeting,
      gatheringZones,
      targetZoneId,
      flashZones,
      approvalDeltas,
      extrude,
      time,
      onInfraClick,
    });
    if (GOOGLE_KEY && layerToggles.buildings) {
      base.unshift(
        new Tile3DLayer({
          id: "google-3d-tiles",
          data: `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_KEY}`,
          loader: Tiles3DLoader,
          loadOptions: { fetch: { headers: { "X-GOOG-API-KEY": GOOGLE_KEY } } },
          operation: "terrain+draw",
        })
      );
    }
    return base;
  }, [
    zones,
    agents,
    infra,
    recommendations,
    layerToggles,
    selectedZoneId,
    selectedInfraId,
    sentiment,
    flows,
    outageZones,
    adoptionByZone,
    voices,
    facilities,
    existingInfra,
    constraints,
    scenarioTargeting,
    gatheringZones,
    targetZoneId,
    flashZones,
    approvalDeltas,
    extrude,
    time,
    onInfraClick,
  ]);

  const handleClick = useCallback(
    (info: PickingInfo) => {
      const obj: any = info.object;
      // Scenario targeting (point-and-click): click a zone to FIRE there immediately.
      if (scenarioTargeting) {
        const zoneId = obj?.properties?.id;
        if (zoneId) fireScenarioAtZone(zoneId);
        return;
      }
      // Manual placement: click anywhere to drop the selected infra kind.
      if (mode === "place" && info.coordinate) {
        const [lng, lat] = info.coordinate as [number, number];
        addInfraAt([lng, lat] as LngLat);
        return;
      }
      if (obj?.kind && obj?.capacityKw) selectInfra(obj.id);
      else if (obj?.properties?.id) selectZone(obj.properties.id);
      else if (!obj) {
        selectZone(null);
        selectInfra(null);
      }
    },
    [mode, scenarioTargeting, fireScenarioAtZone, addInfraAt, selectZone, selectInfra]
  );

  const handleHover = useCallback((info: PickingInfo) => {
    const o: any = info.object;
    // While targeting, preview the hovered zone (glow) so you SEE before you click.
    if (scenarioTargeting) {
      const id = o?.properties?.id ?? null;
      if (id !== useStore.getState().targetZoneId) setTargetZone(id);
    }
    if (!o || info.x == null) {
      setHover(null);
      return;
    }
    let html = "";
    if (o.kind && o.capacityKw) {
      html = `<b>${o.kind.toUpperCase()}</b> · ${o.capacityKw} kW<br/>${o.status}${
        o.placedBy ? ` · placed by ${o.placedBy}` : ""
      }`;
    } else if (o.name && o.position && o.kind && !o.capacityKw && !o.rationale) {
      // facility or existing-infra marker
      html = `<b>${o.name}</b><br/>${String(o.kind).replace(/_/g, " ")}`;
    } else if (o.kind && o.rationale) {
      html = `<b>Recommend ${o.kind}</b><br/>${o.rationale}`;
    } else if (o.properties?.name) {
      const ap = o.properties.approval;
      const env = o.properties.id ? environment[o.properties.id] : undefined;
      html = `<b>${o.properties.name}</b>${
        o.properties.burden != null
          ? `<br/>Energy burden: ${(o.properties.burden * 100).toFixed(0)}%`
          : ""
      }${
        ap != null
          ? `<br/>Approval: ${((ap as number) * 100).toFixed(0)}% <span style="color:#7dd3fc;letter-spacing:1px">${sparkline(
              approvalHistory[o.properties.id]
            )}</span>`
          : ""
      }${
        env?.greenScore != null
          ? `<br/>Green score: ${(env.greenScore * 100).toFixed(0)}%`
          : ""
      }${
        env?.pollutionBurden != null
          ? `<br/>Pollution burden: ${(env.pollutionBurden * 100).toFixed(0)}%`
          : ""
      }`;
    }
    if (html) setHover({ x: info.x, y: info.y, html });
    else setHover(null);
  }, [environment, approvalHistory, scenarioTargeting, setTargetZone]);

  const addBuildingExtrusions = useCallback(() => {
    if (USE_MAPBOX) return; // Mapbox Standard already has 3D buildings
    const map = mapRef.current?.getMap() as any;
    if (!map) return;
    try {
      if (map.getLayer("3d-buildings")) return;
      const layersArr = map.getStyle().layers ?? [];
      const labelLayer = layersArr.find(
        (l: any) => l.type === "symbol" && l.layout?.["text-field"]
      );
      map.addLayer(
        {
          id: "3d-buildings",
          source: "carto",
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 11,
          paint: {
            "fill-extrusion-color": "#1b2a4a",
            "fill-extrusion-height": [
              "case",
              ["has", "render_height"],
              ["get", "render_height"],
              12,
            ],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.85,
          },
        },
        labelLayer?.id
      );
    } catch {
      /* style lacks building layer — baseline still works */
    }
  }, []);

  const resetView = useStore((s) => s.resetView);
  const cursor = mode === "place" || scenarioTargeting ? "crosshair" : undefined;
  const commonMapProps = {
    initialViewState: INITIAL_VIEW_STATE,
    onLoad: addBuildingExtrusions,
    attributionControl: false as const,
    maxPitch: 75,
    cursor,
    dragRotate: true as const,
    pitchWithRotate: true as const,
    touchZoomRotate: true as const,
    style: { width: "100%", height: "100%" },
  };

  return (
    <div className="absolute inset-0">
      {USE_MAPBOX ? (
        <MapboxMap
          ref={mapRef as any}
          mapLib={mapboxgl as any}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MAPBOX_STYLE}
          {...commonMapProps}
        >
          <MapboxDeckOverlay
            interleaved
            layers={layers}
            effects={EFFECTS}
            onClick={handleClick}
            onHover={handleHover}
            pickingRadius={6}
          />
        </MapboxMap>
      ) : (
        <MapLibreMap
          ref={mapRef as any}
          mapLib={maplibregl as any}
          mapStyle={MAPLIBRE_STYLE}
          {...commonMapProps}
        >
          <MaplibreOverlay
            interleaved
            layers={layers}
            effects={EFFECTS}
            onClick={handleClick}
            onHover={handleHover}
            pickingRadius={6}
          />
        </MapLibreMap>
      )}

      {hover && (
        <div
          className="pointer-events-none fixed z-50 max-w-[300px] whitespace-normal break-words rounded-md border border-border bg-popover/95 px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-xl"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
          dangerouslySetInnerHTML={{ __html: hover.html }}
        />
      )}

      {mode === "place" && !scenarioTargeting && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full border border-primary/40 bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur">
          Click the map to place a <b className="uppercase">{placeKind}</b> ·
          press Esc to exit
        </div>
      )}
      {/* Camera reset + free-roam hint */}
      <div className="pointer-events-auto absolute bottom-4 right-4 z-30 flex flex-col items-end gap-1.5">
        <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
          drag to pan · right-drag to orbit/tilt · scroll to zoom
        </span>
        <button
          onClick={() => resetView()}
          className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg transition-colors hover:text-primary"
        >
          <Compass className="h-3.5 w-3.5" /> Reset view
        </button>
      </div>

      {scenarioTargeting && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full border border-yellow-400/50 bg-yellow-400/15 px-4 py-1.5 text-xs font-medium text-yellow-200 backdrop-blur">
          {targetZoneId ? (
            <>
              🎯 Targeting{" "}
              <b>
                {zones.find((z) => z.id === targetZoneId)?.name ?? "zone"}
              </b>{" "}
              — press <b>Fire</b> in the Events panel · Esc to cancel
            </>
          ) : (
            <>🎯 Click a neighbourhood to target the scenario · Esc to cancel</>
          )}
        </div>
      )}
    </div>
  );
}
