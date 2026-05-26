"""Deterministic cohort + concern generation from uploaded datasets (Phase 8)."""

from __future__ import annotations

import re
from typing import Any

COHORT_TYPES = (
    "ev_owners",
    "renters",
    "homeowners",
    "small_businesses",
    "seniors",
    "high_energy_burden_households",
    "climate_advocates",
    "grid_reliability_concerned",
    "generic_residents",
)

COHORT_LABELS: dict[str, str] = {
    "ev_owners": "EV owners",
    "renters": "Renters",
    "homeowners": "Homeowners",
    "small_businesses": "Small businesses",
    "seniors": "Seniors",
    "high_energy_burden_households": "High energy-burden households",
    "climate_advocates": "Climate advocates",
    "grid_reliability_concerned": "Grid reliability advocates",
    "generic_residents": "Generic residents",
}


def _norm_cols(columns: list) -> set[str]:
    return {re.sub(r"[^a-z0-9]+", "_", str(c).lower()).strip("_") for c in columns}


def _preview_text(preview: list, max_items: int = 2) -> list[str]:
    out: list[str] = []
    for row in preview[:max_items]:
        if isinstance(row, dict):
            if "properties" in row:
                props = row.get("properties") or {}
                out.append(str(props)[:180])
            else:
                out.append(str({k: row[k] for k in list(row)[:6]})[:180])
    return out


