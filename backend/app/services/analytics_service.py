from sqlalchemy.orm import Session
from sqlalchemy import case, func, extract

from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.user import User


# ============================================================
# DASHBOARD ANALYTICS
# ============================================================

def get_dashboard_analytics(
    db: Session,
    user_id: int | None = None,
    user_role: str | None = None,
):
    # Policy and scheme data are shared platform data.
    # There is currently no owner/user_id column in these tables.
    # User scope: ADMIN sees all, others only themselves.

    user_is_admin = user_role == "ADMIN"
    user_self_only = not user_is_admin and user_id is not None

    pol_rows = (
        db.query(Policy.status, func.count(Policy.policy_id))
        .group_by(Policy.status)
        .all()
    )
    pol_by_status = {s: c for s, c in pol_rows}
    policies_total = sum(pol_by_status.values())
    policies_approved = pol_by_status.get("APPROVED", 0)
    policies_pending = pol_by_status.get("PENDING_APPROVAL", 0)
    policies_rejected = pol_by_status.get("REJECTED", 0)
    policies_archived = pol_by_status.get("ARCHIVED", 0)

    sch_rows = (
        db.query(Scheme.status, func.count(Scheme.scheme_id))
        .group_by(Scheme.status)
        .all()
    )
    sch_by_status = {s: c for s, c in sch_rows}
    schemes_total = sum(sch_by_status.values())
    schemes_approved = sch_by_status.get("APPROVED", 0)
    schemes_pending = sch_by_status.get("PENDING_APPROVAL", 0)
    schemes_rejected = sch_by_status.get("REJECTED", 0)
    schemes_archived = sch_by_status.get("ARCHIVED", 0)

    user_row = (
        db.query(
            func.count(User.user_id),
            func.sum(case((User.is_active == True, 1), else_=0)),
        )
    )
    if user_self_only:
        user_row = user_row.filter(User.user_id == user_id)
    user_row = user_row.first()
    users_total = user_row[0] or 0
    users_active = int(user_row[1] or 0)
    users_inactive = users_total - users_active

    return {
        "policies": {
            "total": policies_total,
            "approved": policies_approved,
            "pending": policies_pending,
            "rejected": policies_rejected,
            "archived": policies_archived,
        },
        "schemes": {
            "total": schemes_total,
            "approved": schemes_approved,
            "pending": schemes_pending,
            "rejected": schemes_rejected,
            "archived": schemes_archived,
        },
        "users": {
            "total": users_total,
            "active": users_active,
            "inactive": users_inactive,
        },
        # Flat format compatibility
        "total_policies": policies_total,
        "approved_policies": policies_approved,
        "pending_policies": policies_pending,
        "rejected_policies": policies_rejected,
        "archived_policies": policies_archived,
        "total_schemes": schemes_total,
        "approved_schemes": schemes_approved,
        "active_schemes": schemes_approved,
        "pending_schemes": schemes_pending,
        "rejected_schemes": schemes_rejected,
        "archived_schemes": schemes_archived,
        "total_users": users_total,
        "active_users": users_active,
        "inactive_users": users_inactive,
    }


# ============================================================
# POLICY ANALYTICS
# ============================================================

