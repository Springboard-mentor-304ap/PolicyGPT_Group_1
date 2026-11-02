from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# ============================================================
# STATUS
# ============================================================

PolicyStatus = Literal[
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "ARCHIVED",
    "ARCHIVE_REQUESTED",
    "DELETE_REQUESTED",
]


# ============================================================
# CREATE POLICY
# ============================================================


class PolicyCreate(BaseModel):
    title: str = Field(
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

    sector: str | None = Field(
        default=None,
        max_length=100,
    )

    publication_date: date | None = None

    effective_date: date | None = None

    document_url: str | None = None

    source_url: str | None = None

    benefits: list[str] | None = None

    # Eligibility module can manage these separately later.
    eligibility_rules: list[dict[str, Any]] | None = None


# ============================================================
# UPDATE POLICY
# ============================================================


class PolicyUpdate(BaseModel):
    title: str | None = Field(
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

    sector: str | None = Field(
        default=None,
        max_length=100,
    )

    publication_date: date | None = None

    effective_date: date | None = None

    document_url: str | None = None

    source_url: str | None = None

    benefits: list[str] | None = None

    eligibility_rules: list[dict[str, Any]] | None = None


# ============================================================
# REJECT POLICY
# ============================================================


class PolicyRejectRequest(BaseModel):
    reason: str = Field(
        ...,
        min_length=1,
        max_length=2000,
    )


# ============================================================
# ARCHIVE REQUEST
# ============================================================


class PolicyArchiveRequest(BaseModel):
    reason: str = Field(
        ...,
        min_length=1,
        max_length=2000,
    )


# ============================================================
# DELETE REQUEST
# ============================================================


class PolicyDeleteRequest(BaseModel):
    reason: str = Field(
        ...,
        min_length=1,
        max_length=2000,
    )


# ============================================================
# RESPONSE
# ============================================================


class PolicyResponse(BaseModel):

    model_config = ConfigDict(
        from_attributes=True,
    )

    policy_id: int

    title: str

    description: str

    category: str

    ministry: str | None

    department: str | None

    state: str | None

    sector: str | None

    publication_date: date | None

    effective_date: date | None

    status: PolicyStatus

    document_url: str | None

    source_url: str | None

    benefits: list[str] | None

    eligibility_rules: list[dict[str, Any]] | None

    created_by: int | None

    approved_by: int | None

    # Approval rejection
    rejection_reason: str | None

    # Archive request
    archive_reason: str | None

    archive_requested_by: int | None

    archive_requested_at: datetime | None

    # Delete request
    delete_reason: str | None

    delete_requested_by: int | None

    delete_requested_at: datetime | None

    # Important:
    # Stores whether delete was requested from APPROVED
    # or ARCHIVED state.
    delete_requested_from_status: str | None

    created_at: datetime

    updated_at: datetime


# ============================================================
# LIST RESPONSE
# ============================================================


class PolicyListResponse(BaseModel):

    total: int

    page: int

    limit: int

    pages: int

    policies: list[PolicyResponse]

# ============================================================
# COMPARISON RESPONSE
# ============================================================

class PolicyComparisonResponse(BaseModel):

    policy_1: PolicyResponse

    policy_2: PolicyResponse