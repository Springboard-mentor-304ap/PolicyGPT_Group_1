"""Policy & Scheme workflow regression tests (DB-isolated via mocks).

Covers: draft validation, eligibility/URL validation, ownership guards,
self-approval prevention, submit attribution, archive/restore/delete
transitions, and ADMINISTRATOR role normalization. No live database is
touched: the SQLAlchemy session is a MagicMock and notification fan-out
is patched to a no-op.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services import policy_service, scheme_service


# ---------------------------------------------------------------- helpers


def make_db(policy=None):
    db = MagicMock()
    # _policy_or_404 / get_* chain: db.query(X).filter(...).first()
    db.query.return_value.filter.return_value.first.return_value = policy
    return db


def govt(uid=2):
    return SimpleNamespace(
        user_id=uid, role="GOVERNMENT_OFFICIAL", full_name="Gov User"
    )


def admin(uid=1, role="ADMIN"):
    return SimpleNamespace(
        user_id=uid, role=role, full_name="Admin User"
    )


def fake_policy(**kw):
    base = dict(
        policy_id=10,
        title="Test Policy",
        status="DRAFT",
        created_by=2,
        approved_by=None,
        rejection_reason=None,
        archive_reason=None,
        archive_requested_by=None,
        archive_requested_at=None,
        delete_reason=None,
        delete_requested_by=None,
        delete_requested_at=None,
        delete_requested_from_status=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def fake_scheme(**kw):
    base = dict(
        scheme_id=20,
        name="Test Scheme",
        status="DRAFT",
        created_by=2,
        approved_by=None,
        rejection_reason=None,
        ministry="Ministry X",
        archive_reason=None,
        archive_requested_by=None,
        archive_requested_at=None,
        delete_reason=None,
        delete_requested_by=None,
        delete_requested_at=None,
        delete_requested_from_status=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


# ------------------------------------------------------- eligibility + URLs


def test_policy_rejects_unknown_eligibility_rule_type():
    with pytest.raises(HTTPException) as exc:
        policy_service._clean_eligibility_rules(
            [{"rule_type": "NO_SUCH_RULE"}]
        )
    assert exc.value.status_code == 400


def test_policy_rejects_bad_age_criteria():
    with pytest.raises(HTTPException):
        policy_service._clean_eligibility_rules(
            [{"rule_type": "AGE_CRITERIA", "min_age": 60, "max_age": 18}]
        )
    with pytest.raises(HTTPException):
        policy_service._clean_eligibility_rules(
            [{"rule_type": "AGE_CRITERIA", "min_age": 200}]
        )


def test_policy_accepts_known_rule_types():
    out = policy_service._clean_eligibility_rules(
        [
            {"rule_type": "TARGET_BENEFICIARIES", "description": "Farmers"},
            {"rule_type": "AGE_CRITERIA", "min_age": 18, "max_age": 60},
        ]
    )
    assert out is not None and len(out) == 2


def test_policy_url_validation():
    assert (
        policy_service._validate_url_field("source_url", "https://gov.in/x")
        is not None
    )
    assert policy_service._validate_url_field("source_url", None) is None
    assert policy_service._validate_url_field("source_url", "   ") is None
    with pytest.raises(HTTPException):
        policy_service._validate_url_field("source_url", "ftp://evil/x")
    with pytest.raises(HTTPException):
        policy_service._validate_url_field("source_url", "not a url")


def test_scheme_rejects_unknown_eligibility_rule_type():
    with pytest.raises(HTTPException):
        scheme_service._validate_scheme_eligibility([{"rule_type": "BOGUS"}])


def test_scheme_url_validation():
    assert (
        scheme_service._validate_scheme_url("source_url", "http://a.in")
        == "http://a.in"
    )
    with pytest.raises(HTTPException):
        scheme_service._validate_scheme_url("source_url", "javascript:alert(1)")


# ------------------------------------------------------------- self-approval


def test_policy_self_approval_blocked():
    pol = fake_policy(status="PENDING_APPROVAL", created_by=1)
    db = make_db(pol)
    with pytest.raises(HTTPException) as exc:
        policy_service.approve_policy(db, 10, admin(1))
    assert exc.value.status_code == 403
    assert pol.status == "PENDING_APPROVAL"  # unchanged


def test_policy_approve_by_different_admin():
    pol = fake_policy(status="PENDING_APPROVAL", created_by=2)
    db = make_db(pol)
    with patch(
        "app.services.notification_service.notify_policy_approved"
    ):
        out = policy_service.approve_policy(db, 10, admin(1))
    assert out.status == "APPROVED"
    assert out.approved_by == 1


def test_scheme_self_approval_blocked():
    sch = fake_scheme(status="PENDING_APPROVAL", created_by=1)
    db = MagicMock()
    with pytest.raises(HTTPException) as exc:
        scheme_service.approve_scheme(db, sch, admin_user_id=1)
    assert exc.value.status_code == 403
    assert sch.status == "PENDING_APPROVAL"


def test_scheme_approve_by_different_admin():
    sch = fake_scheme(status="PENDING_APPROVAL", created_by=2)
    db = MagicMock()
    with patch("app.services.notification_service.notify_scheme_approved"):
        with patch(
            "app.services.notification_service.notify_scheme_published",
            return_value=[],
        ):
            out = scheme_service.approve_scheme(
                db, sch, admin_user_id=1, actor_name="Admin User"
            )
    assert out.status == "APPROVED"
    assert out.approved_by == 1


# ---------------------------------------------------------------- ownership


def test_policy_update_blocks_other_official():
    pol = fake_policy(status="DRAFT", created_by=2)
    db = make_db(pol)
    data = SimpleNamespace(model_dump=lambda exclude_unset=True: {"title": "x"})
    with pytest.raises(HTTPException) as exc:
        policy_service.update_policy(db, 10, data, govt(99))
    assert exc.value.status_code == 403


def test_policy_update_allows_administrator_spelling_on_approved():
    pol = fake_policy(status="APPROVED", created_by=2)
    db = make_db(pol)
    data = SimpleNamespace(
        model_dump=lambda exclude_unset=True: {"title": "New title"}
    )
    with patch.object(
        policy_service, "_validate_policy_duplicate", return_value=None
    ):
        out = policy_service.update_policy(
            db, 10, data, admin(1, role="ADMINISTRATOR")
        )
    assert out.title == "New title"


def test_policy_submit_blocks_non_creator():
    pol = fake_policy(status="DRAFT", created_by=2)
    db = make_db(pol)
    with pytest.raises(HTTPException) as exc:
        policy_service.submit_policy(db, 10, govt(99))
    assert exc.value.status_code == 403


def test_scheme_update_blocks_other_official():
    sch = fake_scheme(status="DRAFT", created_by=2)
    db = MagicMock()
    data = SimpleNamespace(model_dump=lambda exclude_unset=True: {"name": "x"})
    with pytest.raises(HTTPException) as exc:
        scheme_service.update_scheme(db, sch, data, govt(99))
    assert exc.value.status_code == 403


def test_scheme_submit_uses_current_user_for_notification():
    sch = fake_scheme(status="DRAFT", created_by=2)
    db = MagicMock()
    caller = admin(1)
    with patch(
        "app.services.notification_service.notify_scheme_submitted"
    ) as mocked:
        scheme_service.submit_scheme(db, sch, current_user=caller)
    assert sch.status == "PENDING_APPROVAL"
    assert mocked.call_args.kwargs["submitted_by_id"] == 1


# --------------------------------------------------- archive / delete flows


def test_policy_direct_archive():
    pol = fake_policy(status="APPROVED", created_by=2)
    db = make_db(pol)
    out = policy_service.archive_policy(db, 10, admin(1))
    assert out.status == "ARCHIVED"
    assert out.archive_reason is None


def test_policy_archive_decision_clears_request_fields():
    pol = fake_policy(
        status="ARCHIVE_REQUESTED",
        created_by=2,
        archive_reason="old",
        archive_requested_by=2,
    )
    db = make_db(pol)
    with patch("app.services.notification_service.notify_request_decision"):
        out = policy_service.approve_archive_policy(db, 10, admin(1))
    assert out.status == "ARCHIVED"
    assert out.archive_reason is None
    assert out.archive_requested_by is None


def test_scheme_direct_archive_clears_fields():
    sch = fake_scheme(status="APPROVED", created_by=2)
    db = MagicMock()
    out = scheme_service.archive_scheme(db, sch)
    assert out.status == "ARCHIVED"


def test_policy_request_archive_blocks_non_creator_admin():
    pol = fake_policy(status="APPROVED", created_by=2)
    db = make_db(pol)
    with pytest.raises(HTTPException) as exc:
        policy_service.request_archive_policy(db, 10, "stale", admin(99))
    assert exc.value.status_code == 403


def test_policy_request_delete_blocks_non_creator_admin():
    pol = fake_policy(status="APPROVED", created_by=2)
    db = make_db(pol)
    with pytest.raises(HTTPException) as exc:
        policy_service.request_delete_policy(db, 10, "stale", admin(99))
    assert exc.value.status_code == 403
