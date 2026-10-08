"""Threaded ticket conversation, assignment, priority and analytics.

Uses mocked DB sessions (no live DB) to verify:
- User replies append a message row and reopen RESOLVED tickets.
- Empty/oversize replies are rejected without DB writes.
- Admin assignment validates an existing admin user.
- Invalid priority/status values raise ValueError (route maps to 422).
- Analytics aggregates counts from ticket rows.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest


def _ticket(status="OPEN", user_id=7, priority="MEDIUM"):
    from app.models.support_query import SupportQuery

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return SupportQuery(
        query_id=42,
        user_id=user_id,
        category="General Inquiry",
        subject="Login issue",
        description="Cannot log in since morning",
        priority=priority,
        status=status,
        created_at=now,
        updated_at=now,
    )


def _admin(user_id=1, role="ADMIN"):
    from app.models.user import User

    return User(
        user_id=user_id,
        full_name="Admin One",
        email="admin@example.com",
        password_hash="x",
        role=role,
        is_active=True,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def test_user_reply_reopens_resolved_ticket():
    from app.services import support_service

    ticket = _ticket(status="RESOLVED")
    db = MagicMock()
    with patch(
        "app.services.notification_service.notify_feedback_received"
    ):
        result = support_service.post_ticket_message(
            db=db,
            ticket=ticket,
            sender_id=7,
            sender_role="CITIZEN",
            message="Still broken, please help.",
            background_tasks=MagicMock(),
        )
    assert ticket.status == "IN_PROGRESS"
    assert ticket.resolved_at is None
    assert db.add.called
    assert db.commit.called
    assert result["ticket_id"] == 42


def test_empty_reply_rejected_without_db_writes():
    from app.services import support_service

    ticket = _ticket()
    db = MagicMock()
    with pytest.raises(ValueError):
        support_service.post_ticket_message(
            db=db,
            ticket=ticket,
            sender_id=7,
            sender_role="CITIZEN",
            message="   ",
        )
    assert not db.add.called
    assert not db.commit.called


def test_assign_to_non_admin_rejected():
    from app.services import support_service

    ticket = _ticket()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = _admin(
        user_id=9, role="CITIZEN"
    )
    with pytest.raises(ValueError):
        support_service.respond_to_support_request(
            db=db,
            query_id=42,
            admin_user_id=1,
            assigned_to=9,
        )


def test_assign_to_missing_user_rejected():
    from app.services import support_service

    ticket = _ticket()
    db = MagicMock()
    calls = {"n": 0}

    def fake_query(*args, **kwargs):
        calls["n"] += 1
        mock = MagicMock()
        if calls["n"] == 1:
            mock.filter.return_value.first.return_value = ticket
        else:
            mock.filter.return_value.first.return_value = None
        return mock

    db.query.side_effect = fake_query
    with pytest.raises(ValueError):
        support_service.respond_to_support_request(
            db=db,
            query_id=42,
            admin_user_id=1,
            assigned_to=999,
        )


def test_invalid_priority_and_waiting_status_accepted():
    from app.services import support_service

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = _admin()
    with pytest.raises(ValueError):
        support_service.respond_to_support_request(
            db=db,
            query_id=42,
            admin_user_id=1,
            priority="CRITICAL",
        )
    assert "WAITING_FOR_USER" in support_service.ALLOWED_SUPPORT_STATUSES
    assert "WAITING_FOR_USER" not in {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"}


def test_support_analytics_aggregates():
    from app.services import support_service

    t1 = _ticket(status="OPEN", priority="HIGH")
    t1.user = _admin(user_id=7, role="CITIZEN")
    t2 = _ticket(status="RESOLVED", priority="LOW")
    t2.user = _admin(user_id=8, role="RESEARCHER")
    t2.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db = MagicMock()
    db.query.return_value.all.return_value = [t1, t2]
    db.query.return_value.count.return_value = 0
    # func.count(...).scalar() path
    db.query.return_value.scalar.return_value = 5

    result = support_service.get_support_analytics(db=db)
    assert result["total_tickets"] == 2
    assert result["by_status"]["OPEN"] == 1
    assert result["by_status"]["RESOLVED"] == 1
    assert result["by_priority"]["HIGH"] == 1
    assert result["by_role"]["CITIZEN"] == 1
    assert result["resolved_count"] == 1
    assert result["feedback_count"] == 5
    assert result["avg_resolution_hours"] is not None
