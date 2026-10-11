"""Scheme application-window expiry processing.

Scope
-----
This service derives "ending soon" and "ended" purely from the existing
``schemes.application_end_date`` column. No new date field is introduced.

``policies`` has no end/expiry column at all - only ``publication_date`` and
``effective_date`` - so there is deliberately no policy equivalent here.
See the limitations note in the handover report.

Idempotency
-----------
Safe to run as often as you like. Each (scheme, threshold) pair is emitted at
most once per day, and SCHEME_ENDED at most once ever, enforced by querying
existing notifications rather than by relying on a time window alone.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.scheme import Scheme
from app.services.notification_service import (
    notify_scheme_ended,
    notify_scheme_ending,
)

logger = logging.getLogger("uvicorn.error")

#: Countdown milestones, in days before the application window closes.
REMINDER_THRESHOLDS_DAYS: tuple[int, ...] = (7, 3, 1)

#: Statuses whose application window is genuinely open. Mirrors the canonical
#: vocabulary enforced by the ``schemes_status_canonical_check`` constraint and
#: by ``SchemeStatus`` in ``app/schemas/scheme.py``.
LIVE_SCHEME_STATUSES = ("APPROVED",)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _notified_user_ids(
    db: Session,
    notification_type: str,
    scheme_id: int,
    since: datetime | None = None,
) -> set[int]:
    """User ids that already hold this notice for this scheme.

    ``since`` bounds the window (used for the daily countdown milestones);
    leave it as None for a once-ever notice.
    """
    query = db.query(Notification.user_id).filter(
        Notification.notification_type == notification_type,
        Notification.related_scheme_id == scheme_id,
    )
    if since is not None:
        query = query.filter(Notification.created_at >= since)
    return {row[0] for row in query.all() if row[0] is not None}


def process_scheme_expiry(db: Session) -> dict[str, Any]:
    """Emit SCHEME_ENDING at each milestone and SCHEME_ENDED after
    the deadline.

    Returns a summary suitable for an admin response or a scheduler log line.
    """
    now = _now()
    schemes = (
        db.query(Scheme)
        .filter(
            Scheme.application_end_date.isnot(None),
            Scheme.is_deleted.is_(False),
            Scheme.status.in_(list(LIVE_SCHEME_STATUSES) + ["ARCHIVED"]),
        )
        .all()
    )

    evaluated = 0
    ending_sent = 0
    ended_sent = 0
    schemes_ending: list[int] = []
    schemes_ended: list[int] = []

    # The whole public audience is resolved once, not per scheme.
    from app.services.notification_service import public_audience

    ending_candidates = {
        u.user_id for u in public_audience(db, "SCHEME_ENDING")}
    ended_candidates = {u.user_id for u in public_audience(db, "SCHEME_ENDED")}
    day_start = now - timedelta(hours=20)

    for scheme in schemes:
        evaluated += 1
        end_date = _naive(scheme.application_end_date)
        if end_date is None:
            continue

        title = getattr(scheme, "name", None) or getattr(
            scheme, "scheme_name", None) or "Scheme"
        days_remaining = (end_date.date() - now.date()).days

        if days_remaining < 0:
            # Window has closed: emit once per user, ever.
            already = _notified_user_ids(db, "SCHEME_ENDED", scheme.scheme_id)
            targets = sorted(ended_candidates - already)
            if not targets:
                continue
            created = notify_scheme_ended(
                db=db,
                scheme_id=scheme.scheme_id,
                scheme_title=title,
                end_date=end_date,
                target_user_ids=targets,
            )
            if created:
                ended_sent += len(created)
                schemes_ended.append(scheme.scheme_id)
            continue

        if days_remaining not in REMINDER_THRESHOLDS_DAYS:
            continue

        already = _notified_user_ids(
            db, "SCHEME_ENDING", scheme.scheme_id, since=day_start
        )
        targets = sorted(ending_candidates - already)
        if not targets:
            continue

        created = notify_scheme_ending(
            db=db,
            scheme_id=scheme.scheme_id,
            scheme_title=title,
            end_date=end_date,
            days_remaining=days_remaining,
            target_user_ids=targets,
        )
        if created:
            ending_sent += len(created)
            schemes_ending.append(scheme.scheme_id)

    logger.info(
        "Scheme expiry pass: %s evaluated, %s ending notices, "
            "%s ended notices",
        evaluated,
        ending_sent,
        ended_sent,
    )
    return {
        "schemes_evaluated": evaluated,
        "ending_notifications": ending_sent,
        "ended_notifications": ended_sent,
        "schemes_ending": schemes_ending,
        "schemes_ended": schemes_ended,
        "thresholds_days": list(REMINDER_THRESHOLDS_DAYS),
        "timestamp": now.isoformat(),
    }
