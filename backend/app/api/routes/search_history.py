from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.search_history import SearchHistoryResponse
from app.services.search_history_service import (
    get_all_search_history,
    get_user_search_history,
    delete_user_search_history,
    get_search_history_statistics,
)

router = APIRouter(
    prefix="/search-history",
    tags=["Search History"],
)


@router.get("", response_model=list[SearchHistoryResponse])
def get_search_history_route(
    user_id: int | None = None,
    db: Session = Depends(get_db),
):
    return get_all_search_history(
        db=db,
        user_id=user_id,
    )


@router.get("/me/{user_id}", response_model=list[SearchHistoryResponse])
def get_my_search_history_route(
    user_id: int,
    db: Session = Depends(get_db),
):
    return get_user_search_history(
        db=db,
        user_id=user_id,
    )


@router.delete("/me/{user_id}")
def delete_my_search_history_route(
    user_id: int,
    db: Session = Depends(get_db),
):
    return delete_user_search_history(
        db=db,
        user_id=user_id,
    )


@router.get("/statistics")
def search_history_statistics_route(
    db: Session = Depends(get_db),
):
    return get_search_history_statistics(db)