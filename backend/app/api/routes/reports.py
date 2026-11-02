from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.report import ReportCreate, ReportResponse
from app.services.report_service import (
    create_report,
    get_reports,
    get_report,
    delete_report,
)


router = APIRouter(
    prefix="/reports",
    tags=["Reports"],
)


@router.post(
    "",
    response_model=ReportResponse,
)
def create_report_route(
    data: ReportCreate,
    db: Session = Depends(get_db),
):
    return create_report(db, data)


@router.get(
    "",
    response_model=list[ReportResponse],
)
def get_reports_route(
    user_id: int | None = None,
    db: Session = Depends(get_db),
):
    return get_reports(db, user_id)


@router.get(
    "/{report_id}",
    response_model=ReportResponse,
)
def get_report_route(
    report_id: int,
    db: Session = Depends(get_db),
):
    report = get_report(db, report_id)

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Report not found",
        )

    return report


@router.delete("/{report_id}")
def delete_report_route(
    report_id: int,
    db: Session = Depends(get_db),
):
    report = delete_report(db, report_id)

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Report not found",
        )

    return {
        "message": "Report deleted successfully",
        "report_id": report_id,
    }