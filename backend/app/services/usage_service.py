from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.user import User


def get_usage_statistics(db: Session):
    total_users = db.query(func.count(User.user_id)).scalar() or 0
    active_users = (
        db.query(func.count(User.user_id))
        .filter(User.is_active.is_(True))
        .scalar()
        or 0
    )

    total_policies = db.query(func.count(Policy.policy_id)).scalar() or 0
    total_schemes = db.query(func.count(Scheme.scheme_id)).scalar() or 0

    approved_policies = (
        db.query(func.count(Policy.policy_id))
        .filter(Policy.status == "APPROVED")
        .scalar()
        or 0
    )

    approved_schemes = (
        db.query(func.count(Scheme.scheme_id))
        .filter(Scheme.status == "APPROVED")
        .scalar()
        or 0
    )

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_policies": total_policies,
        "total_schemes": total_schemes,
        "approved_policies": approved_policies,
        "approved_schemes": approved_schemes,
    }


def get_daily_usage(db: Session):
    return {
        "data": []
    }


def get_weekly_usage(db: Session):
    return {
        "data": []
    }


def get_monthly_usage(db: Session):
    return {
        "data": []
    }


def get_search_usage(db: Session):
    return {
        "total_searches": 0,
        "policy_searches": 0,
        "scheme_searches": 0,
    }


def get_policy_search_usage(db: Session):
    return {
        "total_searches": 0,
    }


def get_scheme_search_usage(db: Session):
    return {
        "total_searches": 0,
    }


def get_policy_view_usage(db: Session):
    return {
        "total_policy_views": 0,
    }


def get_scheme_view_usage(db: Session):
    return {
        "total_scheme_views": 0,
    }