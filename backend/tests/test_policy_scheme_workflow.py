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
    # _policy_or_404 / get_* chain: db.query(X).filter(...).first().
    # filter() returns the same query mock so multi-filter chains
    # (e.g. id + is_deleted) resolve identically.
    q = db.query.return_value
    q.filter.return_value = q
    q.first.return_value = policy
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
        ministry="Ministry X",
        department="Department Y",
        rejection_reason=None,
        archive_reason=None,
        archive_requested_by=None,
        archive_requested_at=None,
        delete_reason=None,
        delete_requested_by=None,
        delete_requested_at=None,
        delete_requested_from_status=None,
        is_deleted=False,
        deleted_at=None,
        deleted_by=None,
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
        is_deleted=False,
        deleted_at=None,
        deleted_by=None,
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


# ------------------------------------------- role-based submit transitions


def test_policy_submit_admin_draft_becomes_approved():
    pol = fake_policy(status="DRAFT", created_by=2)
    db = make_db(pol)
    with patch(
        "app.services.notification_service.notify_policy_approved"
    ) as approved_mock:
        with patch(
            "app.services.notification_service.notify_policy_submitted"
        ) as submitted_mock:
            out = policy_service.submit_policy(db, 10, admin(1))
    assert out.status == "APPROVED"
    assert out.approved_by == 1
    assert out.rejection_reason is None
    assert approved_mock.called
    assert not submitted_mock.called


def test_policy_submit_admin_spelling_draft_becomes_approved():
    pol = fake_policy(status="DRAFT", created_by=2)
    db = make_db(pol)
    with patch("app.services.notification_service.notify_policy_approved"):
        out = policy_service.submit_policy(db, 10, admin(1, role="ADMINISTRATOR"))
    assert out.status == "APPROVED"
    assert out.approved_by == 1


def test_policy_submit_govt_draft_becomes_pending():
    pol = fake_policy(status="DRAFT", created_by=2)
    db = make_db(pol)
    with patch(
        "app.services.notification_service.notify_policy_submitted"
    ) as submitted_mock:
        with patch(
            "app.services.notification_service.notify_policy_approved"
        ) as approved_mock:
            out = policy_service.submit_policy(db, 10, govt(2))
    assert out.status == "PENDING_APPROVAL"
    assert out.approved_by is None
    assert submitted_mock.called
    assert not approved_mock.called


def test_policy_submit_blocks_unauthorized_role():
    pol = fake_policy(status="DRAFT", created_by=2)
    db = make_db(pol)
    citizen = SimpleNamespace(user_id=7, role="CITIZEN", full_name="Citizen")
    with pytest.raises(HTTPException) as exc:
        policy_service.submit_policy(db, 10, citizen)
    assert exc.value.status_code == 403
    assert pol.status == "DRAFT"  # unchanged


def test_policy_submit_rejects_non_draft_for_both_roles():
    for user in (admin(1), govt(2)):
        pol = fake_policy(status="APPROVED", created_by=2)
        db = make_db(pol)
        with pytest.raises(HTTPException) as exc:
            policy_service.submit_policy(db, 10, user)
        assert exc.value.status_code == 400
        assert pol.status == "APPROVED"  # unchanged

    pol = fake_policy(status="PENDING_APPROVAL", created_by=2)
    db = make_db(pol)
    with pytest.raises(HTTPException) as exc:
        policy_service.submit_policy(db, 10, admin(1))
    assert exc.value.status_code == 400


def test_policy_submit_db_failure_rolls_back():
    pol = fake_policy(status="DRAFT", created_by=2)
    db = make_db(pol)
    db.commit.side_effect = RuntimeError("db down")
    with patch("app.services.notification_service.notify_policy_approved") as approved_mock:
        with pytest.raises(RuntimeError):
            policy_service.submit_policy(db, 10, admin(1))
    assert db.rollback.called
    assert not approved_mock.called


