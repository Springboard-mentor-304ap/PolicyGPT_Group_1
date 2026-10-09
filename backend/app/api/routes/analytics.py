from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import normalize_role, require_roles
from app.models.user import User

from app.services.analytics_service import (
    get_dashboard_analytics,
    get_policy_analytics,
    get_scheme_analytics,
    get_policy_trends,
    get_researcher_trends,
    get_scheme_usage,
    get_user_analytics,
    get_user_activity,
    get_usage_statistics,
    get_role_analytics,
)
from app.services.personal_analytics_service import get_personal_analytics
from app.services.government_analytics_service import (
    get_government_departments,
    get_government_overview,
    get_government_policy_scheme,
    get_government_user_notifications,
)

from app.services.department_analytics_service import (
    get_departments,
    get_department_analytics,
    get_department_policies,
    get_department_schemes,
)
from app.services.admin_analytics_service import (
    get_admin_overview_analytics,
    get_admin_policy_analytics,
    get_admin_scheme_analytics,
    get_admin_user_analytics,
    get_admin_department_analytics,
    get_admin_usage_statistics,
)


router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


# ============================================================
# GENERAL ANALYTICS
# ============================================================

@router.get("/dashboard")
def dashboard_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    return get_dashboard_analytics(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


@router.get("/policies")
def policy_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    # Public discovery roles (CITIZEN/RESEARCHER/ORGANIZATION) receive
    # APPROVED-only aggregates; staff roles keep the full corpus.
    role = normalize_role(current_user.role)
    public_only = role in ("CITIZEN", "RESEARCHER", "ORGANIZATION")
    return get_policy_analytics(db, approved_only=public_only)


@router.get("/schemes")
def scheme_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    role = normalize_role(current_user.role)
    public_only = role in ("CITIZEN", "RESEARCHER", "ORGANIZATION")
    return get_scheme_analytics(db, approved_only=public_only)


@router.get("/policies/trends")
def policy_trends(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    role = normalize_role(current_user.role)
    public_only = role in ("CITIZEN", "RESEARCHER", "ORGANIZATION")
    return get_policy_trends(db, approved_only=public_only)


@router.get("/schemes/usage")
def scheme_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    role = normalize_role(current_user.role)
    public_only = role in ("CITIZEN", "RESEARCHER", "ORGANIZATION")
    return get_scheme_usage(db, approved_only=public_only)


# ============================================================
# USER ANALYTICS
# ============================================================

@router.get("/users")
def user_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    return get_user_analytics(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


@router.get("/users/activity")
def user_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    return get_user_activity(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


# ============================================================
# USAGE ANALYTICS
# ============================================================

@router.get("/usage")
def usage_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    return get_usage_statistics(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


# ============================================================
# ROLE ANALYTICS
# ============================================================

@router.get("/role")
def role_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    return get_role_analytics(
        db,
        current_user,
    )


# ============================================================
# PERSONAL (ROLE-SCOPED) ANALYTICS
# ============================================================
#
# One endpoint per role, all backed by the same aggregation service.
# The authenticated user is resolved server-side from the token; no
# user_id / organization_id is accepted from the client, so a citizen
# can only ever see their own activity and an organization only its
# own scope. ADMIN (superuser) may access every endpoint.
#
# Every metric is a live database aggregation. Metrics the database
# cannot back yet (views, eligibility checks, comparisons) are
# returned as explicit zeros with tracked=False — never fabricated.

def _personal_overview(
    db: Session,
    current_user: User,
    role: str,
    range: str,
    date_from: str | None,
    date_to: str | None,
):
    try:
        return get_personal_analytics(
            db=db,
            user=current_user,
            role=role,
            range=range,
            date_from=date_from,
            date_to=date_to,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/citizen/overview")
def citizen_overview(
    range: str = Query(default="30d"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("CITIZEN")),
):
    return _personal_overview(db, current_user, "CITIZEN", range, date_from, date_to)


@router.get("/researcher/overview")
def researcher_overview(
    range: str = Query(default="30d"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("RESEARCHER")),
):
    return _personal_overview(db, current_user, "RESEARCHER", range, date_from, date_to)


@router.get("/researcher/trends")
def researcher_trends(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("RESEARCHER")),
):
    """Researcher-specific Policy & Scheme Trends (APPROVED-only).

    Distinct from the personal Research Overview. Aggregates the public
    research corpus only: approved totals, category distributions and
    publication time-series. No user rows, no audit data, no
    unpublished statuses.
    """
    return get_researcher_trends(db)


@router.get("/organization/overview")
def organization_overview(
    range: str = Query(default="30d"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ORGANIZATION", "ORGANISATION")),
):
    role = normalize_role(current_user.role) or "ORGANIZATION"
    return _personal_overview(db, current_user, role, range, date_from, date_to)


# ============================================================
# GOVERNMENT ANALYTICS (platform-wide, role-guarded)
# ============================================================
#
# Backs the four Government Official Analytics pages. All data is
# platform-wide government data aggregated live; private user-targeted
# notification content is never included in listings.

def _handle_gov_errors(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/government/overview")
def government_overview(
    months: int = Query(default=12),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):
    return _handle_gov_errors(
        get_government_overview, db, months, date_from, date_to
    )


@router.get("/government/policy-scheme")
def government_policy_scheme(
    months: int = Query(default=12),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    policy_status: str | None = Query(default=None),
    scheme_status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):
    return _handle_gov_errors(
        get_government_policy_scheme,
        db,
        months,
        date_from,
        date_to,
        policy_status,
        scheme_status,
        category,
    )


@router.get("/government/departments")
def government_departments(
    months: int = Query(default=12),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    department: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):
    return _handle_gov_errors(
        get_government_departments, db, months, date_from, date_to, department
    )


@router.get("/government/user-notifications")
def government_user_notifications(
    months: int = Query(default=12),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    role: str | None = Query(default=None),
    channel: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):
    return _handle_gov_errors(
        get_government_user_notifications, db, months, date_from, date_to, role, channel
    )


# ============================================================
# DEPARTMENT ANALYTICS
# ============================================================

@router.get("/departments")
def list_departments(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "RESEARCHER",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    return get_departments(db)


@router.get("/departments/{department}")
def department_analytics(
    department: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "RESEARCHER",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    role = normalize_role(current_user.role)
    return get_department_analytics(
        db,
        department,
        approved_only=(role == "RESEARCHER"),
    )


@router.get("/departments/{department}/policies")
def department_policies(
    department: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "RESEARCHER",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    role = normalize_role(current_user.role)
    return get_department_policies(
        db,
        department,
        approved_only=(role == "RESEARCHER"),
    )


@router.get("/departments/{department}/schemes")
def department_schemes(
    department: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "RESEARCHER",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        )
    ),
):
    role = normalize_role(current_user.role)
    return get_department_schemes(
        db,
        department,
        approved_only=(role == "RESEARCHER"),
    )


# ============================================================
# ADMIN ANALYTICS (PROTECTED BY ADMIN ROLE)
# ============================================================

@router.get("/admin/overview")
def admin_overview(
    timeframe: str = Query(default="Last 9 Months"),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return get_admin_overview_analytics(
        db=db, timeframe=timeframe, start_date=start_date, end_date=end_date
    )


@router.get("/admin/policies")
def admin_policies(
    state: str | None = Query(default=None),
    category: str | None = Query(default=None),
    ministry: str | None = Query(default=None),
    department: str | None = Query(default=None),
    status: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    filters = {
        "state": state,
        "category": category,
        "ministry": ministry,
        "department": department,
        "status": status,
        "start_date": start_date,
        "end_date": end_date,
    }
    return get_admin_policy_analytics(db=db, filters=filters)


@router.get("/admin/schemes")
def admin_schemes(
    state: str | None = Query(default=None),
    category: str | None = Query(default=None),
    ministry: str | None = Query(default=None),
    status: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    filters = {
        "state": state,
        "category": category,
        "ministry": ministry,
        "status": status,
        "start_date": start_date,
        "end_date": end_date,
    }
    return get_admin_scheme_analytics(db=db, filters=filters)


@router.get("/admin/users")
def admin_users(
    growth_period: str = Query(default="Last 12 Months"),
    reg_period: str = Query(default="Last 6 Months"),
    state_limit: int = Query(default=10),
    heatmap_period: str = Query(default="Last 4 Weeks"),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return get_admin_user_analytics(
        db=db,
        growth_period=growth_period,
        reg_period=reg_period,
        state_limit=state_limit,
        heatmap_period=heatmap_period,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/admin/departments")
def admin_departments(
    search: str | None = Query(default=None),
    selected_department: str = Query(default="all"),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return get_admin_department_analytics(
        db=db,
        search=search,
        selected_department=selected_department,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/admin/usage")
def admin_usage(
    activity_period: str = Query(default="Last 12 Months"),
    daily_period: str = Query(default="Last 30 Days"),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return get_admin_usage_statistics(
        db=db,
        activity_period=activity_period,
        daily_period=daily_period,
        start_date=start_date,
        end_date=end_date,
    )
