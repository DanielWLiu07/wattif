import { create } from "zustand";
import type {
  ActivityItem,
  ActivitySeverity,
  Agent,
  AgentVoice,
  ChatItem,
  ConstraintZone,
  ExistingInfra,
  Facility,
  Flow,
  Infra,
  InfraKind,
  LngLat,
  PlacementMode,
  PlannerEvent,
  Recommendation,
  Scenario,
  ScenarioType,
  Sentiment,
  SimMetrics,
  Zone,
} from "@/types";
import { INFRA_PRESETS, MODEL_URL } from "@/types";
import * as api from "@/api/client";
import { nearestZone, scenarioImpact } from "@/data/mock";
import { makeLandTest } from "@/lib/geo";

export type LayerKey =
  | "buildings"
  | "demand"
  | "equity"
  | "agents"
  | "infra"
  | "recommendations"
  | "flows"
  | "sentiment"
  | "facilities"
  | "existing"
  | "constraints"
  | "flood";

export type ToolMode = "select" | "place";

type FlyTo = {
  target: LngLat;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  nonce: number;
} | null;

type PlannerState = {
  events: PlannerEvent[];
  running: boolean;
  awaitingApproval: boolean;
  summary: string | null;
};

type State = {
  // data
  zones: Zone[];
  agents: Agent[];
  infra: Infra[];
  metrics: SimMetrics | null;
  history: SimMetrics[];
  recommendations: Recommendation[];

  // v2 data
  scenarios: Scenario[];
  sentiment: Sentiment | null;
  voices: AgentVoice[];
  flows: Flow[];
  outageZones: string[];
  adoptionByZone: Record<string, number>;
  planner: PlannerState;

  // v3 real-data layers
  facilities: Facility[];
  existingInfra: ExistingInfra[];
  constraints: ConstraintZone[];
  environment: Record<string, api.ZoneEnviro>;
  generationMix: api.GenerationMix | null;
  floodRisk: Record<string, number>; // per-zone 0..1 (data-2)
  heatVuln: Record<string, number>; // per-zone 0..1 (data-2)
  gatheringZones: string[]; // zones showing crowds (target + neighbours)
  lastTargetZoneId: string | null; // zone the last scenario hit

  // activity log + step highlighting
  activity: ActivityItem[];
  flashZones: string[]; // zones to briefly highlight after a step/event

  // sentiment-over-time
  approvalHistory: Record<string, number[]>; // per-zone approval trend (0..1)
  approvalDeltas: { zoneId: string; delta: number }[]; // transient "+3%" labels

  // juice: placement animations + toasts
  spawnTimes: Record<string, number>; // infraId -> ms when placed (scale-in anim)
  toasts: { id: string; text: string; kind: "info" | "good" | "warn" | "bad" }[];

  // v3 chat (real-time agentic conversation)
  chat: ChatItem[];
  chatConnected: boolean;
  chatBusy: boolean;
  chatAwaiting: boolean;

  // v3 scenario targeting (target -> see -> press)
  scenarioTargeting: boolean;
  pendingScenarioType: ScenarioType | "random";
  targetZoneId: string | null; // chosen-but-not-yet-fired target

  // ui
  layers: Record<LayerKey, boolean>;
  mode: ToolMode; // manual map interaction
  placementMode: PlacementMode; // manual | auto | step
  placeKind: InfraKind;
  selectedZoneId: string | null;
  selectedInfraId: string | null;
  playing: boolean;
  optimizing: boolean;
  flyTo: FlyTo;

  // onboarding / layout
  showWelcome: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  showLegend: boolean;
  extrude: boolean; // 3D height on demand hexbins + equity choropleth (off by default)
  demo: { running: boolean; step: number; total: number; caption: string };

  // connectivity
  live: boolean;
  wsConnected: boolean;
  wsReconnecting: boolean;
  loaded: boolean;

  // actions
  init: () => Promise<void>;
  toggleLayer: (k: LayerKey) => void;
  setLayers: (partial: Partial<Record<LayerKey, boolean>>) => void;
  setPrimaryOverlay: (k: "equity" | "sentiment" | "demand" | "flood" | "none") => void;
  setMode: (m: ToolMode) => void;
  setPlacementMode: (m: PlacementMode) => void;
  setPlaceKind: (k: InfraKind) => void;
  selectZone: (id: string | null) => void;
  selectInfra: (id: string | null) => void;
  flyToInfra: (id: string) => void;
  resetView: () => void;
  addInfraAt: (pos: LngLat) => Promise<void>;
  removeInfra: (id: string) => Promise<void>;
  step: () => Promise<void>;
  reset: () => Promise<void>;
  play: () => void;
  pause: () => void;
  runOptimize: (n?: number) => Promise<void>;
  clearRecommendations: () => void;
  acceptRecommendation: (r: Recommendation) => Promise<void>;

  // v2 actions
  triggerScenario: (type: ScenarioType | "random", zoneId?: string) => Promise<void>;
  resetSession: () => Promise<void>;
  refreshSentiment: () => Promise<void>;
  refreshVoices: (n?: number, context?: string) => Promise<void>;
  refreshFlows: () => Promise<void>;
  startPlanner: (mode: "auto" | "step") => void;
  stopPlanner: () => void;
  approveStep: () => void;
  rejectStep: () => void;

  // juice
  pushToast: (text: string, kind?: "info" | "good" | "warn" | "bad") => void;
  dismissToast: (id: string) => void;

  // v3 actions
  sendChat: (text: string) => void;
  clearChat: () => void;
  setScenarioTargeting: (on: boolean, type?: ScenarioType | "random") => void;
  setTargetZone: (zoneId: string | null) => void;
  setPendingScenarioType: (type: ScenarioType | "random") => void;
  fireScenarioAtTarget: () => void;
  fireScenarioAtZone: (zoneId: string) => void;

  // onboarding / layout
  dismissWelcome: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleLegend: () => void;
  toggleExtrude: () => void;
  runGuidedDemo: () => Promise<void>;
  stopDemo: () => void;
};

