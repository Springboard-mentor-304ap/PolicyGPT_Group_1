"""Defer slow external notification I/O out of the API request path.

Synchronous request handling must:
1. Persist the in-app notification row + delivery bookkeeping in the
   request's own database transaction and commit it.
2. Return the committed result promptly.

Brevo HTTP / SMTP / SMS calls (each with up to ~10s timeouts plus a
fallback chain) must not hold the request's database connection while
they run. This module runs only those external calls in a FastAPI
``BackgroundTasks`` worker with its own short-lived database session,
so a closed request session is never reused and pool connections are
released before any network wait.

Failure semantics are preserved:
- In-app delivery is synchronous and committed before the response.
- External failures only mark the EMAIL/SMS delivery rows FAILED for
  the bounded retry sweep; they never roll back the notification.
"""

import logging

logger = logging.getLogger("uvicorn.error")


def deliver_external_for_notification(notification_id: int) -> None:
    """Send pending EMAIL/SMS legs for one committed notification.

    Opens and closes its own session — never reuse the request session
    here because FastAPI closes it before background tasks run.
    Safe to run more than once: legs already SENT/SKIPPED/EXHAUSTED are
    left untouched by the per-leg guards in the delivery service.
    """
    from app.db.database import SessionLocal
    from app.models.notification import Notification
    from app.services.notification_delivery_service import (
        NotificationDeliveryService,
    )

    db = SessionLocal()
    try:
        notification = (
            db.query(Notification)
            .filter(Notification.notification_id == notification_id)
            .first()
        )
        if notification is None:
            logger.warning(
                "Background external delivery skipped: notification %s not found",
                notification_id,
            )
            return
        try:
            NotificationDeliveryService.deliver_external(
                db=db, notification=notification
            )
        except Exception as exc:
            logger.error(
                "Background external delivery failed for notification %s: %s",
                notification_id,
                exc,
            )
    finally:
        db.close()


def schedule_external_delivery(background_tasks, notification_id: int) -> None:
    """Attach external delivery to the response lifecycle when available.

    Falls back to inline delivery (existing behaviour) when no
    BackgroundTasks instance is supplied — e.g. unit tests, scheduler
    sweeps, and non-HTTP callers.
    """
    if background_tasks is None:
        deliver_external_for_notification(notification_id)
        return
    try:
        background_tasks.add_task(deliver_external_for_notification, notification_id)
    except Exception as exc:
        logger.warning("Background task scheduling failed, delivering inline: %s", exc)
        deliver_external_for_notification(notification_id)
