"""Manage Schemes parity with Manage Policies (live-DB integration).

Covers the backend operations the Manage Schemes register relies on:
draft visibility via manage listing, direct archive (APPROVED ->
ARCHIVED), stats shape, and trash scoping. Cleans up everything.
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
def gov():
    return _user(4)


@pytest.fixture(scope="module")
def admin():
    return _user(1)


def _h(user: User) -> dict:
    return {"Authorization": f"Bearer {_token(user)}"}


def test_scheme_manage_flow(client, gov, admin):
    suffix = uuid.uuid4().hex[:8]
    name = f"ZZZ Manage Scheme {suffix}"
    created = client.post(
        "/schemes",
        json={
            "name": name,
            "description": "Manage parity check.",
            "category": "Agriculture",
        },
        headers=_h(gov),
    )
    assert created.status_code == 201, created.text
    sid = created.json()["scheme_id"]
    try:
        # Draft visible to creator via manage listing + status filter.
        listing = client.get(
            "/schemes",
            params={"manage": True, "status": "DRAFT", "limit": 100},
            headers=_h(gov),
        )
        assert listing.status_code == 200
        assert any(s["scheme_id"] == sid for s in listing.json()["schemes"])

        # Submit -> approve -> direct archive -> restore.
        assert client.post(f"/schemes/{sid}/submit", headers=_h(gov)).status_code == 200
        assert client.post(f"/schemes/{sid}/approve", headers=_h(admin)).status_code == 200
        # Read-after-write guard: the pooled database can briefly serve
        # a stale replica; wait until the approval is visible.
        import time as _time

        for _ in range(6):
            seen = client.get(f"/schemes/{sid}", headers=_h(admin))
            if seen.status_code == 200 and seen.json().get("status") == "APPROVED":
                break
            _time.sleep(1)
        archived = client.post(f"/schemes/{sid}/archive", headers=_h(admin))
        assert archived.status_code == 200, archived.text
        assert archived.json()["status"] == "ARCHIVED"
        restored = client.post(f"/schemes/{sid}/restore", headers=_h(admin))
        assert restored.status_code == 200, restored.text
        assert restored.json()["status"] == "APPROVED"

        # Stats endpoint exposes the five register counts.
        stats = client.get("/analytics/schemes", headers=_h(admin))
        assert stats.status_code == 200
        body = stats.json()
        for key in ("total", "approved", "pending", "rejected", "archived"):
            assert key in body, key
            assert isinstance(body[key], int)

        # Trash scoping: gov sees own deleted row after soft delete.
        assert client.delete(f"/schemes/{sid}", headers=_h(admin)).status_code == 200
        trash = client.get("/schemes/deleted", headers=_h(gov))
        assert trash.status_code == 200
        assert any(s["scheme_id"] == sid for s in trash.json()["schemes"])
        # Restore from trash works.
        assert client.post(f"/schemes/{sid}/restore", headers=_h(admin)).status_code == 200
    finally:
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
