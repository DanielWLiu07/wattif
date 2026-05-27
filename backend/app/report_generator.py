"""Deterministic proposal impact report / decision memo builder (Phase 10).

Collects persisted proposal context and produces a stakeholder-readable markdown
report. No LLM keys required.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .cohort_context import fetch_concern_summaries
from .dataset_context import fetch_dataset_summaries
from .db.repositories import (
    agents as agents_repo,
    dataset_evidence_chunks as evidence_repo,
    planner_runs,
    projects,
    proposal_infrastructure,
    proposals,
    simulation_snapshots,
    synthetic_resident_reactions as reactions_repo,
)
from .db.repositories.base import PersistenceDisabledError
from .evidence_retrieval import EVIDENCE_CAVEAT

REPORT_TITLE = "Proposal Impact Report / Decision Memo (Draft)"

REACTION_CAVEAT = (
    "Synthetic reaction generated for decision support only — "
    "not a real resident response or public consultation."
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _fmt_metric(value: Any, suffix: str = "") -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.1f}{suffix}"
    return f"{value}{suffix}"


def _infra_line(row: dict[str, Any]) -> str:
    kind = row.get("kind") or "unknown"
    cap = row.get("capacity_kw") or row.get("capacityKw")
    zone = row.get("zone_id") or row.get("zoneId") or "unassigned"
    cap_s = f", {cap} kW" if cap is not None else ""
    return f"- **{kind}** — zone `{zone}`{cap_s}"


def _dataset_line(summary: dict[str, Any]) -> str:
    parts = [f"**{summary.get('name') or 'dataset'}**"]
    if summary.get("datasetType"):
        parts.append(f"type={summary['datasetType']}")
    if summary.get("rowCount") is not None:
        parts.append(f"rows={summary['rowCount']}")
    if summary.get("featureCount") is not None:
        parts.append(f"features={summary['featureCount']}")
    cols = summary.get("columns") or []
    if cols:
        parts.append(f"columns: {', '.join(str(c) for c in cols[:6])}")
    return "- " + "; ".join(parts)


def _concern_line(summary: dict[str, Any]) -> str:
    cohort = summary.get("cohortName") or "cohort"
    topic = summary.get("topic") or "planning"
    stance = summary.get("stance") or "neutral"
    severity = summary.get("severity") or "medium"
    text = summary.get("summary") or ""
    return (
        f"- **{cohort}** — `{topic}` ({stance}, {severity}): {text[:240]}"
    )


def _cohort_line(profile: dict[str, Any]) -> str:
    name = profile.get("name") or "cohort"
    ctype = profile.get("cohort_type") or profile.get("cohortType") or "generic"
    desc = profile.get("description") or ""
    line = f"- **{name}** ({ctype})"
    if desc:
        line += f": {desc[:180]}"
    return line


def _metrics_block(metrics: dict[str, Any]) -> list[str]:
    if not metrics:
        return ["No simulation metrics recorded."]
    keys = [
        ("coverage", "Coverage", "%"),
        ("approval", "Public approval", ""),
        ("equity", "Equity score", ""),
        ("emissions", "Emissions", " tCO₂e"),
        ("gridLoad", "Grid load", "%"),
        ("grid_load", "Grid load", "%"),
        ("cost", "Total cost", " CAD"),
        ("costCad", "Total cost", " CAD"),
    ]
    seen: set[str] = set()
    lines: list[str] = []
    for key, label, suffix in keys:
        if key in seen or key not in metrics:
            continue
        seen.add(key)
        lines.append(f"- **{label}:** {_fmt_metric(metrics[key], suffix)}")
    if not lines:
        for k, v in list(metrics.items())[:12]:
            lines.append(f"- **{k}:** {_fmt_metric(v)}")
    return lines


def _scenario_notes(scenarios: list[dict[str, Any]]) -> list[str]:
    if not scenarios:
        return [
            "No active stress-test scenarios were saved with the latest snapshot. "
            "Consider running heatwave, blackout, or ice-storm scenarios before saving."
        ]
    lines: list[str] = []
    for s in scenarios[:8]:
        stype = s.get("type") or s.get("scenarioType") or "scenario"
        label = s.get("label") or stype
        active = s.get("active")
        tick = s.get("startedTick") or s.get("started_tick")
        extra = f" (started tick {tick})" if tick is not None else ""
        status = "active" if active else "recorded"
        lines.append(f"- **{label}** — {status}{extra}")
    return lines


def _recommendation_section(rec: dict[str, Any] | None) -> tuple[list[str], list[str]]:
    """Return (markdown lines, tradeoff lines) from operator recommendation."""
    if not rec:
        return (
            [
                "No operator recommendation has been generated yet.",
                "",
                "Ask the planning operator to address resident concerns (e.g. "
                '"Based on resident concerns, what should we change?") after uploading '
                "datasets and generating synthetic cohort concerns.",
            ],
            [],
        )
    lines: list[str] = []
    if rec.get("summary"):
        lines.append(rec["summary"])
        lines.append("")
    concerns = rec.get("key_concerns_considered") or []
    if concerns:
        lines.append("**Concerns considered:**")
        for c in concerns[:10]:
            topic = c.get("topic") or "concern"
            cohort = c.get("cohortName") or "cohort"
            sev = c.get("severity") or "medium"
            summary = c.get("summary") or ""
            lines.append(f"- `{topic}` ({cohort}, {sev}): {summary[:200]}")
        lines.append("")
    actions = rec.get("recommended_actions") or []
    if actions:
        lines.append("**Recommended actions:**")
        for a in actions[:12]:
            action = a.get("action") or str(a)
            priority = a.get("priority")
            kinds = a.get("kinds") or []
            suffix = ""
            if priority:
                suffix += f" _(priority: {priority})_"
            if kinds:
                suffix += f" `[{', '.join(kinds)}]`"
            lines.append(f"- {action}{suffix}")
    tradeoffs = list(rec.get("tradeoffs") or [])
    next_step = rec.get("suggested_next_step")
    if next_step:
        lines.append("")
        lines.append(f"**Suggested next step:** {next_step}")
    return lines, tradeoffs


def _evidence_line(row: dict[str, Any]) -> str:
    dtype = row.get("dataset_type") or "dataset"
    field = row.get("source_field") or "row"
    row_idx = row.get("source_row_index")
    loc = f"row {row_idx}" if row_idx is not None else "upload"
    text = (row.get("chunk_text") or row.get("chunk_summary") or "")[:220]
    return f"- **[{dtype}/{field} {loc}]** {text}"


def _reaction_line(row: dict[str, Any]) -> str:
    persona = row.get("persona_label") or row.get("personaLabel") or "Synthetic cohort"
    stance = row.get("stance") or "neutral"
    summary = row.get("summary") or ""
    change = row.get("suggested_change") or row.get("suggestedChange")
    suffix = f" Suggested change: {change[:120]}." if change else ""
    return f"- **{persona}** ({stance}): {summary[:220]}{suffix}"


def _executive_summary(
    *,
    project: dict[str, Any],
    proposal: dict[str, Any],
    infra: list[dict[str, Any]],
    datasets: list[dict[str, Any]],
    concerns: list[dict[str, Any]],
    reactions: list[dict[str, Any]],
    evidence_count: int,
    has_recommendation: bool,
    snapshot: dict[str, Any] | None,
) -> list[str]:
    city = project.get("city") or "Toronto"
    pname = proposal.get("name") or "Proposal"
    status = proposal.get("status") or "draft"
    infra_kinds: dict[str, int] = {}
    for row in infra:
        k = row.get("kind") or "unknown"
        infra_kinds[k] = infra_kinds.get(k, 0) + 1
    infra_summary = (
        ", ".join(f"{k}×{n}" for k, n in sorted(infra_kinds.items()))
        if infra_kinds
        else "no persisted infrastructure yet"
    )
    snap_note = (
        f"A simulation snapshot exists (tick {snapshot.get('tick', '?')})."
        if snapshot
        else "No simulation snapshot has been saved yet."
    )
    rec_note = (
        "An operator concern-aware recommendation is on file."
        if has_recommendation
        else "No operator recommendation has been generated yet."
    )
    return [
        f"This draft decision-support memo summarizes **{pname}** ({status}) "
        f"within project **{project.get('name', 'Project')}** ({city}).",
        "",
        f"- **Persisted infrastructure:** {infra_summary}",
        f"- **Uploaded datasets:** {len(datasets)} file(s) on record (metadata/preview only)",
        f"- **Synthetic cohort concerns:** {len(concerns)} generated concern(s)",
        f"- **Synthetic resident reactions:** {len(reactions)} on-demand reaction(s)",
        f"- **Uploaded evidence snippets:** {evidence_count} extracted chunk(s)",
        f"- **Snapshot:** {snap_note}",
        f"- **Operator guidance:** {rec_note}",
        "",
        "This memo is for demo decision-support only — not engineering validation, "
        "not municipal approval evidence, and not a substitute for public consultation.",
    ]


def _caveats_section() -> list[str]:
    return [
        "- **Simplified simulation:** Metrics and scenarios reflect a rule-based demo model, "
        "not utility-grade grid or interconnection studies.",
        "- **Uploaded datasets are context only:** Files are stored as metadata, previews, and "
        "summaries. They do not regenerate zones, demand, or the full Toronto simulation.",
        "- **Synthetic concerns are not real consultation:** Cohort concerns are deterministically "
        "generated from dataset previews. They do not represent surveyed residents or validated "
        "public feedback.",
        "- **Synthetic resident reactions are decision-support only:** On-demand LLM or fallback "
        f"persona reactions are not real residents or public consultation ({REACTION_CAVEAT}).",
        "- **Uploaded evidence is incomplete context:** Snippets are extracted from uploads "
        f"via lightweight lexical retrieval — not validated public consultation ({EVIDENCE_CAVEAT}).",
        "- **Not engineering-grade grid validation:** Headroom, feeder constraints, and outage "
        "impacts are illustrative.",
        "- **Not final municipal approval evidence:** This report must not be used as official "
        "planning or approval documentation.",
    ]


def _next_steps_section(
    *,
    has_recommendation: bool,
    has_concerns: bool,
    has_datasets: bool,
    has_snapshot: bool,
) -> list[str]:
    steps: list[str] = []
    if not has_datasets:
        steps.append(
            "Upload EV, demand, or public-feedback datasets to ground synthetic cohort concerns."
        )
    if not has_concerns:
        steps.append(
            "Generate dataset-grounded synthetic cohort concerns from the Saved tab."
        )
    if not has_recommendation:
        steps.append(
            "Ask the planning operator to address resident concerns and produce a "
            "concern-aware recommendation."
        )
    if not has_snapshot:
        steps.append(
            "Run the simulation, apply stress-test scenarios if relevant, and save a snapshot "
            "to capture metrics."
        )
    steps.extend(
        [
            "Review tradeoffs with stakeholders before committing to infrastructure changes.",
            "Validate assumptions with real utility data and public engagement processes.",
            "Re-run the operator after material proposal changes to refresh recommendations.",
        ]
    )
    return [f"- {s}" for s in steps]


def fetch_operator_recommendation(proposal_id: str) -> dict[str, Any] | None:
    """Latest persisted concern-recommendation from planner_runs, if any."""
    runs = planner_runs.list_runs(proposal_id=proposal_id, limit=20)
    for run in runs:
        if run.get("mode") == "concern_recommendation":
            output = run.get("output") or {}
            rec = output.get("recommendation")
            if isinstance(rec, dict) and rec.get("summary"):
                return rec
    return None


def proposal_has_operator_recommendation(proposal_id: str) -> bool:
    return fetch_operator_recommendation(proposal_id) is not None


def collect_report_data(proposal_id: str) -> dict[str, Any]:
    """Fetch all persisted data needed for a proposal report."""
    proposal = proposals.get_proposal(proposal_id)
    if proposal is None:
        raise ValueError("proposal_not_found")

    project_id = proposal.get("project_id")
    project = projects.get_project(project_id) if project_id else None
    if project is None:
        raise ValueError("project_not_found")

    infra = proposal_infrastructure.list_by_proposal(proposal_id)
    snapshot = simulation_snapshots.get_latest(proposal_id)
    datasets = fetch_dataset_summaries(
        project_id=project_id,
        proposal_id=proposal_id,
    )
    concerns = fetch_concern_summaries(
        project_id=project_id,
        proposal_id=proposal_id,
    )
    profiles = agents_repo.list_profiles(project_id=project_id, proposal_id=proposal_id)

    recommendation = fetch_operator_recommendation(proposal_id)

    try:
        reactions = reactions_repo.list_by_proposal(proposal_id, limit=50)
    except Exception:
        reactions = []

    try:
        evidence = evidence_repo.list_by_proposal(proposal_id, limit=20)
    except Exception:
        evidence = []

    return {
        "project": project,
        "proposal": proposal,
        "infrastructure": infra,
        "snapshot": snapshot,
        "datasets": datasets,
        "cohorts": profiles,
        "concerns": concerns,
        "reactions": reactions,
        "evidence": evidence,
        "recommendation": recommendation,
    }


def build_report_sections(data: dict[str, Any]) -> dict[str, list[str]]:
    """Build structured section content from collected report data."""
    project = data["project"]
    proposal = data["proposal"]
    infra = data["infrastructure"]
    snapshot = data["snapshot"]
    datasets = data["datasets"]
    cohorts = data["cohorts"]
    concerns = data["concerns"]
    reactions = data.get("reactions") or []
    evidence = data.get("evidence") or []
    recommendation = data["recommendation"]

    rec_lines, rec_tradeoffs = _recommendation_section(recommendation)

    sections: dict[str, list[str]] = {
        "executive_summary": _executive_summary(
            project=project,
            proposal=proposal,
            infra=infra,
            datasets=datasets,
            concerns=concerns,
            reactions=reactions,
            evidence_count=len(evidence),
            has_recommendation=recommendation is not None,
            snapshot=snapshot,
        ),
        "proposal_infrastructure": (
            [_infra_line(r) for r in infra]
            if infra
            else ["No persisted infrastructure placements for this proposal yet."]
        ),
        "uploaded_data_sources": (
            [_dataset_line(d) for d in datasets]
            if datasets
            else [
                "No uploaded datasets on record for this project/proposal.",
                "",
                "Upload CSV/GeoJSON files from the Saved tab to provide planner context.",
            ]
        ),
        "simulation_metrics": [],
        "synthetic_concerns": [],
        "uploaded_evidence_signals": [],
        "operator_recommendations": rec_lines,
        "key_tradeoffs": [],
        "resilience_notes": [],
        "recommended_next_steps": _next_steps_section(
            has_recommendation=recommendation is not None,
            has_concerns=bool(concerns),
            has_datasets=bool(datasets),
            has_snapshot=snapshot is not None,
        ),
        "caveats": _caveats_section(),
    }

    if snapshot:
        metrics = snapshot.get("metrics") or {}
        sections["simulation_metrics"].append(
            f"Latest snapshot saved at tick **{snapshot.get('tick', '?')}** "
            f"({snapshot.get('created_at') or 'timestamp unknown'})."
        )
        sections["simulation_metrics"].append("")
        sections["simulation_metrics"].extend(_metrics_block(metrics))
        scenarios = snapshot.get("scenarios") or []
        sections["resilience_notes"] = _scenario_notes(
            scenarios if isinstance(scenarios, list) else []
        )
    else:
        sections["simulation_metrics"] = [
            "No simulation snapshot saved for this proposal.",
            "",
            "Save a snapshot from the Saved tab after running the simulation to include "
            "coverage, approval, equity, and cost metrics here.",
        ]
        sections["resilience_notes"] = _scenario_notes([])

    if cohorts:
        sections["synthetic_concerns"].append("**Synthetic cohort profiles:**")
        sections["synthetic_concerns"].extend(_cohort_line(c) for c in cohorts[:12])
        sections["synthetic_concerns"].append("")

    if concerns:
        sections["synthetic_concerns"].append("**Generated concerns:**")
        sections["synthetic_concerns"].extend(_concern_line(c) for c in concerns[:20])
    elif not cohorts:
        sections["synthetic_concerns"] = [
            "No synthetic cohort concerns have been generated yet.",
            "",
            "Upload datasets and run **Generate resident concerns** from the Saved tab.",
        ]

    if reactions:
        if not sections["synthetic_concerns"]:
            sections["synthetic_concerns"] = []
        sections["synthetic_concerns"].append("")
        sections["synthetic_concerns"].append("**Synthetic resident reactions (on-demand):**")
        sections["synthetic_concerns"].append(
            f"> {REACTION_CAVEAT}"
        )
        sections["synthetic_concerns"].extend(_reaction_line(r) for r in reactions[:12])

    if evidence:
        sections["uploaded_evidence_signals"] = [
            f"> {EVIDENCE_CAVEAT}",
            "",
            f"**{len(evidence)} snippet(s) extracted from uploaded datasets (showing up to 12):**",
        ]
        sections["uploaded_evidence_signals"].extend(_evidence_line(e) for e in evidence[:12])
    else:
        sections["uploaded_evidence_signals"] = [
            "No uploaded evidence snippets on record yet.",
            "",
            "Upload CSV/GeoJSON with text fields (comments, feedback, status notes) to extract evidence.",
        ]

    tradeoffs = list(rec_tradeoffs)
    if not tradeoffs and recommendation:
        tradeoffs = [
            "Operator recommendations balance multiple synthetic concern signals — "
            "prioritizing one cohort topic may defer others."
        ]
    if infra and concerns:
        tradeoffs.append(
            "Adding infrastructure to address one concern topic may shift siting away from "
            "zones favoured by other cohort signals."
        )
    if not tradeoffs:
        tradeoffs = [
            "Insufficient operator recommendation data to enumerate tradeoffs. "
            "Generate concerns and ask the operator for guidance first."
        ]
    sections["key_tradeoffs"] = [f"- {t}" for t in tradeoffs]

    return sections


SECTION_TITLES = {
    "executive_summary": "Executive Summary",
    "proposal_infrastructure": "Proposal Infrastructure",
    "uploaded_data_sources": "Uploaded Data Sources",
    "simulation_metrics": "Simulation Metrics / Snapshot",
    "synthetic_concerns": "Synthetic Resident & Cohort Concerns",
    "uploaded_evidence_signals": "Uploaded Evidence Signals",
    "operator_recommendations": "Operator Recommendations",
    "key_tradeoffs": "Key Tradeoffs",
    "resilience_notes": "Resilience / Stress-Test Notes",
    "recommended_next_steps": "Recommended Next Steps",
    "caveats": "Caveats",
}


def sections_to_markdown(
    sections: dict[str, list[str]],
    *,
    project_name: str,
    proposal_name: str,
    generated_at: str,
) -> str:
    lines = [
        f"# {REPORT_TITLE}",
        "",
        f"**Project:** {project_name}  ",
        f"**Proposal:** {proposal_name}  ",
        f"**Generated:** {generated_at}  ",
        "",
        "> Draft decision-support artifact — not engineering validation or public consultation.",
        "",
    ]
    for key, title in SECTION_TITLES.items():
        body = sections.get(key) or []
        lines.append(f"## {title}")
        lines.append("")
        lines.extend(body)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def markdown_to_html(markdown: str) -> str:
    """Minimal markdown → HTML for export preview (no external deps)."""
    html_lines: list[str] = [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        "<title>Proposal Impact Report</title>",
        "<style>",
        "body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;"
        "line-height:1.5;color:#1a1a1a;padding:0 1rem;}",
        "h1{font-size:1.5rem;} h2{font-size:1.15rem;margin-top:1.5rem;border-bottom:1px solid #ddd;}",
        "blockquote{background:#fff8e6;border-left:4px solid #f0a500;padding:0.5rem 1rem;}",
        "code{background:#f4f4f4;padding:0.1em 0.3em;border-radius:3px;font-size:0.9em;}",
        "ul{margin:0.5rem 0;padding-left:1.5rem;}",
        "</style>",
        "</head>",
        "<body>",
    ]
    in_ul = False
    for raw in markdown.splitlines():
        line = raw.rstrip()
        if not line:
            if in_ul:
                html_lines.append("</ul>")
                in_ul = False
            html_lines.append("<br/>")
            continue
        if line.startswith("# "):
            if in_ul:
                html_lines.append("</ul>")
                in_ul = False
            html_lines.append(f"<h1>{_inline_md(line[2:])}</h1>")
        elif line.startswith("## "):
            if in_ul:
                html_lines.append("</ul>")
                in_ul = False
            html_lines.append(f"<h2>{_inline_md(line[3:])}</h2>")
        elif line.startswith("> "):
            if in_ul:
                html_lines.append("</ul>")
                in_ul = False
            html_lines.append(f"<blockquote>{_inline_md(line[2:])}</blockquote>")
        elif line.startswith("- "):
            if not in_ul:
                html_lines.append("<ul>")
                in_ul = True
            html_lines.append(f"<li>{_inline_md(line[2:])}</li>")
        else:
            if in_ul:
                html_lines.append("</ul>")
                in_ul = False
            html_lines.append(f"<p>{_inline_md(line)}</p>")
    if in_ul:
        html_lines.append("</ul>")
    html_lines.extend(["</body>", "</html>"])
    return "\n".join(html_lines)


def _inline_md(text: str) -> str:
    out = text
    while "**" in out:
        start = out.index("**")
        end = out.index("**", start + 2)
        inner = out[start + 2 : end]
        out = out[:start] + f"<strong>{inner}</strong>" + out[end + 2 :]
    while "`" in out:
        start = out.index("`")
        end = out.index("`", start + 1)
        inner = out[start + 1 : end]
        out = out[:start] + f"<code>{inner}</code>" + out[end + 1 :]
    while "_(" in out and ")_" in out:
        start = out.index("_(")
        end = out.index(")_", start) + 2
        inner = out[start + 2 : end - 2]
        out = out[:start] + f"<em>({inner})</em>" + out[end:]
    return out


def generate_proposal_report(proposal_id: str) -> dict[str, Any]:
    """Build full report payload for a proposal."""
    try:
        data = collect_report_data(proposal_id)
    except PersistenceDisabledError:
        raise
    generated_at = _utc_now_iso()
    sections = build_report_sections(data)
    project_name = data["project"].get("name") or "Project"
    proposal_name = data["proposal"].get("name") or "Proposal"
    markdown = sections_to_markdown(
        sections,
        project_name=project_name,
        proposal_name=proposal_name,
        generated_at=generated_at,
    )
    structured = [
        {
            "id": key,
            "title": SECTION_TITLES[key],
            "markdown": "\n".join(sections.get(key) or []),
        }
        for key in SECTION_TITLES
    ]
    return {
        "projectId": data["project"].get("id"),
        "proposalId": proposal_id,
        "generatedAt": generated_at,
        "markdown": markdown,
        "html": markdown_to_html(markdown),
        "sections": structured,
        "hasOperatorRecommendation": data["recommendation"] is not None,
    }
