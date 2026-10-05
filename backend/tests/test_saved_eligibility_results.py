"""Saved eligibility results: isolation + ownership tests (no live DB).

Proves via the real FastAPI router with overridden auth/DB dependencies
and via the service with a mocked session:
1. Citizen A saves results; Citizen B sees none (list isolation).
2. Citizen B cannot read Citizen A's row by ID (404, no IDOR oracle).
3. Citizen B cannot delete Citizen A's row (404).
4. Duplicate saves are idempotent (existing row returned).
5. Guest role is rejected (403); unauthenticated is rejected (401).
6. Service derives identity from caller args, stores a server-evaluated
   outcome, and never trusts client-side eligibility flags.
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.routes.auth import get_current_user
from app.api.routes.eligibility import require_saved_results_role
from app.db.database import get_db
from app.models.user import User


def _user(user_id, role="CITIZEN"):
    return User(
        user_id=user_id,
        full_name=f"User {user_id}",
        email=f"user{user_id}@example.com",
        role=role,
        is_active=True,
    )


def _client_for(user=None):
    app.dependency_overrides.clear()
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: MagicMock()
    return TestClient(app, raise_server_exceptions=False)


def teardown_function():
    app.dependency_overrides.clear()


ROW_A1 = {
    "saved_id": 1,
    "entity_type": "scheme",
    "entity_id": 60,
    "entity_name": "S1",
    "eligible": True,
    "message": "You are eligible for this scheme.",
    "profile_data": {"age": 30, "gender": "Female"},
    "saved_at": "2026-01-01T00:00:00",
}
ROW_A2 = {
    "saved_id": 2,
    "entity_type": "policy",
    "entity_id": 50,
    "entity_name": "P1",
    "eligible": False,
    "message": "You are not eligible for this policy.",
    "profile_data": {"age": 30, "gender": "Female"},
    "saved_at": "2026-01-02T00:00:00",
}


def _profile():
    from app.schemas.eligibility import EligibilityProfile

    return EligibilityProfile(
        age=30,
        gender="Female",
        annual_income=250000,
        occupation="Student",
        education="Graduate",
        state="West Bengal",
        social_category="General",
        disability_status=False,
    )


# --------------------------------------------------
# Router isolation (mocked service, real auth wiring)
# --------------------------------------------------


def test_citizen_a_lists_two_citizen_b_lists_zero():
    from app.services import eligibility_saved_service as svc

    calls = []

    def fake_list(db, user_id):
        calls.append(user_id)
        return [ROW_A1, ROW_A2] if user_id == 10 else []

    with patch.object(svc, "list_saved_results", side_effect=fake_list):
        ra = _client_for(_user(10)).get("/eligibility/saved")
        rb = _client_for(_user(20)).get("/eligibility/saved")
    assert ra.status_code == 200
    assert [r["saved_id"] for r in ra.json()] == [1, 2]
    assert rb.status_code == 200
    assert rb.json() == []
    assert sorted(calls) == [10, 20]


def test_citizen_b_cannot_read_or_delete_citizen_a_row():
    from app.services import eligibility_saved_service as svc

    def fake_get(db, user_id, saved_id):
        # Owner (10) sees it; anyone else gets None -> router 404s.
        return dict(ROW_A1) if user_id == 10 else None

    def fake_delete(db, user_id, saved_id):
        return user_id == 10

    with (
        patch.object(svc, "get_saved_result", side_effect=fake_get),
        patch.object(svc, "delete_saved_result", side_effect=fake_delete),
    ):
        cb = _client_for(_user(20))
        assert cb.get("/eligibility/saved/1").status_code == 404
        assert cb.delete("/eligibility/saved/1").status_code == 404
        ca = _client_for(_user(10))
        assert ca.get("/eligibility/saved/1").status_code == 200
        assert ca.delete("/eligibility/saved/1").status_code == 200


def test_guest_role_rejected_unauthenticated_rejected():
    c = _client_for(_user(99, role="GUEST"))
    assert c.get("/eligibility/saved").status_code == 403
    anon = _client_for(None)
    assert anon.get("/eligibility/saved").status_code in (401, 403)


def test_duplicate_save_returns_existing_without_rechecking():
    from app.services import eligibility_saved_service as svc

    existing = MagicMock(saved_id=7)
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.first.return_value = existing
    with patch.object(svc, "check_eligibility") as mock_check:
        row, created = svc.save_eligibility_result(
            db=db,
            user_id=10,
            entity_type="scheme",
            entity_id=60,
            profile=_profile(),
        )
    assert row is existing
    assert created is False
    assert not mock_check.called
    assert not db.add.called


def test_save_rejects_unknown_entity_type_and_missing_entity():
    from app.services import eligibility_saved_service as svc
    from fastapi import HTTPException

    db = MagicMock()
    with pytest.raises(HTTPException) as exc:
        svc.save_eligibility_result(
            db=db,
            user_id=10,
            entity_type="report",
            entity_id=1,
            profile=_profile(),
        )
    assert exc.value.status_code == 422

    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.first.return_value = None  # no duplicate
    with patch.object(
        svc,
        "check_eligibility",
        side_effect=HTTPException(status_code=404, detail="Scheme not found"),
    ):
        with pytest.raises(HTTPException) as exc2:
            svc.save_eligibility_result(
                db=db,
                user_id=10,
                entity_type="scheme",
                entity_id=999,
                profile=_profile(),
            )
    assert exc2.value.status_code == 404


def test_save_stores_server_evaluated_outcome_not_client_flags():
    from app.services import eligibility_saved_service as svc

    scheme = MagicMock()
    scheme.scheme_id = 60
    scheme.name = "S1"
    checked = MagicMock(
        entity_name="S1",
        eligible=False,  # server says NOT eligible...
        message="You are not eligible for this scheme.",
    )
    db = MagicMock()

    def fake_query(model):
        from app.models.scheme import Scheme

        qq = MagicMock()
        if model is Scheme:
            qq.filter.return_value = qq
            qq.first.return_value = scheme
        else:
            qq.filter.return_value = qq
            qq.first.return_value = None  # no duplicate
        return qq

    db.query.side_effect = fake_query
    with patch.object(svc, "check_eligibility", return_value=checked):
        row, created = svc.save_eligibility_result(
            db=db,
            user_id=10,
            entity_type="scheme",
            entity_id=60,
            profile=_profile(),
        )
    assert created is True
    stored = db.add.call_args[0][0]
    assert stored.user_id == 10
    assert stored.eligible is False  # ...even if client claimed True
    assert stored.profile_data["age"] == 30
    assert stored.profile_data["annual_income"] == 250000.0
