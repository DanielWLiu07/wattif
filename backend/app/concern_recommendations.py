"""Concern-aware operator recommendations (Phase 9).

Deterministic mapping from synthetic cohort concerns to structured proposal
improvements. Usable without real LLM keys; an LLM may rephrase but is not required.
"""

from __future__ import annotations

import re
from typing import Any

from .optimizer import DEFAULT_CAPACITY_KW, candidate_cost

# User prompts that trigger operator recommendation mode (not generic placement).
_CONCERN_IMPROVEMENT_PATTERNS = (
    r"based on (?:resident )?concern",
    r"address (?:the )?(?:uploaded )?(?:feedback|concern)",
    r"resident concern",
    r"uploaded feedback",
    r"reduce opposition",
    r"heatwave resilience",
    r"heat wave resilience",
    r"heatwave",
    r"improve (?:this )?proposal",
    r"concern[s]? to recommend",
    r"use (?:the )?(?:resident )?concern",
    r"from (?:resident )?concern",
    r"cohort concern",
    r"synthetic concern",
    r"what should i change",
    r"what should we change",
    r"how do we reduce opposition",
    r"what should i add for heat",
)


def is_concern_improvement_intent(text: str, intent: str | None = None) -> bool:
    if (intent or "").lower() in (
        "concern_recommendation",
        "concern",
        "address_concerns",
    ):
        return True
    t = (text or "").lower().strip()
    if not t:
        return False
    return any(re.search(p, t) for p in _CONCERN_IMPROVEMENT_PATTERNS)


def _topic_rule(topic: str) -> dict[str, Any]:
    """Static planning advice keyed by concern topic."""
    rules: dict[str, dict[str, Any]] = {
        "ev_charger_access": {
            "kinds": ["ev_charger"],
            "action": (
                "Add EV chargers near high-demand, transit-adjacent, and commercial zones "
                "where uploaded charger inventory shows coverage gaps."
            ),
            "tradeoff": (
                "Curbside chargers improve access but can compete for parking unless paired "
                "with lot/garage siting."
            ),
        },
        "proposal_ev_placement": {
            "kinds": ["ev_charger"],
            "action": (
                "Re-site or supplement existing proposal EV chargers using uploaded access "
                "feedback — favour off-street lots and lower-conflict corridors."
            ),
            "tradeoff": "Moving chargers may reduce visibility but lowers parking opposition.",
        },
        "parking_and_congestion": {
            "kinds": ["ev_charger"],
            "action": (
                "Place chargers in parking lots, parkades, or retail rear lots rather than "
                "high-turnover curb spaces flagged in feedback."
            ),
            "tradeoff": "Lot-based chargers may see lower walk-up use but reduce congestion complaints.",
        },
        "ev_retail_benefit": {
            "kinds": ["ev_charger"],
            "action": (
                "Pilot chargers at commercial nodes where dwell time supports local business "
                "and parking turnover is manageable."
            ),
            "tradeoff": "Retail-adjacent sites need coordination with business owners.",
        },
        "peak_demand_pressure": {
            "kinds": ["battery", "microgrid"],
            "action": (
                "Add battery storage or a community microgrid hub to shave summer peaks before "
                "scaling EV load clusters."
            ),
            "tradeoff": "Storage adds capital cost but reduces peak-driven opposition and outage risk.",
        },
        "affordability_and_peaks": {
            "kinds": ["battery", "microgrid"],
            "action": (
                "Pair batteries or microgrids with community solar/bill-credit framing in high "
                "energy-burden zones so peak relief reaches bill-sensitive households."
            ),
            "tradeoff": "Community-scale assets need clear bill-credit or shared-benefit framing.",
        },
        "climate_resilience": {
            "kinds": ["battery", "microgrid"],
            "action": (
                "Combine solar + battery and designate a microgrid anchor before the next "
                "heat or storm season."
            ),
            "tradeoff": "Resilience hubs cost more upfront than generation-only builds.",
        },
        "heat_vulnerability": {
            "kinds": ["microgrid", "battery"],
            "action": (
                "Prioritize microgrid/battery support near cooling centres and senior-serving "
                "zones; run a heatwave scenario to stress-test the proposal."
            ),
            "tradeoff": "Cooling-adjacent resilience may defer other equity-weighted solar sites.",
        },
        "rooftop_solar_benefit": {
            "kinds": ["solar", "microgrid"],
            "action": (
                "Add community solar or a microgrid with bill-credit framing so renters — not "
                "only homeowners — benefit from rooftop-scale investments."
            ),
            "tradeoff": "Community programs need policy/partnership design beyond siting alone.",
            "program": "rooftop_solar_rebate",
        },
        "zoning_and_siting": {
            "kinds": ["solar", "wind"],
            "action": (
                "Avoid protected/no-build and sensitive land-use polygons; re-rank optimizer "
                "candidates away from constrained zones."
            ),
            "tradeoff": "Excluding constrained areas may shift assets to less optimal solar/wind yield.",
        },
        "grid_capacity": {
            "kinds": ["battery", "solar"],
            "action": (
                "Stage deployment: add batteries first or split solar/EV clusters to stay within "
                "uploaded feeder/substation headroom."
            ),
            "tradeoff": "Staged rollout slows coverage gains but reduces grid-upgrade backlash.",
        },
        "data_gap": {
            "kinds": [],
            "action": (
                "Upload EV, demand, or feedback datasets and regenerate cohort concerns before "
                "committing to major infrastructure changes."
            ),
            "tradeoff": "Without datasets, recommendations stay generic planning heuristics only.",
        },
        "general_planning": {
            "kinds": ["solar", "battery"],
            "action": (
                "Review uploaded dataset preview rows for local impacts and align the next "
                "placement tranche with the highest-severity synthetic concerns."
            ),
            "tradeoff": "Generic datasets may not justify a single technology choice.",
        },
    }
    return rules.get(
        topic,
        {
            "kinds": ["solar", "battery"],
            "action": f"Review and address the '{topic}' concern with equity-weighted siting.",
            "tradeoff": "Topic-specific tradeoffs depend on uploaded evidence.",
        },
    )