def _infra_counts(infra: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in infra:
        k = item.get("kind") or "unknown"
        counts[k] = counts.get(k, 0) + 1
    return counts


def _make_cohort(
    cohort_type: str,
    *,
    project_id: str,
    proposal_id: str | None,
    dataset_ids: list[str],
    confidence: float,
    priorities: list[str],
    description: str,
) -> dict[str, Any]:
    return {
        "name": COHORT_LABELS.get(cohort_type, cohort_type),
        "cohort_type": cohort_type,
        "archetype": cohort_type,
        "project_id": project_id,
        "proposal_id": proposal_id,
        "zone_id": None,
        "description": description,
        "priorities": priorities,
        "dataset_ids": dataset_ids,
        "confidence": round(confidence, 2),
        "context": {"priorities": priorities, "synthetic": True},
        "metadata": {"generated": True, "source": "concern_generator_v1"},
    }


def _make_concern(
    cohort_type: str,
    *,
    project_id: str,
    proposal_id: str | None,
    severity: str,
    stance: str,
    topic: str,
    summary: str,
    evidence: list[str],
    dataset_ids: list[str],
    infra_ids: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "cohort_type": cohort_type,
        "project_id": project_id,
        "proposal_id": proposal_id,
        "concern_type": topic,
        "topic": topic,
        "severity": severity,
        "stance": stance,
        "summary": summary,
        "evidence": evidence,
        "related_dataset_ids": dataset_ids,
        "related_infra_ids": infra_ids or [],
        "detail": {
            "severity": severity,
            "stance": stance,
            "topic": topic,
            "evidence": evidence,
            "synthetic": True,
        },
        "metadata": {"generated": True, "source": "concern_generator_v1"},
    }


def generate_cohorts_and_concerns(
    *,
    project_id: str,
    proposal_id: str | None,
    datasets: list[dict[str, Any]],
    proposal_infrastructure: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (cohort_profile_rows, concern_rows_without_profile_id)."""
    infra = proposal_infrastructure or []
    infra_counts = _infra_counts(infra)
    ev_placed = infra_counts.get("ev_charger", 0)
    solar_placed = infra_counts.get("solar", 0)
    battery_placed = infra_counts.get("battery", 0)
    microgrid_placed = infra_counts.get("microgrid", 0)

    cohorts: dict[str, dict[str, Any]] = {}
    concerns: list[dict[str, Any]] = []
    active_types: set[str] = set()

    def ensure_cohort(ct: str, ds_ids: list[str], conf: float, priorities: list[str], desc: str):
        if ct not in cohorts:
            cohorts[ct] = _make_cohort(
                ct,
                project_id=project_id,
                proposal_id=proposal_id,
                dataset_ids=ds_ids,
                confidence=conf,
                priorities=priorities,
                description=desc,
            )
        active_types.add(ct)

    if not datasets:
        ensure_cohort(
            "generic_residents",
            [],
            0.35,
            ["affordability", "reliability"],
            "Synthetic cohort with no uploaded datasets — generic planning concerns only.",
        )
        concerns.append(
            _make_concern(
                "generic_residents",
                project_id=project_id,
                proposal_id=proposal_id,
                severity="low",
                stance="mixed",
                topic="data_gap",
                summary=(
                    "No uploaded datasets yet — upload EV, demand, or feedback data to ground "
                    "cohort concerns."
                ),
                evidence=["No dataset previews available for this project."],
                dataset_ids=[],
            )
        )
        return list(cohorts.values()), concerns

    for ds in datasets:
        ds_id = str(ds.get("id") or "")
        ds_name = ds.get("name") or "dataset"
        dtype = (ds.get("dataset_type") or "generic").lower()
        columns = ds.get("columns") or []
        preview = ds.get("preview") or []
        row_count = ds.get("row_count")
        feature_count = ds.get("feature_count")
        col_set = _norm_cols(columns)
        snippets = _preview_text(preview)
        count_label = (
            f"{feature_count} features"
            if feature_count is not None
            else f"{row_count} rows"
            if row_count is not None
            else "preview sample"
        )

        if dtype == "ev_chargers":
            ensure_cohort(
                "ev_owners",
                [ds_id],
                0.82,
                ["charger_access", "fast_charging", "transit_adjacency"],
                f"Grounded in uploaded charger inventory ({ds_name}).",
            )
            scarcity = "limited" if (row_count or feature_count or 0) < 5 else "moderate"
            concerns.append(
                _make_concern(
                    "ev_owners",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="high" if scarcity == "limited" else "medium",
                    stance="mixed",
                    topic="ev_charger_access",
                    summary=(
                        f"Uploaded charger data ({count_label}) suggests {scarcity} fast-charging "
                        f"coverage near transit and commercial areas; current proposal has "
                        f"{ev_placed} EV charger placement(s)."
                    ),
                    evidence=[f"Dataset: {ds_name} ({dtype})", *snippets],
                    dataset_ids=[ds_id],
                )
            )
            ensure_cohort(
                "small_businesses",
                [ds_id],
                0.7,
                ["customer_dwell", "parking_turnover"],
                "Businesses near charger corridors.",
            )
            concerns.append(
                _make_concern(
                    "small_businesses",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="medium",
                    stance="support",
                    topic="ev_retail_benefit",
                    summary=(
                        "Small businesses may support additional chargers where parking turnover "
                        "and dwell time can increase local spending."
                    ),
                    evidence=[f"Columns: {', '.join(list(col_set)[:6])}", *snippets[:1]],
                    dataset_ids=[ds_id],
                )
            )

        elif dtype in ("ev_sentiment", "public_feedback"):
            ensure_cohort(
                "ev_owners",
                [ds_id],
                0.78,
                ["parking", "shared_charging", "reliability"],
                f"Feedback grounded in {ds_name}.",
            )
            parking_hit = any(
                re.search(r"park|congest|stall|curb", str(s), re.I) for s in snippets
            ) or "parking" in col_set
            stance = "oppose" if parking_hit else "mixed"
            concerns.append(
                _make_concern(
                    "ev_owners",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="high" if parking_hit else "medium",
                    stance=stance,
                    topic="parking_and_congestion",
                    summary=(
                        "Uploaded feedback highlights parking and congestion around chargers — "
                        "prioritize lots with excess capacity."
                        if parking_hit
                        else "Uploaded feedback is mixed on charger siting; monitor parking impacts."
                    ),
                    evidence=[f"Dataset: {ds_name}", *snippets],
                    dataset_ids=[ds_id],
                )
            )

        elif dtype == "energy_demand":
            ensure_cohort(
                "grid_reliability_concerned",
                [ds_id],
                0.85,
                ["peak_load", "summer_peak", "resilience"],
                f"Demand signals from {ds_name}.",
            )
            peak_hint = any(
                c in col_set for c in ("peak", "demand", "kwh", "load", "july", "summer")
            )
            concerns.append(
                _make_concern(
                    "grid_reliability_concerned",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="high" if peak_hint else "medium",
                    stance="oppose" if ev_placed > 3 and not battery_placed else "mixed",
                    topic="peak_demand_pressure",
                    summary=(
                        f"Energy demand data ({count_label}) suggests summer peak stress — "
                        "stress-test proposal under heatwave scenarios."
                    ),
                    evidence=[f"Dataset: {ds_name}", *snippets],
                    dataset_ids=[ds_id],
                )
            )
            ensure_cohort(
                "high_energy_burden_households",
                [ds_id],
                0.75,
                ["affordability", "peak_shaving"],
                "Burden-sensitive households tied to demand uploads.",
            )
            concerns.append(
                _make_concern(
                    "high_energy_burden_households",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="medium",
                    stance="support" if battery_placed or microgrid_placed else "mixed",
                    topic="affordability_and_peaks",
                    summary=(
                        "High-burden households support batteries/microgrids if they reduce peak "
                        "exposure during heatwaves."
                    ),
                    evidence=(snippets[:1] or [f"Dataset: {ds_name}"]),
                    dataset_ids=[ds_id],
                )
            )

        elif dtype == "weather_risk":
            ensure_cohort(
                "climate_advocates",
                [ds_id],
                0.8,
                ["heat_resilience", "flood_preparedness"],
                f"Climate risk context from {ds_name}.",
            )
            heat = any(
                re.search(r"heat|temperature|hvi|flood|storm|snow", str(x), re.I)
                for x in list(col_set) + snippets
            )
            concerns.append(
                _make_concern(
                    "climate_advocates",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="high" if heat else "medium",
                    stance="support",
                    topic="climate_resilience",
                    summary=(
                        "Weather-risk data supports pairing solar+battery and cooling-adjacent "
                        "resilience investments before the next heatwave."
                    ),
                    evidence=[f"Dataset: {ds_name}", *snippets],
                    dataset_ids=[ds_id],
                )
            )
            ensure_cohort(
                "seniors",
                [ds_id],
                0.72,
                ["cooling_access", "outage_safety"],
                "Seniors vulnerable to extreme heat.",
            )
            concerns.append(
                _make_concern(
                    "seniors",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="medium",
                    stance="support" if microgrid_placed else "mixed",
                    topic="heat_vulnerability",
                    summary=(
                        "Seniors prioritize reliable power and cooling during heat and storm events."
                    ),
                    evidence=(snippets[:1] or [f"Dataset: {ds_name}"]),
                    dataset_ids=[ds_id],
                )
            )

        elif dtype == "demographic":
            ensure_cohort(
                "renters",
                [ds_id],
                0.8,
                ["tenant_bills", "community_solar"],
                f"Demographics from {ds_name}.",
            )
            renter_signal = "renter" in " ".join(col_set) or "renter" in ds_name.lower()
            concerns.append(
                _make_concern(
                    "renters",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="medium",
                    stance="mixed",
                    topic="rooftop_solar_benefit",
                    summary=(
                        "Renters may not benefit from rooftop solar unless paired with community "
                        "solar or bill-credit policy."
                        if renter_signal or solar_placed
                        else "Demographic data flags equity-sensitive renters — verify bill benefits."
                    ),
                    evidence=[f"Dataset: {ds_name}", *snippets],
                    dataset_ids=[ds_id],
                )
            )
            ensure_cohort(
                "homeowners",
                [ds_id],
                0.65,
                ["property_value", "rooftop_access"],
                "Homeowner interests from demographic context.",
            )

        elif dtype == "zoning_constraints":
            ensure_cohort(
                "generic_residents",
                [ds_id],
                0.77,
                ["siting", "sensitive_land_uses"],
                f"Zoning constraints from {ds_name}.",
            )
            concerns.append(
                _make_concern(
                    "generic_residents",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="medium",
                    stance="oppose",
                    topic="zoning_and_siting",
                    summary=(
                        "Zoning/constraint layers flag no-build or sensitive areas — avoid siting "
                        "in restricted polygons."
                    ),
                    evidence=[f"Dataset: {ds_name}", *snippets],
                    dataset_ids=[ds_id],
                )
            )

        elif dtype == "grid_infrastructure":
            ensure_cohort(
                "grid_reliability_concerned",
                [ds_id],
                0.83,
                ["feeder_capacity", "substation_headroom"],
                f"Grid assets from {ds_name}.",
            )
            concerns.append(
                _make_concern(
                    "grid_reliability_concerned",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="high",
                    stance="mixed",
                    topic="grid_capacity",
                    summary=(
                        "Uploaded grid infrastructure data suggests checking feeder/substation "
                        "headroom before adding large solar or EV load clusters."
                    ),
                    evidence=[f"Dataset: {ds_name}", *snippets],
                    dataset_ids=[ds_id],
                )
            )

        else:
            ensure_cohort(
                "generic_residents",
                [ds_id],
                0.45,
                ["transparency", "local_impacts"],
                f"Generic cohort grounded loosely in {ds_name}.",
            )
            concerns.append(
                _make_concern(
                    "generic_residents",
                    project_id=project_id,
                    proposal_id=proposal_id,
                    severity="low",
                    stance="neutral",
                    topic="general_planning",
                    summary=(
                        f"Uploaded dataset '{ds_name}' adds context but type is generic — "
                        "review preview rows for local impacts."
                    ),
                    evidence=(snippets or [f"Dataset: {ds_name}"]),
                    dataset_ids=[ds_id],
                )
            )

    if ev_placed > 0:
        ensure_cohort(
            "ev_owners",
            [],
            0.6,
            ["placement_quality"],
            "Reacts to current proposal EV charger placements.",
        )
        infra_ids = [str(i.get("id")) for i in infra if i.get("kind") == "ev_charger"]
        concerns.append(
            _make_concern(
                "ev_owners",
                project_id=project_id,
                proposal_id=proposal_id,
                severity="medium",
                stance="mixed",
                topic="proposal_ev_placement",
                summary=(
                    f"Proposal includes {ev_placed} EV charger(s) — align with uploaded access "
                    "feedback and avoid parking-constrained curbs."
                ),
                evidence=[f"Proposal infrastructure: {ev_placed} ev_charger placement(s)"],
                dataset_ids=[],
                infra_ids=infra_ids,
            )
        )

    return list(cohorts.values()), concerns
