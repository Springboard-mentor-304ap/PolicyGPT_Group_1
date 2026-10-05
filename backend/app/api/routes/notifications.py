from datetime import datetime, timezone
from typing import Any
import hmac
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Query,
    status,
)
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.api.routes.auth import get_current_user, normalize_role
from app.models.user import User
from app.models.notification import Notification
from app.models.notification_delivery import NotificationDelivery
from app.schemas.notification import (
    NotificationCreate,
    NotificationResponse,
    NotificationListResponse,
    NotificationSummaryResponse,
    UnreadCountResponse,
    AdminNotificationStatsResponse,
    TestEmailRequest,
    TestSmsRequest,
)
from app.schemas.notification_preference import (
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
)
from app.services.notification_service import (
    dispatch_notification,
    get_user_notifications,
    get_notification_by_id,
    mark_notification_read,
    mark_notification_unread,
    mark_all_notifications_read,
    delete_notification,
    get_unread_count,
    get_notification_summary,
    get_admin_notification_stats,
    get_admin_deliveries,
)
from app.services.notification_preference_service import (
    get_or_create_preferences,
    update_preferences,
    reset_preferences,
)
from app.services.email_service import send_notification_email
from app.services.sms_service import send_sms

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)

admin_router = APIRouter(
    prefix="/admin/notifications",
    tags=["Admin Notifications"],
)

webhook_router = APIRouter(
    prefix="/webhooks/brevo",
    tags=["Brevo Webhooks"],
)

ALLOWED_CANONICAL_ROLES = {
    "ADMIN",
    "GOVERNMENT_OFFICIAL",
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
}


def _verify_role(user: User, allowed_roles: set[str] | None = None) -> None:
    norm = normalize_role(user.role)
    if norm == "ADMIN":
        return
    targets = allowed_roles or ALLOWED_CANONICAL_ROLES
    if norm not in targets:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Access denied. Role '{user.role}' not permitted for notifications."
            ),
        )


def _verify_admin(user: User) -> None:
    norm = normalize_role(user.role)
    if norm != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required.",
        )


# ============================================================
# LIST NOTIFICATIONS (MAIN ENDPOINT)
# ============================================================


