import { create } from "zustand";
import type {
  ActivityItem,
  ActivitySeverity,
  Agent,
  AgentVoice,
  ChatItem,
  CityEvent,
  EventPoint,
  ConstraintZone,
  ExistingInfra,
  Facility,
  Flow,
  Infra,
  InfraKind,
  LngLat,
  PlacementMode,
  PlannerEvent,
  Project,
  Proposal,
  ProposalInfrastructure,
  Recommendation,
  Scenario,
  ScenarioType,
  Sentiment,
  SimMetrics,
  SimulationSnapshot,
  SitingPriorityZone,
  CohortConcern,
  CohortProfile,
  ProposalReport,
  SyntheticResidentReaction,
  DatasetEvidenceChunk,
  EvidenceSearchResult,
  UploadedDataset,
  UploadedInfrastructureAsset,
  UploadedDatasetSummary,
  Zone,
} from "@/types";
import {
  INFRA_PRESETS,
  MODEL_URL,
  infraToPersisted,
  isBuiltInInfraKind,
  snapshotItemToInfra,
} from "@/types";
import * as api from "@/api/client";
import { nearestZone, scenarioImpact } from "@/data/mock";
import {
  loadOperatorRecommendationFlag,
  markOperatorRecommendationReady,
  noteOperatorRecommendation,
} from "@/lib/proposalReadiness";
import { makeLandTest, sampleInside } from "@/lib/geo";

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
  | "flood"
  | "district"
  | "rooftops"
  | "priority";

export type ToolMode = "select" | "place";
export type PersistenceMode = "memory" | "supabase-no-proposal" | "supabase-proposal";

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

  // Master copies for region-based filtering
  allZones: Zone[];
  allAgents: Agent[];
  allSampledAgents: Agent[];
  allFacilities: Facility[];
  allExistingInfra: ExistingInfra[];
  allInfra: Infra[];

  selectedRegion: string;
  showRegionSelector: boolean;
  mainView: "map" | "events"; // navbar-level view switch
  regionCursorMode: boolean;
  hoveredRegion: string | null;
  setSelectedRegion: (region: string) => void;
  setRegionCursorMode: (on: boolean) => void;
  setHoveredRegion: (region: string | null) => void;

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
  districtEnergy: Record<string, api.DistrictEnergyZone>; // existing district energy
  sbei: api.Sbei | null; // city-wide emissions context
  sitingPriority: SitingPriorityZone[]; // ranked "where to build next"
  equityWeight: number; // 0..1 weight for the build-priority ranking
  events: CityEvent[]; // city-events timeline (placements + scenarios)
  eventSeries: EventPoint[]; // approval/coverage over ticks for the sparkline
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
  removalTimes: Record<string, number>; // infraId -> ms when removed (shrink-out anim)
  toasts: { id: string; text: string; kind: "info" | "good" | "warn" | "bad" }[];

  // living world: a sampled set of agents that move + act
  sampledAgents: Agent[]; // ~320 agents, .position = home
  agentTargets: Record<string, LngLat>; // agentId -> where they're streaming to
  agentMobilizedAt: number; // ms when the current mobilization began

  // agent communication (map ↔ voices-log linking)
  selectedVoiceId: string | null;
  focusVoiceNonce: number; // bumps to pull the Voices tab into focus

  // distributed rooftop solar + programs
  rooftopPoints: Record<string, LngLat[]>; // per-zone candidate rooftop sites
  programs: { type: string; label: string; zones: string[]; startedTick: number }[];
  // subject-tied sentiment readout ("X% support this <thing> here")
  subjectApproval:
  | { label: string; support: number; oppose: number; neutral: number }
  | null;

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
  /** From GET /api/health when live; drives honesty labels in TopBar. */
  backendHealth: api.HealthMeta | null;

  // persistence
  projects: Project[];
  proposals: Proposal[];
  selectedProjectId: string | null;
  selectedProposalId: string | null;
  proposalInfrastructure: ProposalInfrastructure[];
  snapshots: SimulationSnapshot[];
  latestSnapshot: SimulationSnapshot | null;
  compareSnapshotId: string | null;
  restoringSnapshot: boolean;
  persistedInfraIds: Record<string, string>;
  persistenceMode: PersistenceMode;
  persistenceLoading: boolean;
  persistenceError: string | null;
  datasets: UploadedDataset[];
  selectedDatasetId: string | null;
  datasetSummaries: UploadedDatasetSummary[];
  datasetUploading: boolean;
  datasetError: string | null;
  existingInfrastructureAssets: UploadedInfrastructureAsset[];
  existingInfrastructureError: string | null;
  cohorts: CohortProfile[];
  cohortConcerns: CohortConcern[];
  cohortGenerating: boolean;
  cohortError: string | null;
  syntheticResidentReactions: SyntheticResidentReaction[];
  residentReactionsGenerating: boolean;
  residentReactionsError: string | null;
  evidenceChunks: DatasetEvidenceChunk[];
  evidenceSearchResults: EvidenceSearchResult[];
  evidenceLoading: boolean;
  evidenceError: string | null;
  decisionMemo: ProposalReport | null;
  decisionMemoLoading: boolean;
  decisionMemoError: string | null;
  operatorRecommendationReady: boolean;
  loadProjects: () => Promise<void>;
  loadDatasets: () => Promise<void>;
  loadExistingInfrastructure: () => Promise<void>;
  uploadDataset: (file: File, datasetType?: string) => Promise<void>;
  selectDataset: (datasetId: string | null) => void;
  deleteDataset: (datasetId: string) => Promise<void>;
  loadCohortConcerns: () => Promise<void>;
  generateCohortConcerns: () => Promise<void>;
  deleteCohortConcern: (concernId: string) => Promise<void>;
  loadSyntheticResidentReactions: () => Promise<void>;
  generateSyntheticResidentReactions: () => Promise<void>;
  deleteResidentReaction: (reactionId: string) => Promise<void>;
  loadEvidenceChunks: () => Promise<void>;
  searchEvidence: (query: string) => Promise<void>;
  generateDecisionMemo: () => Promise<void>;
  clearDecisionMemo: () => void;
  createProject: (name: string) => Promise<void>;
  selectProject: (projectId: string | null) => Promise<void>;
  createProposal: (name: string) => Promise<void>;
  selectProposal: (proposalId: string | null) => Promise<void>;
  saveSnapshot: () => Promise<void>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  selectCompareSnapshot: (snapshotId: string | null) => void;

  // actions
  init: () => Promise<void>;
  refetchLive: () => Promise<void>;
  toggleLayer: (k: LayerKey) => void;
  setLayers: (partial: Partial<Record<LayerKey, boolean>>) => void;
  setPrimaryOverlay: (
    k: "equity" | "sentiment" | "demand" | "flood" | "priority" | "none"
  ) => void;
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

  // agent communication
  selectVoiceFromMap: (id: string) => void; // bubble click → focus log entry
  selectVoiceFromLog: (id: string) => void; // log click → fly camera + pop bubble
  clearSelectedVoice: () => void;

  // programs (rebates/incentives) — drive distributed rooftop adoption
  launchProgram: (type: string, zoneIds?: string[]) => void;

  // build-priority overlay
  setEquityWeight: (w: number) => void;
  refreshSitingPriority: () => Promise<void>;

  // events timeline
  loadEvents: () => Promise<void>;
  traceEvent: (zoneIds: string[]) => void;

  // v3 actions
  sendChat: (
    text: string,
    opts?: { intent?: "concern_recommendation" }
  ) => void;
  clearChat: () => void;
  setScenarioTargeting: (on: boolean, type?: ScenarioType | "random") => void;
  setTargetZone: (zoneId: string | null) => void;
  setPendingScenarioType: (type: ScenarioType | "random") => void;
  fireScenarioAtTarget: () => void;
  fireScenarioAtZone: (zoneId: string) => void;

  // onboarding / layout
  dismissWelcome: () => void;
  setMainView: (v: "map" | "events") => void;
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
function resetPlannerSession() {
  session?.close();
  session = null;
}
let chatSeq = 0;
const cid = () => `c${chatSeq++}`;
let actSeq = 0;
const aid = () => `a${actSeq++}`;
const PROJECT_KEY = "wattif:selectedProjectId";
const PROPOSAL_KEY = "wattif:selectedProposalId";
const stored = (key: string) =>
  typeof window === "undefined" ? null : window.localStorage.getItem(key);
