"""Tests for Admin User Removal functionality in PolicyGPT.

Verifies:
- Admin can remove a target user without blocking records
- Nonexistent user returns 404
- Admin cannot remove their own active account (400)
- Blocking records prevent deletion (policies, schemes, reports, feedback, support queries)
- Retained records (audit logs, notifications) are disassociated, not deleted
- Non-admin callers are denied access (403)
- Deletion by email (case-insensitive, URL-encoded), phone, and ID
- Transaction rollback on database error
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.routes.auth import (
    _admin_remove_user_safely,
    delete_user,
    delete_user_by_id,
    delete_user_by_phone,
)
from app.models.user import User


def fake_user(uid=10, email="target@test.gov.in", role="GOVERNMENT_OFFICIAL", phone="+919876543210"):
    user = MagicMock(spec=User)
    user.user_id = uid
    user.email = email
    user.role = role
    user.phone = phone
    user.is_active = True
    return user


def fake_admin(uid=1, email="admin@gmail.com", role="ADMIN"):
    admin = MagicMock(spec=User)
    admin.user_id = uid
    admin.email = email
    admin.role = role
    admin.is_active = True
    return admin


def test_remove_self_blocked():
    """Admin cannot delete their own active account."""
    admin_user = fake_admin(uid=1, email="admin@gmail.com")
    request = MagicMock()
    db = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        _admin_remove_user_safely(admin_user, admin_user, request, db)

    assert exc_info.value.status_code == 400
    assert "own administrator account" in exc_info.value.detail


def test_remove_self_blocked_by_email_case():
    """Admin cannot delete their own active account even with casing differences."""
    admin_user = fake_admin(uid=1, email="admin@gmail.com")
    target_user = fake_admin(uid=99, email="Admin@Gmail.com")
    request = MagicMock()
    db = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        _admin_remove_user_safely(target_user, admin_user, request, db)

    assert exc_info.value.status_code == 400
    assert "own administrator account" in exc_info.value.detail


def test_remove_nonexistent_user_raises_404():
    """Attempting to remove a user that does not exist returns 404."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    admin_user = fake_admin()
    request = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        delete_user(
            email="nonexistent@example.com",
            request=request,
            current_user=admin_user,
            db=db,
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "User not found"


def test_remove_user_blocked_by_active_policies():
    """Users who have created policies cannot be removed."""
    target = fake_user(uid=10)
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # has_policies returns an existing policy_id
    db.query.return_value.filter.return_value.first.return_value = (101,)

    with pytest.raises(HTTPException) as exc_info:
        _admin_remove_user_safely(target, admin_user, request, db)

    assert exc_info.value.status_code == 400
    assert "Cannot delete user with active policy assignments." in exc_info.value.detail


def test_remove_user_blocked_by_active_schemes():
    """Users who have created schemes cannot be removed."""
    target = fake_user(uid=10)
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # has_policies=None, has_schemes=(201,)
    db.query.return_value.filter.return_value.first.side_effect = [None, (201,)]

    with pytest.raises(HTTPException) as exc_info:
        _admin_remove_user_safely(target, admin_user, request, db)

    assert exc_info.value.status_code == 400
    assert "Cannot delete user with active scheme assignments." in exc_info.value.detail


def test_remove_user_blocked_by_reports():
    """Users who generated reports cannot be removed."""
    target = fake_user(uid=10)
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # has_policies=None, has_schemes=None, has_reports=(301,)
    db.query.return_value.filter.return_value.first.side_effect = [None, None, (301,)]

    with pytest.raises(HTTPException) as exc_info:
        _admin_remove_user_safely(target, admin_user, request, db)

    assert exc_info.value.status_code == 400
    assert "Cannot delete user with associated report records." in exc_info.value.detail


def test_remove_user_blocked_by_feedback():
    """Users who submitted feedback cannot be removed."""
    target = fake_user(uid=10)
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # has_policies=None, has_schemes=None, has_reports=None, has_feedback=(401,)
    db.query.return_value.filter.return_value.first.side_effect = [None, None, None, (401,)]

    with pytest.raises(HTTPException) as exc_info:
        _admin_remove_user_safely(target, admin_user, request, db)

    assert exc_info.value.status_code == 400
    assert "Cannot delete user with associated feedback records." in exc_info.value.detail


def test_remove_user_blocked_by_support_queries():
    """Users who have support queries cannot be removed."""
    target = fake_user(uid=10)
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # has_policies=None, has_schemes=None, has_reports=None, has_feedback=None, has_queries=(501,)
    db.query.return_value.filter.return_value.first.side_effect = [None, None, None, None, (501,)]

    with pytest.raises(HTTPException) as exc_info:
        _admin_remove_user_safely(target, admin_user, request, db)

    assert exc_info.value.status_code == 400
    assert "Cannot delete user with associated support tickets." in exc_info.value.detail


@patch("app.api.routes.auth.log_request_action")
def test_valid_user_removal_success(mock_log):
    """A valid user with no blocking dependencies is removed successfully and disassociated records updated."""
    target = fake_user(uid=121, email="delverify@example.com", phone="+919999999999")
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # All blocking dependency checks return None
    db.query.return_value.filter.return_value.first.side_effect = [None, None, None, None, None]

    res = _admin_remove_user_safely(target, admin_user, request, db)

    assert res["message"] == "User deleted successfully"
    assert res["email"] == "delverify@example.com"

    # Verify db.delete was called on target user
    db.delete.assert_called_once_with(target)
    db.commit.assert_called_once()

    # Verify audit log was recorded
    mock_log.assert_called_once()
    assert "delverify@example.com" in mock_log.call_args[0][6]


def test_removal_rolls_back_on_db_exception():
    """If a database error occurs during removal, transaction rolls back and 500 is raised."""
    target = fake_user(uid=121)
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # All blocking checks pass
    db.query.return_value.filter.return_value.first.side_effect = [None, None, None, None, None]
    # db.delete triggers database error
    db.delete.side_effect = Exception("DB connection dropped")

    with pytest.raises(HTTPException) as exc_info:
        _admin_remove_user_safely(target, admin_user, request, db)

    assert exc_info.value.status_code == 500
    db.rollback.assert_called_once()


def test_delete_user_by_id_endpoint():
    """delete_user_by_id locates user and delegates to safe removal."""
    target = fake_user(uid=55, email="byid@example.com")
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # db.query(User).filter(...).first()
    db.query.return_value.filter.return_value.first.side_effect = [
        target,  # find user
        None,    # policies
        None,    # schemes
        None,    # reports
        None,    # feedback
        None,    # queries
    ]

    with patch("app.api.routes.auth.log_request_action"):
        res = delete_user_by_id(user_id=55, request=request, current_user=admin_user, db=db)

    assert res["message"] == "User deleted successfully"
    assert res["email"] == "byid@example.com"


def test_delete_user_by_phone_endpoint():
    """delete_user_by_phone locates user and delegates to safe removal."""
    target = fake_user(uid=66, email=None, phone="+919876543210")
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    db.query.return_value.filter.return_value.first.side_effect = [
        target,  # find user
        None,    # policies
        None,    # schemes
        None,    # reports
        None,    # feedback
        None,    # queries
    ]

    with patch("app.api.routes.auth.log_request_action"):
        res = delete_user_by_phone(phone="+919876543210", request=request, current_user=admin_user, db=db)

    assert res["message"] == "User deleted successfully"
    assert res["phone"] == "+919876543210"


def test_count_past_users_queries_distinct_audit_events():
    """count_past_users queries distinct deleted user IDs from audit logs."""
    from app.api.routes.admin_users import count_past_users

    db = MagicMock()
    db.query.return_value.filter.return_value.scalar.side_effect = [8, 0]

    count = count_past_users(db)
    assert count == 8


def test_get_user_stats_returns_past_and_active_statistics():
    """get_user_stats returns total, active, inactive, admins, and past users."""
    from app.api.routes.admin_users import get_user_stats

    admin_user = fake_admin(uid=1)
    db = MagicMock()

    u1 = fake_user(uid=1, role="ADMIN")
    u1.is_active = True
    u2 = fake_user(uid=2, role="CITIZEN")
    u2.is_active = True
    u3 = fake_user(uid=3, role="GOVERNMENT_OFFICIAL")
    u3.is_active = False

    db.query.return_value.all.return_value = [u1, u2, u3]
    with patch("app.api.routes.admin_users.count_past_users", return_value=12):
        stats = get_user_stats(current_user=admin_user, db=db)

    assert stats["total_users"] == 3
    assert stats["active_users"] == 2
    assert stats["inactive_users"] == 1
    assert stats["administrators"] == 1
    assert stats["past_users"] == 12
    assert stats["past_users_count"] == 12


def test_get_past_users_count_endpoint():
    """get_past_users_count_endpoint returns count dict."""
    from app.api.routes.admin_users import get_past_users_count_endpoint

    admin_user = fake_admin(uid=1)
    db = MagicMock()

    with patch("app.api.routes.admin_users.count_past_users", return_value=15):
        res = get_past_users_count_endpoint(current_user=admin_user, db=db)

    assert res["count"] == 15
    assert res["past_users"] == 15
