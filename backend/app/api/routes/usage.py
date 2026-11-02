from fastapi import APIRouter, Depends

from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import normalize_role, require_roles
from app.models.user import User

from app.services.usage_service import (
    get_usage_statistics,
    get_daily_usage,
    get_weekly_usage,
    get_monthly_usage,
    get_search_usage,
    get_policy_search_usage,
    get_scheme_search_usage,
    get_policy_view_usage,
    get_scheme_view_usage,
)


router = APIRouter(
    prefix="/usage",
    tags=["Usage Statistics"],
)


def get_data_user_id(current_user: User):
    """
    ADMIN -> None (all data)
    Other users -> their own user_id
    """
    if normalize_role(current_user.role) == "ADMIN":
        return None

    return current_user.user_id


@router.get("/statistics")
def usage_statistics(
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
    user_id = get_data_user_id(current_user)

    return get_usage_statistics(
        db=db,
        user_id=user_id,
    )


@router.get("/daily")
def daily_usage(
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
    user_id = get_data_user_id(current_user)

    return get_daily_usage(
        db=db,
        user_id=user_id,
    )


@router.get("/weekly")
def weekly_usage(
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
    user_id = get_data_user_id(current_user)

    return get_weekly_usage(
        db=db,
        user_id=user_id,
    )


@router.get("/monthly")
def monthly_usage(
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
    user_id = get_data_user_id(current_user)

    return get_monthly_usage(
        db=db,
        user_id=user_id,
    )


@router.get("/searches")
def search_usage(
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
    user_id = get_data_user_id(current_user)

    return get_search_usage(
        db=db,
        user_id=user_id,
    )


@router.get("/searches/policies")
def policy_search_usage(
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
    user_id = get_data_user_id(current_user)

    return get_policy_search_usage(
        db=db,
        user_id=user_id,
    )


@router.get("/searches/schemes")
def scheme_search_usage(
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
    user_id = get_data_user_id(current_user)

    return get_scheme_search_usage(
        db=db,
        user_id=user_id,
    )


@router.get("/views/policies")
def policy_view_usage(
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
    user_id = get_data_user_id(current_user)

    return get_policy_view_usage(
        db=db,
        user_id=user_id,
    )


@router.get("/views/schemes")
def scheme_view_usage(
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
    user_id = get_data_user_id(current_user)

    return get_scheme_view_usage(
        db=db,
        user_id=user_id,
    )
