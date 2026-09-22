from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.user import User


def get_dashboard_analytics(db: Session):
    return {
        "policies": {
            "total": db.query(Policy).count(),
            "approved": db.query(Policy)
            .filter(Policy.status == "APPROVED")
            .count(),
            "pending": db.query(Policy)
            .filter(Policy.status == "PENDING_APPROVAL")
            .count(),
            "rejected": db.query(Policy)
            .filter(Policy.status == "REJECTED")
            .count(),
            "archived": db.query(Policy)
            .filter(Policy.status == "ARCHIVED")
            .count(),
        },

        "schemes": {
            "total": db.query(Scheme).count(),
            "approved": db.query(Scheme)
            .filter(Scheme.status == "APPROVED")
            .count(),
            "pending": db.query(Scheme)
            .filter(Scheme.status == "PENDING_APPROVAL")
            .count(),
            "rejected": db.query(Scheme)
            .filter(Scheme.status == "REJECTED")
            .count(),
            "archived": db.query(Scheme)
            .filter(Scheme.status == "ARCHIVED")
            .count(),
        },

        "users": {
            "total": db.query(User).count(),
            "active": db.query(User)
            .filter(User.is_active == True)
            .count(),
            "inactive": db.query(User)
            .filter(User.is_active == False)
            .count(),
        }
    }


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


def get_scheme_usage(db: Session):
    return {
        "total_schemes": db.query(Scheme).count(),

        "approved_schemes": db.query(Scheme)
        .filter(Scheme.status == "APPROVED")
        .count(),

        "pending_schemes": db.query(Scheme)
        .filter(Scheme.status == "PENDING_APPROVAL")
        .count(),

        "rejected_schemes": db.query(Scheme)
        .filter(Scheme.status == "REJECTED")
        .count(),

        "archived_schemes": db.query(Scheme)
        .filter(Scheme.status == "ARCHIVED")
        .count(),

        "monthly_trend": get_scheme_trends(db)
    }


def get_user_analytics(db: Session):
    total_users = db.query(User).count()

    active_users = (
        db.query(User)
        .filter(User.is_active == True)
        .count()
    )

    inactive_users = (
        db.query(User)
        .filter(User.is_active == False)
        .count()
    )

    by_role = (
        db.query(
            User.role,
            func.count(User.user_id).label("count")
        )
        .group_by(User.role)
        .all()
    )

    by_state = (
        db.query(
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


def get_user_activity(db: Session):
    return {
        "total_users": db.query(User).count(),

        "active_users": db.query(User)
        .filter(User.is_active == True)
        .count(),

        "inactive_users": db.query(User)
        .filter(User.is_active == False)
        .count()
    }

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


def get_usage_statistics(db: Session):
    return {
        "users": db.query(User).count(),
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
            db.query(User)
            .filter(User.is_active == True)
            .count()
        )
    }