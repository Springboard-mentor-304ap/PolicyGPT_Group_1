"""Combined global search across Policies and Schemes.

Reuses the listing services (search_policies / search_schemes) so ranking,
field coverage, pagination, and row-level privacy stay identical to the
listing pages. Role handling mirrors the discovery (non-manage) branch of
GET /policies and GET /schemes: public roles see APPROVED only, ADMIN sees
everything, GOVERNMENT_OFFICIAL sees APPROVED/ALL plus their own workflow
rows.
"""

import re

from sqlalchemy.orm import Session

from app.api.routes.auth import normalize_role
from app.models.user import User
from app.services.policy_service import search_policies
from app.services.scheme_service import search_schemes


def normalize_query(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def _policy_visibility(current_user: User | None) -> tuple[int | None, str | None]:
    """Return (created_by, policy_status) for the discovery view."""
    if current_user is None:
        return None, "APPROVED"
    role = normalize_role(getattr(current_user, "role", "") or "")
    public_roles = {"CITIZEN", "RESEARCHER", "ORGANIZATION", "GUEST"}
    if role in public_roles:
        return None, "APPROVED"
    if role == "ADMIN":
        return None, None
    if role == "GOVERNMENT_OFFICIAL":
        # APPROVED/ALL-style discovery shows everything public; other
        # statuses are scoped to the official's own rows by the service's
        # DRAFT/PENDING_APPROVAL privacy plus created_by below. For the
        # dropdown we default to the public view (None) so officials see
        # APPROVED records plus their own via service privacy.
        return None, None
    return None, "APPROVED"


def _scheme_visibility(current_user: User | None) -> tuple[int | None, str | None]:
    if current_user is None:
        return None, "APPROVED"
    role = normalize_role(getattr(current_user, "role", "") or "")
    public_roles = {"CITIZEN", "RESEARCHER", "ORGANIZATION", "GUEST"}
    if role in public_roles:
        return None, "APPROVED"
    if role in ("ADMIN", "GOVERNMENT_OFFICIAL"):
        return None, None
    return None, "APPROVED"


def global_search(
    db: Session,
    query: str | None,
    limit_per_type: int = 5,
    current_user: User | None = None,
) -> dict:
    normalized = normalize_query(query)
    if not normalized:
        return {
            "query": "",
            "total_policies": 0,
            "total_schemes": 0,
            "policies": [],
            "schemes": [],
        }

    limit_per_type = max(1, min(int(limit_per_type or 5), 20))

    policy_created_by, policy_status = _policy_visibility(current_user)
    scheme_created_by, scheme_status = _scheme_visibility(current_user)

    policy_result = search_policies(
        db=db,
        search=normalized,
        policy_status=policy_status,
        page=1,
        limit=limit_per_type,
        created_by=policy_created_by,
        current_user=current_user,
    )
    scheme_result = search_schemes(
        db=db,
        keyword=normalized,
        status=scheme_status,
        page=1,
        limit=limit_per_type,
        include_archived=False,
        created_by=scheme_created_by,
        current_user=current_user,
    )

    return {
        "query": normalized,
        "total_policies": int(policy_result.get("total") or 0),
        "total_schemes": int(scheme_result.get("total") or 0),
        "policies": policy_result.get("policies") or [],
        "schemes": scheme_result.get("schemes") or [],
    }
