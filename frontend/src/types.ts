// WattIf shared data contract — mirrors docs/PLAN.md (Pydantic on the backend).
// All coordinates are [lng, lat].
import type { Polygon, MultiPolygon } from "geojson";

export type LngLat = [number, number];

export type Zone = {
  id: string;
  name: string;
  polygon: Polygon | MultiPolygon; // islands → MultiPolygon
  centroid: LngLat;
  demographics: {
    population: number;
    medianIncome: number;
    renterPct: number; // 0..1
    energyBurdenIndex: number; // 0..1, higher = more burdened
  };
  demandKwhMonthly: number;
  solarPotential: number; // 0..1
  windPotential: number; // 0..1
};

export type Agent = {
  id: string;
  zoneId: string;
  position: LngLat;
  archetype: string;
  demandKwh: number;
  incomeBracket: "low" | "mid" | "high";
  hasRooftop: boolean;
  evOwner: boolean;
  solarAdopted: boolean;
};

export type InfraKind = "solar" | "wind" | "battery" | "microgrid" | "ev_charger";

export type InfraStatus = "planned" | "active" | "damaged";

export type Infra = {
  id: string;
  kind: InfraKind;
  position: LngLat;
  capacityKw: number;
  costCad: number;
  modelUrl: string;
  status: InfraStatus;
  placedBy?: "you" | "ai"; // who placed it (inspector + map accents)
  zoneId?: string;
};

// ---------- Supabase persistence contracts ----------

