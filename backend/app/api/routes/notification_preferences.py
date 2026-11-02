from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import get_current_user, require_roles
from app.models.user import User

from app.schemas.notification_preference import (
    NotificationPreferenceCreate,
    NotificationPreferenceUpdate,
    NotificationPreferenceResponse,
)

from app.services.notification_preference_service import (
    create_preferences,
    get_preferences,
    update_preferences,
)

router = APIRouter(
    prefix="/notification-preferences",
    tags=["Notification Preferences"],
)


@router.post(
    "",
    response_model=NotificationPreferenceResponse,
)
def create_notification_preferences(
    data: NotificationPreferenceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    if current_user.role != "ADMIN" and current_user.user_id != data.user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only create preferences for your own account",
        )

    existing = get_preferences(db, data.user_id,current_user.role)

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Notification preferences already exist for this user",
        )

    return create_preferences(db, data)


@router.get(
    "/{user_id}",
    response_model=NotificationPreferenceResponse,
)
def get_notification_preferences(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    if (
        current_user.user_id != user_id
        and current_user.role != "ADMIN"
    ):
        raise HTTPException(
            status_code=403,
            detail="You can only access your own notification preferences",
        )

    preference = get_preferences(db, user_id,current_user.role)

    if not preference:
        raise HTTPException(
            status_code=404,
            detail="Notification preferences not found",
        )

    return preference


@router.patch(
    "/{user_id}",
    response_model=NotificationPreferenceResponse,
)
def update_notification_preferences(
    user_id: int,
    data: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(
        current_user,
        [
            "CITIZEN",
            "RESEARCHER",
            "ORGANIZATION",
            "GOVERNMENT_OFFICIAL",
            "ADMIN",
        ],
    )

    if (
        current_user.user_id != user_id
        and current_user.role != "ADMIN"
    ):
        raise HTTPException(
            status_code=403,
            detail="You can only update your own notification preferences",
        )

    preference = update_preferences(db, user_id, current_user.role, data)

    if not preference:
        raise HTTPException(
            status_code=404,
            detail="Notification preferences not found",
        )

    return preference