const persistSelection = (key: string, value: string | null) => {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(key, value);
  else window.localStorage.removeItem(key);
};
const persistenceModeFor = (
  health: api.HealthMeta | null,
  selectedProposalId: string | null
): PersistenceMode => {
  if (health?.persistenceProvider !== "supabase") return "memory";
  return selectedProposalId ? "supabase-proposal" : "supabase-no-proposal";
};
const persistedToInfra = (row: ProposalInfrastructure): Infra | null => {
  if (!isBuiltInInfraKind(row.kind) || !row.position) return null;
  const meta = row.metadata ?? {};
  const status = typeof meta.status === "string" ? meta.status : "planned";
  return {
    id: typeof meta.clientId === "string" ? meta.clientId : `proposal-infra-${row.id}`,
    kind: row.kind,
    position: row.position,
    capacityKw:
      typeof row.capacityKw === "number"
        ? row.capacityKw
        : INFRA_PRESETS[row.kind].capacityKw,
    costCad: typeof meta.costCad === "number" ? meta.costCad : INFRA_PRESETS[row.kind].costCad,
    modelUrl: typeof meta.modelUrl === "string" ? meta.modelUrl : MODEL_URL[row.kind],
    status: status === "active" || status === "damaged" ? status : "planned",
    placedBy: meta.placedBy === "ai" ? "ai" : "you",
    zoneId: row.zoneId ?? undefined,
  };
};
const hashStr = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
};
let vidSeq = 0;
const tagVoices = (vs: AgentVoice[]): AgentVoice[] =>
  vs.map((v) => (v.id ? v : { ...v, id: `v${vidSeq++}` }));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// approval (0..1) → support/oppose/neutral % toward a specific subject
const subjectSplit = (base: number) => {
  const support = Math.round(Math.max(5, Math.min(92, base * 100)));
  const oppose = Math.round(Math.max(4, (1 - base) * 55));
  return { support, oppose, neutral: Math.max(0, 100 - support - oppose) };
};
// Normalize a backend response (counts at any scale, or just an approval 0..1)
// into support/oppose/neutral percentages summing ~100.
const toSplit = (
  approval?: number,
  s?: number,
  o?: number,
  n?: number
): { support: number; oppose: number; neutral: number } => {
  if (s != null && o != null && n != null) {
    const tot = s + o + n || 1;
    return {
      support: Math.round((s / tot) * 100),
      oppose: Math.round((o / tot) * 100),
      neutral: Math.round((n / tot) * 100),
    };
  }
  return subjectSplit(approval ?? 0.5);
};
const PROGRAM_LABEL: Record<string, string> = {
  rooftop_solar_rebate: "Rooftop solar rebate",
  ev_incentive: "EV charging incentive",
  retrofit_grant: "Home retrofit grant",
};
// how a given infra kind shifts local support (wind = noise/visual concerns, etc.)
const KIND_BIAS: Record<InfraKind, number> = {
  solar: 0.06,
  wind: -0.12,
  battery: 0.08,
  microgrid: 0.12,
  ev_charger: 0.09,
};

export const getZoneRegion = (zoneName: string, centroid?: [number, number]): string => {
  if (centroid) {
    const [lng, lat] = centroid;
    if (lng > -79.30) return "Scarborough";
    if (lng < -79.49) return "Etobicoke";
    if (lat > 43.72) return "North York";
    if (lng > -79.358) return "East Toronto";
    if (lng < -79.425) return "West Toronto";
    if (lat > 43.672) return "Midtown";
    return "Downtown";
  }

  const name = zoneName.toLowerCase();
  if (name.includes("scarborough") || name.includes("agincourt") || name.includes("malvern")) return "Scarborough";
  if (name.includes("north york") || name.includes("willowdale") || name.includes("don mills") || name.includes("thorncliffe")) return "North York";
  if (name.includes("etobicoke") || name.includes("rexdale") || name.includes("mimico")) return "Etobicoke";
  if (name.includes("weston") || name.includes("junction") || name.includes("high park") || name.includes("roncesvalles") || name.includes("bloor west")) return "West Toronto";
  if (name.includes("riverdale") || name.includes("leslieville") || name.includes("beaches") || name.includes("east york")) return "East Toronto";
  if (name.includes("rosedale") || name.includes("forest hill") || name.includes("davisville") || name.includes("leaside") || name.includes("st. clair")) return "Midtown";
  return "Downtown";
};

const TORONTO_VIEW = {
  target: [-79.385, 43.715] as LngLat,
  zoom: 11.2,
  pitch: 40,
  bearing: -10,
};

