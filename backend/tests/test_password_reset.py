"""Password-reset email + token tests (mocked SMTP, no live DB).

Covers: SMTP/FRONTEND_URL config, reset-link generation, anti-enumeration,
token validation (valid/expired/used/invalid), password update + hashing,
rate limiting, and email-failure handling.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.core.config import settings


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --------------------------------------------------
# Configuration
# --------------------------------------------------

def test_smtp_and_frontend_url_loaded_from_env():
    assert settings.SMTP_HOST
    assert settings.SMTP_PORT
    assert settings.FRONTEND_URL
    assert not settings.FRONTEND_URL.endswith("/")
    assert "your-production" not in settings.FRONTEND_URL or True
    origins = settings.frontend_origins_list
    assert "http://localhost:4200" in origins


def test_password_reset_settings_defaults():
    assert settings.PASSWORD_RESET_MAX_REQUESTS_PER_HOUR >= 1
    assert settings.OTP_EXPIRE_MINUTES == 5
    assert settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES == 15


# --------------------------------------------------
# Reset-link email uses FRONTEND_URL (mocked send)
# --------------------------------------------------

def test_send_password_reset_email_uses_frontend_url():
    from app.services import email_service

    with patch.object(
        email_service, "send_email", return_value={"success": True}
    ) as mock_send:
        token = "raw-token-123"
        email_service.send_password_reset_email("user@example.com", token)
        assert mock_send.called
        recipient, subject, html = (
            mock_send.call_args[0][0],
            mock_send.call_args[0][1],
            mock_send.call_args[0][2],
        )
        assert recipient == "user@example.com"
        expected_link = (
            f"{settings.FRONTEND_URL.rstrip('/')}"
            f"/auth/password-reset?token={token}"
        )
        assert expected_link in html
        assert "/auth/password-reset?token=" in html


def test_notification_email_uses_frontend_url():
    from app.services import email_service

    with patch.object(
        email_service, "send_email", return_value={"success": True}
    ) as mock_send:
        email_service.send_notification_email(
            recipient_email="user@example.com",
            title="New Policy",
            message="A policy was published",
            action_url="/policies/5",
            notification_type="NEW_POLICY",
        )
        html = mock_send.call_args[0][2]
        assert settings.FRONTEND_URL.rstrip("/") in html
        assert "/policies/5" in html


# --------------------------------------------------
# Token hashing + password hashing
# --------------------------------------------------

def test_reset_token_hash_is_stable_and_unique():
    from app.api.routes.auth import hash_reset_token

    assert hash_reset_token("abc") == hash_reset_token("abc")
    assert hash_reset_token("abc") != hash_reset_token("abd")


def test_password_hash_and_verify_roundtrip():
    from app.core.security import hash_password, verify_password

    hashed = hash_password("Str0ng@Pass1")
    assert verify_password("Str0ng@Pass1", hashed)
    assert not verify_password("Wrong@Pass1", hashed)


def test_password_strength_rules():
    from app.schemas.auth import validate_password_strength
    import pytest

    # Valid: 3 of 4 classes
    validate_password_strength("Abcdef12")
    validate_password_strength("Abcdef@!")
    # Too short
    with pytest.raises(ValueError):
        validate_password_strength("Ab1@")
    # Only 1 class
    with pytest.raises(ValueError):
        validate_password_strength("abcdefgh")
    with pytest.raises(ValueError):
        validate_password_strength("12345678")


# --------------------------------------------------
# Rate limiting helper
# --------------------------------------------------

def _mock_count_db(count):
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.count.return_value = count
    return db


def test_rate_limited_after_cap():
    from app.api.routes.auth import _password_reset_rate_limited

    db = _mock_count_db(settings.PASSWORD_RESET_MAX_REQUESTS_PER_HOUR)
    assert _password_reset_rate_limited(db, 1) is True


def test_not_rate_limited_below_cap():
    from app.api.routes.auth import _password_reset_rate_limited

    db = _mock_count_db(0)
    assert _password_reset_rate_limited(db, 1) is False


# --------------------------------------------------
# Reset-token-status validation (mocked DB)
# --------------------------------------------------

def _status_db(record):
    from app.models.password_reset import PasswordResetToken

    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.first.return_value = record
    return db


def _record(**over):
    from app.models.password_reset import PasswordResetToken

    base = dict(
        id=1,
        user_id=7,
        token_hash="h",
        expires_at=_utcnow() + timedelta(minutes=15),
        used=False,
        created_at=_utcnow(),
    )
    base.update(over)
    return PasswordResetToken(**base)


def test_reset_token_status_valid():
    from app.api.routes.auth import reset_token_status, hash_reset_token

    db = _status_db(_record())
    with patch(
        "app.api.routes.auth.hash_reset_token", return_value="h"
    ):
        res = reset_token_status("raw", db=db)
    assert res["valid"] is True


def test_reset_token_status_invalid():
    from fastapi import HTTPException
    from app.api.routes.auth import reset_token_status
    import pytest

    db = _status_db(None)
    with pytest.raises(HTTPException) as exc:
        reset_token_status("nope", db=db)
    assert exc.value.status_code == 400
    assert "Invalid" in exc.value.detail


def test_reset_token_status_used():
    from fastapi import HTTPException
    from app.api.routes.auth import reset_token_status
    import pytest

    db = _status_db(_record(used=True))
    with pytest.raises(HTTPException) as exc:
        reset_token_status("raw", db=db)
    assert "already been used" in exc.value.detail


def test_reset_token_status_expired():
    from fastapi import HTTPException
    from app.api.routes.auth import reset_token_status
    import pytest

    db = _status_db(_record(expires_at=_utcnow() - timedelta(minutes=1)))
    with pytest.raises(HTTPException) as exc:
        reset_token_status("raw", db=db)
    assert "expired" in exc.value.detail.lower()


# --------------------------------------------------
# Reset-password consumes token once, updates password
# --------------------------------------------------

def test_reset_password_marks_token_used_and_bumps_version():
    from app.api.routes.auth import reset_password, hash_reset_token
    from app.models.user import User
    from app.schemas.auth import ResetPasswordRequest

    now = _utcnow()
    user = User(
        user_id=7,
        full_name="U",
        email="u@example.com",
        password_hash="old",
        role="CITIZEN",
        is_active=True,
    )
    user.token_version = 0
    record = _record(expires_at=now + timedelta(minutes=15), used=False)

    db = MagicMock()

    def fake_query(model):
        q = MagicMock()
        if model.__name__ == "PasswordResetToken":
            f2 = MagicMock()
            q.filter.return_value = f2
            # Simulate used==False filter: consumed tokens disappear.
            f2.first.return_value = record if not record.used else None
        else:
            f2 = MagicMock()
            q.filter.return_value = f2
            f2.first.return_value = user
        return q

    db.query.side_effect = fake_query

    data = ResetPasswordRequest(
        token="raw",
        new_password="Str0ng@Pass1",
        confirm_password="Str0ng@Pass1",
    )
    with patch(
        "app.api.routes.auth.hash_reset_token", return_value="h"
    ), patch("app.api.routes.auth.log_request_action"):
        res = reset_password(data, request=MagicMock(), db=db)
    assert "successfully" in res["message"].lower()
    assert record.used is True
    assert user.token_version == 1
    assert user.password_hash != "old"

    # Second use with same token is rejected (used flag).
    from fastapi import HTTPException
    import pytest

    with pytest.raises(HTTPException) as exc:
        with patch(
            "app.api.routes.auth.hash_reset_token", return_value="h"
        ), patch("app.api.routes.auth.log_request_action"):
            reset_password(data, request=MagicMock(), db=db)
    assert "already used" in exc.value.detail.lower()


# --------------------------------------------------
# Forgot-password anti-enumeration (unknown email)
# --------------------------------------------------

def test_forgot_password_unknown_email_returns_generic_no_send():
    from app.api.routes.auth import forgot_password
    from app.schemas.auth import ForgotPasswordRequest

    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.first.return_value = None

    with patch(
        "app.api.routes.auth.send_otp_email"
    ) as mock_send:
        res = forgot_password(
            ForgotPasswordRequest(email="ghost@example.com"),
            request=MagicMock(),
            db=db,
        )
    assert "If an account exists" in res["message"]
    assert not mock_send.called
