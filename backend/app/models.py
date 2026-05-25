"""Pydantic v2 models mirroring the shared contract in docs/PLAN.md.

JSON is camelCase (matching the TS frontend types); Python attributes are snake_case.
All coordinates are [lng, lat].
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Coord = tuple[float, float]  # [lng, lat]
InfraKind = Literal["solar", "wind", "battery", "microgrid"]
IncomeBracket = Literal["low", "mid", "high"]
InfraStatus = Literal["planned", "active", "damaged"]
ScenarioType = Literal[
    "earthquake",
    "heatwave",
    "ice_storm",
    "blackout",
    "gas_spike",
    "population_boom",
    "policy_incentive",
    "turbine_noise_complaint",
    "solar_approved",
    "cold_snap",
    "drought",
    "wind_lull",
    "grid_upgrade",
    "ev_surge",
    "factory_opening",
    "flood",
    "custom",
]

# Infra kind -> GLB model path the frontend ScenegraphLayer loads (see PLAN.md).
MODEL_URLS: dict[str, str] = {
    "solar": "/models/solar_array.glb",
    "wind": "/models/wind_turbine.glb",
    "battery": "/models/battery.glb",
    "microgrid": "/models/microgrid_hub.glb",
}


class CamelModel(BaseModel):
    """Base: snake_case in Python, camelCase on the wire, accepts either on input."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


# ---------------------------------------------------------------------------
# GeoJSON geometry (minimal — coordinates only, [lng,lat]). Zone boundaries are a
# Polygon OR MultiPolygon (e.g. Waterfront Communities incl. the Toronto Islands).
# ---------------------------------------------------------------------------
class Polygon(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[Coord]]  # [exterior_ring, *holes]


class MultiPolygon(BaseModel):
    type: Literal["MultiPolygon"] = "MultiPolygon"
    coordinates: list[list[list[Coord]]]  # [[exterior_ring, *holes], ...]


# Discriminated on the GeoJSON "type" tag; both pass through GET /api/zones unchanged.
Geometry = Annotated[Union[Polygon, MultiPolygon], Field(discriminator="type")]


# ---------------------------------------------------------------------------
# Zone
# ---------------------------------------------------------------------------
class Demographics(CamelModel):
    population: int
    median_income: int
    renter_pct: float = Field(ge=0, le=1)
    energy_burden_index: float = Field(ge=0, le=1)


class Zone(CamelModel):
    id: str
    name: str
    polygon: Geometry  # Polygon or MultiPolygon
    centroid: Coord
    demographics: Demographics
    demand_kwh_monthly: float
    solar_potential: float = Field(ge=0, le=1)
    wind_potential: float = Field(ge=0, le=1)


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
class Agent(CamelModel):
    id: str
    zone_id: str
    position: Coord
    archetype: str
    demand_kwh: float
    income_bracket: IncomeBracket
    has_rooftop: bool
    ev_owner: bool
    solar_adopted: bool


# ---------------------------------------------------------------------------
# Infra
# ---------------------------------------------------------------------------
class Infra(CamelModel):
    id: str
    kind: InfraKind
    position: Coord
    capacity_kw: float
    cost_cad: float
    model_url: str = ""
    status: InfraStatus = "planned"


class InfraCreate(CamelModel):
    """Inbound placement: id/cost/model_url optional (server fills defaults)."""

    id: str | None = None
    kind: InfraKind
    position: Coord
    capacity_kw: float | None = None
    cost_cad: float | None = None
    model_url: str | None = None
    status: InfraStatus = "planned"


# ---------------------------------------------------------------------------
# SimMetrics
# ---------------------------------------------------------------------------
class SimMetrics(CamelModel):
    tick: int
    year: int
    total_demand_kwh: float
    renewable_supply_kwh: float
    coverage_pct: float
    grid_load_pct: float
    emissions_tonnes: float
    cost_cumulative_cad: float
    equity_score: float = Field(ge=0, le=1)
    approval_pct: float = Field(default=0.5, ge=0, le=1)  # mean public opinion 0..1
    sim_hour: int = 0  # 0..23 clock for day/night pulse