def get_policy_analytics(db: Session, approved_only: bool = False):

    status_rows = (
        db.query(Policy.status, func.count(Policy.policy_id))
        .group_by(Policy.status)
        .all()
    )
    by_status = {s: c for s, c in status_rows}
    total = sum(by_status.values())
    approved = by_status.get("APPROVED", 0)
    pending = by_status.get("PENDING_APPROVAL", 0)
    rejected = by_status.get("REJECTED", 0)
    archived = by_status.get("ARCHIVED", 0)

    # Public/researcher-safe view: breakdowns cover APPROVED records only
    # so unpublished workflow volumes are never exposed. Staff callers
    # keep approved_only=False and receive the full corpus.
    base_filter = [Policy.status == "APPROVED"] if approved_only else []

    by_category = (
        db.query(
            Policy.category,
            func.count(Policy.policy_id).label("count")
        )
        .filter(Policy.category.isnot(None), *base_filter)
        .group_by(Policy.category)
        .all()
    )

    by_state = (
        db.query(
            Policy.state,
            func.count(Policy.policy_id).label("count")
        )
        .filter(Policy.state.isnot(None), *base_filter)
        .group_by(Policy.state)
        .all()
    )

    by_ministry = (
        db.query(
            Policy.ministry,
            func.count(Policy.policy_id).label("count")
        )
        .filter(Policy.ministry.isnot(None), *base_filter)
        .group_by(Policy.ministry)
        .all()
    )

    if approved_only:
        total = approved
        pending = 0
        rejected = 0
        archived = 0

    return {
        "total": total,
        "approved": approved,
        "pending": pending,
        "rejected": rejected,
        "archived": archived,

        "by_category": [
            {
                "category": category,
                "count": count
            }
            for category, count in by_category
        ],

        "by_state": [
            {
                "state": state,
                "count": count
            }
            for state, count in by_state
        ],

        "by_ministry": [
            {
                "ministry": ministry,
                "count": count
            }
            for ministry, count in by_ministry
        ],

        "monthly_trend": get_policy_trends(db, approved_only=approved_only)
    }


# ============================================================
# SCHEME ANALYTICS
# ============================================================

def get_scheme_analytics(db: Session, approved_only: bool = False):

    status_rows = (
        db.query(Scheme.status, func.count(Scheme.scheme_id))
        .group_by(Scheme.status)
        .all()
    )
    by_status = {s: c for s, c in status_rows}
    total = sum(by_status.values())
    approved = by_status.get("APPROVED", 0)
    pending = by_status.get("PENDING_APPROVAL", 0)
    rejected = by_status.get("REJECTED", 0)
    archived = by_status.get("ARCHIVED", 0)

    # Public/researcher-safe view: breakdowns cover APPROVED records only.
    base_filter = [Scheme.status == "APPROVED"] if approved_only else []

    by_category = (
        db.query(
            Scheme.category,
            func.count(Scheme.scheme_id).label("count")
        )
        .filter(Scheme.category.isnot(None), *base_filter)
        .group_by(Scheme.category)
        .all()
    )

    by_state = (
        db.query(
            Scheme.state,
            func.count(Scheme.scheme_id).label("count")
        )
        .filter(Scheme.state.isnot(None), *base_filter)
        .group_by(Scheme.state)
        .all()
    )

    by_ministry = (
        db.query(
            Scheme.ministry,
            func.count(Scheme.scheme_id).label("count")
        )
        .filter(Scheme.ministry.isnot(None), *base_filter)
        .group_by(Scheme.ministry)
        .all()
    )

    if approved_only:
        total = approved
        pending = 0
        rejected = 0
        archived = 0

    return {
        "total": total,
        "approved": approved,
        "active": approved,
        "pending": pending,
        "rejected": rejected,
        "archived": archived,

        "by_category": [
            {
                "category": category,
                "count": count
            }
            for category, count in by_category
        ],

        "by_state": [
            {
                "state": state,
                "count": count
            }
            for state, count in by_state
        ],

        "by_ministry": [
            {
                "ministry": ministry,
                "count": count
            }
            for ministry, count in by_ministry
        ],

        "monthly_trend": get_scheme_trends(db, approved_only=approved_only)
    }


# ============================================================
# POLICY TRENDS
# ============================================================