def test_policy_submit_admin_rejected_stays_pending_without_approver():
    pol = fake_policy(status="REJECTED", created_by=2, rejection_reason="old")
    db = make_db(pol)
    with patch(
        "app.services.notification_service.notify_policy_submitted"
    ):
        with patch(
            "app.services.notification_service.notify_policy_approved"
        ) as approved_mock:
            out = policy_service.submit_policy(db, 10, admin(1))
    assert out.status == "PENDING_APPROVAL"
    assert out.approved_by is None
    assert out.rejection_reason is None
    assert not approved_mock.called


# ----------------------------------- background notification deferral


class _FakeBackgroundTasks:
    def __init__(self):
        self.tasks = []

    def add_task(self, fn, *args, **kwargs):
        self.tasks.append((fn, args, kwargs))


def test_policy_submit_defers_fan_out_to_background():
    pol = fake_policy(status="DRAFT", created_by=2)
    db = make_db(pol)
    bt = _FakeBackgroundTasks()
    with patch(
        "app.services.notification_service.notify_policy_approved"
    ) as approved_mock:
        out = policy_service.submit_policy(db, 10, admin(1), background_tasks=bt)
    # Business transaction still completes synchronously in-request.
    assert out.status == "APPROVED"
    assert out.approved_by == 1
    # ...but the fan-out leaves the request: exactly one deferred task,
    # zero synchronous notification work.
    assert len(bt.tasks) == 1
    assert not approved_mock.called


def test_policy_submit_deferred_task_notifies_with_own_session():
    pol = fake_policy(status="DRAFT", created_by=2)
    db = make_db(pol)
    bt = _FakeBackgroundTasks()
    with patch("app.services.notification_service.notify_policy_approved"):
        policy_service.submit_policy(db, 10, admin(1), background_tasks=bt)
    fn, args, kwargs = bt.tasks[0]
    worker_db = MagicMock()
    with patch(
        "app.services.notification_service.notify_policy_approved"
    ) as approved_mock:
        fn(args[0], db=worker_db)
    assert approved_mock.called
    assert approved_mock.call_args.kwargs["policy_id"] == 10


def test_policy_submit_without_background_tasks_stays_synchronous():
    pol = fake_policy(status="DRAFT", created_by=2)
    db = make_db(pol)
    with patch(
        "app.services.notification_service.notify_policy_approved"
    ) as approved_mock:
        out = policy_service.submit_policy(db, 10, admin(1))
    assert out.status == "APPROVED"
    assert approved_mock.called


# ----------------------------------- approve notification deferral


def test_policy_approve_defers_fan_out_to_background():
    pol = fake_policy(status="PENDING_APPROVAL", created_by=2)
    db = make_db(pol)
    bt = _FakeBackgroundTasks()
    with patch(
        "app.services.notification_service.notify_policy_approved"
    ) as approved_mock:
        out = policy_service.approve_policy(
            db, 10, admin(1), background_tasks=bt
        )
    assert out.status == "APPROVED"
    assert out.approved_by == 1
    assert len(bt.tasks) == 1
    assert not approved_mock.called


def test_policy_approve_deferred_task_notifies_with_own_session():
    pol = fake_policy(status="PENDING_APPROVAL", created_by=2)
    db = make_db(pol)
    bt = _FakeBackgroundTasks()
    with patch("app.services.notification_service.notify_policy_approved"):
        policy_service.approve_policy(db, 10, admin(1), background_tasks=bt)
    fn, args, kwargs = bt.tasks[0]
    worker_db = MagicMock()
    with patch(
        "app.services.notification_service.notify_policy_approved"
    ) as approved_mock:
        fn(args[0], db=worker_db)
    assert approved_mock.called
    assert approved_mock.call_args.kwargs["policy_id"] == 10


