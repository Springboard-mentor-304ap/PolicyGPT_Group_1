from sqlalchemy.orm import Session

from app.models.search_history import SearchHistory


def get_all_search_history(
    db: Session,
    user_id: int | None = None,
):
    query = db.query(SearchHistory)

    if user_id is not None:
        query = query.filter(SearchHistory.user_id == user_id)

    return (
        query
        .order_by(SearchHistory.searched_at.desc())
        .all()
    )


def get_user_search_history(
    db: Session,
    user_id: int,
):
    return (
        db.query(SearchHistory)
        .filter(SearchHistory.user_id == user_id)
        .order_by(SearchHistory.searched_at.desc())
        .all()
    )


def delete_user_search_history(
    db: Session,
    user_id: int,
):
    records = (
        db.query(SearchHistory)
        .filter(SearchHistory.user_id == user_id)
        .all()
    )

    deleted_count = len(records)

    for record in records:
        db.delete(record)

    db.commit()

    return {
        "message": "Search history deleted successfully",
        "deleted_count": deleted_count,
    }


def get_search_history_statistics(
    db: Session,
    user_id: int | None = None,
):
    query = db.query(SearchHistory)

    if user_id is not None:
        query = query.filter(SearchHistory.user_id == user_id)

    total_searches = query.count()

    policy_searches = (
        query
        .filter(SearchHistory.search_type == "POLICY")
        .count()
    )

    scheme_searches = (
        query
        .filter(SearchHistory.search_type == "SCHEME")
        .count()
    )

    return {
        "total_searches": total_searches,
        "policy_searches": policy_searches,
        "scheme_searches": scheme_searches,
    }