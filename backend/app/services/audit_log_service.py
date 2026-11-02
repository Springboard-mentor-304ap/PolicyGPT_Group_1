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


def _sanitise_ip(value: str | None) -> str | None:
    """Return the value only when it parses as an IP address.

    The column is INET: a malformed X-Forwarded-For value or a
    non-IP test client host must degrade to NULL, never fail the
    audit write (and, by design, never fail the caller).
    """
    if not value:
        return None
    try:
        import ipaddress

        ipaddress.ip_address(value.strip())
        return value.strip()
    except Exception:
        return None


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
            ip_address=_sanitise_ip(ip_address),
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
    commit: bool = True,
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
        commit=commit,
    )


def _is_admin_role(user_role: str | None) -> bool:
    return (user_role or "").strip().upper() in ("ADMIN", "ADMINISTRATOR")


def resolve_user_display_name(db: Session, user_id: int | None) -> str | None:
    """Display name (full_name) for a user id, or None when unknown.

    Used to snapshot record-creator names into deletion audit
    descriptions (see the delete routes): the policy/scheme row — and
    hence its ``created_by`` link — is gone after a permanent delete,
    so the name is captured beforehand. Never raises.
    """
    try:
        if user_id is None:
            return None
        user = db.query(User).filter(User.user_id == user_id).first()
        name = (getattr(user, "full_name", None) or "").strip() if user else ""
        return name or None
    except Exception:
        return None


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


# ============================================================
# WORKFLOW TIMELINE
#
# Per-entity chronological history for the Workflow Timeline
# card on policy/scheme details pages. Only meaningful
# workflow actions are included (views, purge summaries, and
# notification pipeline events are excluded); status
# transitions are derived from the canonical action names so
# historical rows work without a schema migration.
# ============================================================

