import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.faq import FAQ
from app.models.support_query import SupportQuery
from app.models.user import User
from app.schemas.support import SupportRequestCreate
from app.services.audit_log_service import log_action

logger = logging.getLogger("uvicorn.error")

#: Retry-safe window: an identical support submission from the same user
#: inside this window returns the original ticket instead of a duplicate.
SUPPORT_IDEMPOTENCY_WINDOW_MINUTES = 10
SUPPORT_LIST_MAX_LIMIT = 200


def _visible_to_role(query, role: str):
    """DB-level FAQ audience filter: rows whose target_roles overlaps
    {role, ALL}. NULL or empty (rows predating the audience migration)
    counts as ALL so existing data keeps working."""
    return query.filter(
        or_(
            FAQ.target_roles.is_(None),
            FAQ.target_roles == [],
            FAQ.target_roles.overlap([role, "ALL"]),
        )
    )


def get_published_faqs(
    db: Session,
    search: Optional[str] = None,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    role: str = "GUEST",
) -> list[FAQ]:
    """Retrieve published FAQs visible to ``role``, optionally filtered
    by keyword and category. Role filtering happens in the database
    query — never client-side."""
    query = db.query(FAQ).filter(FAQ.status == "PUBLISHED")
    query = _visible_to_role(query, role)

    if category and category.strip() and category.strip().lower() != "all":
        query = query.filter(FAQ.category.ilike(category.strip()))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                FAQ.question.ilike(term),
                FAQ.answer.ilike(term),
                FAQ.category.ilike(term),
            )
        )

    return (
        query.order_by(FAQ.display_order.asc(), FAQ.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_faq_categories(db: Session, role: str = "GUEST") -> list[str]:
    """Get distinct categories across published FAQs visible to ``role``."""
    rows = (
        _visible_to_role(db.query(FAQ.category), role)
        .filter(
            FAQ.status == "PUBLISHED",
            FAQ.category.isnot(None),
            FAQ.category != "",
        )
        .distinct()
        .all()
    )
    categories = sorted({r[0].strip() for r in rows if r[0] and r[0].strip()})
    return categories


def get_published_faq(
    db: Session, faq_id: int, role: str = "GUEST"
) -> FAQ | None:
    """Retrieve a single published FAQ by ID when visible to ``role``."""
    return (
        _visible_to_role(db.query(FAQ), role)
        .filter(FAQ.faq_id == faq_id, FAQ.status == "PUBLISHED")
        .first()
    )


def _find_recent_duplicate(
    db: Session,
    user_id: int,
    data: SupportRequestCreate,
) -> SupportQuery | None:
    """Return the user's identical ticket created inside the retry window.

    Retried POSTs (timeout, double-click, back-button resubmit) carry the
    same subject/description/category, so returning the original row makes
    client retries safe without a schema change or a client-generated key.
    An explicit ``Idempotency-Key`` header is handled at the route layer by
    short-circuiting to the user's most recent ticket; the content check
    here is the authoritative guard.
    """
    from datetime import timedelta

    window_start = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        minutes=SUPPORT_IDEMPOTENCY_WINDOW_MINUTES
    )
    return (
        db.query(SupportQuery)
        .filter(
            SupportQuery.user_id == user_id,
            SupportQuery.category == data.category.strip(),
            SupportQuery.subject == data.subject.strip(),
            SupportQuery.description == data.description.strip(),
            SupportQuery.created_at >= window_start,
        )
        .order_by(SupportQuery.created_at.desc())
        .first()
    )


def create_support_request(
    db: Session,
    user_id: int,
    data: SupportRequestCreate,
    background_tasks=None,
) -> SupportQuery:
    """Submit a new user support query and notify administrators.

    The ticket + audit rows are committed before any notification I/O.
    Slow admin email/in-app fan-out is deferred to background tasks when
    available; without them (tests, scripts) delivery stays synchronous.
    Identical retries inside the idempotency window return the original
    ticket so a timeout retry never creates a duplicate.
    """
    existing = _find_recent_duplicate(db=db, user_id=user_id, data=data)
    if existing is not None:
        logger.info(
            "Support request deduplicated for user_id=%s existing_id=%s",
            user_id,
            existing.query_id,
        )
        return existing
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    query = SupportQuery(
        user_id=user_id,
        category=data.category.strip(),
        subject=data.subject.strip(),
        description=data.description.strip(),
        priority=(data.priority or "MEDIUM").strip().upper(),
        status="OPEN",
        created_at=now,
        updated_at=now,
    )
    db.add(query)
    db.commit()
    db.refresh(query)

    # Audit logging
    log_action(
        db=db,
        action="SUPPORT_REQUEST_SUBMITTED",
        user_id=user_id,
        entity_type="SUPPORT_QUERY",
        entity_id=query.query_id,
        description=(
            f"Support request '{query.subject}' (ID: {query.request_id}) submitted"
        ),
        commit=True,
    )

    # Optional notification dispatch to staff (deferred when possible
    # so the ticket response never waits on Brevo/SMTP network I/O).
    try:
        from app.services.notification_service import notify_feedback_received

        notify_feedback_received(
            db=db,
            feedback_id=query.query_id,
            subject=f"[Support #{query.request_id}] {query.subject}",
            user_id=user_id,
            background_tasks=background_tasks,
        )
    except Exception as exc:
        logger.warning("Support query notification dispatch skipped: %s", exc)

    return query


def get_user_support_requests(
    db: Session,
    user_id: int,
    skip: int = 0,
    limit: int = 100,
) -> list[SupportQuery]:
    """Retrieve support requests submitted by a specific user (bounded)."""
    bounded = max(1, min(limit, SUPPORT_LIST_MAX_LIMIT))
    return (
        db.query(SupportQuery)
        .filter(SupportQuery.user_id == user_id)
        .order_by(SupportQuery.created_at.desc())
        .offset(max(0, skip))
        .limit(bounded)
        .all()
    )


def get_support_request(
    db: Session,
    query_id: int,
    user_id: int,
) -> SupportQuery | None:
    """Retrieve a single support request enforcing ownership security
    (IDOR prevention)."""
    return (
        db.query(SupportQuery)
        .filter(
            SupportQuery.query_id == query_id,
            SupportQuery.user_id == user_id,
        )
        .first()
    )


# ============================================================
# ADMIN SUPPORT MANAGEMENT (ADMIN ONLY — no ownership restriction)
# ============================================================

ALLOWED_SUPPORT_STATUSES = {
    "OPEN",
    "IN_PROGRESS",
    "WAITING_FOR_USER",
    "RESOLVED",
    "CLOSED",
}

ALLOWED_SUPPORT_PRIORITIES = {"LOW", "MEDIUM", "HIGH", "URGENT"}


def _support_request_to_dict(query: SupportQuery) -> dict:
    """Serialize a support request with user details for admin views."""
    user = query.user
    return {
        "query_id": query.query_id,
        "request_id": query.request_id,
        "user_id": query.user_id,
        "user_name": getattr(user, "full_name", None),
        "user_email": getattr(user, "email", None),
        "user_role": getattr(user, "role", None),
        "category": query.category,
        "subject": query.subject,
        "description": query.description,
        "priority": query.priority,
        "status": query.status,
        "assigned_to": query.assigned_to,
        "response": query.response,
        "created_at": query.created_at,
        "updated_at": query.updated_at,
        "resolved_at": query.resolved_at,
    }


def get_all_support_requests(
    db: Session,
    status: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[dict]:
    """Retrieve every support request (ADMIN) with optional filters."""
    query = db.query(SupportQuery)

    if status and status.strip() and status.strip().lower() != "all":
        query = query.filter(SupportQuery.status == status.strip().upper())

    if category and category.strip() and category.strip().lower() != "all":
        query = query.filter(SupportQuery.category.ilike(category.strip()))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.join(User, User.user_id == SupportQuery.user_id).filter(
            or_(
                SupportQuery.subject.ilike(term),
                SupportQuery.description.ilike(term),
                SupportQuery.response.ilike(term),
                User.full_name.ilike(term),
                User.email.ilike(term),
            )
        )

    rows = (
        query.order_by(SupportQuery.created_at.desc())
        .offset(max(0, skip))
        .limit(max(1, min(limit, SUPPORT_LIST_MAX_LIMIT)))
        .all()
    )
    return [_support_request_to_dict(row) for row in rows]


def get_support_request_by_id(
    db: Session,
    query_id: int,
) -> dict | None:
    """Retrieve a single support request by ID (ADMIN, no ownership check)."""
    query = db.query(SupportQuery).filter(SupportQuery.query_id == query_id).first()
    if not query:
        return None
    return _support_request_to_dict(query)


def respond_to_support_request(
    db: Session,
    query_id: int,
    admin_user_id: int,
    response: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[int] = None,
    priority: Optional[str] = None,
    background_tasks=None,
) -> dict | None:
    """Record an admin response and/or status change on a support request."""
    query = db.query(SupportQuery).filter(SupportQuery.query_id == query_id).first()
    if not query:
        return None

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    audit_notes: list[str] = []

    if response is not None:
        query.response = response.strip() or None
        if query.response:
            _add_ticket_message(
                db=db,
                ticket=query,
                sender_id=admin_user_id,
                sender_role="ADMIN",
                message=query.response,
                commit=False,
            )
            audit_notes.append("replied")

    if status is not None and status.strip():
        normalized = status.strip().upper()
        if normalized not in ALLOWED_SUPPORT_STATUSES:
            raise ValueError(
                "Status must be one of: " + ", ".join(sorted(ALLOWED_SUPPORT_STATUSES))
            )
        query.status = normalized
        if normalized in ("RESOLVED", "CLOSED") and not query.resolved_at:
            query.resolved_at = now
        if normalized in ("OPEN", "IN_PROGRESS", "WAITING_FOR_USER"):
            query.resolved_at = None

    if priority is not None and str(priority).strip():
        normalized_priority = str(priority).strip().upper()
        if normalized_priority not in ALLOWED_SUPPORT_PRIORITIES:
            raise ValueError(
                "Priority must be one of: "
                + ", ".join(sorted(ALLOWED_SUPPORT_PRIORITIES))
            )
        if query.priority != normalized_priority:
            audit_notes.append(
                f"priority {query.priority}->{normalized_priority}"
            )
        query.priority = normalized_priority

    if assigned_to is not None:
        assignee = db.query(User).filter(User.user_id == assigned_to).first()
        if not assignee:
            raise ValueError("Assigned user does not exist.")
        if str(getattr(assignee, "role", "")).strip().upper() not in (
            "ADMIN",
            "ADMINISTRATOR",
        ):
            raise ValueError("Tickets can only be assigned to admin users.")
        if query.assigned_to != assigned_to:
            audit_notes.append(f"assigned to user {assigned_to}")
        query.assigned_to = assigned_to

    if query.assigned_to is None:
        query.assigned_to = admin_user_id

    query.updated_at = now
    db.commit()
    db.refresh(query)

    for note in audit_notes:
        log_action(
            db=db,
            action="SUPPORT_REQUEST_UPDATED",
            user_id=admin_user_id,
            entity_type="SUPPORT_QUERY",
            entity_id=query.query_id,
            description=f"Admin ticket update ({note}).",
        )

    # Notify the requesting user (best effort, deferred when possible so
    # the admin response never waits on external email/SMS delivery).
    try:
        from app.services.notification_service import (
            notify_feedback_updated,
        )

        notify_feedback_updated(
            db=db,
            feedback_id=query.query_id,
            subject=query.subject,
            user_id=query.user_id,
            response_summary=(query.response[:80] if query.response else None),
            background_tasks=background_tasks,
        )
    except Exception as exc:
        logger.warning("Support response notification dispatch skipped: %s", exc)

    return _support_request_to_dict(query)


# ============================================================
# THREADED TICKET CONVERSATION
# ============================================================

def _add_ticket_message(
    db: Session,
    ticket: SupportQuery,
    sender_id: int,
    sender_role: str,
    message: str,
    commit: bool = True,
):
    """Append one conversation row without touching ticket status."""
    from app.models.support_ticket_message import SupportTicketMessage

    entry = SupportTicketMessage(
        ticket_id=ticket.query_id,
        sender_id=sender_id,
        sender_role=str(sender_role or "").strip().upper() or "CITIZEN",
        message=message.strip(),
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    else:
        db.flush()
    return entry


def _message_to_dict(entry, sender_name: str | None = None) -> dict:
    return {
        "id": entry.id,
        "ticket_id": entry.ticket_id,
        "sender_id": entry.sender_id,
        "sender_role": entry.sender_role,
        "sender_name": sender_name,
        "message": entry.message,
        "created_at": entry.created_at,
    }


def list_ticket_messages(
    db: Session,
    ticket: SupportQuery,
) -> list[dict]:
    """Chronological conversation for a ticket the caller may access."""
    from app.models.support_ticket_message import SupportTicketMessage

    rows = (
        db.query(SupportTicketMessage, User.full_name)
        .outerjoin(User, User.user_id == SupportTicketMessage.sender_id)
        .filter(SupportTicketMessage.ticket_id == ticket.query_id)
        .order_by(SupportTicketMessage.created_at.asc())
        .all()
    )
    return [_message_to_dict(entry, sender_name) for entry, sender_name in rows]


def post_ticket_message(
    db: Session,
    ticket: SupportQuery,
    sender_id: int,
    sender_role: str,
    message: str,
    background_tasks=None,
) -> dict:
    """Append a reply; a user reply reopens RESOLVED/CLOSED tickets."""
    from app.models.support_ticket_message import SupportTicketMessage  # noqa: F401

    text = (message or "").strip()
    if not text:
        raise ValueError("Reply message must not be empty.")
    if len(text) > 5000:
        raise ValueError("Reply message must not exceed 5000 characters.")

    normalized_role = str(sender_role or "").strip().upper() or "CITIZEN"
    entry = _add_ticket_message(
        db=db,
        ticket=ticket,
        sender_id=sender_id,
        sender_role=normalized_role,
        message=text,
        commit=False,
    )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    reopened = False
    if normalized_role != "ADMIN" and ticket.status in ("RESOLVED", "CLOSED"):
        ticket.status = "IN_PROGRESS"
        ticket.resolved_at = None
        reopened = True
    ticket.updated_at = now
    db.commit()
    db.refresh(entry)

    sender = db.query(User).filter(User.user_id == sender_id).first()
    log_action(
        db=db,
        action="SUPPORT_TICKET_REPLIED",
        user_id=sender_id,
        entity_type="SUPPORT_QUERY",
        entity_id=ticket.query_id,
        description=(
            f"Ticket reply by {normalized_role}"
            + (" (ticket reopened to IN_PROGRESS)." if reopened else ".")
        ),
    )

    # Notify the other party (best effort, never blocks the reply).
    try:
        from app.services.notification_service import notify_feedback_updated

        if normalized_role == "ADMIN":
            notify_feedback_updated(
                db=db,
                feedback_id=ticket.query_id,
                subject=ticket.subject,
                user_id=ticket.user_id,
                response_summary=text[:80],
                background_tasks=background_tasks,
            )
        else:
            notify_feedback_received(
                db=db,
                feedback_id=ticket.query_id,
                subject=f"Ticket {ticket.request_id}: {ticket.subject}",
                user_id=None,
                background_tasks=background_tasks,
            )
    except Exception as exc:
        logger.warning("Ticket reply notification dispatch skipped: %s", exc)

    sender_name = getattr(sender, "full_name", None)
    return _message_to_dict(entry, sender_name)


# ============================================================
# SUPPORT ANALYTICS (ADMIN)
# ============================================================

def get_support_analytics(db: Session) -> dict:
    """Aggregate ticket + feedback counts for the admin dashboard."""
    from sqlalchemy import func
    from app.models.feedback import Feedback

    rows = db.query(SupportQuery).all()
    by_status: dict[str, int] = {}
    by_category: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    by_role: dict[str, int] = {}
    resolution_seconds: list[float] = []

    for ticket in rows:
        status = (ticket.status or "OPEN").strip().upper()
        by_status[status] = by_status.get(status, 0) + 1
        category = (ticket.category or "General").strip() or "General"
        by_category[category] = by_category.get(category, 0) + 1
        priority = (ticket.priority or "MEDIUM").strip().upper()
        by_priority[priority] = by_priority.get(priority, 0) + 1
        user = ticket.user
        role = str(getattr(user, "role", None) or "UNKNOWN").strip().upper()
        by_role[role] = by_role.get(role, 0) + 1
        if ticket.resolved_at and ticket.created_at:
            try:
                resolution_seconds.append(
                    (ticket.resolved_at - ticket.created_at).total_seconds()
                )
            except Exception:
                pass

    avg_resolution_hours = (
        round(sum(resolution_seconds) / len(resolution_seconds) / 3600, 2)
        if resolution_seconds
        else None
    )
    feedback_count = db.query(func.count(Feedback.feedback_id)).scalar() or 0

    return {
        "total_tickets": len(rows),
        "by_status": by_status,
        "by_category": by_category,
        "by_priority": by_priority,
        "by_role": by_role,
        "resolved_count": sum(
            count
            for status, count in by_status.items()
            if status in ("RESOLVED", "CLOSED")
        ),
        "avg_resolution_hours": avg_resolution_hours,
        "feedback_count": int(feedback_count),
    }
