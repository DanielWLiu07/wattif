"""Public-opinion model (adapted from Agentropolis' drift idea, original implementation).

Each agent holds a per-kind opinion in [0,1] and a personal `volatility`. Scenarios and
infrastructure placements set per-kind TARGET opinions (optionally scoped to a zone and/or
archetypes); every tick each agent drifts toward its target at rate x volatility. This yields
an emergent, smooth public-opinion shift WITHOUT any pairwise social network — fast, vectorized
and deterministic. City `approvalPct` = mean opinion; per-zone approval feeds the WS zoneDeltas.
"""

from __future__ import annotations

import numpy as np

from ..models import Agent, AgentSentiment, Zone

KINDS = ["solar", "wind", "battery", "microgrid"]
KIND_IDX = {k: i for i, k in enumerate(KINDS)}
DRIFT_RATE = 0.5  # global multiplier; effective per-tick step = DRIFT_RATE * volatility

_MOODS = [
    (0.75, "enthusiastic"),
    (0.6, "supportive"),
    (0.45, "neutral"),
    (0.3, "skeptical"),
    (0.0, "frustrated"),
]


def _load_zone_priors() -> dict | None:
    """Defensive load of real attitude priors (attitudes.json) keyed by zoneId, or None."""
    try:
        from ..data.loader import load_attitudes

        return load_attitudes()
    except Exception:  # noqa: BLE001 — never break sentiment init on attitudes issues
        return None


def _load_zone_env() -> dict | None:
    """Defensive load of environment indicators (pollutionBurden/greenScore) keyed by zoneId."""
    try:
        from ..data.loader import load_environment

        return load_environment()
    except Exception:  # noqa: BLE001
        return None


# Per-kind opinion DELTAS by archetype (added to a zone's per-kind baseline). Creates
# within-zone spread and a defensible direction: renters/highrise lean to community options
# (microgrid/battery) and away from rooftop solar (can't install); suburban owners like solar
# but are wind-NIMBY; businesses value storage/reliability.
#                                        solar,  wind,  battery, microgrid
_ARCHETYPE_DELTA: dict[str, list[float]] = {
    # data-2 archetypes
    "owner-detached": [0.13, -0.12, 0.03, -0.06],  # rooftop solar yes, wind-NIMBY
    "condo-owner": [0.08, -0.04, 0.04, 0.00],  # urban owner
    "renter-low": [-0.12, -0.05, 0.03, 0.14],  # can't install -> community options
    "renter-mid": [-0.05, -0.02, 0.02, 0.08],
    "senior": [
        0.02,
        -0.06,
        0.08,
        0.06,
    ],  # reliability / heat-safety -> storage + microgrid
    "student": [0.10, 0.04, 0.03, 0.10],  # climate-urgency -> pro everything clean
    # legacy archetypes (kept for back-compat / synthetic seed)
    "renter-lowincome": [-0.12, -0.05, 0.03, 0.14],
    "renter-midincome": [-0.05, -0.02, 0.02, 0.08],
    "highrise-tenant": [-0.15, -0.08, 0.05, 0.16],
    "owner-urban": [0.08, -0.04, 0.04, 0.00],
    "owner-suburban": [0.13, -0.12, 0.03, -0.06],
    "small-business": [0.05, 0.00, 0.09, 0.03],
}


