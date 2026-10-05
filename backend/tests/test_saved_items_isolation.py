"""Saved-items user-isolation tests (no live DB, no real email).

Proves, via the real FastAPI router with overridden auth/DB dependencies:
1. Citizen A (1 policy + 2 schemes) sees exactly those records.
2. Citizen B (none) sees empty lists on both endpoints.
3. All list/create/delete calls are scoped to the token identity -
   no user_id is accepted from the frontend.
4. Citizen B cannot delete Citizen A's items (service returns False).
5. Unauthenticated requests are rejected; disallowed roles are rejected.
"""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.api.routes.auth import get_current_user
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


POLICIES_A = [
    {
        "saved_id": 1, "policy_id": 50, "title": "P1",
        "category": None, "ministry": None, "department": None,
        "state": None, "status": "APPROVED", "saved_at": "2025-01-01T00:00:00",
    }
]
SCHEMES_A = [
    {
        "saved_id": 2, "scheme_id": 60, "name": "S1",
        "category": None, "ministry": None, "department": None,
        "state": None, "status": "APPROVED", "saved_at": "2025-01-01T00:00:00",
    },
    {
        "saved_id": 3, "scheme_id": 61, "name": "S2",
        "category": None, "ministry": None, "department": None,
        "state": None, "status": "APPROVED", "saved_at": "2025-01-02T00:00:00",
    },
]


def _client_for(user):
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: MagicMock()
    return TestClient(app, raise_server_exceptions=False)


def teardown_function():
    app.dependency_overrides.clear()


def test_citizen_a_sees_own_items_total_3():
    with patch(
        "app.services.saved_item_service.get_saved_policies",
        return_value=POLICIES_A,
    ) as mock_p, patch(
        "app.services.saved_item_service.get_saved_schemes",
        return_value=SCHEMES_A,
    ) as mock_s:
        c = _client_for(_user(10))
        rp = c.get("/saved-items/policies")
        rs = c.get("/saved-items/schemes")
    assert rp.status_code == 200
    assert rs.status_code == 200
    assert len(rp.json()) == 1
    assert len(rs.json()) == 2
    # Scoped to the token identity.
    assert mock_p.call_args[1]["user_id"] == 10
    assert mock_s.call_args[1]["user_id"] == 10


def test_citizen_b_with_none_sees_zeros():
    with patch(
        "app.services.saved_item_service.get_saved_policies", return_value=[]
    ), patch(
        "app.services.saved_item_service.get_saved_schemes", return_value=[]
    ):
        c = _client_for(_user(20))
        assert c.get("/saved-items/policies").json() == []
        assert c.get("/saved-items/schemes").json() == []


def test_no_user_id_accepted_from_frontend():
    """Query/body user_id must not influence scoping (endpoints take none)."""
    with patch(
        "app.services.saved_item_service.get_saved_policies", return_value=[]
    ) as mock_p:
        c = _client_for(_user(20))
        # Attempt to request another user's data via query param.
        r = c.get("/saved-items/policies?user_id=10")
        assert r.status_code == 200
        assert mock_p.call_args[1]["user_id"] == 20


def test_citizen_b_cannot_delete_citizen_a_item():
    with patch(
        "app.services.saved_item_service.unsave_policy", return_value=False
    ) as mock_del:
        c = _client_for(_user(20))
        r = c.delete("/saved-items/policies/50")
    assert r.status_code == 404
    assert mock_del.call_args[1]["user_id"] == 20
    assert mock_del.call_args[1]["policy_id"] == 50


def test_unauthenticated_rejected():
    app.dependency_overrides[get_db] = lambda: MagicMock()
    c = TestClient(app, raise_server_exceptions=False)
    try:
        assert c.get("/saved-items/policies").status_code in (401, 403)
        assert c.get("/saved-items/schemes").status_code in (401, 403)
    finally:
        app.dependency_overrides.clear()


def test_disallowed_role_rejected():
    with patch(
        "app.services.saved_item_service.get_saved_policies", return_value=[]
    ):
        c = _client_for(_user(99, role="ADMIN"))
        assert c.get("/saved-items/policies").status_code == 403
