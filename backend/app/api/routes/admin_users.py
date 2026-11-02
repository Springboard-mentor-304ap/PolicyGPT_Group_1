from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.api.routes.auth import require_roles
from app.services.user_removal_service import (
    check_user_removal_dependencies,
    reassign_user_ownership,
)


class ReassignOwnershipRequest(BaseModel):
    source_user_email: str
    target_user_id: int
    confirm: bool


class UserStatusUpdate(BaseModel):
    is_active: bool


router = APIRouter(
    prefix="/admin",
    tags=["Administration"],
)


def count_past_users(db: Session) -> int:
    """
    Count the number of distinct users who have been successfully deleted from the system,
    derived from authoritative deletion audit records.
    Avoids double-counting users who have multiple audit events.
    Does not count failed deletions or ordinary inactive users.
    """
    # 1. Distinct user IDs from audit_logs where entity_type == 'USER' and action is a deletion action
    count = (
        db.query(func.count(func.distinct(AuditLog.entity_id)))
        .filter(
            AuditLog.action.in_(["AUTH_ADMIN_USER_DELETED", "AUTH_ACCOUNT_DELETED"]),
            AuditLog.entity_type == "USER",
            AuditLog.entity_id.isnot(None),
        )
        .scalar()
    ) or 0

    # 2. Also handle any legacy records where entity_id was not set but description contains user_id
    null_entity_count = (
        db.query(func.count(func.distinct(AuditLog.description)))
        .filter(
            AuditLog.action.in_(["AUTH_ADMIN_USER_DELETED", "AUTH_ACCOUNT_DELETED"]),
            AuditLog.entity_type == "USER",
            AuditLog.entity_id.is_(None),
        )
        .scalar()
    ) or 0

    return int(count + null_entity_count)


@router.get("/users/stats")
def get_user_stats(
    current_user: User = Depends(require_roles("ADMINISTRATOR")),
    db: Session = Depends(get_db),
):
    """
    Return administrative user statistics including past users count.
    Protected: Only ADMINISTRATOR users can access it.
    Does not expose sensitive personal information of deleted users.
    """
    users = db.query(User.user_id, User.is_active, User.role).all()
    total_users = len(users)
    active_users = sum(1 for u in users if getattr(u, "is_active", False))
    inactive_users = total_users - active_users
    administrators = sum(
        1 for u in users if (getattr(u, "role", "") or "").upper() in ("ADMIN", "ADMINISTRATOR")
    )
    past_users = count_past_users(db)

    return {
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": inactive_users,
        "administrators": administrators,
        "past_users": past_users,
        "past_users_count": past_users,
    }


@router.get("/users/past-count")
def get_past_users_count_endpoint(
    current_user: User = Depends(require_roles("ADMINISTRATOR")),
    db: Session = Depends(get_db),
):
    """
    Return the count of permanently deleted past users.
    Protected: Only ADMINISTRATOR users can access it.
    """
    count = count_past_users(db)
    return {
        "count": count,
        "past_users": count,
        "past_users_count": count,
    }


@router.get("/users")
def get_all_users(
    current_user: User = Depends(
        require_roles("ADMINISTRATOR")
    ),
    db: Session = Depends(get_db),
):
    """
    Return all registered users for the Administrator dashboard.

    The endpoint is protected:
    only ADMINISTRATOR users can access it.
    """

    users = (
        db.query(User)
        .order_by(User.created_at.desc())
        .all()
    )

    return [
        {
            "user_id": user.user_id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "phone": user.phone,
            "date_of_birth": (
                user.date_of_birth.isoformat()
                if user.date_of_birth
                else None
            ),
            "state": user.state,
            "district": user.district,
            "occupation": user.occupation,
            "organization": user.organization,
            "is_active": user.is_active,
            "created_at": (
                user.created_at.isoformat()
                if user.created_at
                else None
            ),
            "updated_at": (
                user.updated_at.isoformat()
                if user.updated_at
                else None
            ),
        }
        for user in users
    ]


@router.patch("/users/{user_id}/status")
def update_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    current_user: User = Depends(
        require_roles("ADMINISTRATOR")
    ),
    db: Session = Depends(get_db),
):
    """
    Activate or deactivate a user account.

    Only ADMINISTRATOR users can access it. Administrators cannot change
    their own status (avoids accidental lockout). The persisted
    ``is_active`` value is what the User Management list displays, so
    toggling here is immediately reflected as Active/Inactive.
    """

    if user_id == current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own account status.",
        )

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)

    return {
        "user_id": user.user_id,
        "is_active": user.is_active,
    }


@router.get("/users/removal-check/{email}")
def check_user_removal(
    email: str,
    current_user: User = Depends(require_roles("ADMINISTRATOR", "ADMIN")),
    db: Session = Depends(get_db),
):
    """Inspect all dependent records for a user before removal, returning any
    blockers (e.g. authored policies or schemes) and eligible officials for
    ownership reassignment.
    """
    user = (
        db.query(User)
        .filter(func.lower(User.email) == email.strip().lower())
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return check_user_removal_dependencies(
        user=user,
        admin_user=current_user,
        db=db,
    )


@router.post("/users/reassign-ownership")
def reassign_user_ownership_endpoint(
    payload: ReassignOwnershipRequest,
    request: Request,
    current_user: User = Depends(require_roles("ADMINISTRATOR", "ADMIN")),
    db: Session = Depends(get_db),
):
    """Reassign ownership of policies and schemes from one user to an eligible
    Government Official. Requires explicit confirmation.
    """
    if not payload.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit confirmation is required before reassigning ownership.",
        )

    source_user = (
        db.query(User)
        .filter(func.lower(User.email) == payload.source_user_email.strip().lower())
        .first()
    )
    if not source_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source user not found",
        )

    target_user = (
        db.query(User)
        .filter(User.user_id == payload.target_user_id)
        .first()
    )
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target official not found",
        )

    return reassign_user_ownership(
        source_user=source_user,
        target_user=target_user,
        admin_user=current_user,
        request=request,
        db=db,
    )
