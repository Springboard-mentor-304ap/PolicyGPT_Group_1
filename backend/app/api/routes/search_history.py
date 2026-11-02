from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import normalize_role, require_roles
from app.models.user import User

from app.schemas.search_history import SearchHistoryCreate, SearchHistoryResponse

from app.services.search_history_service import (
    ALLOWED_SEARCH_TYPES,
    delete_search_history_item,
    get_all_search_history,
    get_user_search_history,
    delete_user_search_history,
    get_search_history_statistics,
    record_search,
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
# RECORD A SEARCH (owner is always the authenticated user)
# ============================================================

@router.post("", response_model=SearchHistoryResponse)
def record_search_history_route(
    data: SearchHistoryCreate,
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
    query = (data.search_query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query is required")

    search_type = (data.search_type or "").strip().upper()
    if search_type not in ALLOWED_SEARCH_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Search type must be one of: {sorted(ALLOWED_SEARCH_TYPES)}",
        )

    return record_search(
        db=db,
        user_id=current_user.user_id,
        search_query=query,
        search_type=search_type,
        filters=data.filters,
    )


# ============================================================
# DELETE ONE SEARCH HISTORY RECORD (own records only)
# ============================================================

@router.delete("/{history_id}")
def delete_search_history_item_route(
    history_id: int,
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
    removed = delete_search_history_item(
        db=db,
        user_id=current_user.user_id,
        history_id=history_id,
    )
    if not removed:
        raise HTTPException(
            status_code=404, detail="Search history record not found"
        )

    return {"message": "Search history record deleted successfully"}


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
