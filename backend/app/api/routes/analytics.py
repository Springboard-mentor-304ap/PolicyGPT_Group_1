from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.services.analytics_service import (
    get_dashboard_analytics,
    get_policy_analytics,
    get_scheme_analytics,
    get_policy_trends,
    get_scheme_usage,
    get_user_analytics,
    get_user_activity,
)

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


@router.get("/dashboard")
def dashboard_analytics(
    db: Session = Depends(get_db),
):
    return get_dashboard_analytics(db)


@router.get("/policies")
def policy_analytics(
    db: Session = Depends(get_db),
):
    return get_policy_analytics(db)


@router.get("/schemes")
def scheme_analytics(
    db: Session = Depends(get_db),
):
    return get_scheme_analytics(db)

@router.get("/policies/trends")
def policy_trends(
    db: Session = Depends(get_db),
):
    return get_policy_trends(db)

@router.get("/schemes/usage")
def scheme_usage(
    db: Session = Depends(get_db),
):
    return get_scheme_usage(db)


@router.get("/users")
def user_analytics(
    db: Session = Depends(get_db),
):
    return get_user_analytics(db)


@router.get("/users/activity")
def user_activity(
    db: Session = Depends(get_db),
):
    return get_user_activity(db)