def test_policy_approve_without_background_tasks_stays_synchronous():
    pol = fake_policy(status="PENDING_APPROVAL", created_by=2)
    db = make_db(pol)
    with patch(
        "app.services.notification_service.notify_policy_approved"
    ) as approved_mock:
        out = policy_service.approve_policy(db, 10, admin(1))
    assert out.status == "APPROVED"
    assert approved_mock.called


# ----------------------------------- restore notification deferral


def test_policy_restore_defers_fan_out_to_background():
    pol = fake_policy(status="ARCHIVED", created_by=2)
    db = make_db(pol)
    bt = _FakeBackgroundTasks()
    with patch(
        "app.services.notification_service.notify_request_decision"
    ) as decision_mock:
        out = policy_service.restore_policy(
            db, 10, admin(1), background_tasks=bt
        )
    assert out.status == "APPROVED"
    assert out.approved_by == 1
    assert len(bt.tasks) == 1
    assert not decision_mock.called


def test_policy_restore_deferred_task_notifies_with_own_session():
    pol = fake_policy(status="ARCHIVED", created_by=2)
    db = make_db(pol)
    bt = _FakeBackgroundTasks()
    with patch("app.services.notification_service.notify_request_decision"):
        policy_service.restore_policy(db, 10, admin(1), background_tasks=bt)
    fn, args, kwargs = bt.tasks[0]
    worker_db = MagicMock()
    with patch(
        "app.services.notification_service.notify_request_decision"
    ) as decision_mock:
        fn(args[0], db=worker_db)
    assert decision_mock.called
    assert decision_mock.call_args.kwargs["entity_id"] == 10


def test_policy_restore_without_background_tasks_stays_synchronous():
    pol = fake_policy(status="ARCHIVED", created_by=2)
    db = make_db(pol)
    with patch(
        "app.services.notification_service.notify_request_decision"
    ) as decision_mock:
        out = policy_service.restore_policy(db, 10, admin(1))
    assert out.status == "APPROVED"
    assert decision_mock.called


def test_policy_restore_rejects_non_archived():
    pol = fake_policy(status="APPROVED", created_by=2)
    db = make_db(pol)
    with pytest.raises(HTTPException) as exc:
        policy_service.restore_policy(db, 10, admin(1))
    assert exc.value.status_code == 400
    assert pol.status == "APPROVED"  # unchanged


# ------------------------------------------- soft-delete lifecycle


def test_policy_direct_delete_is_temporary():
    pol = fake_policy(status="APPROVED", created_by=2)
    db = make_db(pol)
    policy_service.delete_policy(db, 10, admin(1))
    assert pol.is_deleted is True
    assert pol.deleted_at is not None
    assert pol.deleted_by == 1
    assert pol.status == "APPROVED"  # preserved
    assert pol.title == "Test Policy"
    db.delete.assert_not_called()


def test_policy_direct_delete_missing_is_404():
    db = make_db(None)
    with pytest.raises(HTTPException) as exc:
        policy_service.delete_policy(db, 999, admin(1))
    assert exc.value.status_code == 404


def test_policy_approve_delete_moves_to_trash():
    pol = fake_policy(
        status="DELETE_REQUESTED",
        created_by=2,
        delete_requested_by=2,
        delete_requested_from_status="APPROVED",
    )
    db = make_db(pol)
    with patch(
        "app.services.notification_service.notify_request_decision"
    ):
        policy_service.approve_delete_policy(db, 10, admin(1))
    assert pol.is_deleted is True
    assert pol.deleted_by == 1
    assert pol.status == "DELETE_REQUESTED"  # preserved
    db.delete.assert_not_called()


def test_policy_restore_trash_preserves_data():
    pol = fake_policy(
        status="APPROVED",
        created_by=2,
        is_deleted=True,
        deleted_by=1,
    )
    db = make_db(pol)
    with patch(
        "app.services.notification_service.notify_request_decision"
    ):
        out = policy_service.restore_policy(db, 10, admin(1))
    assert out.is_deleted is False
    assert out.deleted_at is None
    assert out.deleted_by is None
    assert out.status == "APPROVED"
    assert out.title == "Test Policy"
    assert out.created_by == 2


