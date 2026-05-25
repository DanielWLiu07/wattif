// deck.gl layer builders. Pure functions of store data -> layer instances.
import {
  GeoJsonLayer,
  ColumnLayer,
  ScatterplotLayer,
  TextLayer,
} from "@deck.gl/layers";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ScenegraphLayer } from "@deck.gl/mesh-layers";
import type { Layer } from "@deck.gl/core";
import type { FeatureCollection } from "geojson";
import type {
  Agent,
  AgentVoice,
  ConstraintZone,
  ExistingInfra,
  Facility,
  Flow,
  Infra,
  InfraKind,
  Recommendation,
  Sentiment,
  Zone,
} from "@/types";
import { INFRA_COLOR, STANCE_COLOR, FACILITY_META } from "@/types";
import type { LayerKey } from "@/store";

type RGB = [number, number, number];

// green (low burden) -> amber -> red (high burden)
export function burdenColor(t: number): RGB {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.5) {
    const k = c / 0.5;
    return [Math.round(52 + k * 198), Math.round(211 - k * 7), Math.round(153 - k * 132)];
  }
  const k = (c - 0.5) / 0.5;
  return [Math.round(250), Math.round(204 - k * 140), Math.round(21 + k * 20)];
}

// approval 0..1 diverging ramp centered at 0.5:
// red (~0.2 oppose) ↔ grey (0.5 neutral) ↔ blue/green (~0.85 support).
export function approvalColor(a: number): RGB {
  const c = Math.max(0, Math.min(1, a));
  const t = (c - 0.5) / 0.5; // -1..1
  if (t < 0) {
    const k = -t; // 0..1 toward oppose
    return [Math.round(148 + k * 100), Math.round(163 - k * 80), Math.round(184 - k * 110)];
  }
  const k = t; // 0..1 toward support
  return [Math.round(148 - k * 96), Math.round(163 + k * 48), Math.round(184 + k * 16)];
}

const incomeColor: Record<Agent["incomeBracket"], RGB> = {
  low: [248, 113, 113],
  mid: [250, 204, 21],
  high: [56, 189, 248],
};

const SIZE_SCALE: Record<InfraKind, number> = {
  wind: 28,
  solar: 16,
  battery: 14,
  microgrid: 22,
};

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export type LayerInputs = {
  zones: Zone[];
  agents: Agent[];
  infra: Infra[];
  recommendations: Recommendation[];
  layers: Record<LayerKey, boolean>;
  selectedZoneId: string | null;
  selectedInfraId: string | null;
  sentiment: Sentiment | null;
  flows: Flow[];
  outageZones: string[];
  adoptionByZone: Record<string, number>;
  voices: AgentVoice[];
  facilities: Facility[];
  existingInfra: ExistingInfra[];
  constraints: ConstraintZone[];
  floodRisk: Record<string, number>;
  scenarioTargeting: boolean;
  gatheringZones: string[];
  targetZoneId: string | null;
  flashZones: string[]; // briefly highlighted zones (what changed this step)
  approvalDeltas: { zoneId: string; delta: number }[]; // transient "+x%" labels
  spawnTimes: Record<string, number>; // infraId -> ms placed (scale-in + ripple)
  sampledAgents: Agent[]; // sampled "living" people
  agentTargets: Record<string, [number, number]>; // agentId -> stream target
  agentMobilizedAt: number; // ms when mobilization began
  extrude: boolean; // 3D height on demand hexbins + equity choropleth
  selectedVoiceId: string | null;
  time: number; // animation clock (ms)
  onInfraClick: (i: Infra) => void;
  onVoiceClick: (id: string) => void;
};

