from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


# Canonical audience codes. Must stay in sync with
# app.services.faq_service.FAQ_AUDIENCES and the normalize_role()
# canonical roles in app.api.routes.auth. "ALL" means visible to every
# role, including unauthenticated guests.
ALLOWED_AUDIENCES = frozenset(
    {
        "ALL",
        "ADMIN",
        "GOVERNMENT_OFFICIAL",
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
        "GUEST",
    }
)


def normalize_audience_input(
    roles: Optional[list[str]],
) -> Optional[list[str]]:
    """Normalize a target_roles payload to canonical audience codes.

    Returns None when roles is None (field left unchanged on update).
    "ALL" collapses any combination (All Users overrides role-specific
    selections). Unknown codes raise ValueError (mapped to HTTP 422).
    """
    if roles is None:
        return None
    seen: list[str] = []
    for raw in roles:
        code = str(raw or "").strip().upper().replace(" ", "_")
        # Accept the frontend/backend alias spellings.
        aliases = {
            "GUEST_USER": "GUEST",
            "GUEST-USERS": "GUEST",
            "GUESTS": "GUEST",
            "CITIZENS": "CITIZEN",
            "RESEARCHERS": "RESEARCHER",
            "ORGANIZATIONS": "ORGANIZATION",
            "ORGANISATIONS": "ORGANIZATION",
            "ORGANISATION": "ORGANIZATION",
            "ORG": "ORGANIZATION",
            "GOVERNMENT": "GOVERNMENT_OFFICIAL",
            "GOVT": "GOVERNMENT_OFFICIAL",
            "GOVERNMENT_OFFICER": "GOVERNMENT_OFFICIAL",
            "ADMINISTRATOR": "ADMIN",
            "ADMINISTRATORS": "ADMIN",
            "ADMINS": "ADMIN",
            "ALL_USERS": "ALL",
            "ALL-USERS": "ALL",
            "EVERYONE": "ALL",
        }
        code = aliases.get(code, code)
        if code not in ALLOWED_AUDIENCES:
            raise ValueError(
                f"Unknown FAQ audience: {raw!r}. Allowed: "
                f"{sorted(ALLOWED_AUDIENCES)}"
            )
        if code not in seen:
            seen.append(code)
    if "ALL" in seen:
        return ["ALL"]
    if not seen:
        raise ValueError("FAQ audience must include at least one role.")
    return seen


class FAQCreate(BaseModel):
    question: str
    answer: str
    category: str | None = None
    status: str = "PUBLISHED"
    display_order: int = 0
    target_roles: list[str] = ["ALL"]

    @field_validator("target_roles")
    @classmethod
    def _normalize_roles(cls, v: list[str] | None) -> list[str] | None:
        return normalize_audience_input(v)


class FAQUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    category: str | None = None
    status: str | None = None
    display_order: int | None = None
    target_roles: list[str] | None = None

    @field_validator("target_roles")
    @classmethod
    def _normalize_roles(cls, v: list[str] | None) -> list[str] | None:
        return normalize_audience_input(v)


class FAQResponse(BaseModel):
    faq_id: int
    question: str
    answer: str
    category: str | None = None
    status: str = "PUBLISHED"
    display_order: int = 0
    target_roles: list[str] = ["ALL"]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("target_roles", mode="before")
    @classmethod
    def _default_roles(cls, v: object) -> object:
        # Legacy rows predating the audience migration carry NULL.
        return ["ALL"] if v is None else v
