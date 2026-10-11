from datetime import datetime, timedelta, timezone
import logging
from typing import Any
from sqlalchemy.orm import Session

from app.models.scheme import Scheme
from app.models.notification import Notification
from app.services.notification_service import notify_deadline, public_audience

logger = logging.getLogger("uvicorn.error")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class DeadlineReminderService:
    """
    Background-ready Deadline Reminder Service.
    Can be scheduled via Celery Beat, cron, or background task worker.
    Evaluates upcoming deadlines and sends reminders at
    7 days, 3 days, and 1 day milestones.
    Prevents duplicate reminder dispatches.
    """

    REMINDER_THRESHOLDS_DAYS = [7, 3, 1]

    @classmethod
    def check_and_trigger_deadline_reminders(
        cls, db: Session
    ) -> dict[str, Any]:
        """
        Evaluate eligible schemes/applications and dispatch deadline
        notifications.
        Returns a summary of processed deadlines and generated reminders.
        """
        now = _now()
        reminders_sent = 0
        schemes_evaluated = 0

        # Query active/approved schemes. Soft-deleted rows are invisible to
        # every active view: they surface only through GET /schemes/deleted.
        approved_schemes = (
            db.query(Scheme)
            .filter(
                Scheme.status == "APPROVED",
                Scheme.is_deleted.is_(False),
            )
            .all()
        )

        # Audience resolved via the rule matrix so the preferences UI
        # and actual delivery can never disagree. Per-recipient channel
        # decisions (including SMS opt-in) happen inside
        # NotificationDeliveryService via resolve_channels_for_user().
        target_users = public_audience(db, "DEADLINE_REMINDER")

        for scheme in approved_schemes:
            schemes_evaluated += 1
            if not scheme.application_end_date:
                continue

            deadline_target = scheme.application_end_date
            if hasattr(deadline_target, "tzinfo") and deadline_target.tzinfo:
                deadline_target = deadline_target.replace(tzinfo=None)

            days_remaining = (deadline_target.date() - now.date()).days
            if days_remaining < 0:
                continue

            scheme_title = getattr(
                scheme, "name", getattr(scheme, "scheme_name", "Scheme")
            )

            if (
                days_remaining in cls.REMINDER_THRESHOLDS_DAYS
                or days_remaining in [14, 30]
            ):
                deadline_str = deadline_target.strftime("%d %B %Y")
                for user in target_users[:25]:
                    # Check if already notified for this scheme in last 24h
                    existing = (
                        db.query(Notification)
                        .filter(
                            Notification.user_id == user.user_id,
                            Notification.related_scheme_id == scheme.scheme_id,
                            Notification.notification_type
                            == "DEADLINE_REMINDER",
                            Notification.created_at
                            >= (now - timedelta(days=1)),
                        )
                        .first()
                    )
                    if not existing:
                        notify_deadline(
                            db=db,
                            user_id=user.user_id,
                            scheme_id=scheme.scheme_id,
                            scheme_title=scheme_title,
                            deadline_date=deadline_str,
                            days_remaining=days_remaining,
                        )
                        reminders_sent += 1

        logger.info(
            f"Deadline check completed: {schemes_evaluated} schemes "
            f"evaluated, {reminders_sent} reminders dispatched."
        )
        return {
            "schemes_evaluated": schemes_evaluated,
            "reminders_sent": reminders_sent,
            "timestamp": now.isoformat(),
        }