let playTimer: ReturnType<typeof setInterval> | null = null;
let demoAbort = false;
let session: api.PlannerSession | null = null;
let chatSeq = 0;
const cid = () => `c${chatSeq++}`;
let actSeq = 0;
const aid = () => `a${actSeq++}`;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
let deltaTimer: ReturnType<typeof setTimeout> | null = null;

// Append the latest per-zone approval to each zone's trend (capped) and surface
// transient deltas for zones that moved meaningfully (drives recolor + "+x%").
function recordApproval(
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void,
  get: () => State,
  perZone: Record<string, number>
) {
  const hist = { ...get().approvalHistory };
  const deltas: { zoneId: string; delta: number }[] = [];
  for (const [zid, val] of Object.entries(perZone)) {
    const arr = hist[zid] ? [...hist[zid]] : [];
    const last = arr.length ? arr[arr.length - 1] : undefined;
    if (last != null && Math.abs(val - last) >= 0.015)
      deltas.push({ zoneId: zid, delta: val - last });
    arr.push(val);
    hist[zid] = arr.slice(-40);
  }
  set({ approvalHistory: hist });
  if (deltas.length) {
    const top = deltas
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6);
    set({ approvalDeltas: top });
    if (deltaTimer) clearTimeout(deltaTimer);
    deltaTimer = setTimeout(() => set({ approvalDeltas: [] }), 2600);
  }
}

// Prepend activity items (newest first, capped) + briefly flash affected zones.
function logActivity(
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void,
  entries: { text: string; severity?: ActivitySeverity; zoneId?: string }[],
  tick: number,
  year: number,
  flashIds: string[] = []
) {
  if (!entries.length && !flashIds.length) return;
  const items: ActivityItem[] = entries.map((e) => ({
    id: aid(),
    tick,
    year,
    text: e.text,
    severity: e.severity ?? "info",
    zoneId: e.zoneId,
  }));
  set((s) => ({
    activity: [...items, ...s.activity].slice(0, 80),
    flashZones: flashIds.length ? flashIds : s.flashZones,
  }));
  if (flashIds.length) {
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ flashZones: [] }), 1800);
  }
}

