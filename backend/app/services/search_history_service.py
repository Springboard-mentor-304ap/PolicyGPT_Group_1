from datetime import datetime

from sqlalchemy.orm import Session

from app.models.search_history import SearchHistory


ALLOWED_SEARCH_TYPES = {"POLICY", "SCHEME"}


def record_search(
    db: Session,
    user_id: int,
    search_query: str,
    search_type: str,
    filters: dict | None = None,
):
    record = SearchHistory(
        user_id=user_id,
        search_query=search_query,
        search_type=search_type,
        filters=filters,
        searched_at=datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def delete_search_history_item(
    db: Session,
    user_id: int,
    history_id: int,
) -> bool:
    record = (
        db.query(SearchHistory)
        .filter(
            SearchHistory.history_id == history_id,
            SearchHistory.user_id == user_id,
        )
        .first()
    )
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True


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