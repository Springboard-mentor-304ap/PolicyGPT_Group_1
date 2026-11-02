"""Centralized report permissions (V1).

Frontend visibility is UX only. Backend authorization here is the
actual security boundary.
"""

from app.api.routes.auth import normalize_role
from app.models.report import Report
from app.models.user import User


# ============================================================
# CONTROLLED VALUES
# ============================================================

REPORT_TYPES = (
    "POLICY_REPORT",
    "SCHEME_REPORT",
    "USER_REPORT",
    "USER_ACTIVITY_REPORT",
    "DEPARTMENT_REPORT",
    "MINISTRY_REPORT",
    "STATE_REPORT",
    "ANALYTICS_REPORT",
    "AUDIT_REPORT",
)

REPORT_FORMATS = (
    "PDF",
    "EXCEL",
)

REPORT_STATUSES = (
    "PENDING",
    "COMPLETED",
    "FAILED",
)

# Roles allowed to reach the persisted reports API at all.
# ADMIN and GOVERNMENT_OFFICIAL have full centers; CITIZEN, RESEARCHER
# and ORGANIZATION have scoped catalogs (see matrix below). Only GUEST
# is excluded entirely.
REPORT_ROLES = (
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
    "GOVERNMENT_OFFICIAL",
    "ADMIN",
)


# ============================================================
# ROLE -> ALLOWED REPORT TYPES (V1 matrix)
# ============================================================

_ROLE_REPORT_TYPES: dict[str, tuple[str, ...]] = {
    # All report types, all history, all downloads.
    "ADMIN": REPORT_TYPES,
    # Content + aggregate reports. No user reports, no audit reports.
    # User activity is self-only (enforced in apply_report_scope).
    "GOVERNMENT_OFFICIAL": (
        "POLICY_REPORT",
        "SCHEME_REPORT",
        "USER_ACTIVITY_REPORT",
        "DEPARTMENT_REPORT",
        "MINISTRY_REPORT",
        "STATE_REPORT",
        "ANALYTICS_REPORT",
    ),
    # CITIZEN: approved/public policies and schemes only. No user
    # reports, no activity, no department/ministry reports, no
    # analytics, no audit.
    "CITIZEN": (
        "POLICY_REPORT",
        "SCHEME_REPORT",
    ),
    # RESEARCHER: approved/aggregate policy/scheme plus aggregate
    # department/ministry/state and aggregate analytics. No user
    # reports, no raw activity, no audit.
    "RESEARCHER": (
        "POLICY_REPORT",
        "SCHEME_REPORT",
        "DEPARTMENT_REPORT",
        "MINISTRY_REPORT",
        "STATE_REPORT",
        "ANALYTICS_REPORT",
    ),
    # ORGANIZATION: approved/authorized aggregates. Same shape as
    # researcher until an organization authorization model exists.
    # No user reports, no raw activity, no audit.
    "ORGANIZATION": (
        "POLICY_REPORT",
        "SCHEME_REPORT",
        "DEPARTMENT_REPORT",
        "MINISTRY_REPORT",
        "STATE_REPORT",
        "ANALYTICS_REPORT",
    ),
    # No persisted report history / generation / download.
    "GUEST": (),
}


def get_allowed_report_types(role: str | None) -> tuple[str, ...]:
    """Return the V1 report types visible to a role."""
    return _ROLE_REPORT_TYPES.get(normalize_role(role), ())


def can_access_report_type(role: str | None, report_type: str | None) -> bool:
    """Check whether a role may generate a report type."""
    if not report_type:
        return False
    normalized_type = str(report_type).strip().upper()
    if normalized_type not in REPORT_TYPES:
        return False
    return normalized_type in get_allowed_report_types(role)