// Build the persistent planner/chat session, wiring its event stream into the
// store: events become chat items, placements drop infra onto the map live,
// and the sim/voices refresh in real time as the agent acts.
function attachSession(
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void,
  get: () => State
): api.PlannerSession {
  const handleEvent = (e: PlannerEvent) => {
    set((s) => ({ chat: [...s.chat, { id: cid(), role: "event", event: e }] }));
    if (e.type === "tool_call" && get().placementMode === "step") {
      set({ chatAwaiting: true });
    }
    if (e.type === "placement") {
      set((s) => ({
        infra: [...s.infra, e.infra],
        spawnTimes: { ...s.spawnTimes, [e.infra.id]: Date.now() },
      }));
      const m0 = get().metrics;
      const zName = get().zones.find((z) => z.id === e.infra.zoneId)?.name;
      logActivity(
        set,
        [
          {
            text: `AI placed a ${e.infra.kind} (${e.infra.capacityKw} kW)${
              zName ? ` in ${zName}` : ""
            }`,
            severity: "good",
            zoneId: e.infra.zoneId,
          },
        ],
        m0?.tick ?? 0,
        m0?.year ?? 2026,
        e.infra.zoneId ? [e.infra.zoneId] : []
      );
      void get().reset();
      void get().refreshFlows();
      void get().refreshSentiment();
    }
    if (e.type === "done") {
      set({ chatBusy: false, chatAwaiting: false });
      get().pushToast(e.summary || "AI planning complete", "good");
      void get().refreshVoices(5, "ai-plan");
    }
  };
  return api.createPlannerSession({
    infraProvider: () => get().infra,
    facilitiesProvider: () =>
      get().facilities.map((f) => ({
        kind: f.kind,
        position: f.position,
        name: f.name,
      })),
    onEvent: handleEvent,
    onStatus: (open) => set({ chatConnected: open }),
    onBusy: (busy) =>
      set((s) => ({ chatBusy: busy, chatAwaiting: busy ? s.chatAwaiting : false })),
  });
}

