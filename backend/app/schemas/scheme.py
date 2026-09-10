from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SchemeStatus = Literal[
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "ARCHIVED",
]


class SchemeCreate(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=300,
    )

    description: str = Field(
        ...,
        min_length=1,
    )

    category: str = Field(
        ...,
        min_length=1,
        max_length=100,
    )

    ministry: str | None = Field(
        default=None,
        max_length=200,
    )

    department: str | None = Field(
        default=None,
        max_length=200,
    )

    state: str | None = Field(
        default=None,
        max_length=100,
    )

    benefits: str | None = None

    documents_required: str | None = None

    application_process: str | None = None

    application_url: str | None = None

    source_url: str | None = None


class SchemeUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=300,
    )

    description: str | None = Field(
        default=None,
        min_length=1,
    )

    category: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    ministry: str | None = Field(
        default=None,
        max_length=200,
    )

    department: str | None = Field(
        default=None,
        max_length=200,
    )

    state: str | None = Field(
        default=None,
        max_length=100,
    )

    benefits: str | None = None

    documents_required: str | None = None

    application_process: str | None = None

    application_url: str | None = None

    source_url: str | None = None


class SchemeRejectRequest(BaseModel):
    reason: str = Field(
        ...,
        min_length=1,
        max_length=1000,
    )


class SchemeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    scheme_id: int

    name: str

    description: str

    category: str

    ministry: str | None

    department: str | None

    state: str | None

    benefits: str | None

    documents_required: str | None

    application_process: str | None

    application_url: str | None

    source_url: str | None

    status: SchemeStatus

    created_by: int | None

    created_at: datetime

    updated_at: datetime


class SchemeListResponse(BaseModel):
    total: int

    page: int

    limit: int

    pages: int

    schemes: list[SchemeResponse]
