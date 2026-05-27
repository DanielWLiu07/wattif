"""Pydantic models for Supabase persistence API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class PersistenceUnavailableResponse(BaseModel):
    available: bool = False
    reason: str = "Supabase persistence is not configured"


class ProjectCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    city: str = "Toronto"
    metadata: dict[str, Any] = Field(default_factory=dict)


class Project(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    name: str
    description: str | None = None
    city: str = "Toronto"
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class ProposalCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    project_id: str
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    status: str = "draft"
    metadata: dict[str, Any] = Field(default_factory=dict)


class Proposal(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    project_id: str
    name: str
    description: str | None = None
    status: str = "draft"
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class ProposalInfrastructureCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    kind: str = Field(min_length=1, max_length=64)
    position: list[float] = Field(min_length=2, max_length=2)
    capacity_kw: float | None = None
    zone_id: str | None = None
    cost_cad: float | None = None
    status: str | None = None
    model_url: str | None = None
    placed_by: str | None = None
    client_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProposalInfrastructure(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    proposal_id: str
    kind: str
    zone_id: str | None = None
    position: list[float] | None = None
    capacity_kw: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None


class SimulationSnapshotCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    tick: int = 0
    metrics: dict[str, Any] = Field(default_factory=dict)
    scenarios: list[dict[str, Any]] = Field(default_factory=list)
    infrastructure: list[dict[str, Any]] = Field(default_factory=list)


class SimulationSnapshot(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    proposal_id: str
    tick: int
    metrics: dict[str, Any] = Field(default_factory=dict)
    scenarios: list[dict[str, Any]] = Field(default_factory=list)
    infrastructure: list[dict[str, Any]] = Field(default_factory=list)
    created_at: str | None = None


class AssetDefinitionCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str = Field(min_length=1, max_length=200)
    kind: str = Field(min_length=1, max_length=64)
    project_id: str | None = None
    spec: dict[str, Any] = Field(default_factory=dict)


class AssetDefinition(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    project_id: str | None = None
    name: str
    kind: str
    spec: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class UploadedDataset(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    project_id: str | None = None
    proposal_id: str | None = None
    name: str
    dataset_type: str
    file_type: str | None = None
    row_count: int | None = None
    feature_count: int | None = None
    columns: list[str] = Field(default_factory=list)
    preview: list[dict[str, Any]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None
    uploaded_at: str | None = None
    extracted_existing_infrastructure_count: int = 0
    invalid_existing_infrastructure_rows: int = 0
    detected_existing_infrastructure_kind: str | None = None


class UploadedInfrastructureAsset(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    project_id: str | None = None
    proposal_id: str | None = None
    dataset_id: str
    asset_kind: str
    source_type: str = "upload"
    name: str | None = None
    address: str | None = None
    latitude: float
    longitude: float
    zone_id: str | None = None
    status: str | None = None
    operator: str | None = None
    capacity_kw: float | None = None
    power_kw: float | None = None
    charger_type: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    source_row_index: int | None = None
    created_at: str | None = None


class UploadedDatasetSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    name: str
    dataset_type: str
    file_type: str | None = None
    row_count: int | None = None
    feature_count: int | None = None
    columns: list[str] = Field(default_factory=list)
    detected_type: str | None = None
    created_at: str | None = None


class CohortProfile(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    project_id: str | None = None
    proposal_id: str | None = None
    name: str
    cohort_type: str
    zone_id: str | None = None
    description: str | None = None
    priorities: list[str] = Field(default_factory=list)
    dataset_ids: list[str] = Field(default_factory=list)
    confidence: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class CohortConcern(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    cohort_id: str
    project_id: str | None = None
    proposal_id: str | None = None
    severity: str
    stance: str
    topic: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    related_dataset_ids: list[str] = Field(default_factory=list)
    related_infra_ids: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None


class CohortGenerateResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    cohorts: list[CohortProfile]
    concerns: list[CohortConcern]
    datasets_used: int = 0


class ProposalReportSection(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    title: str
    markdown: str


class ProposalReport(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    project_id: str
    proposal_id: str
    generated_at: str
    markdown: str
    html: str | None = None
    sections: list[ProposalReportSection] = Field(default_factory=list)
    has_operator_recommendation: bool = False


class SyntheticResidentReaction(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    project_id: str
    proposal_id: str | None = None
    cohort_id: str | None = None
    concern_id: str | None = None
    reaction_type: str = "llm_synthetic_reaction"
    persona_label: str | None = None
    stance: str
    summary: str
    key_concern: str | None = None
    suggested_change: str | None = None
    evidence: str | None = None
    confidence: float | None = None
    caveat: str
    source_context: dict[str, Any] = Field(default_factory=dict)
    provider: str | None = None
    model: str | None = None
    created_at: str | None = None


class SyntheticResidentReactionGenerateResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    reactions: list[SyntheticResidentReaction]
    provider: str
    model: str
    count: int