export type Project = {
  id: string;
  name: string;
  description?: string | null;
  city: string;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type Proposal = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ProposalInfrastructureCreate = {
  kind: InfraKind | string;
  position: LngLat;
  capacityKw?: number;
  zoneId?: string;
  costCad?: number;
  status?: InfraStatus;
  modelUrl?: string;
  placedBy?: "you" | "ai";
  clientId?: string;
  metadata?: Record<string, unknown>;
};

export type ProposalInfrastructure = {
  id: string;
  proposalId: string;
  kind: InfraKind | string;
  zoneId?: string | null;
  position?: LngLat | null;
  capacityKw?: number | null;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
};

export type SimulationSnapshotCreate = {
  tick: number;
  metrics: Record<string, unknown>;
  scenarios?: Record<string, unknown>[];
  infrastructure?: Record<string, unknown>[];
};

export type SimulationSnapshot = {
  id: string;
  proposalId: string;
  tick: number;
  metrics: Record<string, unknown>;
  scenarios: Record<string, unknown>[];
  infrastructure: Record<string, unknown>[];
  createdAt?: string | null;
};

export type DatasetType =
  | "ev_chargers"
  | "ev_sentiment"
  | "energy_demand"
  | "weather_risk"
  | "grid_infrastructure"
  | "demographic"
  | "zoning_constraints"
  | "public_feedback"
  | "generic";

export const DATASET_TYPES: DatasetType[] = [
  "ev_chargers",
  "ev_sentiment",
  "energy_demand",
  "weather_risk",
  "grid_infrastructure",
  "demographic",
  "zoning_constraints",
  "public_feedback",
  "generic",
];

export type UploadedDataset = {
  id: string;
  projectId?: string | null;
  proposalId?: string | null;
  name: string;
  datasetType: DatasetType | string;
  fileType?: string | null;
  rowCount?: number | null;
  featureCount?: number | null;
  columns: string[];
  preview: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  createdAt?: string | null;
  uploadedAt?: string | null;
  extractedExistingInfrastructureCount?: number;
  invalidExistingInfrastructureRows?: number;
  detectedExistingInfrastructureKind?: string | null;
  extractedEvidenceChunkCount?: number;
};

export type DatasetEvidenceChunk = {
  id: string;
  projectId: string;
  proposalId?: string | null;
  datasetId: string;
  sourceType: string;
  chunkText: string;
  chunkSummary?: string | null;
  datasetType?: string | null;
  sourceRowIndex?: number | null;
  sourceField?: string | null;
  topicTags: string[];
  metadata: Record<string, unknown>;
  createdAt?: string | null;
};

export type EvidenceSearchResult = {
  id: string;
  datasetId: string;
  datasetName?: string | null;
  datasetType?: string | null;
  chunkText: string;
  chunkSummary?: string | null;
  sourceRowIndex?: number | null;
  sourceField?: string | null;
  topicTags: string[];
  score: number;
  metadata: Record<string, unknown>;
};

export type UploadedInfrastructureAsset = {
  id: string;
  projectId?: string | null;
  proposalId?: string | null;
  datasetId: string;
  assetKind: string;
  sourceType: string;
  name?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  zoneId?: string | null;
  status?: string | null;
  operator?: string | null;
  capacityKw?: number | null;
  powerKw?: number | null;
  chargerType?: string | null;
  metadata: Record<string, unknown>;
  sourceRowIndex?: number | null;
  createdAt?: string | null;
};

export type UploadedDatasetSummary = {
  id: string;
  name: string;
  datasetType: string;
  fileType?: string | null;
  rowCount?: number | null;
  featureCount?: number | null;
  columns: string[];
  detectedType?: string | null;
  createdAt?: string | null;
};

export type CohortType =
  | "ev_owners"
  | "renters"
  | "homeowners"
  | "small_businesses"
  | "seniors"
  | "high_energy_burden_households"
  | "climate_advocates"
  | "grid_reliability_concerned"
  | "generic_residents";

export type ConcernSeverity = "low" | "medium" | "high";
export type ConcernStance = "support" | "oppose" | "mixed" | "neutral";

export type CohortProfile = {
  id: string;
  projectId?: string | null;
  proposalId?: string | null;
  name: string;
  cohortType: CohortType | string;
  zoneId?: string | null;
  description?: string | null;
  priorities: string[];
  datasetIds: string[];
  confidence?: number | null;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
};

export type CohortConcern = {
  id: string;
  cohortId: string;
  projectId?: string | null;
  proposalId?: string | null;
  severity: ConcernSeverity | string;
  stance: ConcernStance | string;
  topic: string;
  summary: string;
  evidence: string[];
  relatedDatasetIds: string[];
  relatedInfraIds: string[];
  metadata: Record<string, unknown>;
  createdAt?: string | null;
};

export type CohortGenerateResponse = {
  cohorts: CohortProfile[];
  concerns: CohortConcern[];
  datasetsUsed: number;
};

export type ReactionStance =
  | "support"
  | "oppose"
  | "mixed"
  | "concern"
  | "neutral";

export type SyntheticResidentReaction = {
  id: string;
  projectId: string;
  proposalId?: string | null;
  cohortId?: string | null;
  concernId?: string | null;
  reactionType: string;
  personaLabel?: string | null;
  stance: ReactionStance | string;
  summary: string;
  keyConcern?: string | null;
  suggestedChange?: string | null;
  evidence?: string | null;
  confidence?: number | null;
  caveat: string;
  sourceContext: Record<string, unknown>;
  provider?: string | null;
  model?: string | null;
  createdAt?: string | null;
};

export type SyntheticResidentReactionGenerateResponse = {
  reactions: SyntheticResidentReaction[];
  provider: string;
  model: string;
  count: number;
};

export type ProposalReportSection = {
  id: string;
  title: string;
  markdown: string;
};

export type ProposalReport = {
  projectId: string;
  proposalId: string;
  generatedAt: string;
  markdown: string;
  html?: string | null;
  sections: ProposalReportSection[];
  hasOperatorRecommendation: boolean;
};

export function infraToPersisted(infra: Infra): ProposalInfrastructureCreate {
  return {
    kind: infra.kind,
    position: infra.position,
    capacityKw: infra.capacityKw,
    zoneId: infra.zoneId,
    costCad: infra.costCad,
    status: infra.status,
    modelUrl: infra.modelUrl,
    placedBy: infra.placedBy,
    clientId: infra.id,
  };
}

export type SimMetrics = {
  tick: number;
  year: number;
  totalDemandKwh: number;
  renewableSupplyKwh: number;
  coveragePct: number; // renewable / demand
  gridLoadPct: number;
  emissionsTonnes: number;
  costCumulativeCad: number;
  equityScore: number; // 0..1
  approvalPct: number; // 0..1 city-wide public approval (v2)
  hour?: number; // 0..23 sim clock for day/night pulse (v2)
};

export type Recommendation = {
  position: LngLat;
  kind: InfraKind;
  score: number;
  expectedCoverageGain: number;
  equityGain: number;
  rationale: string;
};

// kind -> GLB model in /public/models (assets lane owns the files)
export const MODEL_URL: Record<InfraKind, string> = {
  wind: "/models/wind_turbine.glb",
  solar: "/models/solar_array.glb",
  battery: "/models/battery.glb",
  microgrid: "/models/microgrid_hub.glb",
  ev_charger: "/models/ev_charger.glb",
};

// Typical capacity (kW) + cost (CAD) presets used when placing infra in the UI.
export const INFRA_PRESETS: Record<
  InfraKind,
  { capacityKw: number; costCad: number; label: string }
> = {
  solar: { capacityKw: 250, costCad: 375_000, label: "Solar Array" },
  wind: { capacityKw: 900, costCad: 1_800_000, label: "Wind Turbine" },
  battery: { capacityKw: 500, costCad: 650_000, label: "Battery Storage" },
  microgrid: { capacityKw: 1500, costCad: 2_400_000, label: "Microgrid Hub" },
  ev_charger: { capacityKw: 150, costCad: 95_000, label: "EV Charger Hub" },
};

const BUILT_IN_KINDS = new Set<InfraKind>([
  "solar",
  "wind",
  "battery",
  "microgrid",
  "ev_charger",
]);

export const isBuiltInInfraKind = (kind: string): kind is InfraKind =>
  BUILT_IN_KINDS.has(kind as InfraKind);

/** Convert snapshot JSON infra item → placement draft for live sim restore. */
export function snapshotItemToInfra(item: Record<string, unknown>): Infra | null {
  const kind = item.kind;
  if (typeof kind !== "string" || !isBuiltInInfraKind(kind)) return null;
  const position = item.position;
  if (!Array.isArray(position) || position.length < 2) return null;
  const lng = position[0];
  const lat = position[1];
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  const status = item.status;
  return {
    id: typeof item.id === "string" ? item.id : `snap-infra-${Date.now()}`,
    kind,
    position: [lng, lat],
    capacityKw:
      typeof item.capacityKw === "number" ? item.capacityKw : INFRA_PRESETS[kind].capacityKw,
    costCad: typeof item.costCad === "number" ? item.costCad : INFRA_PRESETS[kind].costCad,
    modelUrl: typeof item.modelUrl === "string" ? item.modelUrl : MODEL_URL[kind],
    status: status === "active" || status === "damaged" ? status : "planned",
    placedBy: item.placedBy === "ai" ? "ai" : "you",
    zoneId: typeof item.zoneId === "string" ? item.zoneId : undefined,
  };
}

/** Parse stored snapshot metrics into SimMetrics fields when present. */
export function metricsFromSnapshotRecord(
  raw: Record<string, unknown>
): Partial<SimMetrics> {
  const num = (k: keyof SimMetrics) => {
    const v = raw[k as string];
    return typeof v === "number" ? v : undefined;
  };
  return {
    tick: num("tick"),
    year: num("year"),
    totalDemandKwh: num("totalDemandKwh"),
    renewableSupplyKwh: num("renewableSupplyKwh"),
    coveragePct: num("coveragePct"),
    gridLoadPct: num("gridLoadPct"),
    emissionsTonnes: num("emissionsTonnes"),
    costCumulativeCad: num("costCumulativeCad"),
    equityScore: num("equityScore"),
    approvalPct: num("approvalPct"),
  };
}

// RGB colors per infra kind (used by deck.gl fallback + UI accents)
export const INFRA_COLOR: Record<InfraKind, [number, number, number]> = {
  solar: [250, 204, 21],
  wind: [56, 189, 248],
  battery: [167, 139, 250],
  microgrid: [52, 211, 153],
  ev_charger: [129, 140, 248],
};

// ---------- v2: Scenarios / Sentiment / Planner / Living scene ----------

export type ScenarioType =
  | "earthquake"
  | "heatwave"
  | "ice_storm"
  | "blackout"
  | "gas_spike"
  | "population_boom"
  | "policy_incentive"
  | "custom";

export type ScenarioEffect = {
  target: "demand" | "infra" | "sentiment" | "adoption" | "grid";
  zoneId?: string;
  infraId?: string;
  delta: number;
  note: string;
};

export type Scenario = {
  id: string;
  type: ScenarioType;
  label: string;
  description: string;
  effects: ScenarioEffect[];
  startedTick: number;
};

export type AgentVoice = {
  id?: string; // client-assigned stable id (for map↔log linking)
  agentId: string;
  zoneId: string;
  archetype: string;
  avatarSeed: string;
  text: string;
  stance: "support" | "oppose" | "neutral";
  topic: string;
  position?: LngLat; // exact agent location (pop the bubble here)
  trigger?: string | null; // "placement" | scenario-type | null
};

export type Sentiment = {
  cityApprovalPct: number; // 0..1
  perZone: Record<string, number>; // zoneId -> approval -1..1
};

export type Flow = {
  fromInfraId: string;
  toZoneId: string;
  powerKwh: number;
};

export type OperatorRecommendation = {
  summary: string;
  key_concerns_considered: {
    id?: string;
    topic?: string;
    cohortName?: string;
    severity?: string;
    stance?: string;
    summary?: string;
    evidence?: string[];
  }[];
  recommended_actions: {
    action: string;
    kinds?: string[];
    priority?: string;
    sourceTopics?: string[];
    program?: string;
  }[];
  tradeoffs: string[];
  suggested_next_step: string;
  optional_tool_actions?: {
    name: string;
    args: Record<string, unknown>;
    rationale?: string;
  }[];
  context?: {
    datasetCount?: number;
    concernCount?: number;
    proposalInfra?: Record<string, number>;
  };
};

export type PlannerEvent =
  | { type: "turn_start"; turnId?: string; message?: string }
  | { type: "thought"; text: string; turnId?: string }
  | { type: "answer"; text: string; turnId?: string }
  | { type: "error"; message: string; turnId?: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown>; turnId?: string }
  | { type: "tool_result"; name: string; result: unknown; turnId?: string }
  | { type: "placement"; infra: Infra; turnId?: string }
  | { type: "recommendation"; recommendation: OperatorRecommendation; turnId?: string }
  | {
      type: "done";
      summary?: string;
      recommendation?: OperatorRecommendation;
      turnId?: string;
    };

export type PlacementMode = "manual" | "auto" | "step";

// Scenario presets surfaced as buttons in the UI.
export const SCENARIO_PRESETS: {
  type: ScenarioType;
  label: string;
  icon: string;
}[] = [
  { type: "earthquake", label: "Earthquake", icon: "🌐" },
  { type: "heatwave", label: "Heatwave", icon: "🔥" },
  { type: "ice_storm", label: "Ice Storm", icon: "❄️" },
  { type: "blackout", label: "Blackout", icon: "🔌" },
  { type: "gas_spike", label: "Gas Spike", icon: "⛽" },
  { type: "population_boom", label: "Pop. Boom", icon: "🏙️" },
  { type: "policy_incentive", label: "Policy Incentive", icon: "📜" },
];

export const STANCE_COLOR: Record<
  AgentVoice["stance"],
  [number, number, number]
> = {
  support: [52, 211, 153],
  oppose: [248, 113, 113],
  neutral: [148, 163, 184],
};

// ---------- v3: real city data layers (degrade gracefully if absent) ----------

export type FacilityKind =
  | "cooling_centre"
  | "shelter"
  | "hospital"
  | "community"
  | "other";

export type Facility = {
  id: string;
  kind: FacilityKind | string;
  name: string;
  position: LngLat;
};

export type ExistingInfra = {
  id: string;
  kind: string; // solar | wind | hydro | ev_charger | ...
  name?: string;
  position: LngLat;
  capacityKw?: number;
};

// Constraints are PER-ZONE: siting penalty + hard no-build flag (44 entries).
export type ConstraintZone = {
  zoneId: string;
  sitingPenalty: number; // 0..1, higher = harder to build
  noBuild: boolean;
};

export const FACILITY_META: Record<
  string,
  { label: string; icon: string; color: [number, number, number] }
> = {
  cooling_centre: { label: "Cooling centre", icon: "❄️", color: [56, 189, 248] },
  shelter: { label: "Shelter", icon: "🏠", color: [251, 191, 36] },
  hospital: { label: "Hospital", icon: "🏥", color: [248, 113, 113] },
  community: { label: "Community hub", icon: "🏛️", color: [167, 139, 250] },
  other: { label: "Facility", icon: "📍", color: [148, 163, 184] },
};

// Chat / real-time agentic conversation
export type ChatItem =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "event"; event: PlannerEvent }
  | { id: string; role: "system"; text: string };