def _infra_counts(infra: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in infra:
        k = row.get("kind") or "unknown"
        counts[k] = counts.get(k, 0) + 1
    return counts


def _merge_infra_counts(*sources: dict[str, int]) -> dict[str, int]:
    out: dict[str, int] = {}
    for src in sources:
        for k, n in src.items():
            out[k] = out.get(k, 0) + n
    return out


def _format_infra_counts(counts: dict[str, int]) -> str:
    if not counts:
        return "none"
    return ", ".join(f"{k}×{n}" for k, n in sorted(counts.items()))


_LOCATION_STOPWORDS = frozenset(
    {
        "csv",
        "json",
        "geojson",
        "dataset",
        "uploaded",
        "owner",
        "feedback",
        "energy",
        "demand",
        "chargers",
        "charger",
        "file",
        "data",
        "rows",
        "preview",
        "sample",
        "generic",
        "public",
        "ev",
        "west",
        "east",
        "north",
        "south",
        "centre",
        "center",
        "city",
        "mall",
        "area",
        "station",
    }
)

# Distinctive place tokens from uploaded filenames / evidence.
_NAMED_AREAS = (
    "islington",
    "kipling",
    "cloverdale",
    "parkdale",
    "etobicoke",
    "scarborough",
    "north york",
    "downtown",
)


def extract_location_hints(
    datasets: list[dict[str, Any]],
    concerns: list[dict[str, Any]] | None = None,
) -> list[str]:
    """Extract geographic tokens from dataset names and concern evidence."""
    raw_text: list[str] = []
    for d in datasets:
        raw_text.append(str(d.get("name") or ""))
    for c in concerns or []:
        raw_text.append(str(c.get("summary") or ""))
        for ev in c.get("evidence") or []:
            raw_text.append(str(ev))

    hints: set[str] = set()
    for text in raw_text:
        norm = text.lower().replace("_", " ").replace("-", " ")
        for named in _NAMED_AREAS:
            if named.replace(" ", "") in norm.replace(" ", "") or named in norm:
                hints.add(named.replace(" ", ""))
        for word in re.findall(r"[a-z]{5,}", norm):
            if word not in _LOCATION_STOPWORDS:
                hints.add(word)
    return sorted(hints)


def _effective_location_hints(hints: list[str]) -> list[str]:
    """Drop weak geographic tokens when stronger named-area hints exist."""
    weak = {"west", "east", "north", "south", "centre", "center", "city", "mall", "area", "station"}
    strong = [h for h in hints if h not in weak]
    return strong if strong else hints


def rank_zones_by_hints(
    engine: Any, hints: list[str]
) -> tuple[list[str], str | None, str | None, str | None]:
    """Return (aligned_zone_ids, location_note, primary_zone_id, primary_zone_name)."""
    hints = _effective_location_hints(hints)
    if not hints:
        return [], None, None, None

    primary_hint = next((h for h in _NAMED_AREAS if h.replace(" ", "") in hints or h in hints), None)

    scored: list[tuple[int, str, str]] = []
    for z in engine.zones:
        zn = z.name.lower().replace("-", " ").replace("_", " ")
        score = 0
        for h in hints:
            if h in zn.replace(" ", ""):
                score += 3
            elif h in zn:
                score += 2
            elif any(h in tok for tok in zn.split()):
                score += 1
        if score > 0:
            if primary_hint and primary_hint not in zn.replace(" ", "") and primary_hint not in zn:
                continue  # strict: must match primary named area when present
            scored.append((score, z.id, z.name))

    if not scored:
        shown = ", ".join(hints[:4])
        return [], (
            f"No Toronto zone matched dataset area hints ({shown}); "
            "using equity-weighted citywide optimizer ranking as fallback."
        ), None, None

    scored.sort(key=lambda x: (-x[0], x[2]))
    top_score = scored[0][0]
    aligned = [zid for s, zid, _ in scored if s == top_score]
    primary_id = aligned[0]
    primary_name = scored[0][2]
    note = f"Prioritizing placements in {primary_name} based on uploaded dataset geography."
    return aligned, note, primary_id, primary_name


def _concern_topics_for_kind(kind: str, topics: list[str]) -> list[str]:
    kind_topics = {
        "ev_charger": {
            "parking_and_congestion",
            "ev_charger_access",
            "proposal_ev_placement",
            "ev_retail_benefit",
        },
        "battery": {
            "peak_demand_pressure",
            "affordability_and_peaks",
            "heat_vulnerability",
            "grid_capacity",
        },
        "microgrid": {
            "peak_demand_pressure",
            "affordability_and_peaks",
            "heat_vulnerability",
            "climate_resilience",
        },
    }
    relevant = kind_topics.get(kind, set())
    return [t for t in topics if t in relevant] or topics[:2]


def _placement_rationale(
    kind: str,
    zone_name: str,
    *,
    geo_aligned: bool,
    primary_zone_name: str | None,
    concern_topics: list[str],
) -> str:
    topics = _concern_topics_for_kind(kind, concern_topics)
    topic_set = set(topics)

    if kind == "battery":
        reason = (
            "Battery storage for peak-demand shaving, heatwave resilience, and "
            "high energy-burden household support."
        )
    elif kind == "ev_charger":
        if "parking_and_congestion" in topic_set or "proposal_ev_placement" in topic_set:
            reason = "Parking-aware EV charger siting based on uploaded resident feedback."
        else:
            reason = "EV charger access improvement based on uploaded charger inventory and feedback."
    elif kind == "microgrid":
        reason = (
            "Community microgrid for peak support and resilience based on uploaded demand concerns."
        )
    else:
        reason = "Concern-aware infrastructure placement."

    if geo_aligned and primary_zone_name:
        return f"{reason} Placed in {zone_name} — matches uploaded dataset geography ({primary_zone_name})."
    if primary_zone_name:
        return (
            f"{reason} Fallback placement in {zone_name} — no budget-feasible site in "
            f"{primary_zone_name}; ranked citywide by equity and demand."
        )
    return f"{reason} Placed in {zone_name}."


def _collapse_deferred_actions(
    raw: list[dict[str, Any]],
    *,
    max_items: int = 2,
    remaining_budget: float | None = None,
) -> list[dict[str, Any]]:
    """Group repetitive over-budget deferrals into short summaries."""
    if not raw:
        return []

    by_kind: dict[str, list[dict[str, Any]]] = {}
    for item in raw:
        kind = (item.get("kinds") or ["asset"])[0]
        by_kind.setdefault(kind, []).append(item)

    out: list[dict[str, Any]] = []
    rem = remaining_budget
    for kind, items in by_kind.items():
        if len(out) >= max_items:
            break
        cost = items[0].get("estimatedCostCad") or 0
        rem_txt = f"{rem:,.0f} CAD remaining" if rem is not None else "budget exhausted"
        if len(items) == 1:
            zone = items[0].get("zoneName") or items[0].get("zoneId") or "selected zone"
            out.append(
                {
                    "action": (
                        f"Defer {kind} near {zone} (~{cost:,.0f} CAD) — exceeds {rem_txt}."
                    ),
                    "kinds": [kind],
                    "priority": "deferred",
                    "sourceTopics": ["budget"],
                    "deferred": True,
                    "deferredCount": 1,
                    "estimatedCostCad": cost,
                }
            )
        else:
            out.append(
                {
                    "action": (
                        f"Defer {kind} placements ({len(items)} candidate sites, ~{cost:,.0f} CAD each) "
                        f"— exceeds {rem_txt}. Increase budget or stage smaller assets first."
                    ),
                    "kinds": [kind],
                    "priority": "deferred",
                    "sourceTopics": ["budget"],
                    "deferred": True,
                    "deferredCount": len(items),
                    "estimatedCostCad": cost,
                }
            )
    return out[:max_items]


def deduplicate_concerns(concerns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge duplicate/near-duplicate concerns by topic + cohort + stance."""
    severity_rank = {"high": 0, "medium": 1, "low": 2}
    merged: dict[tuple[str, str, str], dict[str, Any]] = {}

    for c in concerns:
        topic = c.get("topic") or c.get("concern_type") or "general_planning"
        cohort = str(c.get("cohortName") or c.get("cohortId") or "cohort")
        stance = str(c.get("stance") or "neutral")
        key = (topic, cohort, stance)

        if key not in merged:
            merged[key] = {
                **c,
                "topic": topic,
                "evidence": list(c.get("evidence") or [])[:5],
                "relatedDatasetIds": list(c.get("relatedDatasetIds") or []),
                "_mergedCount": 1,
            }
            continue

        m = merged[key]
        m["_mergedCount"] = int(m.get("_mergedCount", 1)) + 1
        for ev in c.get("evidence") or []:
            if ev and ev not in m["evidence"]:
                m["evidence"].append(str(ev))
        m["evidence"] = m["evidence"][:5]
        for ds_id in c.get("relatedDatasetIds") or []:
            if ds_id and ds_id not in m["relatedDatasetIds"]:
                m["relatedDatasetIds"].append(ds_id)
        if severity_rank.get(str(c.get("severity", "medium")).lower(), 1) < severity_rank.get(
            str(m.get("severity", "medium")).lower(), 1
        ):
            m["severity"] = c.get("severity")
        if c.get("summary") and c["summary"] not in (m.get("summary") or ""):
            m["summary"] = f"{m.get('summary', '')} Also: {c['summary']}".strip()

    out = []
    for m in merged.values():
        count = m.pop("_mergedCount", 1)
        if count > 1:
            m["summary"] = (m.get("summary") or "").rstrip(".")
            m["summary"] = (
                f"{m['summary']} (combined signal from {count} similar concerns)."
                if m.get("summary")
                else f"Combined signal from {count} similar concerns."
            )
        out.append(m)
    return out


def _estimate_placement_cost(kind: str) -> float:
    cap = DEFAULT_CAPACITY_KW.get(kind, 4000.0)
    return candidate_cost(kind, cap)


def _optimize_actions(
    tools: Any,
    kinds: list[str],
    *,
    max_per_kind: int = 1,
    location_hints: list[str] | None = None,
    concern_topics: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str | None]:
    """Build budget-filtered optional placements; return (affordable, deferred, location_note)."""
    actions: list[dict[str, Any]] = []
    raw_deferred: list[dict[str, Any]] = []
    seen_zones: set[str] = set()
    remaining = float(tools.remaining)
    topics = concern_topics or []

    priority_zone_ids, location_note, _primary_id, primary_zone_name = rank_zones_by_hints(
        tools.engine, location_hints or []
    )

    def _is_geo_aligned(zid: str) -> bool:
        return bool(priority_zone_ids and zid in priority_zone_ids)

    def _record_deferred(kind: str, zid: str, zone_name: str, cost: float) -> None:
        raw_deferred.append(
            {
                "kinds": [kind],
                "zoneId": zid,
                "zoneName": zone_name,
                "estimatedCostCad": round(cost, 2),
            }
        )

    for kind in kinds:
        if not kind or kind not in DEFAULT_CAPACITY_KW:
            continue
        cost = _estimate_placement_cost(kind)
        placed = 0
        kind_deferred = False

        for zid in priority_zone_ids:
            if placed >= max_per_kind or zid in seen_zones:
                continue
            zone = next((z for z in tools.engine.zones if z.id == zid), None)
            if zone is None:
                continue
            zi = next(
                (i for i, z in enumerate(tools.engine.zones) if z.id == zid), None
            )
            if zi is not None and bool(tools.engine.zone_no_build[zi]):
                continue
            if cost > remaining:
                if not kind_deferred:
                    _record_deferred(kind, zid, zone.name, cost)
                    kind_deferred = True
                continue
            seen_zones.add(zid)
            remaining -= cost
            actions.append(
                {
                    "name": "place_infrastructure",
                    "args": {"kind": kind, "zoneId": zid},
                    "rationale": _placement_rationale(
                        kind,
                        zone.name,
                        geo_aligned=True,
                        primary_zone_name=primary_zone_name,
                        concern_topics=topics,
                    ),
                    "estimatedCostCad": round(cost, 2),
                    "geoAligned": True,
                }
            )
            placed += 1

        if placed >= max_per_kind:
            continue

        res = tools.execute("optimize", {"kind": kind, "n": 12})
        for rec in res.get("recommendations", []):
            zid = rec.get("zoneId")
            if not zid or zid in seen_zones:
                continue

            zone_name = next(
                (z.name for z in tools.engine.zones if z.id == zid), zid
            )
            aligned = _is_geo_aligned(zid)

            if cost > remaining:
                if not kind_deferred:
                    _record_deferred(kind, zid, zone_name, cost)
                    kind_deferred = True
                break

            seen_zones.add(zid)
            remaining -= cost
            actions.append(
                {
                    "name": "place_infrastructure",
                    "args": {"kind": kind, "zoneId": zid},
                    "rationale": _placement_rationale(
                        kind,
                        zone_name,
                        geo_aligned=aligned,
                        primary_zone_name=primary_zone_name,
                        concern_topics=topics,
                    ),
                    "estimatedCostCad": round(cost, 2),
                    "geoAligned": aligned,
                }
            )
            placed += 1
            if placed >= max_per_kind:
                break

    deferred = _collapse_deferred_actions(
        raw_deferred, max_items=2, remaining_budget=float(tools.remaining)
    )
    return actions, deferred, location_note


def refresh_recommendation_after_actions(
    rec: dict[str, Any],
    *,
    proposal_infra: list[dict[str, Any]],
    session_placements: list[dict[str, Any]],
    placed_count: int,
    remaining_budget: float,
) -> dict[str, Any]:
    """Update summary/context after optional placements so infra counts are not stale."""
    persisted = _infra_counts(proposal_infra)
    session = _infra_counts(session_placements)
    combined = _merge_infra_counts(persisted, session)

    ctx = dict(rec.get("context") or {})
    ctx["proposalInfra"] = combined
    ctx["persistedInfra"] = persisted
    ctx["sessionPlacements"] = session
    ctx["placedThisTurn"] = placed_count
    ctx["remainingBudgetCad"] = round(remaining_budget, 2)

    ds_names = [
        str(d.get("name"))
        for d in (rec.get("_datasets") or [])
        if d.get("name")
    ]
    ds_label = f"Datasets referenced: {', '.join(ds_names[:4])}. " if ds_names else ""
    top_topics = [
        k.get("topic")
        for k in rec.get("key_concerns_considered", [])[:3]
        if k.get("topic")
    ]
    placement_note = ""
    if placed_count:
        placement_note = (
            f" Applied {placed_count} concern-aware placement(s) this turn "
            f"({ _format_infra_counts(session) })."
        )

    summary = (
        f"{ds_label}"
        f"Reviewed {len(rec.get('key_concerns_considered', []))} unique concern signal(s) "
        f"({ctx.get('datasetCount', 0)} uploaded dataset(s), "
        f"infra now: {_format_infra_counts(combined)}). "
        f"Top signals: {', '.join(top_topics) or 'planning'}."
        f"{placement_note} "
        f"Remaining budget: {remaining_budget:,.0f} CAD. "
        "Recommendations are decision-support only — not public consultation or engineering sign-off."
    )

    out = {**rec, "summary": summary, "context": ctx}
    out.pop("_datasets", None)
    return out


def build_concern_recommendations(
    *,
    concerns: list[dict[str, Any]],
    dataset_summaries: list[dict[str, Any]] | None = None,
    proposal_infra: list[dict[str, Any]] | None = None,
    tools: Any | None = None,
    user_message: str | None = None,
) -> dict[str, Any]:
    """Return structured operator recommendation payload traceable to concerns."""
    datasets = dataset_summaries or []
    infra = proposal_infra or []
    infra_counts = _infra_counts(infra)
    msg = (user_message or "").lower()
    concerns = deduplicate_concerns(concerns)
    location_hints = extract_location_hints(datasets, concerns)

    if not concerns:
        return {
            "summary": (
                "No synthetic cohort concerns are loaded for this project/proposal. "
                "Upload datasets, generate concerns, then ask again for grounded recommendations."
            ),
            "key_concerns_considered": [],
            "recommended_actions": [
                {
                    "action": "Upload EV, demand, or feedback CSVs and run cohort concern generation.",
                    "kinds": [],
                    "priority": "high",
                    "sourceTopics": ["data_gap"],
                }
            ],
            "tradeoffs": [
                "Without concerns, the operator can only suggest generic equity-weighted siting."
            ],
            "suggested_next_step": (
                "Open Cohort Concerns, generate from uploaded datasets, then re-run this request."
            ),
            "optional_tool_actions": [],
            "context": {
                "datasetCount": len(datasets),
                "concernCount": 0,
                "proposalInfra": infra_counts,
            },
        }

    # Sort by severity so high-signal concerns lead.
    severity_rank = {"high": 0, "medium": 1, "low": 2}
    sorted_concerns = sorted(
        concerns,
        key=lambda c: severity_rank.get(str(c.get("severity", "medium")).lower(), 1),
    )

    key_considered = []
    actions: list[dict[str, Any]] = []
    tradeoffs: list[str] = []
    kinds_needed: list[str] = []
    seen_action: set[str] = set()

    for c in sorted_concerns[:8]:
        topic = c.get("topic") or c.get("concern_type") or "general_planning"
        rule = _topic_rule(topic)
        key_considered.append(
            {
                "id": c.get("id"),
                "topic": topic,
                "cohortName": c.get("cohortName"),
                "severity": c.get("severity"),
                "stance": c.get("stance"),
                "summary": c.get("summary"),
                "evidence": (c.get("evidence") or [])[:2],
            }
        )
        action_key = rule["action"][:80]
        if action_key not in seen_action:
            seen_action.add(action_key)
            actions.append(
                {
                    "action": rule["action"],
                    "kinds": rule.get("kinds") or [],
                    "priority": c.get("severity") or "medium",
                    "sourceTopics": [topic],
                    "program": rule.get("program"),
                }
            )
            tradeoffs.append(rule["tradeoff"])
            kinds_needed.extend(rule.get("kinds") or [])

    peak_topics = {
        "peak_demand_pressure",
        "affordability_and_peaks",
        "heat_vulnerability",
        "climate_resilience",
    }
    if any(
        (c.get("topic") or c.get("concern_type")) in peak_topics for c in sorted_concerns
    ):
        heat_action = (
            "Run a heatwave scenario to stress-test summer peak exposure and EV load "
            "before finalizing charger scale-up."
        )
        if heat_action[:80] not in seen_action:
            seen_action.add(heat_action[:80])
            actions.append(
                {
                    "action": heat_action,
                    "kinds": [],
                    "priority": "high",
                    "sourceTopics": ["peak_demand_pressure", "heat_vulnerability"],
                    "scenarioType": "heatwave",
                }
            )
            tradeoffs.append(
                "Heatwave stress may reveal gaps not visible in baseline monthly metrics."
            )

    # User asked specifically about heatwave resilience.
    if re.search(r"heatwave|heat wave|heat resilience", msg):
        if not any(a.get("sourceTopics") == ["heat_vulnerability"] for a in actions):
            rule = _topic_rule("heat_vulnerability")
            actions.insert(
                0,
                {
                    "action": rule["action"],
                    "kinds": rule["kinds"],
                    "priority": "high",
                    "sourceTopics": ["heat_vulnerability"],
                },
            )
            tradeoffs.insert(0, rule["tradeoff"])
        kinds_needed = ["microgrid", "battery"] + kinds_needed

    # De-dupe kinds while preserving order (concern-driven only — no generic solar/wind).
    deduped_kinds: list[str] = []
    for k in kinds_needed:
        if k and k not in deduped_kinds:
            deduped_kinds.append(k)

    optional_tool_actions: list[dict[str, Any]] = []
    deferred_actions: list[dict[str, Any]] = []
    location_note: str | None = None
    concern_topics = [
        c.get("topic") or c.get("concern_type") or "general_planning"
        for c in sorted_concerns
    ]
    if tools and deduped_kinds:
        optional_tool_actions, deferred_actions, location_note = _optimize_actions(
            tools,
            deduped_kinds[:3],
            max_per_kind=1,
            location_hints=location_hints,
            concern_topics=concern_topics,
        )

    top_topics = [k["topic"] for k in key_considered[:3] if k.get("topic")]
    ds_names = [str(d.get("name")) for d in datasets if d.get("name")]
    ds_label = f"Datasets referenced: {', '.join(ds_names[:4])}. " if ds_names else ""
    loc_label = f"{location_note} " if location_note else ""
    summary = (
        f"{ds_label}"
        f"{loc_label}"
        f"Reviewed {len(key_considered)} unique concern signal(s) "
        f"({len(datasets)} uploaded dataset(s), proposal infra: {_format_infra_counts(infra_counts)}). "
        f"Top signals: {', '.join(top_topics) or 'planning'}. "
        "Recommendations are decision-support only — not public consultation or engineering sign-off."
    )

    all_actions = actions + deferred_actions
    next_step = "Approve optional placements below, or ask the operator to run a heatwave scenario."
    if optional_tool_actions:
        kinds = sorted({a["args"]["kind"] for a in optional_tool_actions})
        next_step = (
            f"Optional: apply {len(optional_tool_actions)} budget-feasible "
            f"{'/'.join(kinds)} placement(s) near uploaded dataset geography, then simulate 12 months."
        )
    elif deferred_actions:
        next_step = (
            "Placements deferred due to budget — increase budget or remove costly assets before applying."
        )
    elif any(a.get("program") for a in actions):
        next_step = (
            "Consider launching a rooftop-solar rebate in high-burden zones alongside infrastructure."
        )

    return {
        "summary": summary,
        "key_concerns_considered": key_considered,
        "recommended_actions": all_actions,
        "tradeoffs": tradeoffs[:5],
        "suggested_next_step": next_step,
        "optional_tool_actions": optional_tool_actions,
        "deferred_actions": deferred_actions,
        "locationHints": location_hints,
        "context": {
            "datasetCount": len(datasets),
            "concernCount": len(concerns),
            "proposalInfra": infra_counts,
            "locationHints": location_hints,
        },
        "_datasets": datasets,
    }