def get_policy_trends(db: Session, approved_only: bool = False):

    query = db.query(
        extract("year", Policy.created_at).label("year"),
        extract("month", Policy.created_at).label("month"),
        func.count(Policy.policy_id).label("count")
    )
    if approved_only:
        query = query.filter(Policy.status == "APPROVED")
    trends = (
        query
        .group_by(
            extract("year", Policy.created_at),
            extract("month", Policy.created_at)
        )
        .order_by(
            extract("year", Policy.created_at),
            extract("month", Policy.created_at)
        )
        .all()
    )

    return [
        {
            "year": int(year),
            "month": int(month),
            "count": count
        }
        for year, month, count in trends
    ]


# ============================================================
# SCHEME TRENDS
# ============================================================

def get_scheme_trends(db: Session, approved_only: bool = False):

    query = db.query(
        extract("year", Scheme.created_at).label("year"),
        extract("month", Scheme.created_at).label("month"),
        func.count(Scheme.scheme_id).label("count")
    )
    if approved_only:
        query = query.filter(Scheme.status == "APPROVED")
    trends = (
        query
        .group_by(
            extract("year", Scheme.created_at),
            extract("month", Scheme.created_at)
        )
        .order_by(
            extract("year", Scheme.created_at),
            extract("month", Scheme.created_at)
        )
        .all()
    )

    return [
        {
            "year": int(year),
            "month": int(month),
            "count": count
        }
        for year, month, count in trends
    ]


# ============================================================
# SCHEME USAGE
# ============================================================

def get_scheme_usage(db: Session, approved_only: bool = False):

    if approved_only:
        approved = (
            db.query(Scheme)
            .filter(Scheme.status == "APPROVED")
            .count()
        )
        return {
            "total_schemes": approved,
            "approved_schemes": approved,
            "pending_schemes": 0,
            "rejected_schemes": 0,
            "archived_schemes": 0,
            "monthly_trend": get_scheme_trends(db, approved_only=True),
        }

    return {
        "total_schemes": db.query(Scheme).count(),

        "approved_schemes": (
            db.query(Scheme)
            .filter(Scheme.status == "APPROVED")
            .count()
        ),

        "pending_schemes": (
            db.query(Scheme)
            .filter(Scheme.status == "PENDING_APPROVAL")
            .count()
        ),

        "rejected_schemes": (
            db.query(Scheme)
            .filter(Scheme.status == "REJECTED")
            .count()
        ),

        "archived_schemes": (
            db.query(Scheme)
            .filter(Scheme.status == "ARCHIVED")
            .count()
        ),

        "monthly_trend": get_scheme_trends(db)
    }


# ============================================================
# USER ANALYTICS
# ============================================================

def get_user_analytics(
    db: Session,
    user_id: int | None = None,
    user_role: str | None = None,
):

    query = db.query(User)

    # ADMIN → CITIZEN + ADMIN
    if user_role == "ADMIN":
        pass

    # NORMAL USER → only themselves
    elif user_id is not None:
        query = query.filter(
            User.user_id == user_id
        )

    totals_row = (
        query.with_entities(
            func.count(User.user_id),
            func.sum(case((User.is_active == True, 1), else_=0)),
        ).first()
    )
    total_users = totals_row[0] or 0
    active_users = int(totals_row[1] or 0)
    inactive_users = total_users - active_users

    by_role = (
        query
        .with_entities(
            User.role,
            func.count(User.user_id).label("count")
        )
        .group_by(User.role)
        .all()
    )

    role_counts = {
        role: count
        for role, count in by_role
    }

    all_roles = [
        "ADMIN",
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
        "GOVERNMENT_OFFICIAL",
    ]

    by_state = (
        query
        .with_entities(
            User.state,
            func.count(User.user_id).label("count")
        )
        .filter(User.state.isnot(None))
        .group_by(User.state)
        .all()
    )

    return {
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": inactive_users,

        "by_role": [
            {
                "role": role,
                "count": role_counts.get(role, 0)
            }
            for role in all_roles
        ],

        "by_state": [
            {
                "state": state,
                "count": count
            }
            for state, count in by_state
        ]
    }


# ============================================================
# USER ACTIVITY
# ============================================================

