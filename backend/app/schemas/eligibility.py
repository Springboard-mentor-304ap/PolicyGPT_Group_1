from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# =========================================================
# TYPES
# =========================================================

EntityType = Literal["policy", "scheme"]


# =========================================================
# COMMON ELIGIBILITY PROFILE
# =========================================================


class EligibilityProfile(BaseModel):
    age: int = Field(
        ...,
        ge=0,
        le=120,
    )

    gender: str = Field(
        ...,
        min_length=1,
        max_length=30,
    )

    annual_income: Decimal | None = Field(
        default=None,
        ge=0,
    )

    occupation: str | None = Field(
        default=None,
        max_length=150,
    )

    education: str | None = Field(
        default=None,
        max_length=150,
    )

    state: str | None = Field(
        default=None,
        max_length=100,
    )

    social_category: str | None = Field(
        default=None,
        max_length=100,
    )

    disability_status: bool | None = None


# =========================================================
# CREATE RULE
# =========================================================


class EligibilityRuleCreate(BaseModel):
    min_age: int | None = Field(
        default=None,
        ge=0,
        le=120,
    )

    max_age: int | None = Field(
        default=None,
        ge=0,
        le=120,
    )

    gender: str | None = Field(
        default=None,
        max_length=30,
    )

    max_income: Decimal | None = Field(
        default=None,
        ge=0,
    )

    occupation: str | None = Field(
        default=None,
        max_length=150,
    )

    education: str | None = Field(
        default=None,
        max_length=150,
    )

    state: str | None = Field(
        default=None,
        max_length=100,
    )

    social_category: str | None = Field(
        default=None,
        max_length=100,
    )

    disability_status: bool | None = None


# =========================================================
# UPDATE RULE
# =========================================================


class EligibilityRuleUpdate(BaseModel):
    min_age: int | None = Field(
        default=None,
        ge=0,
        le=120,
    )

    max_age: int | None = Field(
        default=None,
        ge=0,
        le=120,
    )

    gender: str | None = Field(
        default=None,
        max_length=30,
    )

    max_income: Decimal | None = Field(
        default=None,
        ge=0,
    )

    occupation: str | None = Field(
        default=None,
        max_length=150,
    )

    education: str | None = Field(
        default=None,
        max_length=150,
    )

    state: str | None = Field(
        default=None,
        max_length=100,
    )

    social_category: str | None = Field(
        default=None,
        max_length=100,
    )

    disability_status: bool | None = None

    is_active: bool | None = None


# =========================================================
# RULE RESPONSE
# =========================================================


class EligibilityRuleResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    rule_id: int

    policy_id: int | None = None

    scheme_id: int | None = None

    min_age: int | None = None

    max_age: int | None = None

    gender: str | None = None

    max_income: Decimal | None = None

    occupation: str | None = None

    education: str | None = None

    state: str | None = None

    social_category: str | None = None

    disability_status: bool | None = None

    is_active: bool

    created_at: datetime

    updated_at: datetime


# =========================================================
# CHECK ONE ENTITY
# =========================================================


class EligibilityCheckRequest(EligibilityProfile):
    entity_type: EntityType

    entity_id: int = Field(
        ...,
        gt=0,
    )


class EligibilityCheckResponse(BaseModel):
    entity_type: EntityType

    entity_id: int

    entity_name: str

    eligible: bool

    message: str

    matched_rules: list[str]

    failed_rules: list[str]


# =========================================================
# MATCH ALL ENTITIES
# =========================================================


class EligibilityMatchRequest(EligibilityProfile):
    entity_type: EntityType


class MatchedEntity(BaseModel):
    entity_id: int

    entity_name: str

    eligible: bool

    message: str


class EligibilityMatchResponse(BaseModel):
    entity_type: EntityType

    total_checked: int

    eligible_entities: list[MatchedEntity]

    ineligible_entities: list[MatchedEntity]


# =========================================================
# SAVED ELIGIBILITY RESULTS (per-user bookmarks)
# =========================================================


class SavedEligibilityCreate(BaseModel):
    entity_type: EntityType

    entity_id: int = Field(
        ...,
        gt=0,
    )

    profile: EligibilityProfile


class SavedEligibilityResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    saved_id: int

    entity_type: str

    entity_id: int

    entity_name: str

    eligible: bool

    message: str | None = None

    profile_data: dict | None = None

    saved_at: datetime