#: action -> {label, from_status, to_status}. from/to None means the
#: action carries no status transition (shown without transition).
TIMELINE_ACTION_META: dict[str, dict[str, str | None]] = {
    "POLICY_CREATED": {"label": "Policy created", "from": None, "to": "DRAFT"},
    "SCHEME_CREATED": {"label": "Scheme created", "from": None, "to": "DRAFT"},
    "POLICY_DRAFT_SAVED": {"label": "Draft saved", "from": None, "to": "DRAFT"},
    "SCHEME_DRAFT_SAVED": {"label": "Draft saved", "from": None, "to": "DRAFT"},
    "POLICY_UPDATED": {"label": "Policy edited", "from": None, "to": None},
    "SCHEME_UPDATED": {"label": "Scheme edited", "from": None, "to": None},
    "POLICY_SUBMITTED": {
        "label": "Submitted for approval",
        "from": "DRAFT",
        "to": "PENDING_APPROVAL",
    },
    "SCHEME_SUBMITTED": {
        "label": "Submitted for approval",
        "from": "DRAFT",
        "to": "PENDING_APPROVAL",
    },
    "POLICY_APPROVED": {
        "label": "Policy approved",
        "from": "PENDING_APPROVAL",
        "to": "APPROVED",
    },
    "APPROVAL_EVENT": {
        "label": "Approved",
        "from": "PENDING_APPROVAL",
        "to": "APPROVED",
    },
    "POLICY_REJECTED": {
        "label": "Policy rejected",
        "from": "PENDING_APPROVAL",
        "to": "REJECTED",
    },
    "REJECTION_EVENT": {
        "label": "Rejected",
        "from": "PENDING_APPROVAL",
        "to": "REJECTED",
    },
    "POLICY_ARCHIVE_REQUESTED": {
        "label": "Archive requested",
        "from": "APPROVED",
        "to": "ARCHIVE_REQUESTED",
    },
    "SCHEME_ARCHIVE_REQUESTED": {
        "label": "Archive requested",
        "from": "APPROVED",
        "to": "ARCHIVE_REQUESTED",
    },
    "POLICY_ARCHIVE_APPROVED": {
        "label": "Archive approved",
        "from": "ARCHIVE_REQUESTED",
        "to": "ARCHIVED",
    },
    "SCHEME_ARCHIVE_APPROVED": {
        "label": "Archive approved",
        "from": "ARCHIVE_REQUESTED",
        "to": "ARCHIVED",
    },
    "POLICY_ARCHIVE_REJECTED": {
        "label": "Archive rejected",
        "from": "ARCHIVE_REQUESTED",
        "to": "APPROVED",
    },
    "SCHEME_ARCHIVE_REJECTED": {
        "label": "Archive rejected",
        "from": "ARCHIVE_REQUESTED",
        "to": "APPROVED",
    },
    "POLICY_ARCHIVED": {
        "label": "Policy archived",
        "from": "APPROVED",
        "to": "ARCHIVED",
    },
    "SCHEME_ARCHIVED": {
        "label": "Scheme archived",
        "from": "APPROVED",
        "to": "ARCHIVED",
    },
    "POLICY_RESTORED": {
        "label": "Policy restored",
        "from": "ARCHIVED",
        "to": "APPROVED",
    },
    "SCHEME_RESTORED": {
        "label": "Scheme restored",
        "from": "ARCHIVED",
        "to": "APPROVED",
    },
    "POLICY_DELETE_REQUESTED": {
        "label": "Deletion requested",
        "from": None,
        "to": "DELETE_REQUESTED",
    },
    "SCHEME_DELETE_REQUESTED": {
        "label": "Deletion requested",
        "from": None,
        "to": "DELETE_REQUESTED",
    },
    "POLICY_DELETE_APPROVED": {
        "label": "Deletion approved",
        "from": "DELETE_REQUESTED",
        "to": None,
    },
    "SCHEME_DELETE_APPROVED": {
        "label": "Deletion approved",
        "from": "DELETE_REQUESTED",
        "to": None,
    },
    "POLICY_DELETE_REJECTED": {
        "label": "Deletion rejected",
        "from": "DELETE_REQUESTED",
        "to": None,
    },
    "SCHEME_DELETE_REJECTED": {
        "label": "Deletion rejected",
        "from": "DELETE_REQUESTED",
        "to": None,
    },
    "POLICY_DELETED": {"label": "Policy deleted", "from": None, "to": None},
    "SCHEME_DELETED": {"label": "Scheme deleted", "from": None, "to": None},
    "POLICY_PERMANENTLY_DELETED": {
        "label": "Policy permanently deleted",
        "from": None,
        "to": None,
    },
    "SCHEME_PERMANENTLY_DELETED": {
        "label": "Scheme permanently deleted",
        "from": None,
        "to": None,
    },
    "POLICY_DOCUMENT_UPLOADED": {
        "label": "Document updated",
        "from": None,
        "to": None,
    },
    "POLICY_DOCUMENT_DELETED": {
        "label": "Document removed",
        "from": None,
        "to": None,
    },
}

_PUBLIC_TIMELINE_ROLES = frozenset(
    {"CITIZEN", "RESEARCHER", "ORGANIZATION", "GUEST"}
)


def _timeline_role(value: object) -> str:
    try:
        from app.api.routes.auth import normalize_role as _nr

        return _nr(str(value or ""))
    except Exception:
        return str(value or "").strip().upper()


