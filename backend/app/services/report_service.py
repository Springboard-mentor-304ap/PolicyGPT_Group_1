from datetime import datetime

from sqlalchemy.orm import Session

from app.models.report import Report
from app.schemas.report import ReportCreate


def create_report(
    db: Session,
    data: ReportCreate,
):
    report = Report(
        generated_by=data.generated_by,
        report_type=data.report_type,
        report_format=data.report_format,
        parameters=data.parameters,
        file_path=data.file_path,
        generated_at=datetime.utcnow(),
    )

    db.add(report)
    db.commit()
    db.refresh(report)

    return report


def get_reports(
    db: Session,
    user_id: int | None = None,
):
    query = db.query(Report)

    if user_id is not None:
        query = query.filter(Report.generated_by == user_id)

    return query.order_by(
        Report.generated_at.desc()
    ).all()


def get_report(
    db: Session,
    report_id: int,
):
    return (
        db.query(Report)
        .filter(Report.report_id == report_id)
        .first()
    )


def delete_report(
    db: Session,
    report_id: int,
):
    report = get_report(db, report_id)

    if not report:
        return None

    db.delete(report)
    db.commit()

    return report