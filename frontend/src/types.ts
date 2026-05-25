// WattIf shared data contract — mirrors docs/PLAN.md (Pydantic on the backend).
// All coordinates are [lng, lat].
import type { Polygon } from "geojson";

export type LngLat = [number, number];

export type Zone = {
  id: string;
  name: string;
  polygon: Polygon;
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

export type InfraKind = "solar" | "wind" | "battery" | "microgrid";

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
};

// RGB colors per infra kind (used by deck.gl fallback + UI accents)
export const INFRA_COLOR: Record<InfraKind, [number, number, number]> = {
  solar: [250, 204, 21],
  wind: [56, 189, 248],
  battery: [167, 139, 250],
  microgrid: [52, 211, 153],
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

export type PlannerEvent =
  | { type: "thought"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "placement"; infra: Infra }
  | { type: "done"; summary: string };

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
