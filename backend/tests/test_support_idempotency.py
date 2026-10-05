"""Regression tests for support idempotency + bounded listing.

Uses mocked DB sessions (no live DB) to verify:
- Identical retries inside the window return the original ticket and do
  not insert a duplicate.
- List endpoints accept and enforce bounded skip/limit.
- Notification delivery exposes an external-only leg that background
  workers can run without touching in-app bookkeeping.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.schemas.support import SupportRequestCreate


def _payload():
    return SupportRequestCreate(
        category="General Inquiry",
        subject="Login issue",
        description="Cannot log in since morning",
        priority="HIGH",
    )


def _existing_ticket():
    from app.models.support_query import SupportQuery

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return SupportQuery(
        query_id=42,
        user_id=7,
        category="General Inquiry",
        subject="Login issue",
        description="Cannot log in since morning",
        priority="HIGH",
        status="OPEN",
        created_at=now,
        updated_at=now,
    )


def test_create_support_request_dedupes_identical_retry():
    from app.services import support_service

    data = _payload()
    existing = _existing_ticket()
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.order_by.return_value = q
    q.first.return_value = existing

    with (
        patch.object(support_service, "_find_recent_duplicate", return_value=existing),
        patch(
            "app.services.notification_service.notify_feedback_received"
        ) as mock_notify,
    ):
        result = support_service.create_support_request(
            db=db, user_id=7, data=data, background_tasks=MagicMock()
        )
    assert result is existing
    assert not db.add.called
    assert not mock_notify.called


def test_create_support_request_creates_when_no_duplicate():
    from app.services import support_service

    data = _payload()
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.order_by.return_value = q
    q.first.return_value = None

    with (
        patch.object(support_service, "_find_recent_duplicate", return_value=None),
        patch(
            "app.services.notification_service.notify_feedback_received"
        ) as mock_notify,
        patch.object(support_service, "log_action"),
    ):
        # Mocked session never assigns an autoincrement id; emulate the
        # flush/commit assigning one so request_id formatting works.
        def _assign_id(obj):
            obj.query_id = 99

        db.add.side_effect = _assign_id
        ticket = support_service.create_support_request(
            db=db, user_id=7, data=data, background_tasks=MagicMock()
        )
    assert db.add.called
    assert db.commit.called
    assert mock_notify.called
    # BackgroundTasks instance is threaded through, not swallowed.
    assert mock_notify.call_args[1]["background_tasks"] is not None
    assert ticket.status == "OPEN"


def test_user_list_is_bounded():
    from app.services import support_service

    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.order_by.return_value = q
    q.offset.return_value = q
    q.limit.return_value = q
    q.all.return_value = []
    support_service.get_user_support_requests(db=db, user_id=7, limit=500)
    # Limit is capped at SUPPORT_LIST_MAX_LIMIT (200), never unbounded.
    assert q.limit.call_args[0][0] == support_service.SUPPORT_LIST_MAX_LIMIT


def test_deliver_external_only_sends_email_sms_legs():
    from app.models.notification import Notification
    from app.models.user import User
    from app.services.notification_delivery_service import (
        NotificationDeliveryService as Svc,
    )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    notif = Notification(
        notification_id=1,
        user_id=7,
        title="T",
        message="M",
        notification_type="NEW_POLICY",
        priority="NORMAL",
        channel="IN_APP",
        is_read=False,
        created_at=now,
        updated_at=now,
    )
    user = User(
        user_id=7,
        full_name="U",
        email="u@example.com",
        password_hash="x",
        role="CITIZEN",
        is_active=True,
    )
    db = MagicMock()

    def fake_query(model):
        qq = MagicMock()
        if model.__name__ == "User":
            qq.filter.return_value = qq
            qq.first.return_value = user
        else:
            qq.filter.return_value = qq
            qq.first.return_value = None
        return qq

    db.query.side_effect = fake_query
    with (
        patch(
            "app.services.notification_preference_rule_service."
            "resolve_channels_for_user",
            return_value={"in_app": True, "email": True, "sms": False},
        ),
        patch(
            "app.services.notification_delivery_service.send_notification_email",
            return_value={
                "success": True,
                "provider": "BREVO",
                "message_id": "m",
                "error": None,
            },
        ) as mock_email,
        patch("app.services.notification_delivery_service.send_sms") as mock_sms,
    ):
        res = Svc.deliver_external(db=db, notification=notif, user=user)
    assert mock_email.called
    assert not mock_sms.called  # sms disabled by preference
    assert len(res["deliveries"]) == 2  # SKIPPED sms still recorded


def test_otp_uses_cryptographic_randomness_and_constant_time_compare():
    import inspect

    import app.api.routes.auth as auth_routes

    send_src = inspect.getsource(auth_routes.send_otp)
    forgot_src = inspect.getsource(auth_routes.forgot_password)
    verify_src = inspect.getsource(auth_routes.verify_otp)
    assert "secrets.randbelow" in send_src
    assert "secrets.randbelow" in forgot_src
    assert "random.randint" not in send_src
    assert "hmac.compare_digest" in verify_src
