from datetime import datetime

from sqlalchemy.orm import Session
from app.models.user import User
from app.models.notification_preference import NotificationPreference
from app.schemas.notification_preference import (
    NotificationPreferenceCreate,
    NotificationPreferenceUpdate,
)


def create_preferences(
    db: Session,
    data: NotificationPreferenceCreate,
):
    preference = NotificationPreference(
        user_id=data.user_id,
        email_enabled=data.email_enabled,
        sms_enabled=data.sms_enabled,
        in_app_enabled=data.in_app_enabled,
        policy_alerts=data.policy_alerts,
        scheme_updates=data.scheme_updates,
        deadline_reminders=data.deadline_reminders,
        updated_at=datetime.utcnow(),
    )

    db.add(preference)
    db.commit()
    db.refresh(preference)

    return preference


def get_preferences(
    db: Session,
    user_id: int,
    user_role: str,
):
    query = (
        db.query(NotificationPreference)
        .join(
            User,
            NotificationPreference.user_id == User.user_id
        )
    )

    # ADMIN → Citizen + Admin preferences
    if user_role == "ADMIN":
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → only their own preferences
    else:
        query = query.filter(
            NotificationPreference.user_id == user_id
        )

    return query.first()


def update_preferences(
    db: Session,
    user_id: int,
    user_role: str,
    data: NotificationPreferenceUpdate,
):
    preference = get_preferences(db, user_id, user_role,) 

    if not preference:
        return None

    update_data = data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(preference, field, value)

    preference.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(preference)

    return preference