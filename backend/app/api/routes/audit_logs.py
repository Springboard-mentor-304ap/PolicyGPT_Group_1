from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.audit_log import AuditLogResponse
from app.services.audit_log_service import (
    get_audit_logs,
    get_audit_log,
)

router = APIRouter(
    prefix="/audit-logs",
    tags=["Audit Logs"],
)


@router.get("", response_model=list[AuditLogResponse])
def get_audit_logs_route(
    user_id: int | None = Query(default=None),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return get_audit_logs(
        db=db,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/{audit_id}", response_model=AuditLogResponse)
def get_audit_log_route(
    audit_id: int,
    db: Session = Depends(get_db),
):
    audit_log = get_audit_log(db, audit_id)

    if not audit_log:
        raise HTTPException(
            status_code=404,
            detail="Audit log not found",
        )

    return audit_log