from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
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


@router.get("/statistics")
def usage_statistics(db: Session = Depends(get_db)):
    return get_usage_statistics(db)


@router.get("/daily")
def daily_usage(db: Session = Depends(get_db)):
    return get_daily_usage(db)


@router.get("/weekly")
def weekly_usage(db: Session = Depends(get_db)):
    return get_weekly_usage(db)


@router.get("/monthly")
def monthly_usage(db: Session = Depends(get_db)):
    return get_monthly_usage(db)


@router.get("/searches")
def search_usage(db: Session = Depends(get_db)):
    return get_search_usage(db)


@router.get("/searches/policies")
def policy_search_usage(db: Session = Depends(get_db)):
    return get_policy_search_usage(db)


@router.get("/searches/schemes")
def scheme_search_usage(db: Session = Depends(get_db)):
    return get_scheme_search_usage(db)


@router.get("/views/policies")
def policy_view_usage(db: Session = Depends(get_db)):
    return get_policy_view_usage(db)


@router.get("/views/schemes")
def scheme_view_usage(db: Session = Depends(get_db)):
    return get_scheme_view_usage(db)