function getRegionFlyTo(region: string, allZones: Zone[]): FlyTo {
  const isAll = region === "All" || region === "All Toronto";
  if (isAll) {
    return { ...TORONTO_VIEW, nonce: Date.now() };
  }

  const filteredZones = allZones.filter((z) => getZoneRegion(z.name, z.centroid) === region);
  if (filteredZones.length === 0) return null;

  const avgLng = filteredZones.reduce((sum, z) => sum + z.centroid[0], 0) / filteredZones.length;
  const avgLat = filteredZones.reduce((sum, z) => sum + z.centroid[1], 0) / filteredZones.length;

  return {
    target: [avgLng, avgLat],
    zoom: 12.5,
    nonce: Date.now(),
  };
}
export const getHaversineDistance = (pos1: [number, number], pos2: [number, number]): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((pos2[1] - pos1[1]) * Math.PI) / 180;
  const dLng = ((pos2[0] - pos1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pos1[1] * Math.PI) / 180) *
      Math.cos((pos2[1] * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const INFRA_CLEARANCES: Record<string, number> = {
  wind: 200,
  microgrid: 120,
  battery: 60,
  solar: 40,
  ev_charger: 30,
};

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
  type TurnTrack = { id: string | null; finalAppended: boolean };
  let turn: TurnTrack = { id: null, finalAppended: false };

  const resetTurn = () => {
    turn = { id: null, finalAppended: false };
  };

  const appendEvent = (e: PlannerEvent) => {
    set((s) => ({ chat: [...s.chat, { id: cid(), role: "event", event: e }] }));
  };

  const handleEvent = (e: PlannerEvent) => {
    if (e.type === "turn_start") {
      turn = { id: e.turnId ?? null, finalAppended: false };
      return;
    }

    // Side effects that must run even when we skip chat append.
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
            text: `AI placed a ${e.infra.kind} (${e.infra.capacityKw} kW)${zName ? ` in ${zName}` : ""
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
      void get().refreshSitingPriority();
    }
    if (e.type === "tool_result" && e.name === "launch_program") {
      const r = (e.result ?? {}) as { program?: string; zones?: string[] };
      if (r.program) get().launchProgram(r.program, r.zones);
    }
    if (e.type === "recommendation") {
      const pid = get().selectedProposalId;
      if (e.recommendation?.summary?.trim() && noteOperatorRecommendation(pid, e.recommendation)) {
        set({ operatorRecommendationReady: true });
      }
    }

    if (e.type === "done") {
      set({ chatBusy: false, chatAwaiting: false });
      if (e.recommendation?.summary?.trim()) {
        const pid = get().selectedProposalId;
        if (noteOperatorRecommendation(pid, e.recommendation)) {
          set({ operatorRecommendationReady: true });
        }
      }
      if (!turn.finalAppended && e.summary?.trim()) {
        appendEvent(e);
        turn.finalAppended = true;
        get().pushToast(e.summary, "good");
      } else if (!turn.finalAppended) {
        get().pushToast("AI planning complete", "good");
      }
      void get().refreshVoices(5, "ai-plan");
      return;
    }

    if (e.type === "error") {
      set({ chatBusy: false, chatAwaiting: false });
      if (!turn.finalAppended) {
        appendEvent(e);
        turn.finalAppended = true;
      }
      get().pushToast(e.message || "Planner error", "warn");
      return;
    }

    if (e.type === "answer" || e.type === "recommendation") {
      if (turn.finalAppended) return;
      turn.finalAppended = true;
      appendEvent(e);
      return;
    }

    // Hide low-level tool JSON from chat; keep status/thought/placement traces.
    if (e.type === "tool_result") return;

    appendEvent(e);
  };

  return api.createPlannerSession({
    infraProvider: () => get().infra,
    facilitiesProvider: () =>
      get().facilities.map((f) => ({
        kind: f.kind,
        position: f.position,
        name: f.name,
      })),
    projectIdProvider: () => get().selectedProjectId,
    proposalIdProvider: () => get().selectedProposalId,
    onEvent: handleEvent,
    onStatus: (open) => set({ chatConnected: open }),
    onBusy: (busy) =>
      set((s) => ({ chatBusy: busy, chatAwaiting: busy ? s.chatAwaiting : false })),
    onTurnReset: resetTurn,
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

  allZones: [],
  allAgents: [],
  allSampledAgents: [],
  allFacilities: [],
  allExistingInfra: [],
  allInfra: [],

  selectedRegion: "All",
  showRegionSelector: true,
  mainView: "map",
  regionCursorMode: false,
  hoveredRegion: null,

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
  districtEnergy: {},
  sbei: null,
  sitingPriority: [],
  equityWeight: 0.4,
  events: [],
  eventSeries: [],
  gatheringZones: [],
  lastTargetZoneId: null,

  activity: [],
  flashZones: [],
  approvalHistory: {},
  approvalDeltas: [],
  spawnTimes: {},
  removalTimes: {},
  toasts: [],
  sampledAgents: [],
  agentTargets: {},
  agentMobilizedAt: 0,
  selectedVoiceId: null,
  focusVoiceNonce: 0,
  rooftopPoints: {},
  programs: [],
  subjectApproval: null,

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
    agents: true, // "people" — sampled animated agents, on by default (living world)
    infra: true,
    recommendations: true,
    flows: true,
    sentiment: true,
    facilities: false, // off by default — too many (583); shown contextually on events
    existing: true,
    constraints: true,
    flood: true, // flood-risk overlay (lights up when data-2 ships it)
    district: true, // existing district-energy service area
    rooftops: true, // distributed rooftop-solar glints (per-home adoption)
    priority: false, // build-priority choropleth (opt-in via overlay switcher)
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
  backendHealth: null,
  projects: [],
  proposals: [],
  selectedProjectId: stored(PROJECT_KEY),
  selectedProposalId: stored(PROPOSAL_KEY),
  proposalInfrastructure: [],
  snapshots: [],
  latestSnapshot: null,
  compareSnapshotId: null,
  restoringSnapshot: false,
  persistedInfraIds: {},
  persistenceMode: "memory",
  persistenceLoading: false,
  persistenceError: null,
  datasets: [],
  selectedDatasetId: null,
  datasetSummaries: [],
  datasetUploading: false,
  datasetError: null,
  existingInfrastructureAssets: [],
  existingInfrastructureError: null,
  cohorts: [],
  cohortConcerns: [],
  cohortGenerating: false,
  cohortError: null,
  syntheticResidentReactions: [],
  residentReactionsGenerating: false,
  residentReactionsError: null,
  evidenceChunks: [],
  evidenceSearchResults: [],
  evidenceLoading: false,
  evidenceError: null,
  decisionMemo: null,
  decisionMemoLoading: false,
  decisionMemoError: null,
  operatorRecommendationReady: loadOperatorRecommendationFlag(stored(PROPOSAL_KEY) ?? ""),

  clearDecisionMemo: () => {
    set({ decisionMemo: null, decisionMemoError: null });
  },

  generateDecisionMemo: async () => {
    const { selectedProposalId, backendHealth } = get();
    if (backendHealth?.persistenceProvider !== "supabase" || !selectedProposalId) {
      set({
        decisionMemo: null,
        decisionMemoError: "Supabase persistence is not configured",
      });
      return;
    }
    set({ decisionMemoLoading: true, decisionMemoError: null });
    const res = await api.getProposalReport(selectedProposalId);
    if (!res.ok) {
      set({
        decisionMemoLoading: false,
        decisionMemoError: res.unavailable
          ? "Supabase persistence is not configured"
          : res.error ?? "Could not generate decision memo",
      });
      get().pushToast(res.error ?? "Decision memo generation failed", "warn");
      return;
    }
    set({
      decisionMemo: res.data,
      decisionMemoLoading: false,
      decisionMemoError: null,
      operatorRecommendationReady:
        get().operatorRecommendationReady || res.data.hasOperatorRecommendation,
    });
    if (res.data.hasOperatorRecommendation && selectedProposalId) {
      markOperatorRecommendationReady(selectedProposalId);
    }
    get().pushToast("Decision memo generated", "good");
  },

  loadCohortConcerns: async () => {
    const { selectedProjectId, backendHealth } = get();
    if (backendHealth?.persistenceProvider !== "supabase" || !selectedProjectId) {
      set({ cohorts: [], cohortConcerns: [], cohortError: null });
      return;
    }
    const [cohortRes, concernRes] = await Promise.all([
      api.listProjectCohorts(selectedProjectId),
      api.listProjectConcerns(selectedProjectId),
    ]);
    if (!cohortRes.ok) {
      set({
        cohortError: cohortRes.unavailable
          ? "Supabase persistence is not configured"
          : cohortRes.error ?? "Could not load cohort concerns",
      });
      return;
    }
    if (!concernRes.ok) {
      set({
        cohortError: concernRes.unavailable
          ? "Supabase persistence is not configured"
          : concernRes.error ?? "Could not load cohort concerns",
      });
      return;
    }
    set({
      cohorts: cohortRes.data,
      cohortConcerns: concernRes.data,
      cohortError: null,
    });
  },

  generateCohortConcerns: async () => {
    const { selectedProjectId, selectedProposalId } = get();
    if (!selectedProjectId) return;
    set({ cohortGenerating: true, cohortError: null });
    const res = await api.generateCohorts(selectedProjectId, selectedProposalId);
    if (res.ok === false) {
      set({
        cohortGenerating: false,
        cohortError: res.unavailable
          ? "Supabase persistence is not configured"
          : res.error ?? "Generation failed",
      });
      get().pushToast(res.error ?? "Could not generate concerns", "warn");
      return;
    }
    set({
      cohorts: res.data.cohorts,
      cohortConcerns: res.data.concerns,
      cohortGenerating: false,
      datasetSummaries: get().datasetSummaries,
    });
    get().pushToast(
      `Generated ${res.data.concerns.length} concern(s) from ${res.data.datasetsUsed} dataset(s)`,
      "good"
    );
    void get().loadCohortConcerns();
  },

  deleteCohortConcern: async (concernId) => {
    const res = await api.deleteConcern(concernId);
    if (res.ok === false) {
      set({
        cohortError: res.unavailable
          ? "Supabase persistence is not configured"
          : res.error ?? "Delete failed",
      });
      return;
    }
    set((s) => ({
      cohortConcerns: s.cohortConcerns.filter((c) => c.id !== concernId),
    }));
  },

  loadSyntheticResidentReactions: async () => {
    const { selectedProjectId, selectedProposalId, backendHealth } = get();
    if (backendHealth?.persistenceProvider !== "supabase" || !selectedProjectId) {
      set({ syntheticResidentReactions: [], residentReactionsError: null });
      return;
    }
    const res = selectedProposalId
      ? await api.fetchProposalResidentReactions(selectedProposalId)
      : await api.fetchProjectResidentReactions(selectedProjectId);
    if (!res.ok) {
      set({
        residentReactionsError: res.unavailable
          ? "Supabase persistence is not configured"
          : res.error ?? "Could not load synthetic resident reactions",
      });
      return;
    }
    set({
      syntheticResidentReactions: res.data,
      residentReactionsError: null,
    });
  },

  generateSyntheticResidentReactions: async () => {
    const { selectedProposalId } = get();
    if (!selectedProposalId) return;
    set({ residentReactionsGenerating: true, residentReactionsError: null });
    const res = await api.generateProposalResidentReactions(selectedProposalId);
    if (!res.ok) {
      set({
        residentReactionsGenerating: false,
        residentReactionsError: res.unavailable
          ? "Supabase persistence is not configured"
          : res.error ?? "Generation failed",
      });
      get().pushToast(res.error ?? "Could not generate reactions", "warn");
      return;
    }
    set({
      syntheticResidentReactions: res.data.reactions,
      residentReactionsGenerating: false,
      residentReactionsError: null,
    });
    get().pushToast(
      `Generated ${res.data.count} synthetic reaction(s) via ${res.data.provider}`,
      "good"
    );
    void get().loadSyntheticResidentReactions();
  },

  deleteResidentReaction: async (reactionId) => {
    const res = await api.deleteResidentReaction(reactionId);
    if (res.ok === false) {
      set({
        residentReactionsError: res.unavailable
          ? "Supabase persistence is not configured"
          : res.error ?? "Delete failed",
      });
      return;
    }
    set((s) => ({
      syntheticResidentReactions: s.syntheticResidentReactions.filter(
        (r) => r.id !== reactionId
      ),
    }));
  },

  loadEvidenceChunks: async () => {
    const { selectedProjectId, selectedProposalId, backendHealth } = get();
    if (backendHealth?.persistenceProvider !== "supabase" || !selectedProjectId) {
      set({ evidenceChunks: [], evidenceSearchResults: [], evidenceError: null });
      return;
    }
    set({ evidenceLoading: true, evidenceError: null });
    const res = selectedProposalId
      ? await api.fetchProposalEvidenceChunks(selectedProposalId)
      : await api.fetchProjectEvidenceChunks(selectedProjectId);
    if (!res.ok) {
      set({
        evidenceLoading: false,
        evidenceError: res.unavailable
          ? "Supabase persistence is not configured"
          : res.error ?? "Could not load evidence snippets",
      });
      return;
    }
    set({
      evidenceChunks: res.data,
      evidenceLoading: false,
      evidenceError: null,
    });
  },

  searchEvidence: async (query) => {
    const { selectedProjectId, selectedProposalId, backendHealth } = get();
    const q = query.trim();
    if (!q || backendHealth?.persistenceProvider !== "supabase" || !selectedProjectId) {
      set({ evidenceSearchResults: [] });
      return;
    }
    set({ evidenceLoading: true, evidenceError: null });
    const res = selectedProposalId
      ? await api.searchProposalEvidence(selectedProposalId, q)
      : await api.searchProjectEvidence(selectedProjectId, q);
    if (!res.ok) {
      set({
        evidenceLoading: false,
        evidenceError: res.error ?? "Evidence search failed",
        evidenceSearchResults: [],
      });
      return;
    }
    set({
      evidenceSearchResults: res.data,
      evidenceLoading: false,
      evidenceError: null,
    });
  },

  loadDatasets: async () => {
    const { selectedProjectId, selectedProposalId, backendHealth } = get();
    if (backendHealth?.persistenceProvider !== "supabase" || !selectedProjectId) {
      set({ datasets: [], datasetSummaries: [], datasetError: null });
      return;
    }
    const merged = new Map<string, UploadedDataset>();
    const projectRes = await api.listProjectDatasets(selectedProjectId);
    if (projectRes.ok === false) {
      set({
        datasets: [],
        datasetSummaries: [],
        datasetError: projectRes.unavailable
          ? "Supabase persistence is not configured"
          : projectRes.error ?? "Could not load datasets",
      });
      return;
    }
    for (const d of projectRes.data) merged.set(d.id, d);
    if (selectedProposalId) {
      const propRes = await api.listProposalDatasets(selectedProposalId);
      if (propRes.ok) {
        for (const d of propRes.data) merged.set(d.id, d);
      }
    }
    const ctxRes = await api.getProjectDatasetContext(selectedProjectId);
    set({
      datasets: [...merged.values()],
      datasetSummaries: ctxRes.ok ? ctxRes.data : [],
      datasetError: null,
      selectedDatasetId: get().selectedDatasetId,
    });
    void get().loadCohortConcerns();
    void get().loadExistingInfrastructure();
  },

  loadExistingInfrastructure: async () => {
    const { selectedProjectId, selectedProposalId, backendHealth } = get();
    if (backendHealth?.persistenceProvider !== "supabase" || !selectedProjectId) {
      set({ existingInfrastructureAssets: [], existingInfrastructureError: null });
      return;
    }
    const res = selectedProposalId
      ? await api.listProposalExistingInfrastructure(selectedProposalId)
      : await api.listProjectExistingInfrastructure(selectedProjectId);
    if (!res.ok) {
      set({
        existingInfrastructureError: res.unavailable
          ? "Supabase persistence is not configured"
          : res.error ?? "Could not load uploaded existing infrastructure",
        existingInfrastructureAssets: [],
      });
      return;
    }
    set({
      existingInfrastructureAssets: res.data,
      existingInfrastructureError: null,
    });
  },

  uploadDataset: async (file, datasetType) => {
    const { selectedProjectId, selectedProposalId } = get();
    if (!selectedProjectId && !selectedProposalId) {
      get().pushToast("Select a project first", "warn");
      return;
    }
    set({ datasetUploading: true, datasetError: null });
    const res = await api.uploadDataset({
      file,
      projectId: selectedProjectId,
      proposalId: selectedProposalId,
      datasetType,
    });
    if (res.ok === false) {
      set({
        datasetUploading: false,
        datasetError: res.unavailable
          ? "Supabase persistence is not configured"
          : res.error ?? "Upload failed",
      });
      get().pushToast(res.error ?? "Upload failed", "warn");
      return;
    }
    set((s) => ({
      datasets: [res.data, ...s.datasets.filter((d) => d.id !== res.data.id)],
      selectedDatasetId: res.data.id,
      datasetUploading: false,
    }));
    await get().loadDatasets();
    void get().loadExistingInfrastructure();
    void get().loadEvidenceChunks();
    const extracted = res.data.extractedExistingInfrastructureCount ?? 0;
    const evidenceCount = res.data.extractedEvidenceChunkCount ?? 0;
    let msg = `Uploaded ${res.data.name} (${res.data.datasetType})`;
    if (extracted > 0) {
      msg = `Uploaded ${res.data.name} — extracted ${extracted} existing infrastructure point(s)`;
    }
    if (evidenceCount > 0) {
      msg += extracted > 0 ? ` and ${evidenceCount} evidence snippet(s)` : ` — extracted ${evidenceCount} evidence snippet(s)`;
    }
    get().pushToast(msg, "good");
  },

  selectDataset: (datasetId) => set({ selectedDatasetId: datasetId }),

  deleteDataset: async (datasetId) => {
    const res = await api.deleteDataset(datasetId);
    if (res.ok === false) {
      set({
        datasetError: res.unavailable
          ? "Supabase persistence is not configured"
          : res.error ?? "Delete failed",
      });
      return;
    }
    set((s) => ({
      datasets: s.datasets.filter((d) => d.id !== datasetId),
      selectedDatasetId:
        s.selectedDatasetId === datasetId ? null : s.selectedDatasetId,
    }));
    await get().loadDatasets();
    void get().loadExistingInfrastructure();
  },

  loadProjects: async () => {
    const health = get().backendHealth;
    if (health?.persistenceProvider !== "supabase") {
      set({
        projects: [],
        proposals: [],
        selectedProjectId: null,
        selectedProposalId: null,
        persistenceMode: "memory",
      });
      return;
    }
    set({ persistenceLoading: true, persistenceError: null });
    const projects = await api.listProjects();
    if (!projects) {
      set({ persistenceLoading: false, persistenceError: "Could not load projects" });
      return;
    }
    set({ projects, persistenceLoading: false });
    const selectedProjectId = get().selectedProjectId;
    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) {
      const proposals = await api.listProposals(selectedProjectId);
      if (proposals) {
        set({ proposals });
        const selectedProposalId = get().selectedProposalId;
        if (
          selectedProposalId &&
          proposals.some((proposal) => proposal.id === selectedProposalId)
        ) {
          void get().selectProposal(selectedProposalId);
        } else {
          void get().loadDatasets();
        }
      }
    }
  },

  createProject: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({ persistenceLoading: true, persistenceError: null });
    const project = await api.createProject(trimmed);
    if (!project) {
      set({ persistenceLoading: false, persistenceError: "Could not create project" });
      get().pushToast("Could not create project", "warn");
      return;
    }
    set((s) => ({
      projects: [project, ...s.projects],
      persistenceLoading: false,
    }));
    await get().selectProject(project.id);
  },

  selectProject: async (projectId) => {
    persistSelection(PROJECT_KEY, projectId);
    persistSelection(PROPOSAL_KEY, null);
    resetPlannerSession();
    set({
      selectedProjectId: projectId,
      selectedProposalId: null,
      proposals: [],
      proposalInfrastructure: [],
      snapshots: [],
      latestSnapshot: null,
      compareSnapshotId: null,
      persistedInfraIds: {},
      datasets: [],
      selectedDatasetId: null,
      datasetSummaries: [],
      cohorts: [],
      cohortConcerns: [],
      syntheticResidentReactions: [],
      persistenceMode: persistenceModeFor(get().backendHealth, null),
      persistenceError: null,
      datasetError: null,
      cohortError: null,
      residentReactionsError: null,
      evidenceChunks: [],
      evidenceSearchResults: [],
      evidenceError: null,
      existingInfrastructureAssets: [],
      existingInfrastructureError: null,
    });
    if (!projectId || get().backendHealth?.persistenceProvider !== "supabase") return;
    set({ persistenceLoading: true });
    const proposals = await api.listProposals(projectId);
    if (!proposals) {
      set({ persistenceLoading: false, persistenceError: "Could not load proposals" });
      return;
    }
    set({ proposals, persistenceLoading: false });
    void get().loadDatasets();
    void get().loadExistingInfrastructure();
    void get().loadCohortConcerns();
    void get().loadSyntheticResidentReactions();
    void get().loadEvidenceChunks();
  },

  createProposal: async (name) => {
    const trimmed = name.trim();
    const projectId = get().selectedProjectId;
    if (!trimmed || !projectId) return;
    set({ persistenceLoading: true, persistenceError: null });
    const proposal = await api.createProposal(projectId, trimmed);
    if (!proposal) {
      set({ persistenceLoading: false, persistenceError: "Could not create proposal" });
      get().pushToast("Could not create proposal", "warn");
      return;
    }
    set((s) => ({
      proposals: [proposal, ...s.proposals],
      persistenceLoading: false,
    }));
    await get().selectProposal(proposal.id);
  },

  selectProposal: async (proposalId) => {
    persistSelection(PROPOSAL_KEY, proposalId);
    resetPlannerSession();
    set({
      selectedProposalId: proposalId,
      persistenceMode: persistenceModeFor(get().backendHealth, proposalId),
      proposalInfrastructure: [],
      snapshots: [],
      latestSnapshot: null,
      compareSnapshotId: null,
      persistedInfraIds: {},
      persistenceError: null,
      decisionMemo: null,
      decisionMemoError: null,
      operatorRecommendationReady: proposalId
        ? loadOperatorRecommendationFlag(proposalId)
        : false,
    });
    if (!proposalId || get().backendHealth?.persistenceProvider !== "supabase") return;

    set({ persistenceLoading: true });
    await get().resetSession();
    const [rows, latestSnapshot, snapshotList] = await Promise.all([
      api.listProposalInfrastructure(proposalId),
      api.getLatestSnapshot(proposalId),
      api.listSnapshots(proposalId),
    ]);
    if (!rows) {
      set({
        persistenceLoading: false,
        persistenceError: "Could not load proposal infrastructure",
      });
      return;
    }

    const restored: Infra[] = [];
    const persistedInfraIds: Record<string, string> = {};
    let restoreFailed = false;
    for (const row of rows) {
      const draft = persistedToInfra(row);
      if (!draft) {
        restoreFailed = true;
        continue;
      }
      const saved = { ...draft, ...(await api.placeInfra(draft)) };
      restored.push(saved);
      persistedInfraIds[saved.id] = row.id;
    }

    set({
      proposalInfrastructure: rows,
      infra: restored,
      allInfra: restored,
      snapshots: snapshotList ?? [],
      latestSnapshot,
      compareSnapshotId: latestSnapshot?.id ?? null,
      persistedInfraIds,
      persistenceLoading: false,
      persistenceError: restoreFailed
        ? "Some persisted placements are listed only because they are not compatible with the current simulator."
        : null,
    });
    await get().reset();
    await get().refreshSentiment();
    await get().refreshFlows();
    void get().refreshSitingPriority();
    void get().loadDatasets();
    void get().loadExistingInfrastructure();
    void get().loadCohortConcerns();
    void get().loadSyntheticResidentReactions();
    void get().loadEvidenceChunks();

    const statusRes = await api.getOperatorRecommendationStatus(proposalId);
    if (statusRes.ok && statusRes.data.hasOperatorRecommendation) {
      markOperatorRecommendationReady(proposalId);
      set({ operatorRecommendationReady: true });
    }
  },

  saveSnapshot: async () => {
    const { selectedProposalId, metrics, scenarios, infra } = get();
    if (!selectedProposalId || !metrics) return;
    const snapshot = await api.createSnapshot(selectedProposalId, {
      tick: metrics.tick,
      metrics: metrics as unknown as Record<string, unknown>,
      scenarios: scenarios as unknown as Record<string, unknown>[],
      infrastructure: infra.map((i) => ({
        id: i.id,
        kind: i.kind,
        position: i.position,
        capacityKw: i.capacityKw,
        costCad: i.costCad,
        status: i.status,
        modelUrl: i.modelUrl,
        zoneId: i.zoneId,
      })),
    });
    if (snapshot) {
      const list = await api.listSnapshots(selectedProposalId);
      set({
        latestSnapshot: snapshot,
        snapshots: list ?? [snapshot, ...get().snapshots.filter((s) => s.id !== snapshot.id)],
        compareSnapshotId: snapshot.id,
      });
      get().pushToast("Snapshot saved", "good");
    } else {
      get().pushToast("Could not save snapshot", "warn");
    }
  },

  selectCompareSnapshot: (snapshotId) => {
    set({ compareSnapshotId: snapshotId });
  },

  restoreSnapshot: async (snapshotId) => {
    const { snapshots, selectedProposalId } = get();
    const snapshot = snapshots.find((s) => s.id === snapshotId);
    if (!snapshot || !selectedProposalId) return;
    if (get().backendHealth?.persistenceProvider !== "supabase") {
      get().pushToast("Snapshot restore requires Supabase persistence", "warn");
      return;
    }

    set({ restoringSnapshot: true, persistenceError: null });
    get().stopPlanner();
    get().pause();
    await api.resetSession();

    const restored: Infra[] = [];
    let restoreFailed = false;
    for (const item of snapshot.infrastructure) {
      const draft = snapshotItemToInfra(item);
      if (!draft) {
        restoreFailed = true;
        continue;
      }
      const saved = { ...draft, ...(await api.placeInfra(draft)) };
      restored.push(saved);
    }

    const { data: sentiment } = await api.getSentiment(restored);
    const { data: flows } = await api.getFlows(restored);
    const { data: metrics } = await api.resetSim(restored);
    const { data: voices } = await api.getVoices(
      8,
      restored,
      sentiment ?? { cityApprovalPct: 0.6, perZone: {} }
    );

    set({
      infra: restored,
      allInfra: restored,
      persistedInfraIds: {},
      sentiment,
      flows,
      voices: tagVoices(voices),
      metrics: { ...metrics, approvalPct: sentiment.cityApprovalPct },
      history: [{ ...metrics, approvalPct: sentiment.cityApprovalPct }],
      compareSnapshotId: snapshotId,
      restoringSnapshot: false,
      persistenceError: restoreFailed
        ? "Some snapshot placements could not be restored to the live sim."
        : null,
      spawnTimes: Object.fromEntries(restored.map((i) => [i.id, Date.now()])),
      selectedInfraId: null,
    });

    await get().reset();
    await get().refreshSentiment();
    await get().refreshFlows();
    void get().refreshVoices(6);
    void get().refreshSitingPriority();
    get().pushToast(
      "Snapshot restored to live sim — persisted proposal placements unchanged",
      "good"
    );
  },

  init: async () => {
    // Retry the REST fetch a few times before settling for mock — a page opened
    // during a backend blip/restart shouldn't get stranded on mock data.
    let zRes = await api.getZones();
    for (let i = 0; i < 4 && !zRes.live; i++) {
      await sleep(600);
      zRes = await api.getZones();
    }
    const zones = zRes.data;
    const zLive = zRes.live;
    const { data: rawAgents } = await api.getAgents();
    // Clip markers that fall on water — keep only points inside a land zone.
    const onLand = makeLandTest(zones);
    const agents = rawAgents.filter((a) => onLand(a.position));
    // Sample ~800 agents to animate as "living" people (don't move all 4000) —
    // denser so the 140 zones each read as populated; still 60fps-cheap.
    const step = Math.max(1, Math.floor(agents.length / 800));
    const sampledAgents = agents.filter((_, i) => i % step === 0).slice(0, 900);
    // candidate rooftop-solar sites per zone (capped) — glints reveal as adoption climbs
    const rooftopPoints: Record<string, LngLat[]> = {};
    zones.forEach((z, i) => {
      rooftopPoints[z.id] = sampleInside(z.polygon, 24, i + 7);
    });
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
    const backendHealth = zLive ? await api.getHealthMeta() : null;
    set({
      zones,
      agents,
      sampledAgents,
      allZones: zones,
      allAgents: agents,
      allSampledAgents: sampledAgents,
      allInfra: infra,
      rooftopPoints,
      infra,
      metrics: metricsWithApproval,
      history: [metricsWithApproval],
      sentiment,
      flows,
      voices: tagVoices(voices),
      live: zLive,
      backendHealth,
      persistenceMode: persistenceModeFor(backendHealth, get().selectedProposalId),
      loaded: true,
      approvalHistory: Object.fromEntries(
        Object.entries(sentiment.perZone).map(([k, v]) => [k, [v]])
      ),
    });
    get().setSelectedRegion(get().selectedRegion);
    if (backendHealth?.persistenceProvider === "supabase") void get().loadProjects();

    // build-priority ranking (where to build next)
    void api
      .getSitingPriority(infra, get().equityWeight)
      .then((r) => set({ sitingPriority: r.zones, equityWeight: r.equityWeight }));

    // events timeline (placements + scenarios with measured impact)
    void get().loadEvents();

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
      api.getDistrictEnergy(),
      api.getSbei(),
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
        districtEnergy,
        sbei,
      ]) => {
        const facs = facilities.filter((f) => onLand(f.position));
        const exInf = existingInfra.filter((e) => onLand(e.position));
        set({
          facilities: facs,
          existingInfra: exInf,
          allFacilities: facs,
          allExistingInfra: exInf,
          constraints,
          environment,
          generationMix,
          floodRisk,
          heatVuln,
          districtEnergy,
          sbei,
          activity: activity.length ? activity.slice(0, 80) : get().activity,
        });
        get().setSelectedRegion(get().selectedRegion);
      }
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
          set((s) => ({ voices: [...tagVoices(msg.voices), ...s.voices].slice(0, 40) }));
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
      (status) => {
        set({
          wsConnected: status === "open",
          wsReconnecting: status === "reconnecting",
        });
        // WS came (back) up but we're on mock → the backend is reachable now,
        // so re-pull live data and flip the badge to Live automatically.
        if (status === "open" && !get().live) void get().refetchLive();
      }
    );
  },

  refetchLive: async () => {
    const { data: zones, live } = await api.getZones();
    if (!live) return;
    const { data: rawAgents } = await api.getAgents();
    const onLand = makeLandTest(zones);
    const agents = rawAgents.filter((a) => onLand(a.position));
    const step = Math.max(1, Math.floor(agents.length / 320));
    const sampledAgents = agents.filter((_, i) => i % step === 0).slice(0, 360);
    const infra = get().infra;
    const [{ data: sentiment }, { data: flows }] = await Promise.all([
      api.getSentiment(infra),
      api.getFlows(infra),
    ]);
    const backendHealth = await api.getHealthMeta();
    set((s) => ({
      zones,
      agents,
      sampledAgents,
      allZones: zones,
      allAgents: agents,
      allSampledAgents: sampledAgents,
      allInfra: s.allInfra,
      sentiment,
      flows,
      live: true,
      backendHealth,
      persistenceMode: persistenceModeFor(backendHealth, s.selectedProposalId),
      approvalHistory: Object.fromEntries(
        Object.entries(sentiment.perZone).map(([k, v]) => [k, [v]])
      ),
      metrics: s.metrics
        ? { ...s.metrics, approvalPct: sentiment.cityApprovalPct }
        : s.metrics,
    }));
    if (backendHealth?.persistenceProvider === "supabase") void get().loadProjects();
    // refresh the optional data layers too
    void Promise.all([
      api.getFacilities(),
      api.getExistingInfra(),
      api.getConstraints(),
      api.getEnvironment(),
      api.getDistrictEnergy(),
    ]).then(([facilities, existingInfra, constraints, environment, districtEnergy]) => {
      const facs = facilities.filter((f) => onLand(f.position));
      const exInf = existingInfra.filter((e) => onLand(e.position));
      set({
        facilities: facs,
        existingInfra: exInf,
        allFacilities: facs,
        allExistingInfra: exInf,
        constraints,
        environment,
        districtEnergy,
      });
      // Re-apply the active filter on the new master lists
      get().setSelectedRegion(get().selectedRegion);
    });
    get().pushToast("Reconnected — live data restored", "good");
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
        priority: k === "priority",
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
  selectInfra: (id) => {
    set({ selectedInfraId: id });
    const inf = id && get().infra.find((i) => i.id === id);
    if (!inf) {
      set({ subjectApproval: null });
      return;
    }
    // instant mock readout, then refine from the live subject route if available
    const base = (get().sentiment?.perZone[inf.zoneId ?? ""] ?? 0.5) + KIND_BIAS[inf.kind];
    set({
      subjectApproval: {
        label: `this ${inf.kind}`,
        ...subjectSplit(Math.max(0, Math.min(1, base))),
      },
    });
    void api.getSubjectApproval(`infra:${inf.id}`).then((r) => {
      if (r && get().selectedInfraId === id)
        set({
          subjectApproval: {
            label: `this ${inf.kind}`,
            ...toSplit(r.approval, r.support, r.oppose, r.neutral),
          },
        });
    });
  },
  flyToInfra: (id) => {
    const inf = get().infra.find((i) => i.id === id);
    if (inf)
      set({
        flyTo: { target: inf.position, zoom: 15, nonce: Date.now() },
        selectedInfraId: id,
      });
  },

  resetView: () => {
    const { selectedRegion, allZones } = get();
    const flyTo = getRegionFlyTo(selectedRegion, allZones);
    if (flyTo) set({ flyTo });
  },

  setSelectedRegion: (region) => {
    const { allZones, allAgents, allSampledAgents, allFacilities, allExistingInfra, allInfra } = get();
    set({ selectedRegion: region });
    // "All" and "All Toronto" both mean the whole city (no region filter).
    if (region === "All" || region === "All Toronto") {
      set({
        zones: allZones,
        agents: allAgents,
        sampledAgents: allSampledAgents,
        facilities: allFacilities,
        existingInfra: allExistingInfra,
        infra: allInfra,
      });
      const flyTo = getRegionFlyTo("All", allZones);
      if (flyTo) set({ flyTo });
    } else {
      const filteredZones = allZones.filter(z => getZoneRegion(z.name, z.centroid) === region);
      const zIds = new Set(filteredZones.map(z => z.id));
      const onRegionLand = makeLandTest(filteredZones);

      set({
        zones: filteredZones,
        agents: allAgents.filter(a => zIds.has(a.zoneId)),
        sampledAgents: allSampledAgents.filter(a => zIds.has(a.zoneId)),
        facilities: allFacilities.filter(f => onRegionLand(f.position)),
        existingInfra: allExistingInfra.filter(e => onRegionLand(e.position)),
        infra: allInfra.filter(i => (i.zoneId && zIds.has(i.zoneId)) || onRegionLand(i.position)),
      });

      const flyTo = getRegionFlyTo(region, allZones);
      if (flyTo) set({ flyTo });
    }
  },

  setRegionCursorMode: (on) => set({ regionCursorMode: on }),
  setHoveredRegion: (region) => set({ hoveredRegion: region }),

  addInfraAt: async (pos) => {
    const { placeKind, selectedRegion, zones } = get();
    const preset = INFRA_PRESETS[placeKind];
    const z = nearestZone(pos);

    // Enforce region-locked placement: reject placing outside active filtered zones
    const activeZoneIds = new Set(zones.map(zone => zone.id));
    if (selectedRegion !== "All" && selectedRegion !== "All Toronto" && z && !activeZoneIds.has(z.id)) {
      get().pushToast(`Cannot place infrastructure outside the active region (${selectedRegion})`, "warn");
      return;
    }

    // Enforce programmatic spacing clearances to prevent model overlapping/clipping
    const placeLimit = INFRA_CLEARANCES[placeKind];
    const conflicts = get().infra.filter((existing) => {
      const dist = getHaversineDistance(pos, existing.position);
      const requiredDist = Math.max(placeLimit, INFRA_CLEARANCES[existing.kind]);
      return dist < requiredDist;
    });

    if (conflicts.length > 0) {
      const nearest = conflicts[0];
      const maxLimit = Math.max(placeLimit, INFRA_CLEARANCES[nearest.kind]);
      get().pushToast(
        `Placement Blocked: Too close to an existing ${nearest.kind} (requires ${maxLimit}m clearance)`,
        "warn"
      );
      return;
    }

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
    set((s) => ({
      infra: [...s.infra, optimistic],
      allInfra: [...s.allInfra, optimistic]
    }));

    const saved = { ...optimistic, ...(await api.placeInfra(optimistic)) };
    set((s) => ({
      infra: s.infra.map((i) => (i.id === optimistic.id ? saved : i)),
      allInfra: s.allInfra.map((i) => (i.id === optimistic.id ? saved : i)),
      spawnTimes: { ...s.spawnTimes, [saved.id]: Date.now(), [optimistic.id]: Date.now() },
    }));
    {
      const proposalId = get().selectedProposalId;
      if (proposalId && get().backendHealth?.persistenceProvider === "supabase") {
        const row = await api.createProposalInfrastructure(
          proposalId,
          infraToPersisted(saved)
        );
        if (row) {
          set((s) => ({
            proposalInfrastructure: [...s.proposalInfrastructure, row],
            persistedInfraIds: { ...s.persistedInfraIds, [saved.id]: row.id },
          }));
        } else {
          get().pushToast("Placement saved in sim, but proposal persistence failed", "warn");
        }
      }
    }
    get().pushToast(
      `Placed ${optimistic.kind} in ${z?.name ?? "the city"}`,
      "good"
    );
    // subject-tied sentiment: "X% support this <kind> here".
    // Prefer the backend's proposalApproval + vote counts; else fall back to mock.
    {
      const sp = saved as api.PlacedInfra;
      const hasLive =
        sp.proposalApproval != null || sp.supportCount != null;
      const split = hasLive
        ? toSplit(
          sp.proposalApproval,
          sp.supportCount,
          sp.opposeCount,
          sp.neutralCount
        )
        : subjectSplit(
          Math.max(0, Math.min(1, (get().sentiment?.perZone[z?.id ?? ""] ?? 0.5) + KIND_BIAS[placeKind]))
        );
      set({ subjectApproval: { label: `this ${placeKind}`, ...split } });
    }
    // nearby people orient toward the new installation (gentle cluster)
    {
      const d2 = (a: LngLat, b: LngLat) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
      const near: Record<string, LngLat> = {};
      for (const a of get().sampledAgents)
        if (d2(a.position, pos) < 0.000012) near[a.id] = pos;
      if (Object.keys(near).length)
        set((s) => ({
          agentTargets: { ...s.agentTargets, ...near },
          agentMobilizedAt: Date.now(),
        }));
    }
    const m0 = get().metrics;
    logActivity(
      set,
      [
        {
          text: `You placed a ${optimistic.kind} (${optimistic.capacityKw} kW) in ${z?.name ?? "the city"
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
    void get().refreshSitingPriority(); // priority drops where we just built
    await get().refreshVoices(4, optimistic.kind);
  },

  removeInfra: async (id) => {
    // mark for shrink-out; keep it on the map ~480ms, then actually remove
    const proposalId = get().selectedProposalId;
    const persistedId = get().persistedInfraIds[id];
    set((s) => ({
      removalTimes: { ...s.removalTimes, [id]: Date.now() },
      selectedInfraId: s.selectedInfraId === id ? null : s.selectedInfraId,
    }));
    if (proposalId && persistedId) {
      const ok = await api.deleteProposalInfrastructure(proposalId, persistedId);
      if (!ok) get().pushToast("Could not delete proposal placement", "warn");
    }
    await api.deleteInfra(id);
    setTimeout(() => {
      set((s) => {
        const rt = { ...s.removalTimes };
        delete rt[id];
        const persistedInfraIds = { ...s.persistedInfraIds };
        delete persistedInfraIds[id];
        return {
          infra: s.infra.filter((i) => i.id !== id),
          allInfra: s.allInfra.filter((i) => i.id !== id),
          proposalInfrastructure: s.proposalInfrastructure.filter(
            (i) => i.id !== persistedId
          ),
          persistedInfraIds,
          removalTimes: rt
        };
      });
      void get().reset();
      void get().refreshFlows();
    }, 480);
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
    set((s) => ({ voices: [...tagVoices(newVoices), ...s.voices].slice(0, 40) }));

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
    const { infra, selectedRegion, zones } = get();

    let zoneIds: string[] | undefined = undefined;
    if (selectedRegion !== "All") {
      zoneIds = zones
        .filter((z) => getZoneRegion(z.name, z.centroid) === selectedRegion)
        .map((z) => z.id);
    }

    const { data } = await api.optimize(n, infra, undefined, zoneIds);
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
    // People ACT: agents in affected zones stream toward the relevant facilities
    // (heatwave→cooling centres, blackout/ice→shelters), else the zone centroid.
    const facCat =
      scenario.type === "heatwave"
        ? "cooling_centre"
        : scenario.type === "blackout" || scenario.type === "ice_storm"
          ? "shelter"
          : null;
    const gset = new Set(gathering);
    const facs = get().facilities;
    const d2 = (a: LngLat, b: LngLat) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    const targets: Record<string, LngLat> = {};
    for (const a of get().sampledAgents) {
      if (!gset.has(a.zoneId)) continue;
      const z = zones.find((zz) => zz.id === a.zoneId);
      if (!z) continue;
      let cand = facs.filter(
        (f) => (!facCat || f.kind === facCat) && d2(f.position, z.centroid) < 0.0004
      );
      if (!cand.length)
        cand = facs.filter((f) => d2(f.position, z.centroid) < 0.0004);
      targets[a.id] = cand.length
        ? cand[Math.abs(hashStr(a.id)) % cand.length].position
        : z.centroid;
    }

    set({
      scenarios: nextScenarios,
      infra: nextInfra,
      outageZones: [...outage],
      gatheringZones: gathering,
      lastTargetZoneId: zoneId ?? null,
      agentTargets: targets,
      agentMobilizedAt: Date.now(),
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
            text: `${scenario.label} ${zoneName ? `hit ${zoneName}` : "struck city-wide"}${outage.size ? ` — ${outage.size} zone(s) affected` : ""
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
            text: `⚡ Scenario fired: ${scenario.label}${zoneName ? ` → ${zoneName}` : " (city-wide)"
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
      voices: tagVoices(voices),
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
      agentTargets: {},
      agentMobilizedAt: 0,
      programs: [],
      subjectApproval: null,
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
    set((s) => ({ voices: [...tagVoices(data), ...s.voices].slice(0, 40) }));
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

  // ---------------- build-priority overlay ----------------

  setEquityWeight: (w) => {
    set({ equityWeight: w });
    void get().refreshSitingPriority();
  },
  refreshSitingPriority: async () => {
    const { infra, equityWeight } = get();
    const r = await api.getSitingPriority(infra, equityWeight);
    set({ sitingPriority: r.zones });
  },

  // ---------------- events timeline ----------------

  loadEvents: async () => {
    const r = await api.getEvents();
    set({ events: r.events, eventSeries: r.series });
  },
  // Click an event card → highlight its zones on the map + fly to frame them.
  traceEvent: (zoneIds) => {
    if (!zoneIds.length) return;
    set({ flashZones: zoneIds });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ flashZones: [] }), 2600);
    const z = get().zones.find((zz) => zz.id === zoneIds[0]);
    if (z) {
      set({
        flyTo: {
          target: z.centroid,
          zoom: zoneIds.length > 6 ? 11 : 13,
          nonce: Date.now(),
        },
      });
    }
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

  selectVoiceFromMap: (id) =>
    set((s) => ({ selectedVoiceId: id, focusVoiceNonce: s.focusVoiceNonce + 1 })),
  selectVoiceFromLog: (id) => {
    const v = get().voices.find((x) => x.id === id);
    set({ selectedVoiceId: id });
    if (!v) return;
    const target =
      v.position ?? get().zones.find((zz) => zz.id === v.zoneId)?.centroid;
    if (target)
      set({ flyTo: { target, zoom: 14.5, pitch: 50, nonce: Date.now() } });
  },
  clearSelectedVoice: () => set({ selectedVoiceId: null }),

  launchProgram: (type, zoneIds) => {
    const { zones, sentiment } = get();
    const label = PROGRAM_LABEL[type] ?? type.replace(/_/g, " ");
    // default targets = the highest energy-burden neighbourhoods
    const targets =
      zoneIds && zoneIds.length
        ? zoneIds
        : [...zones]
          .sort(
            (a, b) =>
              b.demographics.energyBurdenIndex - a.demographics.energyBurdenIndex
          )
          .slice(0, 6)
          .map((z) => z.id);
    // boost rooftop adoption in target zones → glints start appearing
    const adopt = { ...get().adoptionByZone };
    for (const zid of targets) adopt[zid] = Math.min(1, (adopt[zid] ?? 0) + 0.22);
    const m = get().metrics;
    const base =
      targets.reduce((s, z) => s + (sentiment?.perZone[z] ?? 0.5), 0) /
      Math.max(1, targets.length);
    set((s) => ({
      programs: [
        ...s.programs,
        { type, label, zones: targets, startedTick: m?.tick ?? 0 },
      ],
      adoptionByZone: adopt,
      subjectApproval: { label, ...subjectSplit(Math.min(1, base + 0.12)) },
    }));
    void api.getSubjectApproval(`program:${type}`).then((r) => {
      if (r)
        set({
          subjectApproval: {
            label,
            ...toSplit(r.approval, r.support, r.oppose, r.neutral),
          },
        });
    });
    get().pushToast(`${label} launched in ${targets.length} neighbourhoods`, "good");
    logActivity(
      set,
      [
        {
          text: `${label} launched — rooftop adoption rising across ${targets.length} high-burden neighbourhoods`,
          severity: "good",
        },
      ],
      m?.tick ?? 0,
      m?.year ?? 2026,
      targets
    );
    void get().refreshVoices(5, type);
  },

  // ---------------- v3 chat / targeting ----------------

  sendChat: (text, opts) => {
    const t = (typeof text === "string" ? text : "").trim();
    if (!t) return;
    session ??= attachSession(set, get);
    set((s) => ({
      chat: [...s.chat, { id: cid(), role: "user", text: t }],
      chatBusy: true,
      chatAwaiting: false,
    }));
    session.send(t, {
      mode: get().placementMode === "step" ? "step" : "auto",
      intent: opts?.intent,
    });
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
  setMainView: (v) => set({ mainView: v }),
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
