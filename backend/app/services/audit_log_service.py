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



def get_client_ip(request) -> str | None:
    """Extract the client IP from a request (proxy-aware). Never raises."""
    try:
        if request is None:
            return None
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip() or None
        client = getattr(request, "client", None)
        host = getattr(client, "host", None)
        return host or None
    except Exception:
        return None


def log_request_action(
    request,
    db: Session,
    user,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    description: str | None = None,
) -> AuditLog | None:
    """Router-level audit helper.

    Records one audit row for an already-successful operation, attaching
    the client IP. Call only after the business transaction succeeded so
    a failed operation never produces a success record. Never raises.
    """
    try:
        user_id = getattr(user, "user_id", None)
    except Exception:
        user_id = None
    return log_action(
        db=db,
        action=action,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        ip_address=get_client_ip(request),
    )


def _is_admin_role(user_role: str | None) -> bool:
    return (user_role or "").strip().upper() in ("ADMIN", "ADMINISTRATOR")


def _attach_user_info(db: Session, entries) -> None:
    """Attach transient user_name/user_email/user_role for API responses."""
    try:
        items = list(entries or [])
        if not items:
            return
        ids = {e.user_id for e in items if e.user_id}
        users = (
            {
                u.user_id: u
                for u in db.query(User).filter(User.user_id.in_(ids)).all()
            }
            if ids
            else {}
        )
        for entry in items:
            user = users.get(entry.user_id)
            entry.user_name = getattr(user, "full_name", None)
            entry.user_email = getattr(user, "email", None)
            entry.user_role = getattr(user, "role", None)
    except Exception as exc:
        logger.warning("Audit user enrichment failed: %s", exc)


def get_audit_logs(
    db: Session,
    user_id: int,
    user_role: str,
    action: str | None = None,
    entity_type: str | None = None,
    from_date=None,
    to_date=None,
    skip: int | None = None,
    limit: int | None = None,
):
    query = (
        db.query(AuditLog)
        .join(
            User,
            AuditLog.user_id == User.user_id
        )
    )

    # ADMIN → all audit logs across every role
    if _is_admin_role(user_role):
        pass

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

    query = query.order_by(AuditLog.created_at.desc())

    if skip:
        query = query.offset(skip)

    if limit:
        query = query.limit(limit)

    entries = query.all()
    _attach_user_info(db, entries)
    return entries


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

    # ADMIN → all audit logs across every role
    if _is_admin_role(user_role):
        pass

    # NORMAL USER → only their own audit log
    else:
        query = query.filter(
            AuditLog.user_id == user_id
        )

    entry = query.first()
    if entry is not None:
        _attach_user_info(db, [entry])
    return entry