def get_user_activity(
    db: Session,
    user_id: int | None = None,
    user_role: str | None = None,
):

    query = db.query(User)

    # ADMIN → CITIZEN + ADMIN
    if user_role == "ADMIN":
        pass

    # NORMAL USER → only themselves
    elif user_id is not None:
        query = query.filter(
            User.user_id == user_id
        )

    totals_row = (
        query.with_entities(
            func.count(User.user_id),
            func.sum(case((User.is_active == True, 1), else_=0)),
        ).first()
    )
    total = totals_row[0] or 0
    active = int(totals_row[1] or 0)

    return {
        "total_users": total,

        "active_users": active,

        "inactive_users": total - active,
    }


# ============================================================
# DEPARTMENT ANALYTICS
# ============================================================

def get_department_analytics(db: Session):

    policy_departments = (
        db.query(
            Policy.ministry,
            func.count(Policy.policy_id).label("policy_count")
        )
        .filter(Policy.ministry.isnot(None))
        .group_by(Policy.ministry)
        .all()
    )

    scheme_departments = (
        db.query(
            Scheme.ministry,
            func.count(Scheme.scheme_id).label("scheme_count")
        )
        .filter(Scheme.ministry.isnot(None))
        .group_by(Scheme.ministry)
        .all()
    )

    departments = {}

    for ministry, count in policy_departments:

        if ministry not in departments:
            departments[ministry] = {
                "department": ministry,
                "policy_count": 0,
                "scheme_count": 0
            }

        departments[ministry]["policy_count"] = count

    for ministry, count in scheme_departments:

        if ministry not in departments:
            departments[ministry] = {
                "department": ministry,
                "policy_count": 0,
                "scheme_count": 0
            }

        departments[ministry]["scheme_count"] = count

    return list(departments.values())


# ============================================================
# USAGE STATISTICS
# ============================================================

def get_usage_statistics(
    db: Session,
    user_id: int | None = None,
    user_role: str | None = None,
):

    user_query = db.query(User)

    # ADMIN → CITIZEN + ADMIN
    if user_role == "ADMIN":
        pass

    # NORMAL USER → only themselves
    elif user_id is not None:
        user_query = user_query.filter(
            User.user_id == user_id
        )

    return {
        "users": user_query.count(),

        # Policies and schemes are shared platform data.
        "policies": db.query(Policy).count(),

        "schemes": db.query(Scheme).count(),

        "approved_policies": (
            db.query(Policy)
            .filter(Policy.status == "APPROVED")
            .count()
        ),

        "approved_schemes": (
            db.query(Scheme)
            .filter(Scheme.status == "APPROVED")
            .count()
        ),

        "active_users": (
            user_query
            .filter(User.is_active == True)
            .count()
        )
    }


# ============================================================
# ROLE ANALYTICS
# ============================================================