def validate_report_filters(
    role: str | None,
    report_type: str | None,
    filters: dict | None,
) -> dict:
    """Validate report filters without inventing new auth framework.

    V1 rules:
    - report_type and report_format are controlled values.
    - department/ministry are aggregate free-text strings only;
      never resolve Government Official -> department via
      users.organization.
    - USER_ACTIVITY_REPORT is self-only for GOVERNMENT_OFFICIAL and
      forbidden for CITIZEN/RESEARCHER/ORGANIZATION.
    """
    normalized_role = normalize_role(role)
    normalized_type = str(report_type or "").strip().upper()

    if normalized_type not in REPORT_TYPES:
        raise ValueError(f"Unsupported report type: {report_type}")

    if normalized_type not in get_allowed_report_types(normalized_role):
        raise PermissionError(
            f"Role {normalized_role or 'UNKNOWN'} cannot access "
            f"report type {normalized_type}"
        )

    cleaned: dict = dict(filters or {})

    # Per-type filter allowlist. Anything else is silently dropped,
    # except for explicitly rejected keys which raise (they indicate a
    # client bug or probing for unsupported dimensions).
    per_type_allowed: dict[str, set[str]] = {
        "POLICY_REPORT": {
            "date_from", "date_to", "state", "ministry", "department",
            "category", "sector", "status", "policy_id",
        },
        "SCHEME_REPORT": {
            "date_from", "date_to", "state", "ministry", "department",
            "category", "status", "scheme_id",
        },
        "USER_REPORT": {
            "date_from", "date_to", "role", "state", "district",
            "organization", "status",
        },
        "USER_ACTIVITY_REPORT": {
            "date_from", "date_to", "user_id", "action", "entity_type",
        },
        "DEPARTMENT_REPORT": {
            "date_from", "date_to", "state", "ministry", "department",
            "category",
        },
        "MINISTRY_REPORT": {
            "date_from", "date_to", "ministry", "department", "state",
        },
        "STATE_REPORT": {
            "date_from", "date_to", "state", "ministry", "department",
        },
        "ANALYTICS_REPORT": set(),
        "AUDIT_REPORT": {
            "date_from", "date_to", "action", "entity_type", "user_id",
            "role",
        },
    }

    # district is only a real user-table dimension; policy/scheme tables
    # do not support it.
    if "district" in cleaned and normalized_type != "USER_REPORT":
        raise ValueError("Unsupported filter: district")
    if normalized_type == "SCHEME_REPORT" and "sector" in cleaned:
        raise ValueError("Unsupported filter for schemes: sector")

    allowed_keys = per_type_allowed.get(normalized_type, set())
    for key in list(cleaned.keys()):
        if key not in allowed_keys:
            del cleaned[key]

    # user_id scoping: only ADMIN may scope activity/audit cross-user.
    if "user_id" in cleaned and (
        normalized_type
        not in ("USER_ACTIVITY_REPORT", "AUDIT_REPORT")
        or normalized_role != "ADMIN"
    ):
        del cleaned["user_id"]

    # Fail fast on bad dates so invalid requests never create PENDING rows.
    _validate_dates(cleaned)

    return cleaned


def _validate_dates(filters: dict) -> None:
    from datetime import date

    def parse(value: object, name: str) -> date | None:
        if value is None or value == "":
            return None
        if isinstance(value, date):
            return value
        try:
            return date.fromisoformat(str(value).strip()[:10])
        except ValueError:
            raise ValueError(f"Invalid {name}: expected YYYY-MM-DD")

    start = parse(filters.get("date_from"), "date_from")
    end = parse(filters.get("date_to"), "date_to")
    if start and end and start > end:
        raise ValueError("date_from must be on or before date_to")


# ============================================================
# REPORT DETAIL VARIANTS (CATEGORY + DETAIL architecture)
# ============================================================
# Each report type supports a small allowlisted set of detail
# variants. The dataset builders produce the full category dataset;
# the requested detail selects which sections/summary rows are kept.

