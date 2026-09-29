from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import normalize_role, require_roles
from app.models.user import User

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


# ============================================================
# GET ALL / USER SEARCH HISTORY
# ============================================================

@router.get("", response_model=list[SearchHistoryResponse])
def get_search_history_route(
    user_id: int | None = None,
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
    # ADMIN → can see all search history
    if normalize_role(current_user.role) == "ADMIN":
        return get_all_search_history(
            db=db,
            user_id=user_id,
        )

    # NORMAL USER → only their own search history
    return get_all_search_history(
        db=db,
        user_id=current_user.user_id,
    )


# ============================================================
# GET MY SEARCH HISTORY
# ============================================================

@router.get("/me/{user_id}", response_model=list[SearchHistoryResponse])
def get_my_search_history_route(
    user_id: int,
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
    # ADMIN → can access the requested user's history
    if normalize_role(current_user.role) == "ADMIN":
        return get_user_search_history(
            db=db,
            user_id=user_id,
        )

    # NORMAL USER → cannot access another user's history
    if current_user.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only access your own search history",
        )

    return get_user_search_history(
        db=db,
        user_id=current_user.user_id,
    )


# ============================================================
# DELETE MY SEARCH HISTORY
# ============================================================

@router.delete("/me/{user_id}")
def delete_my_search_history_route(
    user_id: int,
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
    # ADMIN → can delete the requested user's history
    if normalize_role(current_user.role) == "ADMIN":
        return delete_user_search_history(
            db=db,
            user_id=user_id,
        )

    # NORMAL USER → can delete only their own history
    if current_user.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only delete your own search history",
        )

    return delete_user_search_history(
        db=db,
        user_id=current_user.user_id,
    )


# ============================================================
# SEARCH HISTORY STATISTICS
# ============================================================

@router.get("/statistics")
def search_history_statistics_route(
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
    # ADMIN → statistics for all users
    if normalize_role(current_user.role) == "ADMIN":
        return get_search_history_statistics(
            db=db,
            user_id=None,
        )

    # NORMAL USER → statistics only for logged-in user
    return get_search_history_statistics(
        db=db,
        user_id=current_user.user_id,
    )
