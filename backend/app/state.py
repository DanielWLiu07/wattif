"""Process-wide world state: zones, agents, and the sim engine. Single in-memory world."""

from __future__ import annotations

import uuid

import numpy as np

from . import config
from .data.loader import load_world
from .models import (
    Flow,
    Infra,
    InfraCreate,
    MODEL_URLS,
    Scenario,
    SentimentSummary,
)
from .optimizer import DEFAULT_CAPACITY_KW, candidate_cost
from .sim.engine import SimEngine


INFRA_CLEARANCES = {
    "wind": 200.0,
    "microgrid": 120.0,
    "battery": 60.0,
    "solar": 40.0,
    "ev_charger": 30.0
}

def haversine_distance(pos1: tuple[float, float], pos2: tuple[float, float]) -> float:
    import math
    R = 6371000.0  # meters
    lon1, lat1 = math.radians(pos1[0]), math.radians(pos1[1])
    lon2, lat2 = math.radians(pos2[0]), math.radians(pos2[1])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c


class World:
    def __init__(self) -> None:
        self.zones, self.agents, self.source = load_world()
        self.zones_by_id = {z.id: z for z in self.zones}
        # Re-assign agent archetypes from the real per-zone mix (archetypes.json) when present,
        # so the agents mirror real Toronto tenure/dwelling/business mix per neighbourhood.
        _apply_archetype_mix(self.agents, self.zones_by_id)
        self.agents_by_zone: dict[str, list] = {}
        for a in self.agents:
            self.agents_by_zone.setdefault(a.zone_id, []).append(a)
        self.engine = SimEngine(self.zones, self.agents)

        # v2 session state.
        self.active_scenarios: list[Scenario] = []
        self.last_scenario_type: str | None = None
        self._scenario_rng = np.random.default_rng(config.RANDOM_SEED + 1000)

        # Causal event log + approval/coverage series (drives the Events timeline).
        self.events: list[dict] = []
        self.approval_series: list[dict] = [self._series_point()]

    # -- events / causal timeline -------------------------------------
    def _snapshot(self) -> dict:
        """Current city approval (0..1) + coverage (0..1) — for before/after deltas."""
        metrics, _ = self.engine._compute()
        return {
            "approval": float(self.engine.sentiment.city_approval_pct()),
            "coverage": float(metrics.coverage_pct),
        }

    def _series_point(self) -> dict:
        snap = self._snapshot()
        return {"tick": int(self.engine.tick), "approval": round(snap["approval"], 4),
                "coverage": round(snap["coverage"], 4)}

    def _append_series(self) -> None:
        self.approval_series.append(self._series_point())

    def record_event(self, type_: str, kind: str | None, label: str,
                     zone_ids: list[str], before: dict, after: dict, voices: list) -> dict:
        """Build + store a CityEvent linking an action to its measured effect + reactions."""
        def _st(v, s):  # stance count helper, tolerant of attr/dict
            return getattr(v, "stance", None) == s
        ev = {
            "id": f"evt-{uuid.uuid4().hex[:8]}",
            "tick": int(self.engine.tick),
            "type": type_,
            "kind": kind,
            "label": label,
            "zoneIds": zone_ids,
            "delta": {
                "approval": round(after["approval"] - before["approval"], 4),
                "coverage": round(after["coverage"] - before["coverage"], 4),
            },
            "reaction": {
                "support": sum(1 for v in voices if _st(v, "support")),
                "oppose": sum(1 for v in voices if _st(v, "oppose")),
                "neutral": sum(1 for v in voices if _st(v, "neutral")),
            },
            "voices": [
                {"text": getattr(v, "text", ""), "stance": getattr(v, "stance", "neutral"),
                 "archetype": getattr(v, "archetype", ""), "zoneId": getattr(v, "zone_id", None)}
                for v in voices
            ],
        }
        self.events.append(ev)
        self._append_series()
        return ev

    # -- agents --------------------------------------------------------
    def agents_for(self, zone_id: str | None) -> list:
        if zone_id is None:
            return self.agents
        return self.agents_by_zone.get(zone_id, [])

    # -- v2: session / scenarios --------------------------------------
    def session_reset(self) -> None:
        """Restore base state: clear placed infra + scenarios, reset sim/sentiment to tick 0."""
        self.engine.infra.clear()
        self.active_scenarios.clear()
        self.last_scenario_type = None
        self._scenario_rng = np.random.default_rng(config.RANDOM_SEED + 1000)
        self.engine.reset()
        self.events.clear()
        self.approval_series = [self._series_point()]

    def apply_scenario(
        self,
        scenario_type: str = "random",
        intensity: float = 1.0,
        zone_id: str | None = None,
        center: tuple[float, float] | None = None,
        radius_km: float | None = None,
    ) -> Scenario:
        from .scenarios import _zones_in_radius, apply_scenario

        target_idxs = None
        if zone_id is not None and zone_id in self.zones_by_id:
            target_idxs = [next(i for i, z in enumerate(self.zones) if z.id == zone_id)]
        elif center is not None and radius_km:
            idxs = _zones_in_radius(self.engine, center, radius_km)
            target_idxs = idxs or None  # fall back to city-wide if nothing in range

        scn = apply_scenario(
            self.engine, scenario_type, intensity, self._scenario_rng, target_idxs
        )
        self.active_scenarios.append(scn)
        self.last_scenario_type = scn.type
        return scn

    # -- v2: sentiment / voices / flows -------------------------------
    def sentiment_summary(self) -> SentimentSummary:
        # perZone and cityApprovalPct are the SAME 0..1 "approval" units (city ≈ mean(perZone)).
        appr = self.engine.sentiment.mean_opinion_by_zone()
        per_zone = {
            self.zones[i].id: round(float(appr[i]), 3)
            for i in range(self.engine.num_zones)
        }
        return SentimentSummary(
            city_approval_pct=round(self.engine.sentiment.city_approval_pct(), 4),
            per_zone=per_zone,
        )

    def voices(self, n: int = 8, context: str | None = None, rng=None):
        from .sim.voices import generate_voices

        ctx = context if context is not None else self.last_scenario_type
        return generate_voices(
            self.engine.sentiment, self.zones_by_id, n=n, context=ctx, rng=rng
        )

    def reaction_voices(
        self,
        trigger: str,
        zone_id: str | None = None,
        kind: str | None = None,
        n: int = 4,
        rng=None,
    ):
        """Event-driven reaction voices (placement/scenario) from the affected zone(s)."""
        from .sim.voices import reaction_voices

        zone_idxs = None
        if zone_id is not None and zone_id in self.zones_by_id:
            zone_idxs = [next(i for i, z in enumerate(self.zones) if z.id == zone_id)]
        return reaction_voices(
            self.engine.sentiment,
            self.zones_by_id,
            zone_idxs,
            trigger=trigger,
            kind=kind,
            n=n,
            rng=rng,
        )

    def scenario_reaction_voices(self, scn, n: int = 4, rng=None):
        """Reaction voices for a just-fired scenario, from the zones it touched."""
        from .sim.voices import reaction_voices

        zone_index = {z.id: i for i, z in enumerate(self.zones)}
        touched = sorted(
            {zone_index[e.zone_id] for e in scn.effects if e.zone_id in zone_index}
        )
        return reaction_voices(
            self.engine.sentiment,
            self.zones_by_id,
            touched or None,
            trigger=scn.type,
            n=n,
            rng=rng,
        )

    def flows(self) -> list[Flow]:
        return self.engine.flows()

    # -- v2: adoption programs + subject-tied sentiment ---------------
    def _resolve_scope(self, scope: str | None) -> list[int]:
        """zoneId | 'high_burden' | 'all' | None -> zone indices."""
        if scope in (None, "all", ""):
            return list(range(self.engine.num_zones))
        if scope == "high_burden":
            return [
                i
                for i, z in enumerate(self.zones)
                if z.demographics.energy_burden_index >= 0.55
            ] or list(range(self.engine.num_zones))
        if scope in self.zones_by_id:
            return [next(i for i, z in enumerate(self.zones) if z.id == scope)]
        return list(range(self.engine.num_zones))

    def launch_program(
        self, program: str, scope: str | None = "all", intensity: float = 1.0
    ) -> dict:
        zone_idxs = self._resolve_scope(scope)
        result = self.engine.launch_program(program, zone_idxs, intensity)
        result["scope"] = scope or "all"
        return result

    _PROGRAM_KIND = {
        "rooftop_solar_rebate": "solar",
        "retrofit_grant": "solar",
        "ev_incentive": "battery",
    }

    def subject_approval(self, subject: str) -> dict:
        """support/oppose toward a specific subject: 'infra:<id>' | 'kind:<k>' | 'program:<name>'."""
        kind, zone_idxs = None, None
        if subject.startswith("infra:"):
            inf = self.engine.infra.get(subject.split(":", 1)[1])
            if inf is not None:
                kind = inf.kind
                zone_idxs = [
                    self.engine._nearest_zone(inf.position)
                ]  # nearby = host zone
        elif subject.startswith("kind:"):
            kind = subject.split(":", 1)[1]
        elif subject.startswith("program:"):
            prog = subject.split(":", 1)[1]
            kind = self._PROGRAM_KIND.get(prog)
            active = [
                i
                for i in range(self.engine.num_zones)
                if self.engine.zone_adoption_incentive[i] > 0
            ]
            zone_idxs = active or None
        out = (
            self.engine.subject_approval(kind, zone_idxs)
            if kind
            else {"approval": None, "n": 0}
        )
        out["subject"] = subject
        return out

    def proposal_approval_for_infra(self, infra) -> dict:
        """Approval toward THIS specific installation among its host-zone agents."""
        zi = self.engine._nearest_zone(infra.position)
        out = self.engine.subject_approval(infra.kind, [zi])
        return {
            "proposalApproval": out["approval"],
            "supportCount": out["supportCount"],
            "opposeCount": out["opposeCount"],
            "neutralCount": out["neutralCount"],
        }

    # -- infra ---------------------------------------------------------
    def place_infra(self, payload: InfraCreate) -> Infra:
        kind = payload.kind
        # Enforce spatial clearance to prevent model overlap/clipping
        place_limit = INFRA_CLEARANCES.get(kind, 30.0)
        for existing in self.engine.infra.values():
            if existing.status == "damaged":
                continue
            dist = haversine_distance(payload.position, existing.position)
            req_dist = max(place_limit, INFRA_CLEARANCES.get(existing.kind, 30.0))
            if dist < req_dist:
                raise ValueError(
                    f"Placement Blocked: Too close to an existing {existing.kind} (requires {req_dist:.0f}m clearance, currently {dist:.1f}m)"
                )

        capacity_kw = (
            payload.capacity_kw
            if payload.capacity_kw is not None
            else _default_capacity(kind)
        )
        cost_cad = (
            payload.cost_cad
            if payload.cost_cad is not None
            else candidate_cost(kind, capacity_kw)
        )
        infra = Infra(
            id=payload.id or f"infra-{uuid.uuid4().hex[:8]}",
            kind=kind,
            position=payload.position,
            capacity_kw=capacity_kw,
            cost_cad=round(cost_cad, 2),
            model_url=payload.model_url or MODEL_URLS.get(kind, ""),
            status=payload.status,
        )
        self.engine.add_infra(infra)
        return infra

    def remove_infra(self, infra_id: str) -> bool:
        return self.engine.remove_infra(infra_id)


