import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User

logger = logging.getLogger("uvicorn.error")

#: Canonical action names used by the notification pipeline. Kept as constants
#: so the audit trail is greppable.
ACTION_NOTIFICATION_GENERATED = "NOTIFICATION_GENERATED"
ACTION_NOTIFICATION_SUPPRESSED = "NOTIFICATION_SUPPRESSED"
ACTION_NOTIFICATION_DELIVERY_FAILED = "NOTIFICATION_DELIVERY_FAILED"
ACTION_NOTIFICATION_PREFERENCE_CHANGED = "NOTIFICATION_PREFERENCE_CHANGED"
ACTION_APPROVAL_EVENT = "APPROVAL_EVENT"
ACTION_REJECTION_EVENT = "REJECTION_EVENT"
ACTION_WEBHOOK_RECEIVED = "WEBHOOK_RECEIVED"


def log_action(
    db: Session,
    action: str,
    user_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    description: str | None = None,
    ip_address: str | None = None,
    commit: bool = True,
) -> AuditLog | None:
    """Append one audit row.

    Never raises and never rolls the caller's transaction back: audit
    logging is observability, not business logic. Provider credentials are
    never passed in here - callers pass outcome and a sanitised reason only.
    """
    try:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            description=description,
            ip_address=ip_address,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(entry)
        if commit:
            db.commit()
        else:
            db.flush()
        return entry
    except Exception as exc:
        logger.warning("Audit log write failed (%s): %s", action, exc)
        if commit:
            try:
                db.rollback()
            except Exception:
                pass
        return None



def get_audit_logs(
    db: Session,
    user_id: int,
    user_role: str,
    action: str | None = None,
    entity_type: str | None = None,
    from_date=None,
    to_date=None,
):
    query = (
        db.query(AuditLog)
        .join(
            User,
            AuditLog.user_id == User.user_id
        )
    )

    # ADMIN → Citizen + Admin audit logs
    if user_role == "ADMIN":
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → only their own audit logs
    else:
        query = query.filter(
            AuditLog.user_id == user_id
        )

    # Optional filters
    if action:
        query = query.filter(
            AuditLog.action == action
        )

    if entity_type:
        query = query.filter(
            AuditLog.entity_type == entity_type
        )

    if from_date:
        query = query.filter(
            AuditLog.created_at >= from_date
        )

    if to_date:
        query = query.filter(
            AuditLog.created_at <= to_date
        )

    return (
        query
        .order_by(AuditLog.created_at.desc())
        .all()
    )


def get_audit_log(
    db: Session,
    audit_id: int,
    user_id: int,
    user_role: str,
):
    query = (
        db.query(AuditLog)
        .join(
            User,
            AuditLog.user_id == User.user_id
        )
        .filter(
            AuditLog.audit_id == audit_id
        )
    )

    # ADMIN → Citizen + Admin audit logs
    if user_role == "ADMIN":
        query = query.filter(
            User.role.in_(["CITIZEN", "ADMIN"])
        )

    # NORMAL USER → only their own audit log
    else:
        query = query.filter(
            AuditLog.user_id == user_id
        )

    return query.first()