@router.get(
    "",
    response_model=NotificationListResponse,
)
def list_notifications(
    search: str | None = Query(None, description="Search term for title/message"),
    category: str | None = Query(
        None, description=("Tab category filter e.g. policy, scheme, application")
    ),
    is_read: bool | None = Query(None, description="Filter by read/unread status"),
    priority: str | None = Query(None, description="Filter by priority"),
    channel: str | None = Query(None, description="Filter by channel"),
    date_range: str | None = Query(
        None, description="Date filter e.g. today, this_week, this_month"
    ),
    sort_by: str = Query("latest", description="Sort by: latest, oldest, unread_first"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)

    result = get_user_notifications(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
        search=search,
        category=category,
        is_read=is_read,
        priority=priority,
        channel=channel,
        date_range=date_range,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )
    return result


# ============================================================
# UNREAD COUNT (FOR TOPBAR BELL BADGE)
# ============================================================


@router.get(
    "/unread-count",
    response_model=UnreadCountResponse,
)
def get_my_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    count = get_unread_count(db, current_user.user_id, current_user.role)
    return {"unread_count": count}


# ============================================================
# NOTIFICATION SUMMARY (FOR SUMMARY CARDS)
# ============================================================


@router.get(
    "/summary",
    response_model=NotificationSummaryResponse,
)
def get_my_notification_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    return get_notification_summary(db, current_user.user_id, current_user.role)


# ============================================================
# USER DASHBOARD COMPATIBILITY ENDPOINTS
# ============================================================


@router.get(
    "/me/{user_id}/stats",
    summary="Get user notification statistics for dashboard cards",
)
def get_user_notification_stats(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    target_id = (
        current_user.user_id
        if normalize_role(current_user.role) != "ADMIN"
        else user_id
    )
    target_role = current_user.role
    if normalize_role(current_user.role) == "ADMIN" and user_id != current_user.user_id:
        target_user = db.query(User).filter(User.user_id == user_id).first()
        if target_user:
            target_role = target_user.role
    summary = get_notification_summary(db, target_id, target_role)
    return {
        "total": summary["total"],
        "read": summary["read"],
        "unread": summary["unread"],
    }


@router.get(
    "/me/{user_id}",
    response_model=list[NotificationResponse],
    summary="Get user notifications list for backwards compatibility",
)
def get_user_notifications_by_id(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    target_id = (
        current_user.user_id
        if normalize_role(current_user.role) != "ADMIN"
        else user_id
    )
    # Reuse the authoritative visibility filter so this compatibility
    # endpoint agrees with the badge, the list, and the summary instead
    # of applying its own ad-hoc SYSTEM_ALERT-only rule.
    from app.services.notification_service import get_base_notification_filter

    target_user = db.query(User).filter(User.user_id == target_id).first()
    target_role = target_user.role if target_user is not None else current_user.role
    notifs = (
        db.query(Notification)
        .filter(get_base_notification_filter(target_id, target_role))
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return notifs


# ============================================================
# PREFERENCES ROUTES UNDER /notifications/preferences
# ============================================================


@router.get(
    "/preferences",
    response_model=NotificationPreferenceResponse,
)
def get_preferences_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    return get_or_create_preferences(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


@router.put(
    "/preferences",
    response_model=NotificationPreferenceResponse,
)
@router.patch(
    "/preferences",
    response_model=NotificationPreferenceResponse,
)
def update_preferences_endpoint(
    data: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    return update_preferences(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
        data=data,
    )


@router.post(
    "/preferences/reset",
    response_model=NotificationPreferenceResponse,
)
def reset_preferences_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    return reset_preferences(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


# ============================================================
# MARK ALL NOTIFICATIONS AS READ
# ============================================================


@router.post(
    "/mark-all-read",
)
@router.patch(
    "/mark-all-read",
)
@router.post(
    "/read-all",
)
@router.patch(
    "/read-all",
)
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    return mark_all_notifications_read(
        db=db,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )


# ============================================================
# GET SINGLE NOTIFICATION DETAILS
# ============================================================


@router.get(
    "/{notification_id}",
    response_model=NotificationResponse,
)
def get_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    notification = get_notification_by_id(
        db=db,
        notification_id=notification_id,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return notification


# ============================================================
# MARK ONE AS READ
# ============================================================


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
)
@router.post(
    "/{notification_id}/read",
    response_model=NotificationResponse,
)
def mark_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    notification = mark_notification_read(
        db=db,
        notification_id=notification_id,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return notification


# ============================================================
# MARK ONE AS UNREAD
# ============================================================


@router.patch(
    "/{notification_id}/unread",
    response_model=NotificationResponse,
)
@router.post(
    "/{notification_id}/unread",
    response_model=NotificationResponse,
)
def mark_as_unread(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    notification = mark_notification_unread(
        db=db,
        notification_id=notification_id,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return notification


# ============================================================
# DELETE NOTIFICATION
# ============================================================


@router.delete(
    "/{notification_id}",
)
def delete_single_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user)
    result = delete_notification(
        db=db,
        notification_id=notification_id,
        user_id=current_user.user_id,
        user_role=current_user.role,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found or access denied",
        )
    return result


# ============================================================
# CREATE NOTIFICATION (ADMIN / GOVT / SYSTEM)
# ============================================================


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
)
def create_new_notification(
    data: NotificationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_role(current_user, {"ADMIN", "GOVERNMENT_OFFICIAL"})
    # Preference + dedupe aware so repeated calls cannot double-email
    # and users who disabled every channel are not mailed. External
    # email/SMS legs run in a background worker; the committed in-app
    # record is returned immediately. Failures stay non-fatal inside
    # the delivery pipeline; the in-app record is preserved.
    result = dispatch_notification(db=db, data=data, background_tasks=background_tasks)
    if result is None:
        return {
            "message": "Notification suppressed by preferences or duplicate",
            "suppressed": True,
        }
    return NotificationResponse.model_validate(result)


# ============================================================
# ADMIN DIAGNOSTICS & DELIVERY MONITORING ROUTES
# ============================================================


@admin_router.get(
    "/statistics",
    response_model=AdminNotificationStatsResponse,
)
def get_admin_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_admin(current_user)
    return get_admin_notification_stats(db)


@admin_router.get(
    "/delivery-status",
)
def get_admin_delivery_status(
    channel: str | None = Query(
        "ALL", description="Filter by channel: ALL, IN_APP, EMAIL, SMS"
    ),
    status: str | None = Query(
        "ALL",
        description=(
            "Filter by status: ALL, SENT, DELIVERED, FAILED, SKIPPED, PENDING"
        ),
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _verify_admin(current_user)
    return get_admin_deliveries(
        db=db,
        page=page,
        page_size=page_size,
        channel=channel,
        status=status,
    )


@admin_router.post(
    "/test-email",
)
def admin_test_email(
    payload: TestEmailRequest,
    current_user: User = Depends(get_current_user),
):
    _verify_admin(current_user)
    res = send_notification_email(
        recipient_email=payload.email,
        title="PolicyGPT Brevo Test Email",
        message=(
            "This is an official test transmission verifying Brevo "
            "email integration with PolicyGPT."
        ),
        action_url="/notifications",
        notification_type="SYSTEM_ALERT",
    )
    return res


@admin_router.post(
    "/test-sms",
)
def admin_test_sms(
    payload: TestSmsRequest,
    current_user: User = Depends(get_current_user),
):
    _verify_admin(current_user)
    res = send_sms(
        recipient_phone=payload.phone_number,
        content=(
            "PolicyGPT: Official test SMS verifying Brevo Transactional SMS delivery."
        ),
    )
    return res


@admin_router.post(
    "/trigger-deadline-reminders",
)
def admin_trigger_deadline_reminders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin endpoint to evaluate active schemes with upcoming
    deadlines and trigger reminders."""
    _verify_admin(current_user)
    from app.services.deadline_service import DeadlineReminderService

    return DeadlineReminderService.check_and_trigger_deadline_reminders(db=db)


@admin_router.post(
    "/process-scheme-expiry",
)
def admin_process_scheme_expiry(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Emit SCHEME_ENDING at each milestone and SCHEME_ENDED after the
    deadline.

    Derived entirely from the existing ``schemes.application_end_date`` column
    and idempotent, so it is safe to call from a scheduler as often as
    you like.
    """
    _verify_admin(current_user)
    from app.services.scheme_expiry_service import process_scheme_expiry

    return process_scheme_expiry(db=db)


@admin_router.post(
    "/retry-failed-deliveries",
)
def admin_retry_failed_deliveries(
    payload: dict[str, Any] | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-attempt failed Email/SMS deliveries that still have attempts left."""
    _verify_admin(current_user)
    limit = int((payload or {}).get("limit", 50))
    from app.services.notification_delivery_service import (
        NotificationDeliveryService,
    )

    return NotificationDeliveryService.retry_failed_deliveries(db=db, limit=limit)


# ============================================================
# BREVO WEBHOOKS (PART 53)
# ============================================================


def _verify_webhook_secret(x_brevo_webhook_secret: str | None) -> bool:
    """Optional shared-secret gate for the Brevo callback endpoints.

    When ``BREVO_WEBHOOK_SECRET`` is unset the endpoint stays open, so an
    existing deployment keeps working unchanged. Once the variable is set, a
    request without the matching header is rejected - otherwise anyone could
    POST a fake 'delivered' event and mark a notification as delivered.

    Comparison is constant-time so the secret cannot be recovered by timing.
    """
    from app.core.config import settings

    expected = (settings.BREVO_WEBHOOK_SECRET or "").strip()
    if not expected:
        return True
    provided = (x_brevo_webhook_secret or "").strip()
    if not provided:
        return False
    return hmac.compare_digest(provided, expected)


@webhook_router.post("/email")
def brevo_email_webhook(
    payload: dict[str, Any],
    x_brevo_webhook_secret: str | None = Header(
        default=None,
        alias="X-Brevo-Webhook-Secret",
    ),
    db: Session = Depends(get_db),
):
    """
    Handle Brevo Email delivery webhook events:
    delivered, soft_bounce, hard_bounce, spam, blocked, opened, clicked
    """
    if not _verify_webhook_secret(x_brevo_webhook_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing webhook secret.",
        )

    event = payload.get("event")
    msg_id = (
        payload.get("message-id") or payload.get("messageId") or payload.get("msg_id")
    )
    if not msg_id:
        return {"status": "ignored", "reason": "no_message_id"}

    clean_id = str(msg_id).strip("<>")
    delivery = (
        db.query(NotificationDelivery)
        .filter(
            or_(
                NotificationDelivery.provider_message_id == clean_id,
                NotificationDelivery.provider_message_id == msg_id,
            )
        )
        .first()
    )

    if delivery:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if event in ("delivered", "opened", "click"):
            delivery.status = "DELIVERED"
            delivery.delivered_at = now
        elif event in (
            "soft_bounce",
            "hard_bounce",
            "blocked",
            "spam",
            "invalid_email",
        ):
            delivery.status = "FAILED"
            delivery.failed_at = now
            delivery.failure_reason = f"Brevo event: {event}"
        delivery.updated_at = now
        db.commit()
        return {
            "status": "received",
            "delivery_id": delivery.delivery_id,
            "event": event,
        }

    return {"status": "received", "result": "not_found", "message_id": msg_id}


@webhook_router.post("/sms")
def brevo_sms_webhook(
    payload: dict[str, Any],
    x_brevo_webhook_secret: str | None = Header(
        default=None,
        alias="X-Brevo-Webhook-Secret",
    ),
    db: Session = Depends(get_db),
):
    if not _verify_webhook_secret(x_brevo_webhook_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing webhook secret.",
        )

    """
    Handle Brevo SMS delivery webhook events:
    delivered, answered, soft_bounce, hard_bounce, blocked
    """
    event = payload.get("event")
    msg_id = (
        payload.get("message-id") or payload.get("messageId") or payload.get("msg_id")
    )
    if not msg_id:
        return {"status": "ignored", "reason": "no_message_id"}

    clean_id = str(msg_id).strip("<>")
    delivery = (
        db.query(NotificationDelivery)
        .filter(
            or_(
                NotificationDelivery.provider_message_id == clean_id,
                NotificationDelivery.provider_message_id == msg_id,
            )
        )
        .first()
    )

    if delivery:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if event in ("delivered", "accepted", "answered"):
            delivery.status = "DELIVERED"
            delivery.delivered_at = now
        elif event in ("soft_bounce", "hard_bounce", "blocked", "failed"):
            delivery.status = "FAILED"
            delivery.failed_at = now
            delivery.failure_reason = f"Brevo SMS event: {event}"
        delivery.updated_at = now
        db.commit()
        return {
            "status": "received",
            "delivery_id": delivery.delivery_id,
            "event": event,
        }

    return {"status": "received", "result": "not_found", "message_id": msg_id}
