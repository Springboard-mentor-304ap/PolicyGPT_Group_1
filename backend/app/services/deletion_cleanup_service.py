"""30-day auto-cleanup for temporarily deleted policies and schemes.

Scope
-----
Physically removes soft-deleted rows (``is_deleted``) whose
``deleted_at`` timestamp is at least ``retention_days`` old
(default 30). Restored rows (``is_deleted=False``) and rows without a
deletion timestamp are never touched.

Idempotency
-----------
Safe to run as often as you like: eligibility is recomputed from the
live table on every pass, each purge is committed independently, and a
row that fails (e.g. a new referencing row appeared) is rolled back
individually while the sweep continues. Repeated runs converge without
duplicating history: every purge writes exactly one audit row at purge
time.

Scheduling
----------
No Celery/APScheduler in this project: ``app/main.py`` runs
:func:`process_deleted_cleanup` as a daily lifespan task (same style
as the reminder sweep), and the
``POST /policies/maintenance/purge-deleted`` and
``POST /schemes/maintenance/purge-deleted`` admin endpoints trigger
the same function on demand.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.scheme import Scheme
from app.services.audit_log_service import log_action

logger = logging.getLogger("uvicorn.error")

#: Default retention window for trash rows, in days.
RETENTION_DAYS = 30


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _cutoff(retention_days: int) -> datetime:
    days = retention_days if retention_days and retention_days > 0 else RETENTION_DAYS
    return _now() - timedelta(days=days)


def is_purge_eligible(row: Any, cutoff: datetime) -> bool:
    """Python-side eligibility check mirroring the sweep queries.

    Restored rows, rows without a deletion timestamp, and rows newer
    than the cutoff are never eligible. Kept as a named helper (in
    addition to the SQL predicates) so the rule is directly unit
    testable without a live database.
    """
    try:
        if not bool(getattr(row, "is_deleted", False)):
            return False
        deleted_at = getattr(row, "deleted_at", None)
        if deleted_at is None:
            return False
        if isinstance(deleted_at, datetime) and deleted_at.tzinfo is not None:
            deleted_at = deleted_at.astimezone(timezone.utc).replace(tzinfo=None)
        return deleted_at <= cutoff
    except Exception:
        return False


def _purge_eligible_policies(db: Session, cutoff: datetime) -> tuple[list[int], int]:
    """Purge trashed policies older than the cutoff.

    Returns (purged_ids, error_count). Each row commits or rolls back
    on its own so one blocked row never aborts the sweep.
    """
    from app.services.policy_service import _purge_policy_row

    rows = (
        db.query(Policy)
        .filter(
            Policy.is_deleted.is_(True),
            Policy.deleted_at.isnot(None),
            Policy.deleted_at <= cutoff,
        )
        .order_by(Policy.deleted_at.asc())
        .all()
    )
    # Belt and suspenders with the SQL predicates above (also makes the
    # rule unit-testable without a live database).
    rows = [row for row in rows if is_purge_eligible(row, cutoff)]

    purged: list[int] = []
    errors = 0
    for row in rows:
        policy_id = row.policy_id
        title = row.title
        try:
            _purge_policy_row(db, row)
            log_action(
                db=db,
                action="POLICY_PERMANENTLY_DELETED",
                user_id=None,
                entity_type="POLICY",
                entity_id=policy_id,
                description=(
                    f"Policy '{title}' automatically purged after "
                    f"30 days in Deleted Policies."
                ),
            )
            purged.append(policy_id)
        except Exception as exc:
            errors += 1
            logger.warning(
                "Deleted-policy auto-cleanup skipped policy %s: %s",
                policy_id,
                exc,
            )
    return purged, errors


def _purge_eligible_schemes(db: Session, cutoff: datetime) -> tuple[list[int], int]:
    """Purge trashed schemes older than the cutoff (same contract)."""
    from app.services.scheme_service import _purge_scheme_row

    rows = (
        db.query(Scheme)
        .filter(
            Scheme.is_deleted.is_(True),
            Scheme.deleted_at.isnot(None),
            Scheme.deleted_at <= cutoff,
        )
        .order_by(Scheme.deleted_at.asc())
        .all()
    )
    # Belt and suspenders with the SQL predicates above (also makes the
    # rule unit-testable without a live database).
    rows = [row for row in rows if is_purge_eligible(row, cutoff)]

    purged: list[int] = []
    errors = 0
    for row in rows:
        scheme_id = row.scheme_id
        name = row.name
        try:
            _purge_scheme_row(db, row)
            log_action(
                db=db,
                action="SCHEME_PERMANENTLY_DELETED",
                user_id=None,
                entity_type="SCHEME",
                entity_id=scheme_id,
                description=(
                    f"Scheme '{name}' automatically purged after "
                    f"30 days in Deleted Schemes."
                ),
            )
            purged.append(scheme_id)
        except Exception as exc:
            errors += 1
            logger.warning(
                "Deleted-scheme auto-cleanup skipped scheme %s: %s",
                scheme_id,
                exc,
            )
    return purged, errors


def process_deleted_cleanup(
    db: Session,
    retention_days: int = RETENTION_DAYS,
    triggered_by: int | None = None,
) -> dict[str, Any]:
    """Purge trash rows older than the retention window.

    Returns a summary suitable for an admin response or a scheduler
    log line. Never raises: per-row failures are counted, and a
    top-level guard keeps a scheduler loop alive.
    """
    try:
        cutoff = _cutoff(retention_days)
        policies_purged, policy_errors = _purge_eligible_policies(db, cutoff)
        schemes_purged, scheme_errors = _purge_eligible_schemes(db, cutoff)
    except Exception as exc:
        logger.exception("Deleted-items auto-cleanup pass failed: %s", exc)
        return {
            "policies_purged": [],
            "policies_skipped_errors": 0,
            "schemes_purged": [],
            "schemes_skipped_errors": 0,
            "retention_days": retention_days,
            "triggered_by": triggered_by,
            "timestamp": _now().isoformat(),
            "error": str(exc),
        }

    logger.info(
        "Deleted-items cleanup pass: %s policies purged (%s errors), "
        "%s schemes purged (%s errors), retention %s days",
        len(policies_purged),
        policy_errors,
        len(schemes_purged),
        scheme_errors,
        retention_days,
    )
    return {
        "policies_purged": policies_purged,
        "policies_skipped_errors": policy_errors,
        "schemes_purged": schemes_purged,
        "schemes_skipped_errors": scheme_errors,
        "retention_days": retention_days,
        "triggered_by": triggered_by,
        "timestamp": _now().isoformat(),
    }
