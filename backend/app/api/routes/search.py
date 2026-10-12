from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.schemas.search import GlobalSearchResponse
from app.services.global_search_service import global_search, normalize_query

router = APIRouter(
    prefix="/search",
    tags=["Search"],
)


# ============================================================
# GLOBAL SEARCH (policies + schemes dropdown)
#
# GET /search/global?q=water&limit=5
#
# ALL AUTHENTICATED USERS (role-filtered server-side).
# Empty/blank queries return empty payloads (never the full DB).
# ============================================================


@router.get(
    "/global",
    response_model=GlobalSearchResponse,
)
def global_search_route(
    q: str | None = Query(default=None),
    query: str | None = Query(default=None),
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw = q if q is not None else query
    normalized = normalize_query(raw)
    if not normalized:
        return {
            "query": "",
            "total_policies": 0,
            "total_schemes": 0,
            "policies": [],
            "schemes": [],
        }
    return global_search(
        db=db,
        query=normalized,
        limit_per_type=limit,
        current_user=current_user,
    )