class SentimentModel:
    def __init__(self, agents: list[Agent], zones: list[Zone], seed: int = 0):
        self.n = len(agents)
        self.agents = agents
        zone_index = {z.id: i for i, z in enumerate(zones)}
        self.num_zones = len(zones)
        self.zone_idx = np.array(
            [zone_index[a.zone_id] for a in agents], dtype=np.int32
        )

        rng = np.random.default_rng(seed)

        # --- Per-zone, data-driven baseline opinion (genuinely heterogeneous) -------------
        # Blend REAL per-zone signals into a wide pro-renewable "affinity" per zone, then derive
        # per-kind baselines. Direction is documented + defensible:
        #   + pollution burden  -> want clean air (strong support)
        #   + region attitude   -> surveyed pro-renewable prior (amplified from its narrow band)
        #   + affluence         -> can afford/adopt, value resilience/environment
        #   + low green space   -> want environmental improvement
        #   - renter share      -> less able to adopt rooftop (lower overall, offset by microgrid)
        priors = _load_zone_priors() or {}
        env = _load_zone_env() or {}
        incomes = np.array(
            [z.demographics.median_income for z in zones], dtype=np.float64
        )
        inc_lo, inc_hi = float(incomes.min()), float(incomes.max())

        zone_kind_base = np.zeros((self.num_zones, 4))
        for zi, z in enumerate(zones):
            burden = z.demographics.energy_burden_index
            renter = z.demographics.renter_pct
            income_norm = (
                (z.demographics.median_income - inc_lo) / (inc_hi - inc_lo)
                if inc_hi > inc_lo
                else 0.5
            )
            zp = priors.get(z.id) or {}
            prior = float(zp.get("proRenewablePrior", 0.58))
            prior_amp = float(
                np.clip((prior - 0.50) / 0.15, 0.0, 1.0)
            )  # 0.50..0.65 -> 0..1
            ze = env.get(z.id) or {}
            pollution = float(ze.get("pollutionBurden", 0.5))
            green = float(ze.get("greenScore", 0.5))

            # Centered signals in [-1,1] give a symmetric, WIDE swing around a neutral 0.50,
            # so zone means span ~0.25..0.85 (not a narrow band). Per-kind deltas are kept small
            # so the zone MEAN tracks affinity while kinds still differ within the zone.
            pollution_c = (pollution - 0.5) * 2
            prior_c = (prior_amp - 0.5) * 2
            income_c = (income_norm - 0.5) * 2
            green_c = ((1.0 - green) - 0.5) * 2
            renter_c = (renter - 0.5) * 2
            affinity = float(
                np.clip(
                    0.50
                    + 0.18 * pollution_c  # high pollution -> want clean air
                    + 0.16 * income_c  # affluence -> afford/adopt
                    + 0.14 * prior_c  # surveyed regional attitude
                    + 0.08 * green_c  # low green -> want improvement
                    - 0.16 * renter_c,  # renters less able to adopt
                    0.15,
                    0.90,
                )
            )
            sp = float(zp.get("solarPropensity", 0.25))
            # Per-kind baselines branch from affinity (explainable spread by technology):
            zone_kind_base[zi, KIND_IDX["solar"]] = (
                affinity - 0.08 * renter + 0.06 * (sp - 0.25)
            )
            zone_kind_base[zi, KIND_IDX["wind"]] = affinity - 0.05
            zone_kind_base[zi, KIND_IDX["battery"]] = affinity + 0.02
            zone_kind_base[zi, KIND_IDX["microgrid"]] = (
                affinity + 0.06 * burden + 0.05 * renter
            )

        # --- Per-agent: zone baseline + archetype delta + variance (within-zone spread) ----
        self._base_opinion = np.zeros((self.n, 4))
        for i, a in enumerate(agents):
            base = zone_kind_base[self.zone_idx[i]].copy()
            delta = np.array(_ARCHETYPE_DELTA.get(a.archetype, [0.0, 0.0, 0.0, 0.0]))
            self._base_opinion[i] = base + delta
        # Wider per-agent jitter so a zone is a real distribution, not a constant.
        self._base_opinion = np.clip(
            self._base_opinion + rng.normal(0, 0.07, self._base_opinion.shape),
            0.02,
            0.98,
        )

        # volatility: how fast each agent moves toward target (low-income slightly more reactive)
        self.volatility = np.clip(rng.normal(0.12, 0.05, self.n), 0.03, 0.28)

        self.reset()

    def reset(self) -> None:
        self.opinion = self._base_opinion.copy()
        self.target = self._base_opinion.copy()

    # ------------------------------------------------------------------
    # Setting targets (scenarios / placements call these)
    # ------------------------------------------------------------------
    def nudge_target(
        self,
        kind: str,
        target: float,
        *,
        zone_idx: int | None = None,
        archetypes: set[str] | None = None,
        weight: float = 1.0,
    ) -> None:
        """Move the TARGET opinion for `kind` toward `target` for the selected agents.

        weight in [0,1] blends current target with the new target (1.0 = set fully).
        """
        if kind not in KIND_IDX:
            return
        ki = KIND_IDX[kind]
        mask = np.ones(self.n, dtype=bool)
        if zone_idx is not None:
            mask &= self.zone_idx == zone_idx
        if archetypes:
            arche = np.array(
                [a.archetype in archetypes for a in self.agents], dtype=bool
            )
            mask &= arche
        if not mask.any():
            return
        w = float(np.clip(weight, 0.0, 1.0))
        self.target[mask, ki] = np.clip(
            (1 - w) * self.target[mask, ki] + w * float(np.clip(target, 0.0, 1.0)),
            0.0,
            1.0,
        )

    def shift_target_all(self, kind: str, delta: float) -> None:
        """Shift every agent's target for `kind` by delta (clamped)."""
        if kind not in KIND_IDX:
            return
        ki = KIND_IDX[kind]
        self.target[:, ki] = np.clip(self.target[:, ki] + delta, 0.0, 1.0)

    def shift_target(
        self, kind: str, delta: float, zone_idxs: list[int] | None = None
    ) -> None:
        """Shift target for `kind` by delta, optionally only for agents in given zones."""
        if kind not in KIND_IDX:
            return
        if zone_idxs is None:
            self.shift_target_all(kind, delta)
            return
        ki = KIND_IDX[kind]
        mask = np.isin(self.zone_idx, np.asarray(zone_idxs))
        self.target[mask, ki] = np.clip(self.target[mask, ki] + delta, 0.0, 1.0)

    def on_placement(self, kind: str, zone_idx: int) -> None:
        """A placed installation nudges local opinion: seeing it work raises support, but a
        turbine raises noise opposition among suburban owners."""
        self.nudge_target(kind, 0.8, zone_idx=zone_idx, weight=0.5)
        if kind == "wind":
            self.nudge_target(
                "wind",
                0.25,
                zone_idx=zone_idx,
                archetypes={"owner-suburban", "owner-urban"},
                weight=0.6,
            )

    # ------------------------------------------------------------------
    # Tick
    # ------------------------------------------------------------------
    def step(self) -> None:
        """Drift every opinion toward its target at rate x volatility (vectorized)."""
        step = (self.target - self.opinion) * (DRIFT_RATE * self.volatility[:, None])
        self.opinion = np.clip(self.opinion + step, 0.0, 1.0)

    # ------------------------------------------------------------------
    # Readouts
    # ------------------------------------------------------------------
    def agent_mean_opinion(self) -> np.ndarray:
        return self.opinion.mean(axis=1)

    def approval_by_zone(self) -> np.ndarray:
        """Mean approval (-1..1) per zone. (Internal; the API uses the 0..1 form below.)"""
        return 2.0 * self.mean_opinion_by_zone() - 1.0

    def mean_opinion_by_zone(self) -> np.ndarray:
        """Mean opinion (0..1 'approval rate') per zone — SAME units as city_approval_pct, so
        city ≈ mean(perZone). This is what the API/HUD/map tint all use."""
        op = self.agent_mean_opinion()
        out = np.zeros(self.num_zones)
        counts = np.zeros(self.num_zones)
        np.add.at(out, self.zone_idx, op)
        np.add.at(counts, self.zone_idx, 1.0)
        with np.errstate(divide="ignore", invalid="ignore"):
            return np.where(counts > 0, out / counts, 0.0)

    def city_approval_pct(self) -> float:
        """Mean opinion across all agents/kinds, 0..1 — equals the agent-weighted mean of perZone."""
        return float(self.opinion.mean())

    @staticmethod
    def _mood(mean_opinion: float) -> str:
        for thresh, label in _MOODS:
            if mean_opinion >= thresh:
                return label
        return "frustrated"

    def agent_sentiment(self, i: int) -> AgentSentiment:
        a = self.agents[i]
        # 0..1 "approval" units, consistent with perZone + cityApprovalPct.
        toward = {k: round(float(self.opinion[i, KIND_IDX[k]]), 3) for k in KINDS}
        mean_op = float(self.opinion[i].mean())
        return AgentSentiment(
            agent_id=a.id,
            zone_id=a.zone_id,
            approval=round(mean_op, 3),
            toward=toward,
            mood=self._mood(mean_op),
        )
