from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import require_roles
from app.models.user import User

from app.schemas.audit_log import AuditLogResponse, EntityAuditTimelineResponse

from app.services.audit_log_service import (
    get_audit_logs,
    get_audit_log,
    get_entity_audit_logs,
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
    skip: int | None = Query(default=None, ge=0),
    limit: int | None = Query(default=None, ge=1, le=2000),
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
    #   Service returns audit logs across every role.
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
        skip=skip,
        limit=limit,
    )


# ============================================================
# WORKFLOW TIMELINE FOR ONE POLICY / SCHEME
#
# ADMIN + GOVERNMENT_OFFICIAL
#
# Chronological, paginated workflow history with actor names and
# roles inlined (no per-event lookups). Public roles are rejected:
# internal governance details never leak to citizens, researchers,
# organizations, or guests. Must precede /{audit_id} so "entity"
# is never parsed as an integer id.
# ============================================================


@router.get(
    "/entity/{entity_type}/{entity_id}",
    response_model=EntityAuditTimelineResponse,
)
def get_entity_timeline_route(
    entity_type: str,
    entity_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):
    return get_entity_audit_logs(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
        current_user=current_user,
        page=page,
        limit=limit,
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