def get_entity_audit_logs(
    db: Session,
    entity_type: str,
    entity_id: int,
    current_user,
    page: int = 1,
    limit: int = 50,
) -> dict:
    """Chronological workflow timeline for one policy/scheme.

    Only ADMIN and GOVERNMENT_OFFICIAL may read it (the route guard
    enforces this too); public roles are rejected so internal
    governance details never leak. Government officials additionally
    get the same 404-masking as the detail endpoints for records
    they cannot read. Raises HTTPException (404/403); never returns
    partial data.
    """
    from fastapi import HTTPException, status as _status

    from app.models.policy import Policy
    from app.models.scheme import Scheme

    normalized_type = (entity_type or "").strip().upper()
    if normalized_type not in ("POLICY", "SCHEME"):
        raise HTTPException(
            status_code=_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="entity_type must be POLICY or SCHEME.",
        )

    model = Policy if normalized_type == "POLICY" else Scheme
    entity = (
        db.query(model)
        .filter(
            model.policy_id == entity_id
            if normalized_type == "POLICY"
            else model.scheme_id == entity_id,
            model.is_deleted.is_(False),
        )
        .first()
    )
    if entity is None:
        raise HTTPException(
            status_code=_status.HTTP_404_NOT_FOUND,
            detail="Record not found.",
        )

    role = _timeline_role(getattr(current_user, "role", ""))
    if role in _PUBLIC_TIMELINE_ROLES or role not in (
        "ADMIN",
        "ADMINISTRATOR",
        "GOVERNMENT_OFFICIAL",
    ):
        # Fail closed: internal audit details are staff-only.
        raise HTTPException(
            status_code=_status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this timeline.",
        )
    if role == "GOVERNMENT_OFFICIAL":
        if getattr(entity, "status", None) != "APPROVED" and (
            getattr(entity, "created_by", None)
            != getattr(current_user, "user_id", None)
        ):
            raise HTTPException(
                status_code=_status.HTTP_404_NOT_FOUND,
                detail="Record not found.",
            )

    page = max(1, int(page or 1))
    limit = max(1, min(int(limit or 50), 200))

    base = (
        db.query(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.user_id)
        .filter(
            AuditLog.entity_type == normalized_type,
            AuditLog.entity_id == entity_id,
            AuditLog.action.in_(list(TIMELINE_ACTION_META)),
        )
    )
    total = base.count()
    rows = (
        base.order_by(AuditLog.created_at.asc(), AuditLog.audit_id.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    events = []
    for row, user in rows:
        name = (getattr(user, "full_name", None) or "").strip() if user else ""
        if not name:
            name = "System" if row.user_id is None else "Unknown User"
        entry_role = getattr(user, "role", None) if user else None
        meta = TIMELINE_ACTION_META.get(row.action, {})
        events.append(
            {
                "audit_id": row.audit_id,
                "user_id": row.user_id,
                "user_name": name,
                "user_email": None,
                "user_role": entry_role,
                "action": row.action,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "description": row.description,
                "ip_address": None,
                "created_at": row.created_at,
                "action_label": meta.get("label") or row.action,
                "from_status": meta.get("from"),
                "to_status": meta.get("to"),
                "reason": _timeline_reason(entity, row.action),
            }
        )

    pages = (total + limit - 1) // limit if total else 0
    return {
        "entity_type": normalized_type,
        "entity_id": entity_id,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "events": events,
    }


def _timeline_reason(entity, action: str) -> str | None:
    """Recorded reason for terminal request states, else None.

    Reasons live on the entity columns; they are attached only while
    the entity is still in the corresponding state, so stale reasons
    are never shown on older events.
    """
    try:
        status = getattr(entity, "status", None)
        if action in ("POLICY_REJECTED", "REJECTION_EVENT") and status == "REJECTED":
            return getattr(entity, "rejection_reason", None)
        if action.endswith("ARCHIVE_REQUESTED") and status == "ARCHIVE_REQUESTED":
            return getattr(entity, "archive_reason", None)
        if action.endswith("DELETE_REQUESTED") and status == "DELETE_REQUESTED":
            return getattr(entity, "delete_reason", None)
    except Exception:
        return None
    return None


def attach_actor_display_names(db: Session, entity) -> None:
    """Populate transient creator/approver name+role fields.

    Single-entity detail responses carry real identities (no per-event
    lookups needed). Unknown users keep None so the UI falls back to
    "Unknown User". Never raises.
    """
    try:
        ids = {
            uid
            for uid in (
                getattr(entity, "created_by", None),
                getattr(entity, "approved_by", None),
            )
            if uid is not None
        }
        users = (
            {
                u.user_id: u
                for u in db.query(User).filter(User.user_id.in_(ids)).all()
            }
            if ids
            else {}
        )
        creator = users.get(getattr(entity, "created_by", None))
        approver = users.get(getattr(entity, "approved_by", None))
        # Transient display fields (plain attributes, as in the trash
        # listings): absent users stay None so the UI falls back.
        entity.created_by_name = (
            (getattr(creator, "full_name", None) or "").strip() or None
        )
        entity.created_by_role = getattr(creator, "role", None)
        entity.approved_by_name = (
            (getattr(approver, "full_name", None) or "").strip() or None
        )
        entity.approved_by_role = getattr(approver, "role", None)
    except Exception as exc:
        logger.warning("Actor display-name enrichment failed: %s", exc)