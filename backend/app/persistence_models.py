"""Pydantic models for Supabase persistence API (Phase 2)."""

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