def get_role_analytics(
    db: Session,
    user: User,
):

    try:
        from app.api.routes.auth import normalize_role as _normalize
        role = _normalize(str(user.role or "")) or str(user.role)
    except Exception:
        role = str(user.role)

    user_id = user.user_id
    user_role = user.role

    # ========================================================
    # ADMIN
    # ========================================================

    if role == "ADMIN":

        return {
            "role": "ADMIN",

            "dashboard": get_dashboard_analytics(
                db,
                user_id,
                user_role
            ),

            "policies": get_policy_analytics(db),

            "schemes": get_scheme_analytics(db),

            "users": get_user_analytics(
                db,
                user_id,
                user_role
            ),

            "user_activity": get_user_activity(
                db,
                user_id,
                user_role
            ),

            "departments": get_department_analytics(db),

            "usage": get_usage_statistics(
                db,
                user_id,
                user_role
            )
        }

    # ========================================================
    # GOVERNMENT OFFICIAL
    # ========================================================

    elif role == "GOVERNMENT_OFFICIAL":

        return {
            "role": "GOVERNMENT_OFFICIAL",

            "policies": get_policy_analytics(db),

            "schemes": get_scheme_analytics(db),

            "departments": get_department_analytics(db),

            "policy_trends": get_policy_trends(db),

            "scheme_trends": get_scheme_trends(db),

            "user": get_user_analytics(
                db,
                user_id,
                user_role
            ),

            "activity": get_user_activity(
                db,
                user_id,
                user_role
            )
        }

    # ========================================================
    # ORGANIZATION
    # ========================================================

    elif role == "ORGANIZATION":

        return {
            "role": "ORGANIZATION",

            "policies": get_policy_analytics(db, approved_only=True),

            "schemes": get_scheme_analytics(db, approved_only=True),

            "policy_trends": get_policy_trends(db, approved_only=True),

            "scheme_trends": get_scheme_trends(db, approved_only=True),

            "user": get_user_analytics(
                db,
                user_id,
                user_role
            ),

            "activity": get_user_activity(
                db,
                user_id,
                user_role
            )
        }

    # ========================================================
    # RESEARCHER
    # ========================================================

    elif role == "RESEARCHER":

        return {
            "role": "RESEARCHER",

            # Researcher-safe: APPROVED-only aggregates. Unpublished
            # workflow volumes are never exposed to researchers.
            "policies": get_policy_analytics(db, approved_only=True),

            "schemes": get_scheme_analytics(db, approved_only=True),

            "policy_trends": get_policy_trends(db, approved_only=True),

            "scheme_trends": get_scheme_trends(db, approved_only=True),

            "departments": get_department_analytics(db),

            "user": get_user_analytics(
                db,
                user_id,
                user_role
            ),

            "activity": get_user_activity(
                db,
                user_id,
                user_role
            )
        }

    # ========================================================
    # CITIZEN
    # ========================================================

    elif role == "CITIZEN":

        return {
            "role": "CITIZEN",

            "policies": get_policy_analytics(db, approved_only=True),

            "schemes": get_scheme_analytics(db, approved_only=True),

            "user": get_user_analytics(
                db,
                user_id,
                user_role
            ),

            "activity": get_user_activity(
                db,
                user_id,
                user_role
            )
        }

    # ========================================================
    # UNKNOWN ROLE
    # ========================================================

    else:

        return {
            "role": role,
            "message": "No analytics available for this role"
        }


# ============================================================
# RESEARCHER TRENDS (APPROVED-only, researcher-safe)
# ============================================================
#
# Distinct from the personal Research Overview
# (GET /analytics/researcher/overview). This aggregates the public
# research corpus only: APPROVED policies/schemes, their category
# distributions and their publication time-series. No user rows, no
# audit rows, no unpublished statuses. All queries use existing
# Policy/Scheme columns only.

def get_researcher_trends(db: Session):
    policy = get_policy_analytics(db, approved_only=True)
    scheme = get_scheme_analytics(db, approved_only=True)

    policy_trend = get_policy_trends(db, approved_only=True)
    scheme_trend = get_scheme_trends(db, approved_only=True)

    return {
        "generated_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "scope": "APPROVED",
        "policies": {
            "total_approved": policy.get("approved", 0),
            "by_category": policy.get("by_category", []),
            "by_state": policy.get("by_state", []),
            "by_ministry": policy.get("by_ministry", []),
            "trend": policy_trend,
        },
        "schemes": {
            "total_approved": scheme.get("approved", scheme.get("active", 0)),
            "by_category": scheme.get("by_category", []),
            "by_state": scheme.get("by_state", []),
            "by_ministry": scheme.get("by_ministry", []),
            "trend": scheme_trend,
        },
        "limitations": [
            "Research trends cover APPROVED policies and schemes only.",
            "Personal search/save activity is available from "
            "GET /analytics/researcher/overview and is not duplicated here.",
        ],
    }