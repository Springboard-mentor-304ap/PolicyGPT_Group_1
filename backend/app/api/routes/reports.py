from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user, require_roles
from app.models.user import User
from app.db.database import get_db

from app.services.report_service import (
    generate_report,
    get_role_reports,
)


router = APIRouter(
    prefix="/reports",
    tags=["Reports"],
)


ALLOWED_ROLES = [
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
    "GOVERNMENT_OFFICIAL",
    "ADMIN",
]


# ============================================================
# ROLE-BASED REPORTS
# ============================================================

@router.get("/role")
def role_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        ALLOWED_ROLES,
    )

    return get_role_reports(
        db,
        current_user,
    )


# ============================================================
# GENERATE REPORT
# ============================================================

@router.get("/{report_type}")
def generate_report_endpoint(
    report_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        ALLOWED_ROLES,
    )

    try:
        return {
            "report_type": report_type.upper(),

            "data": generate_report(
                db=db,
                report_type=report_type,
                user=current_user,
            ),
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )