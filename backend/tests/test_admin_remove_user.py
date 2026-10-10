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


@patch("app.api.routes.auth.log_request_action")
def test_remove_user_with_reports_disassociates_and_succeeds(mock_log):
    """Users who generated reports can be removed; reports are disassociated (generated_by set to NULL), not deleted."""
    target = fake_user(uid=10, email="reporter@example.com")
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # Blocking checks (policies, schemes) pass
    db.query.return_value.filter.return_value.first.side_effect = [None, None]

    res = _admin_remove_user_safely(target, admin_user, request, db)

    assert res["message"] == "User deleted successfully"
    assert res["email"] == "reporter@example.com"
    db.delete.assert_called_once_with(target)
    db.commit.assert_called_once()

    executed_statements = [str(call[0][0]) for call in db.execute.call_args_list]
    assert any("UPDATE reports SET generated_by = NULL WHERE generated_by = :uid" in s for s in executed_statements)


@patch("app.api.routes.auth.log_request_action")
def test_remove_user_with_feedback_disassociates_and_succeeds(mock_log):
    """Users who submitted feedback can be removed; feedback is disassociated (user_id set to NULL), not deleted."""
    target = fake_user(uid=10, email="feedback_user@example.com")
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # Blocking checks (policies, schemes) pass
    db.query.return_value.filter.return_value.first.side_effect = [None, None]

    res = _admin_remove_user_safely(target, admin_user, request, db)

    assert res["message"] == "User deleted successfully"
    assert res["email"] == "feedback_user@example.com"
    db.delete.assert_called_once_with(target)
    db.commit.assert_called_once()

    executed_statements = [str(call[0][0]) for call in db.execute.call_args_list]
    assert any("UPDATE feedback SET user_id = NULL WHERE user_id = :uid" in s for s in executed_statements)


@patch("app.api.routes.auth.log_request_action")
def test_remove_user_with_support_queries_disassociates_and_succeeds(mock_log):
    """Users who have support queries can be removed; tickets and messages are disassociated, not deleted."""
    target = fake_user(uid=10, email="citizen_with_ticket@example.com")
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # Blocking checks: policies=None, schemes=None
    db.query.return_value.filter.return_value.first.side_effect = [None, None]

    res = _admin_remove_user_safely(target, admin_user, request, db)

    assert res["message"] == "User deleted successfully"
    assert res["email"] == "citizen_with_ticket@example.com"
    db.delete.assert_called_once_with(target)
    db.commit.assert_called_once()

    # Verify executed SQL disassociated support queries and support messages
    executed_statements = [str(call[0][0]) for call in db.execute.call_args_list]
    assert any("UPDATE support_queries SET user_id = NULL WHERE user_id = :uid" in s for s in executed_statements)
    assert any("UPDATE support_ticket_messages SET sender_id = NULL WHERE sender_id = :uid" in s for s in executed_statements)


@patch("app.api.routes.auth.log_request_action")
def test_remove_user_with_multiple_associated_records_succeeds(mock_log):
    """A user with reports, feedback, tickets, applications, and search history is safely removed."""
    target = fake_user(uid=88, email="multi_record@example.com")
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    db.query.return_value.filter.return_value.first.side_effect = [None, None]

    res = _admin_remove_user_safely(target, admin_user, request, db)

    assert res["message"] == "User deleted successfully"
    assert res["email"] == "multi_record@example.com"
    db.delete.assert_called_once_with(target)
    db.commit.assert_called_once()

    executed_statements = [str(call[0][0]) for call in db.execute.call_args_list]
    # Check disassociated accountability records
    assert any("UPDATE reports SET generated_by = NULL WHERE generated_by = :uid" in s for s in executed_statements)
    assert any("UPDATE feedback SET user_id = NULL WHERE user_id = :uid" in s for s in executed_statements)
    assert any("UPDATE support_queries SET user_id = NULL WHERE user_id = :uid" in s for s in executed_statements)
    assert any("UPDATE support_ticket_messages SET sender_id = NULL WHERE sender_id = :uid" in s for s in executed_statements)
    assert any("UPDATE scheme_applications SET user_id = NULL WHERE user_id = :uid" in s for s in executed_statements)
    # Check disposable personal records cleaned up
    assert any("DELETE FROM search_history WHERE user_id = :uid" in s for s in executed_statements)
    assert any("DELETE FROM saved_policies WHERE user_id = :uid" in s for s in executed_statements)


@patch("app.api.routes.auth.log_request_action")
def test_valid_user_removal_success(mock_log):
    """A valid user with no blocking dependencies is removed successfully and disassociated records updated."""
    target = fake_user(uid=121, email="delverify@example.com", phone="+919999999999")
    admin_user = fake_admin(uid=1)
    request = MagicMock()
    db = MagicMock()

    # Blocking checks (policies, schemes)
    db.query.return_value.filter.return_value.first.side_effect = [None, None]

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
    db.query.return_value.filter.return_value.first.side_effect = [None, None]
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


def test_non_admin_cannot_access_delete_user():
    """Citizens and non-admins are forbidden from invoking user removal."""
    from app.api.routes.auth import require_roles

    role_checker = require_roles("ADMIN")
    citizen = fake_user(uid=99, role="CITIZEN")

    with pytest.raises(HTTPException) as exc_info:
        role_checker(current_user=citizen)

    assert exc_info.value.status_code == 403
    assert "Access denied" in exc_info.value.detail


def test_check_user_removal_dependencies_with_authored_records():
    """check_user_removal_dependencies identifies authored policies and schemes as reassignable blockers."""
    from app.services.user_removal_service import check_user_removal_dependencies
    from app.models.policy import Policy
    from app.models.scheme import Scheme

    target = fake_user(uid=138, email="official@test.gov.in")
    admin = fake_admin(uid=1)
    db = MagicMock()

    mock_policy = MagicMock(spec=Policy)
    mock_policy.policy_id = 127
    mock_policy.title = "Green Hydrogen Initiative"
    mock_policy.status = "APPROVED"
    mock_policy.created_by = 138
    mock_policy.approved_by = None
    mock_policy.archive_requested_by = None
    mock_policy.delete_requested_by = None

    mock_scheme = MagicMock(spec=Scheme)
    mock_scheme.scheme_id = 55
    mock_scheme.name = "Solar Subsidy Scheme"
    mock_scheme.status = "PENDING"
    mock_scheme.created_by = 138
    mock_scheme.approved_by = None
    mock_scheme.archive_requested_by = None
    mock_scheme.delete_requested_by = None

    eligible_gov = fake_user(uid=4, email="govt@gmail.com", role="GOVERNMENT_OFFICIAL")

    # First query for policies, second for schemes, third for candidates
    db.query.return_value.filter.return_value.all.side_effect = [
        [mock_policy],
        [mock_scheme],
    ]
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [eligible_gov]

    res = check_user_removal_dependencies(target, admin, db)

    assert res["can_remove"] is False
    assert len(res["blockers"]) == 2
    assert res["reassignable_count"] == 2
    assert res["unreassignable_count"] == 0
    assert res["blockers"][0]["entity_type"] == "POLICY"
    assert res["blockers"][0]["entity_id"] == 127
    assert res["blockers"][0]["title"] == "Green Hydrogen Initiative"
    assert res["blockers"][0]["relationship"] == "Author"
    assert res["blockers"][0]["can_reassign"] is True
    assert res["blockers"][1]["entity_type"] == "SCHEME"
    assert res["blockers"][1]["entity_id"] == 55
    assert len(res["eligible_officials"]) == 1
    assert res["eligible_officials"][0]["user_id"] == 4


def test_reassign_user_ownership_updates_records_and_logs():
    """reassign_user_ownership reassigns policy and scheme ownership to target official."""
    from app.services.user_removal_service import reassign_user_ownership
    from app.models.policy import Policy
    from app.models.scheme import Scheme

    source = fake_user(uid=138, email="source@test.gov.in")
    target = fake_user(uid=4, email="target@test.gov.in", role="GOVERNMENT_OFFICIAL")
    admin = fake_admin(uid=1)
    db = MagicMock()
    request = MagicMock()

    mock_policy = MagicMock(spec=Policy)
    mock_policy.policy_id = 127
    mock_policy.title = "Green Hydrogen Initiative"
    mock_policy.created_by = 138

    mock_scheme = MagicMock(spec=Scheme)
    mock_scheme.scheme_id = 55
    mock_scheme.name = "Solar Subsidy Scheme"
    mock_scheme.created_by = 138

    # authored policies, policy requests, authored schemes, scheme requests
    db.query.return_value.filter.return_value.all.side_effect = [
        [mock_policy],
        [],
        [mock_scheme],
        [],
    ]

    with patch("app.api.routes.auth.log_request_action") as mock_log:
        res = reassign_user_ownership(source, target, admin, request, db)

    assert mock_policy.created_by == 4
    assert mock_scheme.created_by == 4
    assert db.commit.called
    assert res["reassigned_policies"] == 1
    assert res["reassigned_schemes"] == 1
    assert mock_log.call_count == 2


def test_reassign_ownership_endpoint_requires_confirmation():
    """reassign_user_ownership_endpoint raises 400 when confirm is False."""
    from app.api.routes.admin_users import (
        reassign_user_ownership_endpoint,
        ReassignOwnershipRequest,
    )

    admin = fake_admin(uid=1)
    db = MagicMock()
    request = MagicMock()

    payload = ReassignOwnershipRequest(
        source_user_email="official@test.gov.in",
        target_user_id=4,
        confirm=False,
    )

    with pytest.raises(HTTPException) as exc_info:
        reassign_user_ownership_endpoint(payload, request, admin, db)

    assert exc_info.value.status_code == 400
    assert "Explicit confirmation is required" in exc_info.value.detail


def test_delete_user_with_reassign_to_user_id():
    """delete_user endpoint atomically reassigns ownership and deletes user when reassign_to_user_id is provided."""
    source = fake_user(uid=138, email="official@test.gov.in")
    target_gov = fake_user(uid=4, email="new_official@test.gov.in", role="GOVERNMENT_OFFICIAL")
    admin = fake_admin(uid=1)
    db = MagicMock()
    request = MagicMock()

    # Query for user by email, query for target_official by user_id, has_approver (policy, scheme)
    db.query.return_value.filter.return_value.first.side_effect = [
        source,
        target_gov,
        None,
        None,
    ]
    # Reassign queries (policies, policy requests, schemes, scheme requests)
    db.query.return_value.filter.return_value.all.side_effect = [
        [],
        [],
        [],
        [],
    ]

    with patch("app.api.routes.auth.log_request_action"):
        res = delete_user(
            email="official@test.gov.in",
            request=request,
            reassign_to_user_id=4,
            current_user=admin,
            db=db,
        )

    assert res["message"] == "User deleted successfully"
    db.delete.assert_called_once_with(source)
    db.commit.assert_called_once()

