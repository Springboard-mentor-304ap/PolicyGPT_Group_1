from sqlalchemy.orm import Session
from sqlalchemy import func, extract

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

    user_query = db.query(User)

    if user_role == "ADMIN":
        user_query = user_query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )
    elif user_id is not None:
        user_query = user_query.filter(
            User.user_id == user_id
        )

    return {
        "policies": {
            "total": db.query(Policy).count(),

            "approved": (
                db.query(Policy)
                .filter(Policy.status == "APPROVED")
                .count()
            ),

            "pending": (
                db.query(Policy)
                .filter(Policy.status == "PENDING_APPROVAL")
                .count()
            ),

            "rejected": (
                db.query(Policy)
                .filter(Policy.status == "REJECTED")
                .count()
            ),

            "archived": (
                db.query(Policy)
                .filter(Policy.status == "ARCHIVED")
                .count()
            ),
        },

        "schemes": {
            "total": db.query(Scheme).count(),

            "approved": (
                db.query(Scheme)
                .filter(Scheme.status == "APPROVED")
                .count()
            ),

            "pending": (
                db.query(Scheme)
                .filter(Scheme.status == "PENDING_APPROVAL")
                .count()
            ),

            "rejected": (
                db.query(Scheme)
                .filter(Scheme.status == "REJECTED")
                .count()
            ),

            "archived": (
                db.query(Scheme)
                .filter(Scheme.status == "ARCHIVED")
                .count()
            ),
        },

        "users": {
            "total": user_query.count(),

            "active": (
                user_query
                .filter(User.is_active == True)
                .count()
            ),

            "inactive": (
                user_query
                .filter(User.is_active == False)
                .count()
            ),
        }
    }


# ============================================================
# POLICY ANALYTICS
# ============================================================

def get_policy_analytics(db: Session):

    total = db.query(Policy).count()

    approved = (
        db.query(Policy)
        .filter(Policy.status == "APPROVED")
        .count()
    )

    pending = (
        db.query(Policy)
        .filter(Policy.status == "PENDING_APPROVAL")
        .count()
    )

    rejected = (
        db.query(Policy)
        .filter(Policy.status == "REJECTED")
        .count()
    )

    archived = (
        db.query(Policy)
        .filter(Policy.status == "ARCHIVED")
        .count()
    )

    by_category = (
        db.query(
            Policy.category,
            func.count(Policy.policy_id).label("count")
        )
        .filter(Policy.category.isnot(None))
        .group_by(Policy.category)
        .all()
    )

    by_state = (
        db.query(
            Policy.state,
            func.count(Policy.policy_id).label("count")
        )
        .filter(Policy.state.isnot(None))
        .group_by(Policy.state)
        .all()
    )

    by_ministry = (
        db.query(
            Policy.ministry,
            func.count(Policy.policy_id).label("count")
        )
        .filter(Policy.ministry.isnot(None))
        .group_by(Policy.ministry)
        .all()
    )

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

        "monthly_trend": get_policy_trends(db)
    }


# ============================================================
# SCHEME ANALYTICS
# ============================================================

def get_scheme_analytics(db: Session):

    total = db.query(Scheme).count()

    approved = (
        db.query(Scheme)
        .filter(Scheme.status == "APPROVED")
        .count()
    )

    pending = (
        db.query(Scheme)
        .filter(Scheme.status == "PENDING_APPROVAL")
        .count()
    )

    rejected = (
        db.query(Scheme)
        .filter(Scheme.status == "REJECTED")
        .count()
    )

    archived = (
        db.query(Scheme)
        .filter(Scheme.status == "ARCHIVED")
        .count()
    )

    by_category = (
        db.query(
            Scheme.category,
            func.count(Scheme.scheme_id).label("count")
        )
        .filter(Scheme.category.isnot(None))
        .group_by(Scheme.category)
        .all()
    )

    by_state = (
        db.query(
            Scheme.state,
            func.count(Scheme.scheme_id).label("count")
        )
        .filter(Scheme.state.isnot(None))
        .group_by(Scheme.state)
        .all()
    )

    by_ministry = (
        db.query(
            Scheme.ministry,
            func.count(Scheme.scheme_id).label("count")
        )
        .filter(Scheme.ministry.isnot(None))
        .group_by(Scheme.ministry)
        .all()
    )

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

        "monthly_trend": get_scheme_trends(db)
    }


# ============================================================
# POLICY TRENDS
# ============================================================

def get_policy_trends(db: Session):

    trends = (
        db.query(
            extract("year", Policy.created_at).label("year"),
            extract("month", Policy.created_at).label("month"),
            func.count(Policy.policy_id).label("count")
        )
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

def get_scheme_trends(db: Session):

    trends = (
        db.query(
            extract("year", Scheme.created_at).label("year"),
            extract("month", Scheme.created_at).label("month"),
            func.count(Scheme.scheme_id).label("count")
        )
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

def get_scheme_usage(db: Session):

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
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → only themselves
    elif user_id is not None:
        query = query.filter(
            User.user_id == user_id
        )

    total_users = query.count()

    active_users = (
        query
        .filter(User.is_active == True)
        .count()
    )

    inactive_users = (
        query
        .filter(User.is_active == False)
        .count()
    )

    by_role = (
        query
        .with_entities(
            User.role,
            func.count(User.user_id).label("count")
        )
        .group_by(User.role)
        .all()
    )

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
                "count": count
            }
            for role, count in by_role
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
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → only themselves
    elif user_id is not None:
        query = query.filter(
            User.user_id == user_id
        )

    return {
        "total_users": query.count(),

        "active_users": (
            query
            .filter(User.is_active == True)
            .count()
        ),

        "inactive_users": (
            query
            .filter(User.is_active == False)
            .count()
        )
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
        user_query = user_query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

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

            "policies": get_policy_analytics(db),

            "schemes": get_scheme_analytics(db),

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
    # RESEARCHER
    # ========================================================

    elif role == "RESEARCHER":

        return {
            "role": "RESEARCHER",

            "policies": get_policy_analytics(db),

            "schemes": get_scheme_analytics(db),

            "policy_trends": get_policy_trends(db),

            "scheme_trends": get_scheme_trends(db),

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

            "policies": get_policy_analytics(db),

            "schemes": get_scheme_analytics(db),

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