// Target zone + its k nearest neighbours (for localized scenario effects).
function zoneCluster(zones: Zone[], zoneId: string, k = 3): string[] {
  const target = zones.find((z) => z.id === zoneId);
  if (!target) return [zoneId];
  const near = zones
    .filter((z) => z.id !== zoneId)
    .map((z) => ({
      id: z.id,
      d:
        (z.centroid[0] - target.centroid[0]) ** 2 +
        (z.centroid[1] - target.centroid[1]) ** 2,
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((n) => n.id);
  return [zoneId, ...near];
}

const GRID_LOSS_TYPES = new Set(["blackout", "earthquake", "ice_storm"]);

// Recompute the derived world state (infra damage, sentiment bias, demand) from scenarios.
function applyScenarioState(infra: Infra[], scenarios: Scenario[]) {
  const impact = scenarioImpact(scenarios);
  const nextInfra = infra.map((i) =>
    impact.damagedInfra.has(i.id) ? { ...i, status: "damaged" as const } : i
  );
  return { impact, nextInfra };
}

export const useStore = create<State>((set, get) => ({
  zones: [],
  agents: [],
  infra: [],
  metrics: null,
  history: [],
  recommendations: [],

  scenarios: [],
  sentiment: null,
  voices: [],
  flows: [],
  outageZones: [],
  adoptionByZone: {},
  planner: { events: [], running: false, awaitingApproval: false, summary: null },

  facilities: [],
  existingInfra: [],
  constraints: [],
  environment: {},
  generationMix: null,
  floodRisk: {},
  heatVuln: {},
  gatheringZones: [],
  lastTargetZoneId: null,

  activity: [],
  flashZones: [],
  approvalHistory: {},
  approvalDeltas: [],
  spawnTimes: {},
  toasts: [],

  chat: [],
  chatConnected: false,
  chatBusy: false,
  chatAwaiting: false,

  scenarioTargeting: false,
  pendingScenarioType: "random",
  targetZoneId: null,

  layers: {
    buildings: true,
    demand: false, // heavy hexbins — off by default for a clean hero; demo + toggle enable it
    equity: false,
    agents: false,
    infra: true,
    recommendations: true,
    flows: true,
    sentiment: true,
    facilities: false, // off by default — too many (583); shown contextually on events
    existing: true,
    constraints: true,
    flood: true, // flood-risk overlay (lights up when data-2 ships it)
  },
  mode: "select",
  placementMode: "manual",
  placeKind: "solar",
  selectedZoneId: null,
  selectedInfraId: null,
  playing: false,
  optimizing: false,
  flyTo: null,

  showWelcome: true,
  leftOpen: true,
  rightOpen: true,
  showLegend: true,
  extrude: false,
  demo: { running: false, step: 0, total: 6, caption: "" },

  live: false,
  wsConnected: false,
  wsReconnecting: false,
  loaded: false,

  init: async () => {
    const [{ data: zones, live: zLive }, { data: rawAgents }] = await Promise.all([
      api.getZones(),
      api.getAgents(),
    ]);
    // Clip markers that fall on water — keep only points inside a land zone.
    const onLand = makeLandTest(zones);
    const agents = rawAgents.filter((a) => onLand(a.position));
    const infra = api.seedInfra();
    const [{ data: metrics }, { data: sentiment }, { data: flows }] =
      await Promise.all([
        api.resetSim(infra),
        api.getSentiment(infra),
        api.getFlows(infra),
      ]);
    const metricsWithApproval = {
      ...metrics,
      approvalPct: sentiment.cityApprovalPct,
    };
    const { data: voices } = await api.getVoices(8, infra, sentiment);
    set({
      zones,
      agents,
      infra,
      metrics: metricsWithApproval,
      history: [metricsWithApproval],
      sentiment,
      flows,
      voices,
      live: zLive,
      loaded: true,
      approvalHistory: Object.fromEntries(
        Object.entries(sentiment.perZone).map(([k, v]) => [k, [v]])
      ),
    });

    // v3 real-data layers — degrade gracefully (empty until data-2 lands)
    void Promise.all([
      api.getFacilities(),
      api.getExistingInfra(),
      api.getConstraints(),
      api.getEnvironment(),
      api.getGenerationMix(),
      api.getActivity(),
      api.getFloodRisk(),
      api.getHeatVulnerability(),
    ]).then(
      ([
        facilities,
        existingInfra,
        constraints,
        environment,
        generationMix,
        activity,
        floodRisk,
        heatVuln,
      ]) =>
        set({
          facilities: facilities.filter((f) => onLand(f.position)),
          existingInfra: existingInfra.filter((e) => onLand(e.position)),
          constraints,
          environment,
          generationMix,
          floodRisk,
          heatVuln,
          activity: activity.length ? activity.slice(0, 80) : get().activity,
        })
    );

    api.openSimSocket(
      (msg) => {
        if (msg.type === "tick_start") {
          set((s) => ({
            metrics: s.metrics
              ? { ...s.metrics, tick: msg.tick, hour: msg.hour ?? s.metrics.hour }
              : s.metrics,
          }));
        } else if (msg.type === "placements") {
          set((s) => ({ infra: [...s.infra, ...msg.infra] }));
        } else if (msg.type === "voices") {
          set((s) => ({ voices: [...msg.voices, ...s.voices].slice(0, 40) }));
        } else if (msg.type === "tick_complete" || msg.type === "metrics") {
          const m = msg.metrics;
          set((s) => ({
            metrics: m,
            history: [...s.history.slice(-119), m],
            live: true,
            flows: msg.type === "tick_complete" && msg.flows ? msg.flows : s.flows,
          }));
          if (msg.type === "tick_complete" && msg.activity?.length) {
            logActivity(
              set,
              msg.activity.map((a) => ({
                text: a.text,
                severity: a.severity,
                zoneId: a.zoneId,
              })),
              m.tick,
              m.year,
              msg.activity.map((a) => a.zoneId).filter(Boolean) as string[]
            );
          }
        }
      },
      (status) =>
        set({
          wsConnected: status === "open",
          wsReconnecting: status === "reconnecting",
        })
    );
  },

  toggleLayer: (k) =>
    set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setLayers: (partial) =>
    set((s) => ({ layers: { ...s.layers, ...partial } })),
  // Make one choropleth overlay the active/primary one (others off) for a clean,
  // self-explanatory map. "none" clears them all.
  setPrimaryOverlay: (k) =>
    set((s) => ({
      layers: {
        ...s.layers,
        equity: k === "equity",
        sentiment: k === "sentiment",
        demand: k === "demand",
        flood: k === "flood",
      },
    })),
  setMode: (m) => set({ mode: m }),
  setPlacementMode: (m) => {
    set({ placementMode: m });
    if (m === "manual") {
      get().stopPlanner();
    } else {
      set({ mode: "select" });
      get().startPlanner(m);
    }
  },
  setPlaceKind: (k) => set({ placeKind: k, mode: "place", placementMode: "manual" }),
  selectZone: (id) => {
    set({ selectedZoneId: id });
    // Click a zone → frame it (only on a real selection, not deselect).
    if (id) {
      const z = get().zones.find((zz) => zz.id === id);
      if (z) set({ flyTo: { target: z.centroid, zoom: 13.6, nonce: Date.now() } });
    }
  },
  selectInfra: (id) => set({ selectedInfraId: id }),
  flyToInfra: (id) => {
    const inf = get().infra.find((i) => i.id === id);
    if (inf)
      set({
        flyTo: { target: inf.position, zoom: 15, nonce: Date.now() },
        selectedInfraId: id,
      });
  },

  resetView: () =>
    set({
      flyTo: {
        target: [-79.385, 43.715],
        zoom: 11.2,
        pitch: 40,
        bearing: -10,
        nonce: Date.now(),
      },
    }),

  addInfraAt: async (pos) => {
    const { placeKind, infra } = get();
    const preset = INFRA_PRESETS[placeKind];
    const z = nearestZone(pos);
    const optimistic: Infra = {
      id: `infra-${placeKind}-${Date.now()}`,
      kind: placeKind,
      position: pos,
      capacityKw: preset.capacityKw,
      costCad: preset.costCad,
      modelUrl: MODEL_URL[placeKind],
      status: "planned",
      placedBy: "you",
      zoneId: z?.id,
    };
    set({ infra: [...infra, optimistic] });
    const saved = await api.placeInfra(optimistic);
    set((s) => ({
      infra: s.infra.map((i) => (i.id === optimistic.id ? saved : i)),
      spawnTimes: { ...s.spawnTimes, [saved.id]: Date.now(), [optimistic.id]: Date.now() },
    }));
    get().pushToast(
      `Placed ${optimistic.kind} in ${z?.name ?? "the city"}`,
      "good"
    );
    const m0 = get().metrics;
    logActivity(
      set,
      [
        {
          text: `You placed a ${optimistic.kind} (${optimistic.capacityKw} kW) in ${
            z?.name ?? "the city"
          }`,
          severity: "good",
          zoneId: z?.id,
        },
      ],
      m0?.tick ?? 0,
      m0?.year ?? 2026,
      z ? [z.id] : []
    );
    await get().reset();
    await get().refreshSentiment();
    await get().refreshFlows();
    await get().refreshVoices(4, optimistic.kind);
  },

  removeInfra: async (id) => {
    set((s) => ({
      infra: s.infra.filter((i) => i.id !== id),
      selectedInfraId: s.selectedInfraId === id ? null : s.selectedInfraId,
    }));
    await api.deleteInfra(id);
    await get().reset();
    await get().refreshFlows();
  },

  step: async () => {
    const { metrics, infra, scenarios, sentiment, adoptionByZone } = get();
    const nextTick = (metrics?.tick ?? 0) + 1;
    const { impact } = applyScenarioState(infra, scenarios);
    const approval =
      (sentiment?.cityApprovalPct ?? 0.6) + impact.sentimentDelta * 0.05;

    // Phase 1: tick_start
    set((s) => ({
      metrics: s.metrics ? { ...s.metrics, tick: nextTick, hour: (6 + nextTick) % 24 } : s.metrics,
    }));

    // Phase 2: voices (staggered ~ mid-tick)
    const { data: newVoices } = await api.getVoices(
      3,
      infra,
      sentiment ?? { cityApprovalPct: approval, perZone: {} }
    );
    set((s) => ({ voices: [...newVoices, ...s.voices].slice(0, 40) }));

    // Phase 3: tick_complete — metrics + adoption spread
    const { data, live } = await api.stepSim(nextTick, infra);
    const demandMult = live ? 1 : impact.demandMultiplier; // backend already reflects scenarios
    const merged: SimMetrics = {
      ...data,
      tick: nextTick,
      hour: (6 + nextTick) % 24,
      approvalPct:
        data.approvalPct != null && live
          ? data.approvalPct
          : Math.min(1, Math.max(0, approval)),
      totalDemandKwh: Math.round(data.totalDemandKwh * demandMult),
    };
    // grow rooftop adoption a little each tick (policy + organic)
    const grow = 0.015 + impact.adoptionDelta * 0.05;
    const adopt = { ...adoptionByZone };
    for (const z of get().zones) {
      adopt[z.id] = Math.min(1, (adopt[z.id] ?? z.solarPotential * 0.2) + grow * z.solarPotential);
    }
    set((s) => ({
      metrics: merged,
      history: [...s.history.slice(-119), merged],
      adoptionByZone: adopt,
    }));

    // Per-zone sentiment moves each tick → trend sparklines + recolor + deltas.
    await get().refreshSentiment();

    // Narrate the tick (mock fallback when backend doesn't send `activity`).
    if (!(live && (data as any).activity)) {
      const zones = get().zones;
      const covDelta = (merged.coveragePct - (metrics?.coveragePct ?? 0)) * 100;
      const entries: { text: string; severity?: ActivitySeverity; zoneId?: string }[] = [];
      const flash: string[] = [];
      if (Math.abs(covDelta) >= 0.01)
        entries.push({
          text: `Renewable coverage ${covDelta >= 0 ? "+" : ""}${covDelta.toFixed(2)}% citywide`,
          severity: covDelta >= 0 ? "good" : "warn",
        });
      // a couple of zones with the strongest rooftop-adoption gains
      const gainers = [...zones]
        .filter((z) => (adopt[z.id] ?? 0) > 0.1)
        .sort((a, b) => (adopt[b.id] ?? 0) - (adopt[a.id] ?? 0))
        .slice(0, 2);
      for (const z of gainers) {
        entries.push({
          text: `Rooftop solar adoption rising in ${z.name}`,
          severity: "good",
          zoneId: z.id,
        });
        flash.push(z.id);
      }
      if (get().outageZones.length)
        entries.push({
          text: `${get().outageZones.length} zone(s) still affected by the active scenario`,
          severity: "warn",
        });
      logActivity(set, entries, merged.tick, merged.year, flash);
    }
  },

  reset: async () => {
    const { infra, scenarios } = get();
    const { impact } = applyScenarioState(infra, scenarios);
    const sent = get().sentiment?.cityApprovalPct ?? 0.62;
    const { data, live } = await api.resetSim(infra);
    const m: SimMetrics = {
      ...data,
      approvalPct: data.approvalPct != null && live ? data.approvalPct : sent,
      totalDemandKwh: Math.round(
        data.totalDemandKwh * (live ? 1 : impact.demandMultiplier)
      ),
    };
    set({ metrics: m, history: [m] });
  },

  play: () => {
    if (get().playing) return;
    set({ playing: true });
    playTimer = setInterval(() => {
      void get().step();
      const m = get().metrics;
      if (m && m.tick >= 60) get().pause();
    }, 1100);
  },

  pause: () => {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    set({ playing: false });
  },

  runOptimize: async (n = 5) => {
    set({ optimizing: true });
    const { infra } = get();
    const { data } = await api.optimize(n, infra);
    set({
      recommendations: data,
      optimizing: false,
      layers: { ...get().layers, recommendations: true },
    });
    get().pushToast(`${data.length} candidate sites recommended`, "info");
  },

  clearRecommendations: () => set({ recommendations: [] }),

  acceptRecommendation: async (r) => {
    set({ placeKind: r.kind });
    await get().addInfraAt(r.position);
    set((s) => ({
      recommendations: s.recommendations.filter((x) => x !== r),
    }));
  },

  // ---------------- v2 ----------------

  triggerScenario: async (type, zoneId) => {
    const { infra, metrics, scenarios, zones } = get();
    const { data: scenario } = await api.applyScenario(
      type,
      metrics?.tick ?? 0,
      infra,
      1,
      zoneId
    );
    const nextScenarios = [...scenarios, scenario].slice(-4);
    const { impact, nextInfra } = applyScenarioState(infra, nextScenarios);

    // Localize the visual effect when a zone is targeted: the cluster (target +
    // neighbours) is where crowds gather; darkening only for grid-loss events.
    let outage: Set<string>;
    let gathering: string[];
    if (zoneId) {
      const cluster = zoneCluster(zones, zoneId, 3);
      gathering = cluster;
      outage = GRID_LOSS_TYPES.has(scenario.type)
        ? new Set(cluster)
        : new Set();
    } else {
      outage = new Set(impact.outageZones);
      gathering = [...impact.outageZones];
    }
    set({
      scenarios: nextScenarios,
      infra: nextInfra,
      outageZones: [...outage],
      gatheringZones: gathering,
      lastTargetZoneId: zoneId ?? null,
    });
    get().pushToast(
      `${scenario.label} ${zones.find((z) => z.id === zoneId)?.name
        ? `→ ${zones.find((z) => z.id === zoneId)!.name}`
        : "(city-wide)"}`,
      ["blackout", "earthquake", "ice_storm"].includes(scenario.type) ? "bad" : "warn"
    );
    // Camera "follow the action": fly to a targeted zone, or pull back for city-wide.
    {
      const tz = zoneId ? zones.find((z) => z.id === zoneId) : undefined;
      if (tz)
        set({ flyTo: { target: tz.centroid, zoom: 13.4, pitch: 55, nonce: Date.now() } });
      else
        set({
          flyTo: { target: [-79.38, 43.65], zoom: 11.6, pitch: 45, nonce: Date.now() },
        });
    }
    // Narrate the event
    {
      const m0 = get().metrics;
      const zoneName = zones.find((z) => z.id === zoneId)?.name;
      const sev: ActivitySeverity = ["blackout", "earthquake", "ice_storm"].includes(
        scenario.type
      )
        ? "bad"
        : "warn";
      logActivity(
        set,
        [
          {
            text: `${scenario.label} ${zoneName ? `hit ${zoneName}` : "struck city-wide"}${
              outage.size ? ` — ${outage.size} zone(s) affected` : ""
            }`,
            severity: sev,
            zoneId,
          },
        ],
        m0?.tick ?? 0,
        m0?.year ?? 2026,
        [...gathering]
      );
    }
    // If a chat is active, surface the event AND notify the agent over the WS so
    // it observes the scenario and reacts in-character (real-time).
    if (session || get().chat.length) {
      const zoneName = zones.find((z) => z.id === zoneId)?.name;
      set((s) => ({
        chat: [
          ...s.chat,
          {
            id: cid(),
            role: "system",
            text: `⚡ Scenario fired: ${scenario.label}${
              zoneName ? ` → ${zoneName}` : " (city-wide)"
            }. Agents & grid are reacting…`,
          },
        ],
      }));
      // WS action so the agent reasons about it (no-op if WS not live)
      session?.fireScenario(scenario.type, zoneId, 1);
    }
    await get().reset();
    await get().refreshSentiment();
    await get().refreshFlows();
    await get().refreshVoices(6, scenario.type);
  },

  resetSession: async () => {
    get().stopPlanner();
    get().pause();
    await api.resetSession();
    const infra = api.seedInfra();
    const { data: sentiment } = await api.getSentiment(infra);
    const { data: flows } = await api.getFlows(infra);
    const { data: metrics } = await api.resetSim(infra);
    const { data: voices } = await api.getVoices(8, infra, sentiment);
    set({
      infra,
      scenarios: [],
      outageZones: [],
      adoptionByZone: {},
      recommendations: [],
      sentiment,
      flows,
      voices,
      metrics: { ...metrics, approvalPct: sentiment.cityApprovalPct },
      history: [{ ...metrics, approvalPct: sentiment.cityApprovalPct }],
      planner: { events: [], running: false, awaitingApproval: false, summary: null },
      chat: [],
      chatAwaiting: false,
      chatBusy: false,
      selectedInfraId: null,
      scenarioTargeting: false,
      targetZoneId: null,
      gatheringZones: [],
      lastTargetZoneId: null,
      activity: [],
      flashZones: [],
      approvalHistory: {},
      approvalDeltas: [],
      spawnTimes: {},
    });
    get().pushToast("Session reset", "info");
  },

  refreshSentiment: async () => {
    const { infra, scenarios } = get();
    const bias = scenarioImpact(scenarios).sentimentDelta;
    const { data } = await api.getSentiment(infra, bias);
    recordApproval(set, get, data.perZone);
    set((s) => ({
      sentiment: data,
      metrics: s.metrics
        ? { ...s.metrics, approvalPct: data.cityApprovalPct }
        : s.metrics,
    }));
  },

  refreshVoices: async (n = 6, context) => {
    const { infra, sentiment } = get();
    const { data } = await api.getVoices(
      n,
      infra,
      sentiment ?? { cityApprovalPct: 0.6, perZone: {} },
      context
    );
    set((s) => ({ voices: [...data, ...s.voices].slice(0, 40) }));
  },

  refreshFlows: async () => {
    const { infra } = get();
    const { data } = await api.getFlows(infra);
    set({ flows: data });
  },

  startPlanner: (mode) => {
    session ??= attachSession(set, get);
    const goal =
      mode === "step"
        ? "Plan the city step by step — propose one action at a time for me to approve."
        : "Auto-plan the whole city: maximize renewable coverage and energy equity within budget.";
    set((s) => ({
      chat: [...s.chat, { id: cid(), role: "user", text: goal }],
      chatBusy: true,
    }));
    session.send(goal, { mode });
  },

  stopPlanner: () => {
    session?.close();
    session = null;
    set({ chatBusy: false, chatAwaiting: false });
  },

  approveStep: () => {
    set({ chatAwaiting: false });
    session?.approve();
  },

  rejectStep: () => {
    set({ chatAwaiting: false });
    session?.reject();
  },

  // ---------------- juice: toasts ----------------

  pushToast: (text, kind = "info") => {
    const id = aid();
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }].slice(-4) }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      3600
    );
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ---------------- v3 chat / targeting ----------------

  sendChat: (text) => {
    const t = text.trim();
    if (!t) return;
    session ??= attachSession(set, get);
    set((s) => ({
      chat: [...s.chat, { id: cid(), role: "user", text: t }],
      chatBusy: true,
    }));
    session.send(t, { mode: get().placementMode === "step" ? "step" : "auto" });
  },

  clearChat: () => set({ chat: [], chatAwaiting: false }),

  setScenarioTargeting: (on, type) =>
    set({
      scenarioTargeting: on,
      pendingScenarioType: type ?? get().pendingScenarioType,
      mode: on ? "select" : get().mode,
      targetZoneId: on ? get().targetZoneId : null,
    }),

  setTargetZone: (zoneId) => set({ targetZoneId: zoneId }),

  setPendingScenarioType: (type) => set({ pendingScenarioType: type }),

  fireScenarioAtTarget: () => {
    const { pendingScenarioType, targetZoneId } = get();
    if (!targetZoneId) return;
    set({ scenarioTargeting: false, targetZoneId: null });
    void get().triggerScenario(pendingScenarioType, targetZoneId);
  },

  // One-gesture: click a zone while targeting -> fires there immediately.
  fireScenarioAtZone: (zoneId) => {
    const { pendingScenarioType } = get();
    set({ scenarioTargeting: false, targetZoneId: null });
    void get().triggerScenario(pendingScenarioType, zoneId);
  },

  // ---------------- onboarding / layout / guided demo ----------------
  // (the window hook below exposes this store for E2E/screenshot tooling)

  dismissWelcome: () => set({ showWelcome: false }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  toggleLegend: () => set((s) => ({ showLegend: !s.showLegend })),
  toggleExtrude: () => set((s) => ({ extrude: !s.extrude })),

  stopDemo: () => {
    demoAbort = true;
    set((s) => ({ demo: { ...s.demo, running: false, caption: "" } }));
  },

  runGuidedDemo: async () => {
    demoAbort = false;
    const sleep = (ms: number) =>
      new Promise<void>((res) => setTimeout(res, ms));
    const aborted = () => demoAbort;
    const cap = (step: number, caption: string) =>
      set({ demo: { running: true, step, total: 6, caption } });

    set({ showWelcome: false });
    // fresh slate
    await get().resetSession();
    get().setLayers({
      equity: false,
      demand: false,
      sentiment: true,
      flows: true,
      infra: true,
      agents: false,
    });

    // 1 — equity gap
    cap(1, "Toronto's energy-equity gap — darker red zones carry the heaviest energy burden.");
    get().setLayers({ equity: true, sentiment: false });
    await sleep(4200);
    if (aborted()) return;

    // 2 — demand
    cap(2, "Where electricity demand concentrates across the city.");
    get().setLayers({ equity: false, demand: true });
    await sleep(4200);
    if (aborted()) return;

    // 3 — AI planner places a mix
    cap(3, "An AI planning agent sites a mix of solar, wind, battery & microgrids — prioritizing high-burden zones.");
    get().setPlacementMode("auto");
    await sleep(9000);
    if (aborted()) return;
    get().setPlacementMode("manual");

    // 4 — play: flows + adoption
    cap(4, "Press play: clean energy flows to neighbourhoods and rooftop solar adoption spreads.");
    get().setLayers({ demand: false, flows: true, sentiment: true, agents: true });
    get().play();
    await sleep(7000);
    if (aborted()) {
      get().pause();
      return;
    }

    // 5 — blackout
    cap(5, "Now a stress test: a city-wide blackout strikes.");
    await get().triggerScenario("blackout");
    await sleep(4500);
    if (aborted()) {
      get().pause();
      return;
    }

    // 6 — resilience
    cap(6, "Microgrid-served zones stay lit — resilience where it matters most. That's WattIf.");
    get().pause();
    await sleep(5000);

    set({ demo: { running: false, step: 0, total: 6, caption: "" } });
  },
}));

// Dev-only hook so E2E/screenshot tooling can drive exact UI states.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { wattifStore: typeof useStore }).wattifStore = useStore;
}
