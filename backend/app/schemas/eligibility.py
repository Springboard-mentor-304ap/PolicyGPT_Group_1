from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


# =========================================================
# ELIGIBILITY CHECK REQUEST
# =========================================================

class EligibilityCheckRequest(BaseModel):

    scheme_id: int = Field(
        ...,
        gt=0,
    )

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
# ELIGIBILITY RULE RESPONSE
# =========================================================

class EligibilityRuleResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)

    rule_id: int
    scheme_id: int

    min_age: int | None
    max_age: int | None
    gender: str | None
    max_income: Decimal | None
    occupation: str | None
    education: str | None
    state: str | None
    social_category: str | None
    disability_status: bool | None


# =========================================================
# ELIGIBILITY CHECK RESPONSE
# =========================================================

class EligibilityCheckResponse(BaseModel):

    scheme_id: int
    scheme_name: str
    eligible: bool
    message: str
    matched_rules: list[str]
    failed_rules: list[str]


# =========================================================
# MATCHED SCHEME
# =========================================================

class MatchedScheme(BaseModel):

    scheme_id: int
    scheme_name: str
    eligible: bool
    message: str


# =========================================================
# SCHEME MATCH REQUEST
# =========================================================

class SchemeMatchRequest(BaseModel):

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
# SCHEME MATCH RESPONSE
# =========================================================

class SchemeMatchResponse(BaseModel):

    total_schemes_checked: int

    eligible_schemes: list[MatchedScheme]

    ineligible_schemes: list[MatchedScheme]
# =========================================================
# ELIGIBILITY RULE CREATE
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
# ELIGIBILITY RULE UPDATE
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