from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# =========================================================
# POLICY STATUS
# =========================================================

PolicyStatus = Literal[
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "ARCHIVED",
]


# =========================================================
# CREATE POLICY
# =========================================================


class PolicyCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)

    description: str = Field(..., min_length=1)

    category: str = Field(..., min_length=1, max_length=100)

    ministry: str | None = Field(default=None, max_length=200)

    department: str | None = Field(default=None, max_length=200)

    state: str | None = Field(default=None, max_length=100)

    sector: str | None = Field(default=None, max_length=100)

    publication_date: date | None = None

    effective_date: date | None = None

    document_url: str | None = None

    source_url: str | None = None


# =========================================================
# UPDATE POLICY
# =========================================================


class PolicyUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)

    description: str | None = Field(default=None, min_length=1)

    category: str | None = Field(default=None, min_length=1, max_length=100)

    ministry: str | None = Field(default=None, max_length=200)

    department: str | None = Field(default=None, max_length=200)

    state: str | None = Field(default=None, max_length=100)

    sector: str | None = Field(default=None, max_length=100)

    publication_date: date | None = None

    effective_date: date | None = None

    document_url: str | None = None

    source_url: str | None = None


# =========================================================
# REJECT POLICY
# =========================================================


class PolicyRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)


# =========================================================
# POLICY RESPONSE
# =========================================================


class PolicyResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)

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

    created_by: int | None

    approved_by: int | None

    created_at: datetime

    updated_at: datetime


# =========================================================
# PAGINATED POLICY RESPONSE
# =========================================================


class PolicyListResponse(BaseModel):

    total: int

    page: int

    limit: int

    pages: int

    policies: list[PolicyResponse]
