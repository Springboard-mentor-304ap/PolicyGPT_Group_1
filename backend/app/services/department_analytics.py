from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.services.department_analytics_service import (
    get_departments,
    get_department_analytics,
    get_department_policies,
    get_department_schemes,
)

router = APIRouter(
    prefix="/analytics/departments",
    tags=["Department Analytics"],
)


@router.get("")
def list_departments(
    db: Session = Depends(get_db),
):
    return get_departments(db)


@router.get("/{department}")
def department_analytics(
    department: str,
    db: Session = Depends(get_db),
):
    result = get_department_analytics(db, department)

    if (
        result["total_policies"] == 0
        and result["total_schemes"] == 0
    ):
        raise HTTPException(
            status_code=404,
            detail="Department not found",
        )

    return result


@router.get("/{department}/policies")
def department_policies(
    department: str,
    db: Session = Depends(get_db),
):
    return get_department_policies(db, department)


@router.get("/{department}/schemes")
def department_schemes(
    department: str,
    db: Session = Depends(get_db),
):
    return get_department_schemes(db, department)