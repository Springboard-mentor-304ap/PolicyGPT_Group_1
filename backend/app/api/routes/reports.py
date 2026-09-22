from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.services.report_service import generate_report


router = APIRouter(
    prefix="/reports",
    tags=["Reports"],
)


@router.get("/{report_type}")
def generate_report_endpoint(
    report_type: str,
    db: Session = Depends(get_db),
):
    try:
        return {
            "report_type": report_type.upper(),
            "data": generate_report(
                db,
                report_type
            )
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )