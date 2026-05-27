import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
import { Compass } from "@phosphor-icons/react";
import { useStore, getZoneRegion } from "@/store";
import { buildLayers, uploadedAssetsToMapPoints } from "@/map/layers";
import { RecommendationImpact } from "@/components/RecommendationImpact";
import type { Infra, LngLat, Recommendation } from "@/types";

// Framed on the Toronto neighbourhoods (centre nudged north so Lake Ontario
// sits at the bottom edge), moderate pitch, zoom where the 44 zones fill the frame.
const INITIAL_VIEW_STATE = {
  longitude: -79.385,
  latitude: 43.715,
  zoom: 11.2,
  pitch: 40,
  bearing: -10,
};

const MAPLIBRE_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
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
  const allZones = useStore((s) => s.allZones);
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
  const rooftopPoints = useStore((s) => s.rooftopPoints);
  const voices = useStore((s) => s.voices);
  const facilities = useStore((s) => s.facilities);
  const existingInfra = useStore((s) => s.existingInfra);
  const existingInfrastructureAssets = useStore((s) => s.existingInfrastructureAssets);
  const constraints = useStore((s) => s.constraints);
  const scenarioTargeting = useStore((s) => s.scenarioTargeting);
  const setTargetZone = useStore((s) => s.setTargetZone);
  const fireScenarioAtZone = useStore((s) => s.fireScenarioAtZone);
  const gatheringZones = useStore((s) => s.gatheringZones);
  const targetZoneId = useStore((s) => s.targetZoneId);
  const flashZones = useStore((s) => s.flashZones);
  const approvalDeltas = useStore((s) => s.approvalDeltas);
  const approvalHistory = useStore((s) => s.approvalHistory);
  const spawnTimes = useStore((s) => s.spawnTimes);
  const removalTimes = useStore((s) => s.removalTimes);
  const sampledAgents = useStore((s) => s.sampledAgents);
  const agentTargets = useStore((s) => s.agentTargets);
  const agentMobilizedAt = useStore((s) => s.agentMobilizedAt);
  const selectedVoiceId = useStore((s) => s.selectedVoiceId);
  const selectVoiceFromMap = useStore((s) => s.selectVoiceFromMap);
  const extrude = useStore((s) => s.extrude);
  const environment = useStore((s) => s.environment);
  const floodRisk = useStore((s) => s.floodRisk);
  const heatVuln = useStore((s) => s.heatVuln);
  const districtEnergy = useStore((s) => s.districtEnergy);
  const sitingPriority = useStore((s) => s.sitingPriority);
  const flyTo = useStore((s) => s.flyTo);
  const addInfraAt = useStore((s) => s.addInfraAt);
  const selectInfra = useStore((s) => s.selectInfra);
  const selectZone = useStore((s) => s.selectZone);
  const regionCursorMode = useStore((s) => s.regionCursorMode);
  const hoveredRegion = useStore((s) => s.hoveredRegion);
  const setHoveredRegion = useStore((s) => s.setHoveredRegion);
  const setSelectedRegion = useStore((s) => s.setSelectedRegion);
  const setRegionCursorMode = useStore((s) => s.setRegionCursorMode);

  const [hover, setHover] = useState<Hover>(null);
  const [districtHoverHtml, setDistrictHoverHtml] = useState<string | null>(null);
  const [districtPopup, setDistrictPopup] = useState<Hover>(null);
  const [placementHoverCoordinate, setPlacementHoverCoordinate] = useState<[number, number] | null>(null);
  const [recCard, setRecCard] = useState<{
    rec: Recommendation;
    x: number;
    y: number;
    pinned: boolean;
  } | null>(null);
  const mapRef = useRef<MaplibreRef | MapboxMapRef | null>(null);
  const rightClickDragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // ---- animation clock (drives flows / turbine spin / battery pulse) ----
  const [time, setTime] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let last = 0;
    const loop = () => {
      const now = performance.now() - start;
      if (now - last >= 60) {
        // ~16fps — enough for smooth flows/spin, drastically cuts React render churn
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

  const uploadedExistingInfra = useMemo(
    () => uploadedAssetsToMapPoints(existingInfrastructureAssets),
    [existingInfrastructureAssets]
  );

  const layers = useMemo<Layer[]>(() => {
    const base = buildLayers({
      zones,
      allZones,
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
      rooftopPoints,
      voices,
      facilities,
      existingInfra,
      uploadedExistingInfra,
      constraints,
      floodRisk,
      districtEnergy,
      sitingPriority,
      scenarioTargeting,
      gatheringZones,
      targetZoneId,
      flashZones,
      approvalDeltas,
      spawnTimes,
      removalTimes,
      sampledAgents,
      agentTargets,
      agentMobilizedAt,
      extrude,
      selectedVoiceId,
      time,
      onInfraClick,
      onVoiceClick: selectVoiceFromMap,
      regionCursorMode,
      hoveredRegion,
      placementHoverCoordinate,
      placementHoverKind: mode === "place" ? placeKind : null,
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
    rooftopPoints,
    voices,
    facilities,
    existingInfra,
    uploadedExistingInfra,
    constraints,
    floodRisk,
    districtEnergy,
    sitingPriority,
    scenarioTargeting,
    gatheringZones,
    targetZoneId,
    flashZones,
    approvalDeltas,
    spawnTimes,
    removalTimes,
    sampledAgents,
    agentTargets,
    agentMobilizedAt,
    extrude,
    selectedVoiceId,
    time,
    onInfraClick,
    selectVoiceFromMap,
    regionCursorMode,
    hoveredRegion,
    allZones,
    placementHoverCoordinate,
    mode,
    placeKind,
  ]);

  const buildDistrictPopupHtml = useCallback(
    (
      zone: {
        id?: string;
        name?: string;
        burden?: number;
        approval?: number;
      } | null | undefined
    ) => {
      if (!zone?.name) return null;

      const zoneId = zone.id;
      const ap = zone.approval ?? (zoneId ? sentiment?.perZone[zoneId] : undefined);
      const env = zoneId ? environment[zoneId] : undefined;
      const heat = zoneId ? heatVuln[zoneId] : undefined;
      const flood = zoneId ? floodRisk[zoneId] : undefined;
      const district = zoneId ? districtEnergy[zoneId] : undefined;
      const sp = zoneId ? sitingPriority.find((s) => s.zoneId === zoneId) : undefined;

      return `<b>${zone.name}</b>${
        zone.burden != null
          ? `<br/>Energy burden: ${(zone.burden * 100).toFixed(0)}%`
          : ""
      }${
        ap != null
          ? `<br/>Approval: ${((ap as number) * 100).toFixed(0)}% <span style="color:#7dd3fc;letter-spacing:1px">${sparkline(
              zoneId ? approvalHistory[zoneId] : undefined
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
      }${
        heat != null
          ? `<br/>Heat vulnerability: ${(heat * 100).toFixed(0)}%`
          : ""
      }${
        flood != null
          ? `<br/>Flood risk: ${(flood * 100).toFixed(0)}%`
          : ""
      }${
        district && district.servedFraction > 0.05
          ? `<br/><span style="color:#2dd4bf">District energy: ${(district.servedFraction * 100).toFixed(0)}% · ${district.systemName}</span>`
          : ""
      }${
        sp
          ? `<br/><span style="color:#e879f9">Build priority: ${(sp.score * 100).toFixed(0)}/100</span>`
          : ""
      }`;
    },
    [
      approvalHistory,
      districtEnergy,
      environment,
      floodRisk,
      heatVuln,
      sentiment,
      sitingPriority,
    ]
  );

  const handleClick = useCallback(
    (info: PickingInfo) => {
      const obj: any = info.object;
      setDistrictPopup(null);
      
      // Interactive region selection cursor: click a zone to simulate just its region.
      if (regionCursorMode) {
        const zoneName = obj?.properties?.name;
        if (zoneName) {
          const zoneObj = allZones.find(z => z.id === obj?.properties?.id || z.name === zoneName);
          const region = getZoneRegion(zoneName, zoneObj?.centroid);
          setSelectedRegion(region);
          setRegionCursorMode(false);
          setHoveredRegion(null);
        }
        return;
      }

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
      // recommendation marker → pin its impact card
      if (obj && obj.rationale != null && obj.expectedCoverageGain != null) {
        setRecCard({ rec: obj as Recommendation, x: info.x ?? 0, y: info.y ?? 0, pinned: true });
        return;
      }
      if (obj?.kind && obj?.capacityKw) selectInfra(obj.id);
      else if (obj?._uploadedExisting) {
        // read-only overlay — no selection
      } else if (obj?.properties?.id) selectZone(obj.properties.id);
      else if (!obj) {
        selectZone(null);
        selectInfra(null);
        setRecCard((c) => (c?.pinned ? null : c)); // click empty → unpin card
      }
    },
    [mode, scenarioTargeting, fireScenarioAtZone, addInfraAt, selectZone, selectInfra, regionCursorMode, setSelectedRegion, setRegionCursorMode, setHoveredRegion, allZones]
  );

  const handleHover = useCallback((info: PickingInfo) => {
    if (mode === "place" && info.coordinate) {
      setPlacementHoverCoordinate(info.coordinate as [number, number]);
    } else {
      setPlacementHoverCoordinate(null);
    }

    const o: any = info.object;

    // Interactive region selection cursor: highlight hovered region without covering the map.
    if (regionCursorMode) {
      const zoneName = o?.properties?.name;
      if (zoneName) {
        const zoneObj = allZones.find(z => z.id === o?.properties?.id || z.name === zoneName);
        const region = getZoneRegion(zoneName, zoneObj?.centroid);
        setHoveredRegion(region);
        
        const filtered = allZones.filter(z => getZoneRegion(z.name, z.centroid) === region);
        const pop = filtered.reduce((sum, z) => sum + z.demographics.population, 0);
        
        const html = `<div class="p-1">
          <div class="font-bold text-emerald-400 text-sm mb-0.5">Select ${region}</div>
          <div class="text-[11px] text-muted-foreground mb-1.5">Click to simulate this region only</div>
          <div class="text-[11px] text-foreground/90 leading-tight">
            <b>${filtered.length}</b> neighborhoods<br/>
            <b>${pop.toLocaleString()}</b> residents
          </div>
        </div>`;
        setHover({ x: info.x ?? 0, y: info.y ?? 0, html });
      } else {
        setHoveredRegion(null);
      }
      setDistrictHoverHtml(null);
      setHover(null);
      return;
    }

    // While targeting, preview the hovered zone (glow) so you SEE before you click.
    if (scenarioTargeting) {
      const id = o?.properties?.id ?? null;
      if (id !== useStore.getState().targetZoneId) setTargetZone(id);
    }
    // recommendation marker → show its impact card (don't override a pinned one)
    if (o && o.rationale != null && o.expectedCoverageGain != null) {
      const rec = o as Recommendation;
      const x = info.x ?? 0;
      const y = info.y ?? 0;
      setRecCard((c) => (c?.pinned ? c : { rec, x, y, pinned: false }));
      setDistrictHoverHtml(null);
      setHover(null);
      return;
    }
    setRecCard((c) => (c?.pinned ? c : null)); // left a rec → drop unpinned card
    if (!o || info.x == null) {
      setDistrictHoverHtml(null);
      setHover(null);
      return;
    }
    let html = "";
    if (o.kind && o.capacityKw) {
      const zone = o.zoneId ? zones.find((z) => z.id === o.zoneId) : undefined;
      setDistrictHoverHtml(
        buildDistrictPopupHtml(
          zone
            ? {
                id: zone.id,
                name: zone.name,
                burden: zone.demographics.energyBurdenIndex,
              }
            : null
        )
      );
      html = `<b>${o.kind.toUpperCase()}</b> · ${o.capacityKw} kW<br/>${o.status}${
        o.placedBy ? ` · placed by ${o.placedBy}` : ""
      }`;
    } else if (o._uploadedExisting) {
      const label = o.name || `Uploaded ${String(o.kind).replace(/_/g, " ")}`;
      html = `<b>${label}</b><br/><span style="color:#fbbf24">Existing inventory (uploaded)</span>`;
      if (o.status) html += `<br/>Status: ${o.status}`;
      if (o.powerKw != null) html += `<br/>Power: ${o.powerKw} kW`;
    } else if (o.name && o.position && o.kind && !o.capacityKw && !o.rationale) {
      setDistrictHoverHtml(null);
      // facility or existing-infra marker
      html = `<b>${o.name}</b><br/>${String(o.kind).replace(/_/g, " ")}`;
    } else if (o.kind && o.rationale) {
      setDistrictHoverHtml(null);
      html = `<b>Recommend ${o.kind}</b><br/>${o.rationale}`;
    } else if (o.properties?.name) {
      setDistrictHoverHtml(buildDistrictPopupHtml(o.properties));
      setHover(null);
      return;
    } else {
      setDistrictHoverHtml(null);
    }
    if (html) setHover({ x: info.x, y: info.y, html });
    else setHover(null);
  }, [buildDistrictPopupHtml, scenarioTargeting, setTargetZone, regionCursorMode, setHoveredRegion, allZones, zones, mode]);

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const rightClickDrag = rightClickDragRef.current;
      rightClickDragRef.current = null;
      if (rightClickDrag?.moved) return;
      if (!districtHoverHtml) return;
      setDistrictPopup({
        x: event.clientX,
        y: event.clientY,
        html: districtHoverHtml,
      });
      setHover(null);
    },
    [districtHoverHtml]
  );

  const handleMapMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    rightClickDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  }, []);

  const handleMapMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const rightClickDrag = rightClickDragRef.current;
    if (!rightClickDrag || (event.buttons & 2) !== 2) return;
    const dx = event.clientX - rightClickDrag.x;
    const dy = event.clientY - rightClickDrag.y;
    if (dx * dx + dy * dy > 36) rightClickDrag.moved = true;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDistrictPopup(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap() as any;
    if (!map) return;

    // LAND-ONLY on a WHITE base: recede water to a soft light tone so the land +
    // city read as the focus, with a crisp light-gray shoreline at the lake edge.
    const WATER_VOID = "#e3e9ee";
    try {
      const layers = map.getStyle().layers ?? [];
      for (const l of layers) {
        const id = String(l.id).toLowerCase();
        const sl = String(l["source-layer"] ?? "").toLowerCase();
        const isWater =
          sl === "water" ||
          sl === "waterway" ||
          /water|ocean|sea|river|lake|bathym|marine/.test(id);
        if (!isWater) continue;
        try {
          if (l.type === "fill") {
            map.setPaintProperty(l.id, "fill-color", WATER_VOID);
            map.setPaintProperty(l.id, "fill-opacity", 1);
          } else if (l.type === "line") {
            map.setPaintProperty(l.id, "line-color", WATER_VOID);
          } else if (l.type === "fill-extrusion") {
            map.setPaintProperty(l.id, "fill-extrusion-color", WATER_VOID);
          } else {
            map.setLayoutProperty(l.id, "visibility", "none");
          }
        } catch {
          /* layer not stylable — skip */
        }
      }
      // also push the map background itself to the void colour
      const bg = layers.find((l: any) => l.type === "background");
      if (bg) map.setPaintProperty(bg.id, "background-color", WATER_VOID);
    } catch {
      /* style introspection failed — baseline still works */
    }

    // 3D building extrusions (MapLibre/CARTO only; Mapbox Standard has its own).
    if (USE_MAPBOX) return;
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
            // Light neutral-gray massing that reads as solid form on the white base.
            "fill-extrusion-color": "#bcc6d0",
            "fill-extrusion-height": [
              "case",
              ["has", "render_height"],
              ["get", "render_height"],
              12,
            ],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.9,
            "fill-extrusion-vertical-gradient": true,
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
    onLoad: onMapLoad,
    attributionControl: false as const,
    maxPitch: 75,
    cursor,
    dragRotate: true as const,
    pitchWithRotate: true as const,
    touchZoomRotate: true as const,
    style: { width: "100%", height: "100%" },
  };

  return (
    <div
      className="absolute inset-0"
      onContextMenu={handleContextMenu}
      onMouseDownCapture={handleMapMouseDown}
      onMouseMoveCapture={handleMapMouseMove}
    >
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
          className="pointer-events-none fixed z-50 max-w-[300px] whitespace-normal break-words rounded-md border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
          dangerouslySetInnerHTML={{ __html: hover.html }}
        />
      )}

      {districtPopup && (
        <div
          className="pointer-events-auto fixed z-50 max-w-[300px] whitespace-normal break-words rounded-md border border-border bg-popover/95 px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-xl"
          style={{
            left: Math.min(districtPopup.x + 14, window.innerWidth - 316),
            top: Math.min(districtPopup.y + 14, window.innerHeight - 180),
          }}
          dangerouslySetInnerHTML={{ __html: districtPopup.html }}
        />
      )}

      {recCard && (
        <div
          className="pointer-events-auto fixed z-50"
          style={{
            left: Math.min(recCard.x + 16, window.innerWidth - 276),
            top: Math.min(recCard.y + 16, window.innerHeight - 220),
          }}
          onMouseLeave={() => setRecCard((c) => (c?.pinned ? c : null))}
        >
          <RecommendationImpact
            rec={recCard.rec}
            pinned={recCard.pinned}
            onClose={() => setRecCard(null)}
          />
        </div>
      )}

      {mode === "place" && !scenarioTargeting && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full border border-primary/40 bg-primary/15 px-4 py-1.5 text-xs font-medium text-primary">
          Click the map to place a <b className="uppercase">{placeKind}</b> ·
          press Esc to exit
        </div>
      )}
      {/* Camera reset */}
      <div className="pointer-events-auto absolute bottom-4 right-4 z-30 flex flex-col items-end gap-1.5">
        <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
          drag to pan · right-drag to orbit/tilt · scroll to zoom
        </span>
        <button
          onClick={() => resetView()}
          className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:text-primary"
        >
          <Compass className="h-3.5 w-3.5" /> Reset view
        </button>
      </div>

      {scenarioTargeting && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full border border-yellow-500/50 bg-yellow-400/15 px-4 py-1.5 text-xs font-medium text-yellow-700">
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

      {regionCursorMode && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full border border-emerald-500/50 bg-emerald-400/15 px-4 py-1.5 text-xs font-semibold text-emerald-700">
          📍 Hover and click any neighborhood to simulate its region only · Esc to cancel
        </div>
      )}
    </div>
  );
}