def _apply_archetype_mix(agents: list, zones_by_id: dict) -> None:
    """Re-sample each zone's agents' archetype from real proportions (archetypes.json).

    Defensive + deterministic; no-op (keeps current archetypes) if the file is absent/empty.
    """
    try:
        from .data.loader import load_archetypes

        mix = load_archetypes()
        if not mix:
            return
        rng = np.random.default_rng(config.RANDOM_SEED + 7)
        by_zone: dict[str, list] = {}
        for a in agents:
            by_zone.setdefault(a.zone_id, []).append(a)
        for zid, zone_agents in by_zone.items():
            props = mix.get(zid)
            if not props:
                continue
            kinds = list(props.keys())
            weights = np.array([max(0.0, props[k]) for k in kinds], dtype=float)
            total = weights.sum()
            if total <= 0:
                continue
            weights /= total
            picks = rng.choice(kinds, size=len(zone_agents), p=weights)
            for a, k in zip(zone_agents, picks):
                a.archetype = str(k)
    except Exception:  # noqa: BLE001 — archetype mix is optional, never break boot
        pass


def archetype_mix(agents: list, zones: list) -> dict[str, dict]:
    """Actual per-zone archetype proportions from the current agents (for a FE breakdown)."""
    by_zone: dict[str, dict] = {}
    counts: dict[str, int] = {}
    for a in agents:
        d = by_zone.setdefault(a.zone_id, {})
        d[a.archetype] = d.get(a.archetype, 0) + 1
        counts[a.zone_id] = counts.get(a.zone_id, 0) + 1
    out = {}
    for z in zones:
        d = by_zone.get(z.id, {})
        n = counts.get(z.id, 0) or 1
        out[z.id] = {
            k: round(v / n, 3) for k, v in sorted(d.items(), key=lambda kv: -kv[1])
        }
    return out


def _default_capacity(kind: str) -> float:
    return DEFAULT_CAPACITY_KW.get(kind, 4000.0)


# Lazily-initialized singleton so importing the module is cheap (and test-friendly).
_world: World | None = None


def get_world() -> World:
    global _world
    if _world is None:
        _world = World()
    return _world


def reset_world() -> World:
    """Rebuild the world from scratch (used by tests)."""
    global _world
    _world = World()
    return _world
