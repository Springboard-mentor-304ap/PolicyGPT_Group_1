import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.faq import FAQ
from app.models.support_query import SupportQuery
from app.schemas.support import SupportRequestCreate
from app.services.audit_log_service import log_action

logger = logging.getLogger("uvicorn.error")


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
    return (
        db.query(FAQ)
        .filter(FAQ.faq_id == faq_id, FAQ.status == "PUBLISHED")
        .first()
    )


def create_support_request(
    db: Session,
    user_id: int,
    data: SupportRequestCreate,
) -> SupportQuery:
    """Submit a new user support query and notify administrators."""
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
            f"Support request '{query.subject}' "
            f"(ID: {query.request_id}) submitted"
        ),
        commit=True,
    )

    # Optional notification dispatch to staff
    try:
        from app.services.notification_service import notify_feedback_received
        notify_feedback_received(
            db=db,
            feedback_id=query.query_id,
            subject=f"[Support #{query.request_id}] {query.subject}",
            user_id=user_id,
        )
    except Exception as exc:
        logger.warning("Support query notification dispatch skipped: %s", exc)

    return query


def get_user_support_requests(
    db: Session,
    user_id: int,
) -> list[SupportQuery]:
    """Retrieve all support requests submitted by a specific user."""
    return (
        db.query(SupportQuery)
        .filter(SupportQuery.user_id == user_id)
        .order_by(SupportQuery.created_at.desc())
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