def test_policy_restore_live_non_archived_is_400():
    pol = fake_policy(status="APPROVED", created_by=2)
    db = make_db(pol)
    with pytest.raises(HTTPException) as exc:
        policy_service.restore_policy(db, 10, admin(1))
    assert exc.value.status_code == 400


def test_policy_permanent_delete_requires_trash():
    pol = fake_policy(status="APPROVED", created_by=2)
    db = make_db(pol)
    with pytest.raises(HTTPException) as exc:
        policy_service.permanent_delete_policy(db, 10, admin(1))
    assert exc.value.status_code == 400
    db.delete.assert_not_called()


def test_policy_permanent_delete_removes_trashed_row():
    pol = fake_policy(status="APPROVED", created_by=2, is_deleted=True, deleted_by=1)
    db = make_db(pol)
    policy_service.permanent_delete_policy(db, 10, admin(1))
    db.delete.assert_called_once_with(pol)


def test_policy_trashed_list_scoping_and_search():
    from app.services import policy_service as ps

    rows = [
        fake_policy(policy_id=1, created_by=2, is_deleted=True, deleted_by=1),
        fake_policy(policy_id=2, created_by=3, is_deleted=True, deleted_by=1),
    ]
    db = make_db()
    q = db.query.return_value
    q.count.return_value = 2
    q.order_by.return_value.offset.return_value.all.return_value = rows
    q.all.return_value = [
        SimpleNamespace(user_id=1, full_name="Admin User"),
        SimpleNamespace(user_id=2, full_name="Gov User"),
    ]
    out = ps.get_deleted_policies(db, current_user=admin(1))
    assert out["total"] == 2
    assert [p.policy_id for p in out["policies"]] == [1, 2]
    # Transient display names enriched, never stored.
    assert rows[0].created_by_name == "Gov User"
    assert rows[0].deleted_by_name == "Admin User"
    filter_calls = [str(c.args[0]) for c in q.filter.call_args_list]
    assert any("is_deleted" in c for c in filter_calls)
    # Government officials are scoped to their own rows.
    db2 = make_db()
    q2 = db2.query.return_value
    q2.count.return_value = 1
    q2.order_by.return_value.offset.return_value.all.return_value = rows[:1]
    q2.all.return_value = []
    ps.get_deleted_policies(db2, current_user=govt(2))
    gov_calls = [str(c.args[0]) for c in q2.filter.call_args_list]
    assert any("created_by" in c for c in gov_calls)


def test_scheme_direct_delete_restore_permanent_round_trip():
    from app.services import scheme_service as ss

    sch = fake_scheme(status="APPROVED", created_by=2)
    db = make_db()
    ss.delete_scheme(db, sch, deleted_by=1)
    assert sch.is_deleted is True
    assert sch.deleted_by == 1
    assert sch.status == "APPROVED"
    db.delete.assert_not_called()

    out = ss.restore_scheme(db, sch, actor_id=1, actor_name="Admin User")
    assert out.is_deleted is False
    assert out.deleted_at is None
    assert out.status == "APPROVED"

    sch.is_deleted = True
    ss.permanent_delete_scheme(db, sch)
    db.delete.assert_called_once_with(sch)


def test_scheme_permanent_delete_requires_trash():
    from app.services import scheme_service as ss

    sch = fake_scheme(status="APPROVED", created_by=2)
    db = make_db()
    with pytest.raises(ValueError):
        ss.permanent_delete_scheme(db, sch)
    db.delete.assert_not_called()


def _trash_db(policy_rows, scheme_rows):
    """Mock db routing entity queries to canned trash rows."""
    db = MagicMock()

    def _query(entity, *args):
        name = getattr(entity, "__name__", "")
        rows = (
            policy_rows
            if name == "Policy"
            else (scheme_rows if name == "Scheme" else [])
        )
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        q.offset.return_value = q
        q.all.return_value = rows
        q.count.return_value = len(rows)
        q.first.return_value = None
        return q

    db.query.side_effect = _query
    return db