REPORT_DETAILS: dict[str, tuple[str, ...]] = {
    "POLICY_REPORT": (
        "overview",
        "status",
        "ministry-wise",
        "department-wise",
        "state-wise",
        "category-wise",
        "sector-wise",
    ),
    "SCHEME_REPORT": (
        "overview",
        "status",
        "ministry-wise",
        "department-wise",
        "state-wise",
        "category-wise",
        "expiring",
    ),
    "USER_REPORT": (
        "overview",
        "registration",
        "role-wise",
        "state-wise",
        "district-wise",
        "active-inactive",
    ),
    "MINISTRY_REPORT": (
        "overview",
        "policy",
        "scheme",
        "policy-vs-scheme",
    ),
    "STATE_REPORT": (
        "overview",
        "policy",
        "scheme",
    ),
    "AUDIT_REPORT": (
        "activity",
        "action-wise",
        "entity-wise",
    ),
    # Single-variant categories accept no detail value.
    "USER_ACTIVITY_REPORT": (),
    "DEPARTMENT_REPORT": (),
    "ANALYTICS_REPORT": (),
}

#: Default detail applied when the client omits it.
DEFAULT_DETAIL: dict[str, str] = {
    "POLICY_REPORT": "overview",
    "SCHEME_REPORT": "overview",
    "USER_REPORT": "overview",
    "MINISTRY_REPORT": "overview",
    "STATE_REPORT": "overview",
    "AUDIT_REPORT": "activity",
    "USER_ACTIVITY_REPORT": "overview",
    "DEPARTMENT_REPORT": "overview",
    "ANALYTICS_REPORT": "overview",
}


def validate_report_detail(
    role: str | None,
    report_type: str | None,
    detail: str | None,
) -> str:
    """Validate a detail variant and return the effective detail."""
    normalized_role = normalize_role(role)
    normalized_type = str(report_type or "").strip().upper()

    if normalized_type not in REPORT_TYPES:
        raise ValueError(f"Unsupported report type: {report_type}")

    if normalized_type not in get_allowed_report_types(normalized_role):
        raise PermissionError(
            f"Role {normalized_role or 'UNKNOWN'} cannot access "
            f"report type {normalized_type}"
        )

    allowed = REPORT_DETAILS.get(normalized_type, ())
    if detail is None or detail == "":
        return DEFAULT_DETAIL.get(normalized_type, "overview")
    normalized_detail = str(detail).strip().lower()
    if normalized_detail == DEFAULT_DETAIL.get(normalized_type, "overview"):
        return normalized_detail
    if normalized_detail not in allowed:
        raise ValueError(
            f"Unsupported detail '{detail}' for report type {normalized_type}"
        )
    return normalized_detail


def apply_report_scope(
    role: str | None,
    user_id: int | None,
    report_type: str | None,
    filters: dict | None = None,
    detail: str | None = None,
) -> dict:
    """Apply V1 scoping rules and return the effective filter set.

    - GOVERNMENT_OFFICIAL user activity is self-only.
    - No department-shared ownership in V1.
    - Department reports are aggregate ministry/department strings only.
    """
    normalized_role = normalize_role(role)
    normalized_type = str(report_type or "").strip().upper()
    scoped = validate_report_filters(normalized_role, normalized_type, filters)
    effective_detail = validate_report_detail(
        normalized_role, normalized_type, detail
    )
    # The detail travels inside the persisted parameters so history and
    # detail views show exactly which variant was generated.
    scoped["detail"] = effective_detail

    if normalized_type == "USER_ACTIVITY_REPORT":
        # Only ADMIN (cross-user) and GOVERNMENT_OFFICIAL (self-only)
        # can reach this branch given the matrix above.
        if normalized_role == "ADMIN":
            return scoped
        scoped["user_id"] = user_id
        return scoped

    return scoped


def _is_admin(user: User | None) -> bool:
    return normalize_role(getattr(user, "role", None)) == "ADMIN"


def can_view_report(user: User | None, report: Report | None) -> bool:
    """Ownership rule (V1).

    ADMIN can access all generated reports. All other authenticated
    report users can access only reports where
    generated_by == current_user.user_id. GUEST has no access.
    """
    if report is None or user is None:
        return False
    if normalize_role(getattr(user, "role", None)) == "GUEST":
        return False
    if _is_admin(user):
        return True
    return report.generated_by == user.user_id


def can_download_report(user: User | None, report: Report | None) -> bool:
    """Download follows the same ownership rule as detail view."""
    return can_view_report(user, report)
