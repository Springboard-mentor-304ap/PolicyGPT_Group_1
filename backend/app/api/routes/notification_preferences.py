from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
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
):
    existing = get_preferences(db, data.user_id)

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
):
    preference = get_preferences(db, user_id)

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
):
    preference = update_preferences(db, user_id, data)

    if not preference:
        raise HTTPException(
            status_code=404,
            detail="Notification preferences not found",
        )

    return preference
