"""Scheme RBAC matrix vs policy parity (live-DB integration).

Verifies every applicable role against scheme endpoints and spot-checks
the matching policy behavior: listing, manage view, create, update,
submit/approve, archive, trash, and timeline denial. Cleans up rows.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.database import SessionLocal
from app.models.audit_log import AuditLog
from app.models.user import User


def _db():
    return SessionLocal()


def _user(user_id: int) -> User:
    db = _db()
    try:
        user = db.query(User).filter(User.user_id == user_id).first()
        assert user is not None
        return user
    finally:
        db.close()


def _token(user: User) -> str:
    return create_access_token(
        user_id=user.user_id,
        role=user.role,
        token_version=getattr(user, "token_version", 0) or 0,
    )


@pytest.fixture(scope="module")
def client():
    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture(scope="module")
def admin():
    return _user(1)


@pytest.fixture(scope="module")
def gov():
    return _user(4)


@pytest.fixture(scope="module")
def citizen():
    return _user(3)


@pytest.fixture(scope="module")
def guest_token(client):
    res = client.post("/auth/guest-login", json={})
    assert res.status_code == 200
    return res.json()["access_token"]


def _h(user: User) -> dict:
    return {"Authorization": f"Bearer {_token(user)}"}


def _hg(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _only_approved(items) -> bool:
    return all(s.get("status") == "APPROVED" for s in items)


def test_public_list_is_approved_only(client, citizen, guest_token):
    for headers in (_h(citizen), _hg(guest_token)):
        res = client.get("/schemes", params={"limit": 50}, headers=headers)
        assert res.status_code == 200
        assert _only_approved(res.json()["schemes"])
        # Parity spot-check on policies.
        pres = client.get("/policies", params={"limit": 50}, headers=headers)
        assert pres.status_code == 200
        assert all(p.get("status") == "APPROVED" for p in pres.json()["policies"])


def test_manage_view_is_staff_only(client, admin, gov, citizen, guest_token):
    assert (
        client.get("/schemes", params={"manage": True}, headers=_h(admin)).status_code
        == 200
    )
    assert (
        client.get("/schemes", params={"manage": True}, headers=_h(gov)).status_code
        == 200
    )
    assert (
        client.get("/schemes", params={"manage": True}, headers=_h(citizen)).status_code
        == 403
    )
    assert (
        client.get("/schemes", params={"manage": True}, headers=_hg(guest_token)).status_code
        == 403
    )
    # Parity spot-check on policies.
    assert (
        client.get("/policies", params={"manage": True}, headers=_h(citizen)).status_code
        == 403
    )


def test_mutations_are_staff_only(client, citizen, guest_token):
    payload = {"name": "x", "description": "y", "category": "z"}
    assert client.post("/schemes", json=payload, headers=_h(citizen)).status_code == 403
    assert client.post("/schemes", json=payload, headers=_hg(guest_token)).status_code == 403
    assert client.put("/schemes/5", json={"description": "y"}, headers=_h(citizen)).status_code in (
        403,
        404,
    )
    assert (
        client.post("/schemes/5/submit", headers=_h(citizen)).status_code == 403
    )
    assert (
        client.post("/schemes/5/approve", headers=_h(citizen)).status_code == 403
    )
    assert client.get("/schemes/deleted", headers=_h(citizen)).status_code == 403
    # Parity spot-check on policies.
    assert client.post("/policies", json={**payload, "title": "x"}, headers=_h(citizen)).status_code == 403


def test_ownership_and_self_approval(client, gov, admin):
    suffix = uuid.uuid4().hex[:8]
    gov_name = f"ZZZ RBAC Gov {suffix}"
    adm_name = f"ZZZ RBAC Adm {suffix}"
    gov_id = client.post(
        "/schemes",
        json={"name": gov_name, "description": "d", "category": "Agriculture"},
        headers=_h(gov),
    )
    assert gov_id.status_code == 201
    gid = gov_id.json()["scheme_id"]
    adm_id = client.post(
        "/schemes",
        json={"name": adm_name, "description": "d", "category": "Agriculture"},
        headers=_h(admin),
    )
    assert adm_id.status_code == 201
    aid = adm_id.json()["scheme_id"]
    try:
        # Gov cannot touch admin's draft; admin can edit anything editable.
        assert (
            client.put(f"/schemes/{aid}", json={"description": "z"}, headers=_h(gov)).status_code
            == 403
        )
        assert (
            client.put(f"/schemes/{gid}", json={"description": "z"}, headers=_h(admin)).status_code
            == 200
        )
        # Gov cannot submit admin's draft.
        assert client.post(f"/schemes/{aid}/submit", headers=_h(gov)).status_code == 403
        # Gov submits own; admin approves (different users: allowed).
        assert client.post(f"/schemes/{gid}/submit", headers=_h(gov)).status_code == 200
        assert client.post(f"/schemes/{gid}/approve", headers=_h(admin)).status_code == 200
        # Admin cannot approve their own record.
        assert client.post(f"/schemes/{aid}/submit", headers=_h(admin)).status_code in (200, 400)
        mine = client.post(f"/schemes/{aid}/approve", headers=_h(admin))
        # Either self-approval 403 (if pending) or 400 (if submit failed); both deny.
        assert mine.status_code in (400, 403)
        # Gov cannot use admin-only endpoints.
        assert client.post(f"/schemes/{gid}/approve", headers=_h(gov)).status_code == 403
        assert client.post(f"/schemes/{gid}/archive", headers=_h(gov)).status_code == 403
        assert client.delete(f"/schemes/{gid}", headers=_h(gov)).status_code == 403
    finally:
        for sid in (gid, aid):
            db = _db()
            try:
                db.query(AuditLog).filter(
                    AuditLog.entity_type == "SCHEME", AuditLog.entity_id == sid
                ).delete(synchronize_session=False)
                db.commit()
            finally:
                db.close()
            client.delete(f"/schemes/{sid}", headers=_h(admin))
            client.delete(f"/schemes/{sid}/permanent", headers=_h(admin))
            db = _db()
            try:
                db.query(AuditLog).filter(
                    AuditLog.entity_type == "SCHEME", AuditLog.entity_id == sid
                ).delete(synchronize_session=False)
                db.commit()
            finally:
                db.close()


def test_unauthenticated_is_rejected(client):
    assert client.get("/schemes").status_code in (401, 403)
    assert client.get("/audit-logs/entity/SCHEME/5").status_code in (401, 403)
