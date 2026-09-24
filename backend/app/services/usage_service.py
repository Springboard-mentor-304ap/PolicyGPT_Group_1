from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.user import User
from app.models.search_history import SearchHistory


def get_usage_statistics(
    db: Session,
    user_id: int | None = None,
):
    # ---------------------------------------------------------
    # USER STATISTICS
    # ---------------------------------------------------------

    user_query = db.query(User)

    if user_id is not None:
        user_query = user_query.filter(User.user_id == user_id)

    total_users = user_query.count()

    active_users = (
        user_query
        .filter(User.is_active.is_(True))
        .count()
    )

    # ---------------------------------------------------------
    # POLICY / SCHEME STATISTICS
    # ---------------------------------------------------------

    total_policies = db.query(
        func.count(Policy.policy_id)
    ).scalar() or 0

    total_schemes = db.query(
        func.count(Scheme.scheme_id)
    ).scalar() or 0

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

    # ---------------------------------------------------------
    # SEARCH STATISTICS
    # ---------------------------------------------------------

    search_query = db.query(SearchHistory)

    if user_id is not None:
        search_query = search_query.filter(
            SearchHistory.user_id == user_id
        )

    total_searches = search_query.count()

    policy_searches = (
        search_query
        .filter(SearchHistory.search_type == "POLICY")
        .count()
    )

    scheme_searches = (
        search_query
        .filter(SearchHistory.search_type == "SCHEME")
        .count()
    )

    return {
        "total_users": total_users,
        "active_users": active_users,

        "total_policies": total_policies,
        "total_schemes": total_schemes,

        "approved_policies": approved_policies,
        "approved_schemes": approved_schemes,

        "total_searches": total_searches,
        "policy_searches": policy_searches,
        "scheme_searches": scheme_searches,
    }


def get_daily_usage(
    db: Session,
    user_id: int | None = None,
):
    query = db.query(SearchHistory)

    if user_id is not None:
        query = query.filter(
            SearchHistory.user_id == user_id
        )

    results = (
        query
        .with_entities(
            func.date(SearchHistory.searched_at).label("date"),
            func.count(SearchHistory.search_id).label("searches"),
        )
        .group_by(
            func.date(SearchHistory.searched_at)
        )
        .order_by(
            func.date(SearchHistory.searched_at)
        )
        .all()
    )

    return {
        "data": [
            {
                "date": str(row.date),
                "searches": row.searches,
            }
            for row in results
        ]
    }


def get_weekly_usage(
    db: Session,
    user_id: int | None = None,
):
    query = db.query(SearchHistory)

    if user_id is not None:
        query = query.filter(
            SearchHistory.user_id == user_id
        )

    results = (
        query
        .with_entities(
            func.date_trunc(
                "week",
                SearchHistory.searched_at
            ).label("week"),
            func.count(SearchHistory.search_id).label("searches"),
        )
        .group_by(
            func.date_trunc(
                "week",
                SearchHistory.searched_at
            )
        )
        .order_by(
            func.date_trunc(
                "week",
                SearchHistory.searched_at
            )
        )
        .all()
    )

    return {
        "data": [
            {
                "week": str(row.week),
                "searches": row.searches,
            }
            for row in results
        ]
    }


def get_monthly_usage(
    db: Session,
    user_id: int | None = None,
):
    query = db.query(SearchHistory)

    if user_id is not None:
        query = query.filter(
            SearchHistory.user_id == user_id
        )

    results = (
        query
        .with_entities(
            func.date_trunc(
                "month",
                SearchHistory.searched_at
            ).label("month"),
            func.count(SearchHistory.search_id).label("searches"),
        )
        .group_by(
            func.date_trunc(
                "month",
                SearchHistory.searched_at
            )
        )
        .order_by(
            func.date_trunc(
                "month",
                SearchHistory.searched_at
            )
        )
        .all()
    )

    return {
        "data": [
            {
                "month": str(row.month),
                "searches": row.searches,
            }
            for row in results
        ]
    }


def get_search_usage(
    db: Session,
    user_id: int | None = None,
):
    query = db.query(SearchHistory)

    if user_id is not None:
        query = query.filter(
            SearchHistory.user_id == user_id
        )

    return {
        "total_searches": query.count(),

        "policy_searches": (
            query
            .filter(SearchHistory.search_type == "POLICY")
            .count()
        ),

        "scheme_searches": (
            query
            .filter(SearchHistory.search_type == "SCHEME")
            .count()
        ),
    }


def get_policy_search_usage(
    db: Session,
    user_id: int | None = None,
):
    query = db.query(SearchHistory)

    if user_id is not None:
        query = query.filter(
            SearchHistory.user_id == user_id
        )

    return {
        "total_searches": (
            query
            .filter(SearchHistory.search_type == "POLICY")
            .count()
        )
    }


def get_scheme_search_usage(
    db: Session,
    user_id: int | None = None,
):
    query = db.query(SearchHistory)

    if user_id is not None:
        query = query.filter(
            SearchHistory.user_id == user_id
        )

    return {
        "total_searches": (
            query
            .filter(SearchHistory.search_type == "SCHEME")
            .count()
        )
    }


def get_policy_view_usage(
    db: Session,
    user_id: int | None = None,
):
    # No policy-view table was provided yet.
    return {
        "total_policy_views": 0,
    }


def get_scheme_view_usage(
    db: Session,
    user_id: int | None = None,
):
    # No scheme-view table was provided yet.
    return {
        "total_scheme_views": 0,
    }