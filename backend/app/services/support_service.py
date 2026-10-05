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


def get_published_faqs(
    db: Session,
    search: Optional[str] = None,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> list[FAQ]:
    """Retrieve all published FAQs, optionally filtered by keyword
    and category."""
    query = db.query(FAQ).filter(FAQ.status == "PUBLISHED")

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


def get_faq_categories(db: Session) -> list[str]:
    """Get all distinct categories across published FAQs."""
    rows = (
        db.query(FAQ.category)
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


def get_published_faq(db: Session, faq_id: int) -> FAQ | None:
    """Retrieve a single published FAQ by ID."""
    return db.query(FAQ).filter(FAQ.faq_id == faq_id, FAQ.status == "PUBLISHED").first()


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

ALLOWED_SUPPORT_STATUSES = {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"}


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
    background_tasks=None,
) -> dict | None:
    """Record an admin response and/or status change on a support request."""
    query = db.query(SupportQuery).filter(SupportQuery.query_id == query_id).first()
    if not query:
        return None

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if response is not None:
        query.response = response.strip() or None

    if status is not None and status.strip():
        normalized = status.strip().upper()
        if normalized not in ALLOWED_SUPPORT_STATUSES:
            raise ValueError(
                "Status must be one of: " + ", ".join(sorted(ALLOWED_SUPPORT_STATUSES))
            )
        query.status = normalized
        if normalized in ("RESOLVED", "CLOSED") and not query.resolved_at:
            query.resolved_at = now
        if normalized in ("OPEN", "IN_PROGRESS"):
            query.resolved_at = None

    if query.assigned_to is None:
        query.assigned_to = admin_user_id

    query.updated_at = now
    db.commit()
    db.refresh(query)

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
