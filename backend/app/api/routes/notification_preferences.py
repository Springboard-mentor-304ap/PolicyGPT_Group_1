from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import get_current_user, normalize_role
from app.models.user import User
from app.schemas.notification_preference import (
    NotificationPreferenceUpdate,
    NotificationPreferenceResponse,
)
from app.services.notification_preference_service import (
    get_or_create_preferences,
    update_preferences,
    reset_preferences,
)

router = APIRouter(
    prefix="/notification-preferences",
    tags=["Notification Preferences"],
)


def _verify_not_guest(current_user: User):
    role = normalize_role(current_user.role)
    if role in ("GUEST", "GUEST_USER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Guest users cannot manage notification "
                "preferences. Please sign in."
            ),
        )


# ============================================================
# GET MY PREFERENCES
# ============================================================

@router.get(
    "",
    response_model=NotificationPreferenceResponse,
)
@router.get(
    "/me",
    response_model=NotificationPreferenceResponse,
)
def get_my_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_not_guest(current_user)
    return get_or_create_preferences(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


# ============================================================
# UPDATE MY PREFERENCES
# ============================================================

@router.put(
    "",
    response_model=NotificationPreferenceResponse,
)
@router.patch(
    "",
    response_model=NotificationPreferenceResponse,
)
@router.put(
    "/me",
    response_model=NotificationPreferenceResponse,
)
@router.patch(
    "/me",
    response_model=NotificationPreferenceResponse,
)
def update_my_preferences(
    data: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_not_guest(current_user)
    return update_preferences(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
        data=data,
    )


# ============================================================
# RESET PREFERENCES TO DEFAULT
# ============================================================

@router.post(
    "/reset",
    response_model=NotificationPreferenceResponse,
)
@router.post(
    "/me/reset",
    response_model=NotificationPreferenceResponse,
)
def reset_my_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_not_guest(current_user)
    return reset_preferences(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


# ============================================================
# LEGACY ROUTES (PRESERVING COMPATIBILITY)
# ============================================================

@router.get(
    "/{user_id}",
    response_model=NotificationPreferenceResponse,
)
def get_preferences_by_id(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_not_guest(current_user)
    if (
        current_user.user_id != user_id
        and normalize_role(current_user.role) != "ADMIN"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own notification preferences",
        )
    # Defaults must reflect the target user's role, not the viewer's.
    target = db.query(User).filter(User.user_id == user_id).first()
    return get_or_create_preferences(
        db=db,
        user_id=user_id,
        user_role=(target.role if target else current_user.role),
    )


@router.patch(
    "/{user_id}",
    response_model=NotificationPreferenceResponse,
)
def update_preferences_by_id(
    user_id: int,
    data: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_not_guest(current_user)
    if (
        current_user.user_id != user_id
        and normalize_role(current_user.role) != "ADMIN"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own notification preferences",
        )
    return update_preferences(
        db=db,
        user_id=user_id,
        user_role=current_user.role,
        data=data,
    )

# ============================================================
# PER-NOTIFICATION-TYPE CHANNEL MATRIX
#
# The backend is the authority on which preference groups a role may view and
# edit. The preferences screen renders whatever these endpoints return; it does
# not decide visibility itself.
# ============================================================

from app.schemas.notification_preference import (  # noqa: E402
    NotificationMatrixResponse,
    NotificationMatrixUpdate,
    NotificationTypeRuleUpdate,
)
from app.services import notification_taxonomy as tax  # noqa: E402
from app.services.notification_preference_rule_service import (  # noqa: E402
    delete_rules,
    effective_matrix,
    replace_rules,
    upsert_rule,
)
from app.services.notification_preference_service import (  # noqa: E402
    update_preferences as _update_preferences,
)
from app.services.notification_service import (  # noqa: E402
    invalidate_preference_cache,
)


@router.get(
    "/me/matrix",
    response_model=NotificationMatrixResponse,
)
def get_my_notification_matrix(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The full per-type x channel matrix, scoped to the caller's role."""
    _verify_not_guest(current_user)
    role = normalize_role(current_user.role)
    preference = get_or_create_preferences(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )
    return {
        "user_id": current_user.user_id,
        "role": role,
        "global_settings": preference,
        "groups": effective_matrix(
            db, current_user.user_id, role, preference=preference
        ),
    }


@router.put(
    "/me/matrix",
    response_model=NotificationMatrixResponse,
)
def save_my_notification_matrix(
    data: NotificationMatrixUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save master switches and/or per-type rules in one transaction.

    Rejects any type the caller's role is not allowed to configure, so a
    crafted request cannot turn on internal workflow alerts for a citizen.

    Authorisation is checked *before* anything is written and the whole save
    commits once at the end. Otherwise a request that mixes valid master
    switches with a forbidden rule type would return 403 while leaving the
    master switches already persisted.
    """
    _verify_not_guest(current_user)
    role = normalize_role(current_user.role)

    rejected = [
        rule.notification_type
        for rule in data.rules
        if not tax.role_can_configure_type(role, rule.notification_type)
    ]
    if rejected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your role cannot configure notifications of type: "
                + ", ".join(sorted(set(rejected)))
            ),
        )

    if data.global_settings is not None:
        _update_preferences(
            db=db,
            user_id=current_user.user_id,
            user_role=current_user.role,
            data=data.global_settings,
            commit=False,
        )

    if data.rules:
        replace_rules(
            db,
            current_user.user_id,
            [rule.model_dump() for rule in data.rules],
        )

    db.commit()

    # The resolved-channel cache is now stale.
    invalidate_preference_cache(current_user.user_id)

    preference = get_or_create_preferences(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )
    return {
        "user_id": current_user.user_id,
        "role": role,
        "global_settings": preference,
        "groups": effective_matrix(
            db, current_user.user_id, role, preference=preference
        ),
    }


@router.patch(
    "/me/types/{notification_type}",
    response_model=NotificationMatrixResponse,
)
def set_single_type(
    notification_type: str,
    data: NotificationTypeRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle one notification type's channels without touching the rest."""
    _verify_not_guest(current_user)
    role = normalize_role(current_user.role)

    if not tax.role_can_configure_type(role, notification_type):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Your role cannot configure notifications of type "
                f"'{notification_type}'."
            ),
        )

    upsert_rule(
        db=db,
        user_id=current_user.user_id,
        notification_type=notification_type,
        in_app_enabled=data.in_app_enabled,
        email_enabled=data.email_enabled,
        sms_enabled=data.sms_enabled,
    )
    db.commit()
    invalidate_preference_cache(current_user.user_id)

    preference = get_or_create_preferences(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )
    return {
        "user_id": current_user.user_id,
        "role": role,
        "global_settings": preference,
        "groups": effective_matrix(
            db, current_user.user_id, role, preference=preference
        ),
    }


@router.delete(
    "/me/types",
    response_model=NotificationMatrixResponse,
)
def reset_types_to_defaults(
    types: list[str] = Query(
        default_factory=list,
        description="Notification types to reset. Omit to reset every type.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete explicit per-type rules, falling back to the group defaults."""
    _verify_not_guest(current_user)
    role = normalize_role(current_user.role)
    if types:
        targets = [t for t in types if tax.role_can_configure_type(role, t)]
    else:
        targets = [t for group in tax.groups_for_role(
            role) for t in group.types]
    delete_rules(db, current_user.user_id, targets)
    db.commit()
    invalidate_preference_cache(current_user.user_id)

    preference = get_or_create_preferences(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )
    return {
        "user_id": current_user.user_id,
        "role": role,
        "global_settings": preference,
        "groups": effective_matrix(
            db, current_user.user_id, role, preference=preference
        ),
    }