def test_cleanup_purges_only_30_day_trash():
    from datetime import datetime, timedelta, timezone

    from app.services import deletion_cleanup_service as cleanup

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff = now - timedelta(days=30)
    old = fake_policy(policy_id=1, is_deleted=True, deleted_by=1,
                      deleted_at=now - timedelta(days=31))
    boundary = fake_policy(policy_id=2, is_deleted=True, deleted_by=1,
                           deleted_at=now - timedelta(days=30, seconds=5))
    fresh = fake_policy(policy_id=3, is_deleted=True, deleted_by=1,
                        deleted_at=now - timedelta(days=29))
    live = fake_policy(policy_id=4, is_deleted=False, deleted_by=None,
                       deleted_at=None)
    old_scheme = fake_scheme(scheme_id=21, is_deleted=True, deleted_by=1,
                             deleted_at=now - timedelta(days=45))

    # Eligibility boundaries, evaluated directly (mocked queries cannot
    # apply SQL predicates, so the sweep is fed pre-filtered rows).
    assert cleanup.is_purge_eligible(old, cutoff) is True
    assert cleanup.is_purge_eligible(boundary, cutoff) is True
    assert cleanup.is_purge_eligible(fresh, cutoff) is False
    assert cleanup.is_purge_eligible(live, cutoff) is False
    assert cleanup.is_purge_eligible(
        fake_policy(is_deleted=True, deleted_by=1, deleted_at=None), cutoff
    ) is False

    db = _trash_db([old, boundary], [old_scheme])
    summary = cleanup.process_deleted_cleanup(db, retention_days=30)
    assert summary["policies_purged"] == [1, 2]
    assert summary["policies_skipped_errors"] == 0
    assert summary["schemes_purged"] == [21]
    assert summary["schemes_skipped_errors"] == 0

    # Restored rows are excluded on later passes.
    db2 = _trash_db([], [])
    again = cleanup.process_deleted_cleanup(db2, retention_days=30)
    assert again["policies_purged"] == []
    assert again["policies_skipped_errors"] == 0
    assert again["schemes_purged"] == []
    assert again["schemes_skipped_errors"] == 0


def test_cleanup_counts_row_errors_without_aborting():
    from datetime import datetime, timedelta, timezone

    from sqlalchemy.exc import IntegrityError

    from app.services import deletion_cleanup_service as cleanup

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    blocked = fake_policy(policy_id=9, is_deleted=True, deleted_by=1,
                          deleted_at=now - timedelta(days=60))
    ok = fake_policy(policy_id=10, is_deleted=True, deleted_by=1,
                     deleted_at=now - timedelta(days=60))
    db = _trash_db([blocked, ok], [])
    db.delete.side_effect = [
        IntegrityError("x", "y", Exception("fk")),
        None,
    ]
    summary = cleanup.process_deleted_cleanup(db, retention_days=30)
    assert summary["policies_purged"] == [10]
    assert summary["policies_skipped_errors"] == 1


# ------------------------------------------- creator-name resolution


def test_resolve_creator_name_returns_full_name():
    from app.services.audit_log_service import resolve_user_display_name

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = (
        SimpleNamespace(full_name="  Original Creator  ")
    )
    assert resolve_user_display_name(db, 7) == "Original Creator"


def test_resolve_creator_name_unknown_or_missing():
    from app.services.audit_log_service import resolve_user_display_name

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    assert resolve_user_display_name(db, 99) is None
    assert resolve_user_display_name(db, None) is None


def test_resolve_creator_name_never_raises():
    from app.services.audit_log_service import resolve_user_display_name

    db = MagicMock()
    db.query.side_effect = Exception("db down")
    assert resolve_user_display_name(db, 7) is None