// Build-priority ranking — WHERE to build next (unmet demand × energy burden).
export type SitingPriorityZone = {
  zoneId: string;
  name: string;
  score: number; // 0..1, higher = build here first
  unmetRatio: number; // 0..1 share of demand unserved
  energyBurden: number; // 0..1
  unmetDemandKwh: number;
  rationale: string;
};

// City events — timeline of placements + scenarios with their measured impact.
export type EventVoice = {
  text: string;
  stance: "support" | "oppose" | "neutral";
  archetype: string;
  zoneId: string;
};
export type CityEvent = {
  id: string;
  tick: number;
  type: string; // "placement" | "scenario" | ...
  kind: string; // infra kind ("solar"…) or scenario kind ("heatwave"…)
  label: string;
  zoneIds: string[];
  delta: { approval: number; coverage: number };
  reaction: { support: number; oppose: number; neutral: number };
  voices: EventVoice[];
};
export type EventPoint = { tick: number; approval: number; coverage: number };

// ---------- Forecast: projected city trajectory over a horizon ----------
// One point per tick (horizon + 1 incl. t0). All ratios 0..1; emissions is a
// raw float (tonnes).
export type ForecastPoint = {
  tick: number;
  approval: number; // 0..1
  coverage: number; // 0..1
  equity: number; // 0..1
  emissions: number;
};

// POST /api/forecast response. `projected` is present only when a `proposed`
// build set was sent (current world + proposed builds); otherwise null.
export type Forecast = {
  horizon: number;
  baseline: ForecastPoint[];
  projected: ForecastPoint[] | null;
};

// A proposed build to project — kind + [lng, lat] position.
export type ProposedBuild = { kind: InfraKind; position: LngLat };

// Activity log — chronological narration of what changed each tick.
export type ActivitySeverity = "info" | "good" | "warn" | "bad";
export type ActivityItem = {
  id: string;
  tick: number;
  year: number;
  text: string;
  severity: ActivitySeverity;
  zoneId?: string;
};
