from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SchemeStatus = Literal[
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "ARCHIVED",
    "ARCHIVE_REQUESTED",
    "DELETE_REQUESTED",
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

    eligibility_state: str | None = Field(
        default=None,
        max_length=100,
    )

    benefits: list[str] | None = None

    key_highlights: list[str] | None = None

    additional_info: str | None = None

    important_notes: str | None = None

    documents_required: str | None = None

    application_process: str | None = None

    application_url: str | None = None

    application_source_url: str | None = None

    source_url: str | None = None

    eligibility_rules: list[dict[str, Any]] | None = None

    related_policy_id: int | None = None

    launch_date: date | None = None


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

    eligibility_state: str | None = Field(
        default=None,
        max_length=100,
    )

    benefits: list[str] | None = None

    key_highlights: list[str] | None = None

    additional_info: str | None = None

    important_notes: str | None = None

    documents_required: str | None = None

    application_process: str | None = None

    application_url: str | None = None

    application_source_url: str | None = None

    source_url: str | None = None

    eligibility_rules: list[dict[str, Any]] | None = None

    related_policy_id: int | None = None

    launch_date: date | None = None


class SchemeRejectRequest(BaseModel):
    reason: str = Field(
        ...,
        min_length=1,
        max_length=2000,
    )


class SchemeArchiveRequest(BaseModel):
    reason: str = Field(
        ...,
        min_length=1,
        max_length=2000,
    )


class SchemeDeleteRequest(BaseModel):
    reason: str = Field(
        ...,
        min_length=1,
        max_length=2000,
    )


class SchemeResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    scheme_id: int

    name: str

    description: str

    category: str

    ministry: str | None

    department: str | None

    state: str | None

    eligibility_state: str | None = None

    benefits: list[str] | None

    key_highlights: list[str] | None = None

    additional_info: str | None = None

    important_notes: str | None = None

    documents_required: str | None

    application_process: str | None

    application_url: str | None

    application_source_url: str | None = None

    source_url: str | None

    status: SchemeStatus

    eligibility_rules: list[dict[str, Any]] | None

    created_by: int | None

    approved_by: int | None

    #: Latest editor (draft ownership); created_by never changes.
    updated_by: int | None = None

    rejection_reason: str | None

    archive_reason: str | None

    archive_requested_by: int | None

    archive_requested_at: datetime | None

    delete_reason: str | None

    delete_requested_by: int | None

    delete_requested_at: datetime | None

    delete_requested_from_status: str | None

    related_policy_id: int | None = None

    #: Display title of the referenced policy (transient, resolved by
    #: the backend from the real policy row; never stored on schemes).
    related_policy_title: str | None = None

    launch_date: date | None = None

    # Soft delete (trash). Backward-compatible additions: existing rows
    # read as not deleted. Trash endpoints also populate the transient
    # display names below (never stored).
    is_deleted: bool = False

    deleted_at: datetime | None = None

    deleted_by: int | None = None

    created_by_name: str | None = None

    #: Live role of the creator (populated on single-entity reads).
    created_by_role: str | None = None

    #: Live display name/role of the approver (single-entity reads).
    approved_by_name: str | None = None

    approved_by_role: str | None = None

    deleted_by_name: str | None = None

    requested_by_name: str | None = None

    created_at: datetime

    updated_at: datetime


class SchemeListResponse(BaseModel):
    total: int

    page: int

    limit: int

    pages: int

    schemes: list[SchemeResponse]
