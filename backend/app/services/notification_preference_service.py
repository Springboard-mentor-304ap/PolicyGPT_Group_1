from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.notification_preference import NotificationPreference
from app.schemas.notification_preference import (
    NotificationPreferenceCreate,
    NotificationPreferenceUpdate,
)


def get_role_defaults(user_role: str) -> dict[str, bool | str]:
    role = (user_role or "").upper().strip()
    
    defaults: dict[str, bool | str] = {
        "email_enabled": True,
        "sms_enabled": False,
        "in_app_enabled": True,
        "policy_alerts": True,
        "scheme_updates": True,
        "deadline_reminders": True,
        "application_updates": True,
        "government_announcements": False,
        "regulatory_updates": True,
        "research_reports": False,
        "system_alerts": True,
        "frequency": "INSTANT",
    }

    if role == "RESEARCHER":
        defaults["deadline_reminders"] = False
        defaults["application_updates"] = False
        defaults["research_reports"] = True
        defaults["government_announcements"] = True
    elif role in ("ORGANIZATION", "ORGANISATION"):
        defaults["government_announcements"] = True
    elif role in ("GOVERNMENT_OFFICIAL", "GOVERNMENT_OFFICER", "GOVERNMENT"):
        defaults["government_announcements"] = True
        defaults["research_reports"] = True
    elif role in ("ADMIN", "ADMINISTRATOR"):
        defaults["government_announcements"] = True
        defaults["research_reports"] = True

    return defaults


def get_or_create_preferences(
    db: Session,
    user_id: int,
    user_role: str,
) -> NotificationPreference:
    preference = (
        db.query(NotificationPreference)
        .filter(NotificationPreference.user_id == user_id)
        .first()
    )

    if preference:
        return preference

    # Initialize with role-based defaults
    defaults = get_role_defaults(user_role)
    new_pref = NotificationPreference(
        user_id=user_id,
        email_enabled=bool(defaults["email_enabled"]),
        sms_enabled=bool(defaults["sms_enabled"]),
        in_app_enabled=bool(defaults["in_app_enabled"]),
        policy_alerts=bool(defaults["policy_alerts"]),
        scheme_updates=bool(defaults["scheme_updates"]),
        deadline_reminders=bool(defaults["deadline_reminders"]),
        application_updates=bool(defaults["application_updates"]),
        government_announcements=bool(defaults["government_announcements"]),
        regulatory_updates=bool(defaults["regulatory_updates"]),
        research_reports=bool(defaults["research_reports"]),
        system_alerts=bool(defaults["system_alerts"]),
        frequency=str(defaults["frequency"]),
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )

    db.add(new_pref)
    db.commit()
    db.refresh(new_pref)
    return new_pref


def update_preferences(
    db: Session,
    user_id: int,
    user_role: str,
    data: NotificationPreferenceUpdate,
    commit: bool = True,
) -> NotificationPreference:
    """Apply a flat preference update.

    ``commit=False`` lets a caller that writes several things together (the
    matrix endpoint writes master switches *and* per-type rules) own the
    transaction, so a later failure cannot leave a half-applied save behind.
    """
    pref = get_or_create_preferences(db, user_id, user_role)

    update_dict = data.model_dump(exclude_unset=True)
    changed = False
    for field, value in update_dict.items():
        if (
            value is not None
            and hasattr(pref, field)
            and getattr(pref, field) != value
        ):
            setattr(pref, field, value)
            changed = True

    if changed:
        pref.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if commit:
            db.commit()
            db.refresh(pref)
        else:
            db.flush()

        # Cached channel decisions for this user are now stale.
        from app.services.notification_service import (
            invalidate_preference_cache,
        )

        invalidate_preference_cache(user_id)

        try:
            from app.services.audit_log_service import (
                ACTION_NOTIFICATION_PREFERENCE_CHANGED,
                log_action,
            )

            log_action(
                db,
                action=ACTION_NOTIFICATION_PREFERENCE_CHANGED,
                user_id=user_id,
                entity_type="NOTIFICATION_PREFERENCE",
                entity_id=user_id,
                description=(
                f"Updated fields: {', '.join(sorted(update_dict))}"
            ),
                commit=commit,
            )
        except Exception:
            if commit:
                raise
            db.rollback()

    return pref


def reset_preferences(
    db: Session,
    user_id: int,
    user_role: str,
) -> NotificationPreference:
    pref = get_or_create_preferences(db, user_id, user_role)
    defaults = get_role_defaults(user_role)

    for field, val in defaults.items():
        if hasattr(pref, field):
            setattr(pref, field, val)

    # A reset also drops every explicit per-type rule, otherwise the matrix
    # would keep the overrides the user just asked to discard.
    try:
        from app.models.notification_preference_rule import (
            NotificationPreferenceRule,
        )

        db.query(NotificationPreferenceRule).filter(
            NotificationPreferenceRule.user_id == user_id
        ).delete(synchronize_session=False)
    except Exception:
        pass

    pref.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(pref)

    from app.services.notification_service import invalidate_preference_cache

    invalidate_preference_cache(user_id)
    return pref