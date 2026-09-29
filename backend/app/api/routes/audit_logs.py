from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import require_roles
from app.models.user import User

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
    # The user_id query parameter is NOT used to determine access.
    #
    # ADMIN:
    #   Service returns audit logs belonging to CITIZEN + ADMIN.
    #
    # Normal users:
    #   Service returns only the logged-in user's audit logs.
    #
    # This prevents a normal user from passing another user's ID
    # through ?user_id= and accessing their audit logs.

    return get_audit_logs(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
        action=action,
        entity_type=entity_type,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/{audit_id}", response_model=AuditLogResponse)
def get_audit_log_route(
    audit_id: int,
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
    audit_log = get_audit_log(
        db=db,
        audit_id=audit_id,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )

    if not audit_log:
        raise HTTPException(
            status_code=404,
            detail="Audit log not found or access denied",
        )

    return audit_log
