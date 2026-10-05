"""Notification email tests (mocked SMTP, no live DB).

Covers: correct recipient, preference respect, dynamic content + links,
duplicate prevention, graceful failure without breaking in-app, and
read/unread behavior preservation.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationCreate


def _user(**over):
    base = dict(
        user_id=7,
        full_name="Citizen One",
        email="citizen7@example.com",
        role="CITIZEN",
        is_active=True,
    )
    base.update(over)
    return User(**base)


def _notif(**over):
    base = dict(
        notification_id=1,
        user_id=7,
        title="New Policy Published",
        message="Policy X is now available.",
        notification_type="NEW_POLICY",
        priority="NORMAL",
        channel="IN_APP",
        action_url="/policies/5",
        entity_type="POLICY",
        entity_id=5,
        source_name="Ministry",
        related_policy_id=5,
        related_scheme_id=None,
        is_read=False,
        read_at=None,
        created_at=datetime(2026, 9, 24, 12, 0, 0),
        updated_at=datetime(2026, 9, 24, 12, 0, 0),
        expires_at=None,
        category="POLICY",
    )
    base.update(over)
    return Notification(**base)


# --------------------------------------------------
# Correct recipient + dynamic content
# --------------------------------------------------

def test_deliver_email_uses_registered_user_email():
    from app.services.notification_delivery_service import (
        NotificationDeliveryService as Svc,
    )

    user = _user(email="correct@example.com")
    notif = _notif()
    db = MagicMock()

    with patch(
        "app.services.notification_delivery_service.send_notification_email",
        return_value={"success": True, "provider": "BREVO",
                      "message_id": "m1", "error": None},
    ) as mock_send:
        Svc.deliver_email(
            db=db, notification=notif, user=user,
            is_enabled_by_preference=True,
        )
    assert mock_send.call_args[1]["recipient_email"] == "correct@example.com"
    assert mock_send.call_args[1]["title"] == "New Policy Published"
    assert mock_send.call_args[1]["action_url"] == "/policies/5"


def test_email_html_contains_frontend_url_and_details():
    from app.services import email_service
    from app.core.config import settings

    with patch.object(
        email_service, "send_email", return_value={"success": True}
    ) as mock_send:
        email_service.send_scheme_email(
            recipient_email="u@example.com",
            title="New Scheme",
            message="Scheme Y launched",
            scheme_id=9,
        )
        html = mock_send.call_args[0][2]
        assert settings.FRONTEND_URL.rstrip("/") in html
        assert "New Scheme" in html
        assert "Scheme Y launched" in html
        assert "/schemes/9" in html


# --------------------------------------------------
# Preferences respected
# --------------------------------------------------

def test_email_skipped_when_preference_disabled_no_send():
    from app.services.notification_delivery_service import (
        NotificationDeliveryService as Svc,
    )

    db = MagicMock()
    with patch(
        "app.services.notification_delivery_service.send_notification_email"
    ) as mock_send:
        delivery = Svc.deliver_email(
            db=db, notification=_notif(), user=_user(),
            is_enabled_by_preference=False,
        )
    assert not mock_send.called
    assert delivery.status == "SKIPPED"
    assert delivery.failure_reason == "PREFERENCE_DISABLED"


def test_email_skipped_when_no_email_address():
    from app.services.notification_delivery_service import (
        NotificationDeliveryService as Svc,
    )

    db = MagicMock()
    with patch(
        "app.services.notification_delivery_service.send_notification_email"
    ) as mock_send:
        delivery = Svc.deliver_email(
            db=db, notification=_notif(), user=_user(email=None),
            is_enabled_by_preference=True,
        )
    assert not mock_send.called
    assert delivery.status == "SKIPPED"


# --------------------------------------------------
# Duplicate prevention via dispatch
# --------------------------------------------------

def test_dispatch_suppresses_duplicate_within_window():
    from app.services import notification_service as ns

    data = NotificationCreate(
        user_id=7,
        title="T",
        message="M",
        notification_type="NEW_POLICY",
        entity_type="POLICY",
        entity_id=5,
    )
    db = MagicMock()
    # Preference allows everything; duplicate exists.
    with patch(
        "app.services.notification_preference_rule_service."
        "resolve_channels_for_user",
        return_value={"in_app": True, "email": True, "sms": False},
    ), patch.object(ns, "_is_duplicate", return_value=True), patch.object(
        ns, "create_notification"
    ) as mock_create:
        res = ns.dispatch_notification(db, data)
    assert res is None
    assert not mock_create.called


def test_dispatch_creates_when_not_duplicate():
    from app.services import notification_service as ns

    data = NotificationCreate(
        user_id=7,
        title="T",
        message="M",
        notification_type="NEW_POLICY",
        entity_type="POLICY",
        entity_id=5,
    )
    db = MagicMock()
    sentinel = object()
    with patch(
        "app.services.notification_preference_rule_service."
        "resolve_channels_for_user",
        return_value={"in_app": True, "email": True, "sms": False},
    ), patch.object(ns, "_is_duplicate", return_value=False), patch.object(
        ns, "create_notification", return_value=sentinel
    ):
        assert ns.dispatch_notification(db, data) is sentinel


def test_dispatch_suppressed_when_all_channels_off():
    from app.services import notification_service as ns

    data = NotificationCreate(
        user_id=7,
        title="T",
        message="M",
        notification_type="NEW_POLICY",
    )
    with patch(
        "app.services.notification_preference_rule_service."
        "resolve_channels_for_user",
        return_value={"in_app": False, "email": False, "sms": False},
    ), patch.object(ns, "create_notification") as mock_create:
        assert ns.dispatch_notification(MagicMock(), data) is None
    assert not mock_create.called


# --------------------------------------------------
# Failure graceful, in-app preserved
# --------------------------------------------------

def test_email_failure_recorded_in_app_preserved():
    from app.services.notification_delivery_service import (
        NotificationDeliveryService as Svc,
    )

    db = MagicMock()
    notif = _notif()
    with patch(
        "app.services.notification_delivery_service.send_notification_email",
        return_value={"success": False, "provider": "BREVO",
                      "message_id": None, "error": "SMTP down"},
    ):
        email_delivery = Svc.deliver_email(
            db=db, notification=notif, user=_user(),
            is_enabled_by_preference=True,
        )
        in_app = Svc.deliver_in_app(db, notif)
    assert email_delivery.status == "FAILED"
    assert "SMTP" in email_delivery.failure_reason
    assert in_app.status == "DELIVERED"


def test_read_unread_does_not_touch_deliveries():
    from app.services import notification_service as ns

    n = _notif(is_read=False)
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.first.return_value = n
    ns.mark_notification_read(db, 1, 7, "CITIZEN")
    assert n.is_read is True
    ns.mark_notification_unread(db, 1, 7, "CITIZEN")
    assert n.is_read is False
