from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import get_current_user, require_roles
from app.models.user import User
from app.models.notification import Notification

from app.schemas.notification import (
    NotificationCreate,
    NotificationResponse,
)

from app.services.notification_service import (
    create_notification,
    get_user_notifications,
    mark_notification_read,
    mark_all_notifications_read,
    delete_notification,
    get_notification_stats,
)


router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


ALLOWED_ROLES = [
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
    "GOVERNMENT_OFFICIAL",
    "ADMIN",
]


# ============================================================
# CREATE NOTIFICATION
# ============================================================

@router.post(
    "",
    response_model=NotificationResponse
)
def create_notification_route(
    data: NotificationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    return create_notification(
        db=db,
        data=data,
    )


# ============================================================
# GET NOTIFICATIONS
# ============================================================

@router.get(
    "/me/{user_id}",
    response_model=list[NotificationResponse]
)
def get_my_notifications(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        ALLOWED_ROLES,
    )

    # ADMIN → Citizen + Admin notifications
    if current_user.role == "ADMIN":
        return get_user_notifications(
            db=db,
            user_id=current_user.user_id,
            user_role=current_user.role,
        )

    # NORMAL USER → only their own notifications
    if current_user.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only access your own notifications",
        )

    return get_user_notifications(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


# ============================================================
# MARK ONE NOTIFICATION AS READ
# ============================================================

@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse
)
def mark_notification_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        ALLOWED_ROLES,
    )

    notification = mark_notification_read(
    db=db,
    notification_id=notification_id,
    user_id=current_user.user_id,
    user_role=current_user.role,
)

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )
    return notification

    # ADMIN can modify Citizen + Admin notifications
    if current_user.role == "ADMIN":
        notification_user = (
            db.query(User)
            .filter(
                User.user_id == notification.user_id
            )
            .first()
        )

        if not notification_user or notification_user.role not in [
            "CITIZEN",
            "ADMIN",
        ]:
            raise HTTPException(
                status_code=403,
                detail="You cannot modify this notification",
            )

        return notification

    # Normal user can modify only their own notification
    if notification.user_id != current_user.user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only modify your own notification",
        )

    return notification


# ============================================================
# MARK ALL AS READ
# ============================================================

@router.patch(
    "/me/{user_id}/read-all"
)
def mark_all_notifications_as_read(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        ALLOWED_ROLES,
    )

    # ADMIN
    if current_user.role == "ADMIN":
        # Admin marks their own notifications here.
        return mark_all_notifications_read(
            db=db,
            user_id=current_user.user_id,
        )

    # NORMAL USER
    if current_user.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only update your own notifications",
        )

    return mark_all_notifications_read(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


# ============================================================
# DELETE NOTIFICATION
# ============================================================

@router.delete(
    "/{notification_id}"
)
def delete_notification_route(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        ALLOWED_ROLES,
    )

    notification = delete_notification(
        db=db,
        notification_id=notification_id,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found or access denied",
        )

    return notification

# ============================================================
# NOTIFICATION STATISTICS
# ============================================================

@router.get(
    "/me/{user_id}/stats"
)
def notification_stats(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        ALLOWED_ROLES,
    )

    # ADMIN → Citizen + Admin statistics
    if current_user.role == "ADMIN":
        return get_notification_stats(
            db=db,
            user_id=current_user.user_id,
            user_role=current_user.role,
        )

    # NORMAL USER → only their own statistics
    if current_user.user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only access your own notification statistics",
        )

    return get_notification_stats(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )