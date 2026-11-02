from sqlalchemy.orm import Session

from sqlalchemy import func,extract

from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.user import User


def get_dashboard_analytics(db: Session):
    return {
        "total_policies": db.query(Policy).count(),

        "total_schemes": db.query(Scheme).count(),

        "approved_policies": (
            db.query(Policy)
            .filter(Policy.status == "APPROVED")
            .count()
        ),

        "pending_policies": (
            db.query(Policy)
            .filter(Policy.status == "PENDING_APPROVAL")
            .count()
        ),

        "rejected_policies": (
            db.query(Policy)
            .filter(Policy.status == "REJECTED")
            .count()
        ),

        "archived_policies": (
            db.query(Policy)
            .filter(Policy.status == "ARCHIVED")
            .count()
        ),

        "active_schemes": (
            db.query(Scheme)
            .filter(Scheme.status == "APPROVED")
            .count()
        ),

        "total_users": db.query(User).count(),

        "total_notifications": 0,

        "total_feedback": 0,
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
            {"category": category, "count": count}
            for category, count in by_category
        ],
        "by_state": [
            {"state": state, "count": count}
            for state, count in by_state
        ],
        "by_ministry": [
            {"ministry": ministry, "count": count}
            for ministry, count in by_ministry
        ],
        "monthly_trend": [],
    }

def get_scheme_analytics(db: Session):
    total = db.query(Scheme).count()

    active = (
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
        "active": active,
        "pending": pending,
        "rejected": rejected,
        "archived": archived,
        "by_category": [
            {"category": category, "count": count}
            for category, count in by_category
        ],
        "by_state": [
            {"state": state, "count": count}
            for state, count in by_state
        ],
        "by_ministry": [
            {"ministry": ministry, "count": count}
            for ministry, count in by_ministry
        ],
        "monthly_trend": [],
    }

def get_policy_trends(db: Session):
    trends = (
        db.query(
            extract("year", Policy.created_at).label("year"),
            extract("month", Policy.created_at).label("month"),
            func.count(Policy.policy_id).label("count"),
        )
        .group_by(
            extract("year", Policy.created_at),
            extract("month", Policy.created_at),
        )
        .order_by(
            extract("year", Policy.created_at),
            extract("month", Policy.created_at),
        )
        .all()
    )

    return [
        {
            "year": int(year),
            "month": int(month),
            "count": count,
        }
        for year, month, count in trends
    ]

def get_scheme_usage(db: Session):
    total_schemes = db.query(Scheme).count()

    approved_schemes = (
        db.query(Scheme)
        .filter(Scheme.status == "APPROVED")
        .count()
    )

    pending_schemes = (
        db.query(Scheme)
        .filter(Scheme.status == "PENDING_APPROVAL")
        .count()
    )

    rejected_schemes = (
        db.query(Scheme)
        .filter(Scheme.status == "REJECTED")
        .count()
    )

    archived_schemes = (
        db.query(Scheme)
        .filter(Scheme.status == "ARCHIVED")
        .count()
    )

    return {
        "total_schemes": total_schemes,
        "approved_schemes": approved_schemes,
        "pending_schemes": pending_schemes,
        "rejected_schemes": rejected_schemes,
        "archived_schemes": archived_schemes,
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
        ],
    }


def get_user_activity(db: Session):
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

    return {
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": inactive_users,
    }