class ZoneDelta(CamelModel):
    """Per-zone change emitted each tick (for map overlays + living scene)."""

    zone_id: str
    demand_kwh: float
    renewable_supply_kwh: float
    coverage_pct: float
    adoption_pct: float
    approval: float = (
        0.5  # 0..1 public approval rate (same units as metrics.approvalPct)
    )
    demand_intensity: float = 0.0  # 0..1 normalized, for day/night pulse
    adoption_count: int = 0  # households with rooftop solar adopted
    ev_count: int = 0  # households owning an EV
    outage: bool = False  # darkened by a scenario (blackout/earthquake)


class SimTick(CamelModel):
    """WS payload each tick: global metrics + per-zone deltas + a human-readable activity log."""

    metrics: SimMetrics
    zone_deltas: list[ZoneDelta]
    activity: list[str] = []  # ~3-5 most significant human-readable changes this tick


# ---------------------------------------------------------------------------
# v2: Scenarios / events
# ---------------------------------------------------------------------------
class ScenarioEffect(CamelModel):
    target: Literal["demand", "infra", "sentiment", "adoption", "grid"]
    zone_id: str | None = None
    infra_id: str | None = None
    delta: float
    note: str


class GatheringHint(CamelModel):
    """A place agents converge on during an event (drives the living-scene crowd animation)."""

    zone_id: str
    kind: str  # e.g. "shelter", "cooling_center", "warming_center", "charging_hub", "crowd"
    pull: float  # 0..1 strength of convergence
    hours: int  # how long the gathering lasts (sim hours)
    position: Coord | None = None  # real facility coords (facilities.json) when known
    name: str | None = None  # real facility name when known


class Scenario(CamelModel):
    id: str
    type: ScenarioType
    label: str
    description: str
    effects: list[ScenarioEffect]
    started_tick: int
    gatherings: list[GatheringHint] = []


# ---------------------------------------------------------------------------
# v2: Sentiment / voices
# ---------------------------------------------------------------------------
class AgentSentiment(CamelModel):
    agent_id: str
    zone_id: str
    approval: float  # 0..1 (same units as perZone + cityApprovalPct)
    toward: dict[str, float]  # per-kind opinion 0..1
    mood: str


class AgentVoice(CamelModel):
    agent_id: str
    zone_id: str
    archetype: str
    avatar_seed: str
    text: str
    stance: Literal["support", "oppose", "neutral"]
    topic: str
    position: Coord | None = (
        None  # the speaking agent's [lng,lat] (for a speech bubble in 3D)
    )
    trigger: str | None = (
        None  # what prompted it: None (tick) | "placement" | scenario type
    )


class SentimentSummary(CamelModel):
    city_approval_pct: float
    per_zone: dict[str, float]


# ---------------------------------------------------------------------------
# v2: Living-scene data
# ---------------------------------------------------------------------------
class Flow(CamelModel):
    from_infra_id: str
    to_zone_id: str
    power_kwh: float


# ---------------------------------------------------------------------------
# Recommendation
# ---------------------------------------------------------------------------
class Recommendation(CamelModel):
    position: Coord
    kind: InfraKind
    score: float
    expected_coverage_gain: float
    equity_gain: float
    rationale: str


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------
class StepRequest(CamelModel):
    ticks: int = 1


class OptimizeRequest(CamelModel):
    kind: InfraKind | None = None
    n: int = 5


class ScenarioRequest(CamelModel):
    type: ScenarioType | Literal["random"] | None = "random"
    intensity: float = 1.0  # 0..1+ multiplier on effect magnitudes
    # Optional localization: target a single zone, or a center+radius area. City-wide if none.
    zone_id: str | None = None
    center: Coord | None = None
    radius_km: float | None = None


class PlannerRunRequest(CamelModel):
    mode: Literal["auto", "step"] = "auto"
    goal: str | None = None
    budget_cad: float | None = None
