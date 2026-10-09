from datetime import datetime, timezone
import logging
from typing import Any
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.notification_delivery import NotificationDelivery
from app.models.notification_preference import NotificationPreference
from app.models.user import User
from app.services.email_service import send_notification_email

logger = logging.getLogger("uvicorn.error")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class NotificationDeliveryService:
    @staticmethod
    def deliver_in_app(
        db: Session,
        notification: Notification,
    ) -> NotificationDelivery:
        """In-App delivery always succeeds once notification is stored
        in DB."""
        now = _now()
        delivery = NotificationDelivery(
            notification_id=notification.notification_id,
            channel="IN_APP",
            provider="INTERNAL",
            status="DELIVERED",
            attempt_count=1,
            sent_at=now,
            delivered_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(delivery)
        db.commit()
        db.refresh(delivery)
        return delivery

    @staticmethod
    def deliver_email(
        db: Session,
        notification: Notification,
        user: User | None,
        is_enabled_by_preference: bool = True,
    ) -> NotificationDelivery | None:
        """Deliver via Brevo Email or record appropriate
        skipped/failed delivery."""
        now = _now()

        # A channel the user switched off is still recorded, so the admin
        # delivery dashboard can show that preferences were honoured rather
        # than that a send was silently forgotten.
        if not is_enabled_by_preference:
            delivery = NotificationDelivery(
                notification_id=notification.notification_id,
                channel="EMAIL",
                provider="BREVO",
                status="SKIPPED",
                failure_reason="PREFERENCE_DISABLED",
                attempt_count=0,
                created_at=now,
                updated_at=now,
            )
            db.add(delivery)
            db.commit()
            return delivery

        # Check contact info
        if not user or not user.email:
            delivery = NotificationDelivery(
                notification_id=notification.notification_id,
                channel="EMAIL",
                provider="BREVO",
                status="SKIPPED",
                failure_reason="EMAIL_NOT_AVAILABLE",
                attempt_count=0,
                created_at=now,
                updated_at=now,
            )
            db.add(delivery)
            db.commit()
            return delivery

        # Call email service
        res = send_notification_email(
            recipient_email=user.email,
            title=notification.title,
            message=notification.message,
            action_url=notification.action_url,
            notification_type=notification.notification_type,
        )

        sent_time = _now()
        if res.get("success"):
            delivery = NotificationDelivery(
                notification_id=notification.notification_id,
                channel="EMAIL",
                provider=res.get("provider", "BREVO"),
                status="SENT",
                provider_message_id=res.get("message_id"),
                attempt_count=1,
                sent_at=sent_time,
                delivered_at=sent_time,  # Sent to Brevo provider
                created_at=sent_time,
                updated_at=sent_time,
            )
        else:
            delivery = NotificationDelivery(
                notification_id=notification.notification_id,
                channel="EMAIL",
                provider=res.get("provider", "BREVO"),
                status="FAILED",
                failure_reason=res.get("error", "Email transmission failed"),
                attempt_count=1,
                failed_at=sent_time,
                created_at=sent_time,
                updated_at=sent_time,
            )

        db.add(delivery)
        db.commit()
        db.refresh(delivery)
        return delivery

    @staticmethod
    def deliver_sms(
        db: Session,
        notification: Notification,
        user: User | None,
        is_enabled_by_preference: bool = False,
    ) -> NotificationDelivery | None:
        """SMS channel is retired: SMS is OTP-only (Twilio Verify).

        Never sends, never retries, never calls any SMS provider. Records a
        SKIPPED delivery so the admin dashboard shows the channel was
        deliberately not attempted rather than silently forgotten.
        """
        now = _now()
        delivery = NotificationDelivery(
            notification_id=notification.notification_id,
            channel="SMS",
            provider="twilio",
            status="SKIPPED",
            failure_reason="SMS_CHANNEL_RETIRED",
            attempt_count=0,
            created_at=now,
            updated_at=now,
        )
        db.add(delivery)
        db.commit()
        return delivery

    @classmethod
    def deliver_external(
        cls,
        db: Session,
        notification: Notification,
        user: User | None = None,
        preference: NotificationPreference | None = None,
    ) -> dict[str, Any]:
        """Send only the EMAIL leg for an already-stored notification.

        Used by background workers after the request has committed the
        in-app row. Never creates the notification itself and never
        touches in-app delivery bookkeeping. SMS is retired (OTP-only);
        an SMS leg is recorded as SKIPPED, never sent.
        """
        from app.services.notification_preference_rule_service import (
            resolve_channels_for_user,
        )

        deliveries = []
        target_user = user
        if not target_user and notification.user_id:
            target_user = (
                db.query(User).filter(User.user_id == notification.user_id).first()
            )
        if not target_user:
            return {"deliveries": deliveries}
        if not preference:
            preference = (
                db.query(NotificationPreference)
                .filter(NotificationPreference.user_id == target_user.user_id)
                .first()
            )
        channels = resolve_channels_for_user(
            db=db,
            user_id=target_user.user_id,
            notification_type=notification.notification_type,
            preference=preference,
        )
        try:
            email_delivery = cls.deliver_email(
                db=db,
                notification=notification,
                user=target_user,
                is_enabled_by_preference=channels["email"],
            )
            if email_delivery:
                deliveries.append(email_delivery)
        except Exception as e:
            logger.error(f"Email delivery error (non-fatal): {e}")
        try:
            sms_delivery = cls.deliver_sms(
                db=db,
                notification=notification,
                user=target_user,
                is_enabled_by_preference=channels["sms"],
            )
            if sms_delivery:
                deliveries.append(sms_delivery)
        except Exception as e:
            logger.error(f"SMS delivery error (non-fatal): {e}")
        return {"deliveries": deliveries}

    @classmethod
    def deliver(
        cls,
        db: Session,
        notification: Notification,
        user: User | None = None,
        preference: NotificationPreference | None = None,
    ) -> dict[str, Any]:
        """
        Unified delivery pipeline:
        1. Record in-app delivery, but ONLY when the In-App channel is
           enabled for this user + type. Suppressed types get no IN_APP
           record at all (and the parent row is kept out of the centre).
        2. Check user's preferences for Email (SMS is retired: OTP-only).
        3. Deliver via Brevo Email if enabled.
        4. Record SMS as SKIPPED (retired channel; never sent).
        CRITICAL: Never rolls back notification if external email
        delivery fails!
        """
        deliveries = []

        if not user and notification.user_id:
            user = db.query(User).filter(User.user_id == notification.user_id).first()

        # If system broadcast without specific user, in-app is sufficient
        # (no preferences exist to evaluate).
        if not user:
            try:
                in_app_delivery = cls.deliver_in_app(db, notification)
                deliveries.append(in_app_delivery)
            except Exception as e:
                logger.error(f"In-App delivery recording error: {e}")
            return {"deliveries": deliveries}

        # Load preference if not provided
        if not preference:
            preference = (
                db.query(NotificationPreference)
                .filter(NotificationPreference.user_id == user.user_id)
                .first()
            )

        # Determine the effective channel decision for this user + type.
        # Resolution lives in notification_preference_rule_service so the
        # preferences screen, the notification centre and delivery can never
        # disagree about what the user asked for.
        from app.services.notification_preference_rule_service import (
            resolve_channels_for_user,
        )

        channels = resolve_channels_for_user(
            db=db,
            user_id=user.user_id,
            notification_type=notification.notification_type,
            preference=preference,
        )
        email_enabled = channels["email"]

        # 1. In-App delivery, gated by preference. When the channel is
        # disabled no IN_APP record is created; the parent row stays out
        # of the notification centre (it exists only as the vehicle for
        # email tracking/dedupe and is never surfaced: suppressed types
        # are filtered from lists, counts, and realtime).
        if channels["in_app"]:
            try:
                in_app_delivery = cls.deliver_in_app(db, notification)
                deliveries.append(in_app_delivery)
            except Exception as e:
                logger.error(f"In-App delivery recording error: {e}")
        else:
            try:
                notification.is_read = True
                notification.read_at = _now()
                db.commit()
            except Exception as exc:
                logger.debug(
                    "Could not mark in-app-suppressed notification read: %s", exc
                )

        # 2. Email Delivery via Brevo
        try:
            email_delivery = cls.deliver_email(
                db=db,
                notification=notification,
                user=user,
                is_enabled_by_preference=email_enabled,
            )
            if email_delivery:
                deliveries.append(email_delivery)
        except Exception as e:
            logger.error(f"Email delivery error (non-fatal): {e}")

        # 3. SMS channel retired (OTP-only via Twilio Verify): record
        # SKIPPED, never attempt delivery.
        try:
            sms_delivery = cls.deliver_sms(
                db=db,
                notification=notification,
                user=user,
                is_enabled_by_preference=False,
            )
            if sms_delivery:
                deliveries.append(sms_delivery)
        except Exception as e:
            logger.error(f"SMS delivery error (non-fatal): {e}")

        return {"deliveries": deliveries}

    # ------------------------------------------------------------------
    # Retry
    # ------------------------------------------------------------------
    @classmethod
    def retry_failed_deliveries(
        cls,
        db: Session,
        limit: int = 50,
    ) -> dict[str, Any]:
        """Re-attempt FAILED Email deliveries that still have
        attempts left. SMS is retired (OTP-only) and is never retried.

        Deliberately bounded: a delivery that has used up
        ``settings.MAX_NOTIFICATION_RETRIES`` is marked EXHAUSTED and left
        alone, so a permanently broken destination cannot be retried forever.
        Safe to call from a scheduler, a cron job, or the admin endpoint.
        """
        from app.core.config import settings

        max_attempts = max(1, int(settings.MAX_NOTIFICATION_RETRIES))
        candidates = (
            db.query(NotificationDelivery)
            .filter(
                NotificationDelivery.status == "FAILED",
                NotificationDelivery.channel == "EMAIL",
                NotificationDelivery.attempt_count < max_attempts,
            )
            .order_by(NotificationDelivery.failed_at.asc().nullsfirst())
            .limit(max(1, min(limit, 500)))
            .all()
        )

        retried = 0
        exhausted = 0
        recovered = 0

        # Batch the notification + user lookups (2 IN queries) instead of
        # 2 sequential lookups per delivery row.
        notif_ids = list({d.notification_id for d in candidates if d.notification_id})
        notifications = (
            {
                n.notification_id: n
                for n in db.query(Notification)
                .filter(Notification.notification_id.in_(notif_ids))
                .all()
            }
            if notif_ids
            else {}
        )
        user_ids = list(
            {n.user_id for n in notifications.values() if n.user_id is not None}
        )
        users = (
            {
                u.user_id: u
                for u in db.query(User).filter(User.user_id.in_(user_ids)).all()
            }
            if user_ids
            else {}
        )

        for delivery in candidates:
            notification = notifications.get(delivery.notification_id)
            if notification is None:
                continue
            user = users.get(notification.user_id) if notification.user_id else None

            delivery.attempt_count += 1
            db.commit()

            try:
                result = (
                    send_notification_email(
                        recipient_email=user.email,
                        title=notification.title,
                        message=notification.message,
                        action_url=notification.action_url,
                        notification_type=notification.notification_type,
                    )
                    if user and user.email
                    else {
                        "success": False,
                        "provider": "BREVO",
                        "error": "Recipient has no email address",
                    }
                )
            except Exception as exc:
                result = {"success": False, "provider": "BREVO", "error": str(exc)}

            now = _now()
            if result.get("success"):
                delivery.status = "SENT"
                delivery.provider_message_id = result.get("message_id")
                delivery.sent_at = now
                delivery.delivered_at = now
                delivery.failed_at = None
                delivery.failure_reason = None
                recovered += 1
            else:
                delivery.status = "FAILED"
                delivery.failure_reason = result.get("error", "Retry failed")
                delivery.failed_at = now
                if delivery.attempt_count >= max_attempts:
                    delivery.status = "EXHAUSTED"
                    exhausted += 1
            delivery.updated_at = now
            db.commit()
            retried += 1

        logger.info(
            "Delivery retry pass: %s attempted, %s recovered, %s exhausted",
            retried,
            recovered,
            exhausted,
        )
        return {
            "attempted": retried,
            "recovered": recovered,
            "exhausted": exhausted,
            "max_attempts": max_attempts,
        }

    @classmethod
    def mark_exhausted_deliveries(cls, db: Session) -> int:
        """Flag deliveries that used every attempt so the queue stays
        bounded."""
        from app.core.config import settings

        max_attempts = max(1, int(settings.MAX_NOTIFICATION_RETRIES))
        return (
            db.query(NotificationDelivery)
            .filter(
                NotificationDelivery.status == "FAILED",
                NotificationDelivery.attempt_count >= max_attempts,
            )
            .update(
                {NotificationDelivery.status: "EXHAUSTED"},
                synchronize_session=False,
            )
        )