export function buildLayers(input: LayerInputs): Layer[] {
  const {
    zones,
    agents,
    infra,
    recommendations,
    layers,
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
    floodRisk,
    gatheringZones,
    targetZoneId,
    flashZones,
    approvalDeltas,
    spawnTimes,
    sampledAgents,
    agentTargets,
    agentMobilizedAt,
    extrude,
    selectedVoiceId,
    time,
    onInfraClick,
    onVoiceClick,
  } = input;
  const out: Layer[] = [];
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  // placement scale-in (easeOutBack overshoot) + ripple timing
  const SPAWN_MS = 650;
  const RIPPLE_MS = 1200;
  const easeOutBack = (x: number) => {
    const c1 = 1.70158,
      c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  };
  const placeScale = (id: string) => {
    const sp = spawnTimes[id];
    if (!sp) return 1;
    const a = (Date.now() - sp) / SPAWN_MS;
    return a >= 1 ? 1 : Math.max(0.01, easeOutBack(a));
  };
  const outageSet = new Set(outageZones);
  const gatheringSet = new Set(gatheringZones);

  // ---- No-build / siting-penalty constraints (tint the zone polygons) ----
  if (layers.constraints && constraints.length && zones.length) {
    const byZone = new Map(constraints.map((c) => [c.zoneId, c]));
    const feats = zones
      .map((z) => {
        const c = byZone.get(z.id);
        if (!c || (!c.noBuild && c.sitingPenalty < 0.25)) return null;
        return {
          type: "Feature" as const,
          geometry: z.polygon,
          properties: {
            noBuild: c.noBuild,
            penalty: c.sitingPenalty,
          },
        };
      })
      .filter(Boolean) as any[];
    if (feats.length) {
      out.push(
        new GeoJsonLayer({
          id: "constraints",
          data: { type: "FeatureCollection", features: feats } as FeatureCollection,
          filled: true,
          stroked: true,
          // no-build → red; high siting penalty → amber (ramped by penalty)
          getFillColor: (f: any) =>
            f.properties.noBuild
              ? [220, 38, 38, 70]
              : [251, 191, 36, Math.round(25 + f.properties.penalty * 55)],
          getLineColor: (f: any) =>
            f.properties.noBuild ? [248, 113, 113, 200] : [251, 191, 36, 150],
          lineWidthMinPixels: 1,
          pickable: false,
        })
      );
    }
  }

  // ---- Flood-risk overlay (data-2; per-zone 0..1, blue tint) ----
  if (layers.flood && Object.keys(floodRisk).length && zones.length) {
    const feats = zones
      .filter((z) => (floodRisk[z.id] ?? 0) > 0.05)
      .map((z) => ({
        type: "Feature" as const,
        geometry: z.polygon,
        properties: { risk: floodRisk[z.id] ?? 0 },
      }));
    if (feats.length) {
      out.push(
        new GeoJsonLayer({
          id: "flood",
          data: { type: "FeatureCollection", features: feats } as FeatureCollection,
          filled: true,
          stroked: true,
          getFillColor: (f: any) =>
            [56, 132, 255, Math.round(30 + f.properties.risk * 120)] as any,
          getLineColor: [96, 165, 250, 160],
          lineWidthMinPixels: 0.5,
          pickable: false,
        })
      );
    }
  }

  // ---- Scenario target highlight (chosen zone, before firing) ----
  if (targetZoneId) {
    const tz = zoneById.get(targetZoneId);
    if (tz) {
      const pulse = 0.5 + 0.5 * Math.sin(time / 250);
      out.push(
        new GeoJsonLayer({
          id: "target-ring",
          data: {
            type: "FeatureCollection",
            features: [
              { type: "Feature", geometry: tz.polygon, properties: {} },
            ],
          } as FeatureCollection,
          filled: true,
          stroked: true,
          getFillColor: [250, 204, 21, 40],
          getLineColor: [250, 204, 21, 230],
          lineWidthMinPixels: 2.5,
          pickable: false,
        })
      );
      out.push(
        new ScatterplotLayer({
          id: "target-pulse",
          data: [tz],
          getPosition: (z: Zone) => z.centroid,
          getRadius: 180 + pulse * 260,
          radiusUnits: "meters",
          getFillColor: [250, 204, 21, 35],
          stroked: true,
          getLineColor: [250, 204, 21, 220],
          lineWidthMinPixels: 2,
          updateTriggers: { getRadius: [time] },
          pickable: false,
        })
      );
    }
  }

  // ---- Step-change flash (what changed this tick/action) ----
  if (flashZones.length && zones.length) {
    const flashSet = new Set(flashZones);
    const pulse = 0.5 + 0.5 * Math.sin(time / 180);
    out.push(
      new GeoJsonLayer({
        id: "flash",
        data: {
          type: "FeatureCollection",
          features: zones
            .filter((z) => flashSet.has(z.id))
            .map((z) => ({ type: "Feature", geometry: z.polygon, properties: {} })),
        } as FeatureCollection,
        filled: true,
        stroked: true,
        getFillColor: [125, 211, 252, Math.round(40 + pulse * 60)],
        getLineColor: [186, 230, 253, 255],
        lineWidthMinPixels: 2.5,
        pickable: false,
        updateTriggers: { getFillColor: [time] },
      })
    );
  }

  // day/night factor (0 night .. 1 day) from sim hour baked into a pulse
  const microgridZones = new Set(
    infra.filter((i) => i.kind === "microgrid").map((i) => i.zoneId)
  );

  // ---- Outage darkening (resilience moment) ----
  if (outageSet.size && zones.length) {
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: zones
        .filter((z) => outageSet.has(z.id))
        .map((z) => ({
          type: "Feature",
          geometry: z.polygon,
          properties: { id: z.id, lit: microgridZones.has(z.id) },
        })),
    };
    out.push(
      new GeoJsonLayer({
        id: "outage",
        data: fc,
        filled: true,
        stroked: true,
        getFillColor: (f: any) =>
          f.properties.lit ? [52, 211, 153, 70] : [5, 8, 16, 180],
        getLineColor: (f: any) =>
          f.properties.lit ? [52, 211, 153, 200] : [90, 30, 30, 160],
        lineWidthMinPixels: 1.5,
        pickable: false,
      })
    );
  }

  // ---- Equity choropleth ----
  if (layers.equity && zones.length) {
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: zones.map((z) => ({
        type: "Feature",
        geometry: z.polygon,
        properties: {
          id: z.id,
          name: z.name,
          burden: z.demographics.energyBurdenIndex,
        },
      })),
    };
    out.push(
      new GeoJsonLayer({
        id: "equity",
        data: fc,
        filled: true,
        stroked: true,
        extruded: extrude,
        getFillColor: (f: any) => {
          const [r, g, b] = burdenColor(f.properties.burden);
          // flat → more transparent so basemap/labels read through; 3D → opaque
          const a = f.properties.id === selectedZoneId ? 215 : extrude ? 170 : 120;
          return [r, g, b, a];
        },
        getLineColor: [255, 255, 255, 50],
        getElevation: (f: any) => f.properties.burden * 900,
        elevationScale: extrude ? 1 : 0,
        lineWidthMinPixels: 1,
        pickable: true,
        updateTriggers: {
          getFillColor: [selectedZoneId, extrude],
          getElevation: [extrude],
        },
      })
    );
  }

  // ---- Sentiment choropleth (opinion by zone) ----
  if (layers.sentiment && sentiment && zones.length && !layers.equity) {
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: zones.map((z) => ({
        type: "Feature",
        geometry: z.polygon,
        properties: {
          id: z.id,
          name: z.name,
          approval: sentiment.perZone[z.id] ?? 0,
        },
      })),
    };
    out.push(
      new GeoJsonLayer({
        id: "sentiment",
        data: fc,
        filled: true,
        stroked: true,
        // stronger alpha + alpha scaled by distance from neutral so support/oppose
        // zones pop while near-neutral stays calm — reads clearly different.
        getFillColor: (f: any) => {
          const a = f.properties.approval as number;
          const intensity = Math.min(1, Math.abs(a - 0.5) / 0.35);
          return [...approvalColor(a), Math.round(90 + intensity * 90)] as any;
        },
        getLineColor: [255, 255, 255, 45],
        lineWidthMinPixels: 0.5,
        pickable: true,
        updateTriggers: { getFillColor: [sentiment] },
      })
    );
  }

  // ---- Adoption spread (rooftops light up over time) ----
  if (Object.keys(adoptionByZone).length && zones.length) {
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: zones
        .filter((z) => (adoptionByZone[z.id] ?? 0) > 0.05)
        .map((z) => ({
          type: "Feature",
          geometry: z.polygon,
          properties: { a: adoptionByZone[z.id] ?? 0 },
        })),
    };
    out.push(
      new GeoJsonLayer({
        id: "adoption-glow",
        data: fc,
        filled: true,
        stroked: false,
        getFillColor: (f: any) =>
          [250, 204, 21, Math.round(10 + f.properties.a * 90)] as any,
        pickable: false,
        updateTriggers: { getFillColor: [adoptionByZone] },
      })
    );
  }

  // ---- Demand heat ----
  if (layers.demand && agents.length) {
    out.push(
      new HexagonLayer({
        id: "demand",
        data: agents,
        getPosition: (a: Agent) => a.position,
        getElevationWeight: (a: Agent) => a.demandKwh,
        getColorWeight: (a: Agent) => a.demandKwh,
        elevationScale: extrude ? 6 : 0,
        extruded: extrude,
        radius: 220,
        coverage: 0.85,
        opacity: extrude ? 0.5 : 0.6,
        updateTriggers: { getElevationWeight: [extrude] },
        colorRange: [
          [13, 71, 161],
          [2, 119, 189],
          [0, 172, 193],
          [255, 193, 7],
          [245, 124, 0],
          [216, 67, 21],
        ],
        pickable: false,
      })
    );
  }

  // ---- People (sampled agents that MOVE: idle drift + stream to targets) ----
  if (layers.agents && sampledAgents.length) {
    const mobAge = agentMobilizedAt
      ? Math.min(1, (Date.now() - agentMobilizedAt) / 3500)
      : 0;
    const ease = mobAge < 0.5 ? 2 * mobAge * mobAge : 1 - (-2 * mobAge + 2) ** 2 / 2;
    const livePos = (a: Agent): [number, number] => {
      const home = a.position;
      const ph = hashSeed(a.id);
      // gentle idle drift so people are never perfectly still
      const dx = Math.sin(time * 0.0006 + ph) * 0.00035;
      const dy = Math.cos(time * 0.0005 + ph * 1.3) * 0.00035;
      const tgt = agentTargets[a.id];
      if (tgt) {
        return [
          home[0] + (tgt[0] - home[0]) * ease + dx * 0.4,
          home[1] + (tgt[1] - home[1]) * ease + dy * 0.4,
        ];
      }
      return [home[0] + dx, home[1] + dy];
    };
    out.push(
      new ScatterplotLayer({
        id: "people",
        data: sampledAgents,
        getPosition: livePos,
        getFillColor: (a: Agent) =>
          (sentiment
            ? approvalColor(sentiment.perZone[a.zoneId] ?? 0.5)
            : a.solarAdopted
            ? [52, 211, 153]
            : incomeColor[a.incomeBracket]) as any,
        getRadius: 16,
        radiusMinPixels: 2,
        radiusMaxPixels: 6,
        opacity: 0.95,
        stroked: true,
        getLineColor: [255, 255, 255, 110],
        lineWidthMinPixels: 0.5,
        pickable: false,
        updateTriggers: {
          getPosition: [time, agentTargets, agentMobilizedAt],
          getFillColor: [sentiment],
        },
      })
    );
  }

  // ---- Energy-flow particles (source -> powered zones) ----
  if (layers.flows && flows.length) {
    const LOOP = 2000;
    const t = (time % LOOP) / LOOP; // 0..1
    const trips = flows
      .map((f) => {
        const src = infra.find((i) => i.id === f.fromInfraId);
        const z = zoneById.get(f.toZoneId);
        if (!src || !z) return null;
        return {
          path: [src.position, z.centroid] as [number, number][],
          kind: src.kind,
          power: f.powerKwh,
        };
      })
      .filter(Boolean) as {
      path: [number, number][];
      kind: InfraKind;
      power: number;
    }[];
    out.push(
      new TripsLayer({
        // id keyed to data size: when the flow set changes the layer remounts
        // cleanly instead of diffing buffers mid-animation (avoids deck.gl
        // "offset is out of bounds" when length changes between rAF frames).
        id: `flows-${trips.length}`,
        data: trips,
        getPath: (d: any) => d.path,
        getTimestamps: () => [0, 100],
        getColor: (d: any) => INFRA_COLOR[d.kind as InfraKind] as any,
        currentTime: t * 100,
        trailLength: 40,
        widthMinPixels: 3,
        capRounded: true,
        jointRounded: true,
        opacity: 0.9,
        fadeTrail: true,
      })
    );
  }

  // ---- Recommendations: beam + ring ----
  if (layers.recommendations && recommendations.length) {
    out.push(
      new ColumnLayer({
        id: "rec-beams",
        data: recommendations,
        getPosition: (r: Recommendation) => r.position,
        getFillColor: (r: Recommendation) => [...INFRA_COLOR[r.kind], 120] as any,
        getElevation: (r: Recommendation) => 600 + r.score * 1400,
        radius: 90,
        diskResolution: 24,
        extruded: true,
        pickable: true,
        opacity: 0.7,
      })
    );
    out.push(
      new ScatterplotLayer({
        id: "rec-rings",
        data: recommendations,
        getPosition: (r: Recommendation) => r.position,
        getLineColor: (r: Recommendation) => INFRA_COLOR[r.kind] as any,
        getFillColor: (r: Recommendation) => [...INFRA_COLOR[r.kind], 40] as any,
        stroked: true,
        filled: true,
        // gentle pulse so recommendation markers read as "suggestions"
        getRadius: 230 + (0.5 + 0.5 * Math.sin(time / 350)) * 90,
        lineWidthMinPixels: 2,
        radiusMinPixels: 8,
        pickable: true,
        updateTriggers: { getRadius: [time] },
      })
    );
  }

  // ---- Placement ripple (expanding ring at freshly-placed infra) ----
  if (layers.infra && infra.length) {
    const ripples = infra.filter(
      (i) => spawnTimes[i.id] && Date.now() - spawnTimes[i.id] < RIPPLE_MS
    );
    if (ripples.length) {
      out.push(
        new ScatterplotLayer({
          id: "place-ripple",
          data: ripples,
          getPosition: (i: Infra) => i.position,
          getRadius: (i: Infra) => {
            const a = (Date.now() - spawnTimes[i.id]) / RIPPLE_MS;
            return 50 + a * 360;
          },
          radiusUnits: "meters",
          stroked: true,
          filled: false,
          getLineColor: (i: Infra) => {
            const a = (Date.now() - spawnTimes[i.id]) / RIPPLE_MS;
            return [...INFRA_COLOR[i.kind], Math.round(220 * (1 - a))] as any;
          },
          lineWidthMinPixels: 2.5,
          updateTriggers: { getRadius: [time], getLineColor: [time] },
          pickable: false,
        })
      );
    }
  }

  // ---- Infra base halos (pulsing batteries/microgrids) ----
  if (layers.infra && infra.length) {
    const pulse = 0.5 + 0.5 * Math.sin(time / 400);
    out.push(
      new ColumnLayer({
        id: "infra-base",
        data: infra,
        getPosition: (i: Infra) => i.position,
        getFillColor: (i: Infra) => {
          if (i.status === "damaged") return [120, 40, 40, 200] as any;
          const a = i.status === "active" ? 200 : 110;
          return [...INFRA_COLOR[i.kind], a] as any;
        },
        getElevation: (i: Infra) => {
          const base = 40;
          if (i.kind === "battery" || i.kind === "microgrid")
            return base + pulse * 60;
          return base;
        },
        radius: 75,
        stroked: true,
        getLineColor: (i: Infra) =>
          (i.id === selectedInfraId ? [255, 255, 255, 255] : [255, 255, 255, 90]) as any,
        lineWidthMinPixels: (selectedInfraId ? 2 : 0) as any,
        diskResolution: 24,
        extruded: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 60],
        updateTriggers: {
          getElevation: [time],
          getLineColor: [selectedInfraId],
        },
        onClick: (info: any) => info.object && onInfraClick(info.object),
      })
    );

    // One ScenegraphLayer per kind. Wind turbines spin (yaw animates with time).
    const kinds: InfraKind[] = ["solar", "wind", "battery", "microgrid"];
    for (const kind of kinds) {
      const items = infra.filter((i) => i.kind === kind && i.status !== "damaged");
      if (!items.length) continue;
      const spin = kind === "wind";
      out.push(
        new ScenegraphLayer({
          id: `infra-model-${kind}`,
          data: items,
          scenegraph: items[0].modelUrl,
          getPosition: (i: Infra) => i.position,
          getOrientation: (i: Infra) =>
            spin
              ? [0, (time / 12 + hashSeed(i.id) % 360) % 360, 90]
              : [0, 0, 90],
          // animate IN: scale from ~0 with an overshoot when freshly placed
          getScale: (i: Infra) => {
            const s = placeScale(i.id);
            return [s, s, s];
          },
          sizeScale: SIZE_SCALE[kind],
          _lighting: "pbr",
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 90],
          updateTriggers: {
            getOrientation: spin ? [time] : [],
            getScale: [time],
          },
          onClick: (info: any) => info.object && onInfraClick(info.object),
        })
      );
    }
  }

  // ---- Existing infrastructure (real renewables + EV chargers) ----
  if (layers.existing && existingInfra.length) {
    const colorFor = (k: string): RGB => {
      const key = k.toLowerCase();
      if (key.includes("solar")) return INFRA_COLOR.solar;
      if (key.includes("wind")) return INFRA_COLOR.wind;
      if (key.includes("hydro")) return [56, 189, 248];
      if (key.includes("ev") || key.includes("charg")) return [129, 140, 248];
      return [148, 163, 184];
    };
    out.push(
      new ScatterplotLayer({
        id: "existing-infra",
        data: existingInfra,
        getPosition: (d: ExistingInfra) => d.position,
        getFillColor: (d: ExistingInfra) => [...colorFor(d.kind), 60] as any,
        getLineColor: (d: ExistingInfra) => colorFor(d.kind) as any,
        stroked: true,
        filled: true,
        getRadius: 55,
        radiusMinPixels: 3,
        radiusMaxPixels: 9,
        lineWidthMinPixels: 1.5,
        opacity: 0.9,
        pickable: true,
      })
    );
  }

  // ---- Facilities (cooling centres / shelters / hospitals) ----
  // Default OFF (583 is noise). Shown when the user toggles the layer, OR
  // CONTEXTUALLY: only facilities inside active gathering zones during an event.
  if (facilities.length) {
    const contextual = !layers.facilities && gatheringSet.size > 0;
    let facList: Facility[] = [];
    if (layers.facilities) {
      facList = facilities;
    } else if (contextual) {
      facList = facilities.filter((f) =>
        zones.some(
          (z) =>
            gatheringSet.has(z.id) &&
            (f.position[0] - z.centroid[0]) ** 2 +
              (f.position[1] - z.centroid[1]) ** 2 <
              0.00018
        )
      );
    }
    if (facList.length) {
      out.push(
        new TextLayer({
          id: "facilities",
          data: facList,
          getPosition: (f: Facility) => f.position,
          getText: (f: Facility) =>
            FACILITY_META[f.kind as string]?.icon ?? FACILITY_META.other.icon,
          getSize: contextual ? 22 : 17,
          sizeUnits: "pixels",
          getColor: [255, 255, 255, 255],
          background: true,
          getBackgroundColor: (f: Facility) =>
            [
              ...(FACILITY_META[f.kind as string]?.color ?? FACILITY_META.other.color),
              contextual ? 235 : 200,
            ] as any,
          backgroundPadding: [3, 2, 3, 2],
          billboard: true,
          getPixelOffset: [0, -10], // lift above ground so it doesn't sit in terrain
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
          characterSet: "auto",
          // always face camera + draw on top so icons never clip through floor/buildings
          parameters: { depthTest: false } as any,
          pickable: true,
          updateTriggers: { getSize: [contextual], getBackgroundColor: [contextual] },
        })
      );
    }
  }

  // ---- Approval delta labels ("+3%") — brief, on zones whose sentiment moved ----
  if (approvalDeltas.length && zones.length) {
    const data = approvalDeltas
      .map((d) => {
        const z = zoneById.get(d.zoneId);
        return z ? { position: z.centroid, delta: d.delta } : null;
      })
      .filter(Boolean) as { position: [number, number]; delta: number }[];
    out.push(
      new TextLayer({
        id: "approval-deltas",
        data,
        getPosition: (d: any) => d.position,
        getText: (d: any) =>
          `${d.delta > 0 ? "▲" : "▼"}${Math.abs(d.delta * 100).toFixed(0)}%`,
        getColor: (d: any) =>
          (d.delta > 0 ? [52, 211, 153, 255] : [248, 113, 113, 255]) as any,
        getSize: 15,
        sizeUnits: "pixels",
        fontWeight: 700,
        getPixelOffset: [0, 8],
        background: true,
        getBackgroundColor: [10, 14, 26, 220],
        backgroundPadding: [4, 2, 4, 2],
        billboard: true,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        characterSet: "auto",
        parameters: { depthTest: false } as any,
      })
    );
  }

  // ---- Speech bubbles (newest voices float over their neighbourhoods) ----
  // Clickable → opens that line in the Voices log. Selected bubble is enlarged
  // and always shown (even if not in the newest few).
  if (layers.sentiment && voices.length && zones.length) {
    const recent = voices.slice(0, 4);
    const sel = selectedVoiceId
      ? voices.find((v) => v.id === selectedVoiceId)
      : undefined;
    const list =
      sel && !recent.some((v) => v.id === sel.id) ? [sel, ...recent] : recent;
    const data = list.map((v) => {
      const z = zoneById.get(v.zoneId);
      const selected = v.id === selectedVoiceId;
      const cap = selected ? 200 : 120;
      const text = v.text.length > cap ? v.text.slice(0, cap - 2) + "…" : v.text;
      return {
        id: v.id,
        position: z ? z.centroid : ([-79.38, 43.65] as [number, number]),
        text,
        stance: v.stance,
        selected,
      };
    });
    out.push(
      new TextLayer({
        id: "speech",
        data,
        getPosition: (d: any) => d.position,
        getText: (d: any) => d.text,
        getSize: (d: any) => (d.selected ? 15 : 12),
        getColor: (d: any) => [...STANCE_COLOR[d.stance as AgentVoice["stance"]], 255] as any,
        getPixelOffset: [0, -30],
        background: true,
        getBackgroundColor: (d: any) =>
          (d.selected ? [30, 41, 75, 245] : [10, 14, 26, 225]) as any,
        getBorderColor: (d: any) =>
          (d.selected
            ? [...STANCE_COLOR[d.stance as AgentVoice["stance"]], 255]
            : [0, 0, 0, 0]) as any,
        getBorderWidth: (d: any) => (d.selected ? 1.5 : 0),
        backgroundPadding: [7, 5, 7, 5],
        fontWeight: 600,
        sizeUnits: "pixels",
        wordBreak: "break-word",
        maxWidth: 16,
        lineHeight: 1.25,
        billboard: true,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        pickable: true,
        onClick: (info: any) => info.object?.id && onVoiceClick(info.object.id),
        characterSet: "auto",
        parameters: { depthTest: false } as any,
        updateTriggers: {
          getSize: [selectedVoiceId],
          getBackgroundColor: [selectedVoiceId],
          getBorderWidth: [selectedVoiceId],
        },
      })
    );
  }

  return out;
}
