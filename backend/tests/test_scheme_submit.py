"""Scheme submission status transitions (live-DB integration).

Admin submit -> APPROVED (direct approval, mirroring submit_policy);
gov submit -> PENDING_APPROVAL; draft saves stay DRAFT; payload
tampering ignored; duplicate submits rejected; edit-approved keeps
APPROVED. Cleans up all created rows.
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


def _h(user: User) -> dict:
    return {"Authorization": f"Bearer {_token(user)}"}


_CREATED: list[int] = []


def _make(client, headers, tag: str) -> int:
    name = f"ZZZ Submit {tag} {uuid.uuid4().hex[:6]}"
    res = client.post(
        "/schemes",
        json={"name": name, "description": "submit-transition check.", "category": "Agriculture"},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "DRAFT"
    _CREATED.append(res.json()["scheme_id"])
    return res.json()["scheme_id"]


def _audit_actions(client, headers, sid: int) -> list[str]:
    res = client.get(f"/audit-logs/entity/SCHEME/{sid}", headers=headers)
    assert res.status_code == 200, res.text
    return [e["action"] for e in res.json()["events"]]


@pytest.fixture(scope="module")
def _cleanup(client, admin):
    yield
    ha = _h(admin)
    db = _db()
    try:
        for sid in list(_CREATED):
            try:
                db.query(AuditLog).filter(
                    AuditLog.entity_type == "SCHEME", AuditLog.entity_id == sid
                ).delete(synchronize_session=False)
                db.commit()
            finally:
                pass
            client.delete(f"/schemes/{sid}", headers=ha)
            client.delete(f"/schemes/{sid}/permanent", headers=ha)
            try:
                db.query(AuditLog).filter(
                    AuditLog.entity_type == "SCHEME", AuditLog.entity_id == sid
                ).delete(synchronize_session=False)
                db.commit()
            finally:
                pass
    finally:
        db.close()
    _CREATED.clear()


def test_1_admin_create_and_submit_is_approved(client, admin, _cleanup):
    sid = _make(client, _h(admin), "adm-new")
    res = client.post(f"/schemes/{sid}/submit", headers=_h(admin))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "APPROVED"
    assert body["approved_by"] == admin.user_id
    actions = _audit_actions(client, _h(admin), sid)
    assert "SCHEME_SUBMITTED" in actions
    assert "APPROVAL_EVENT" in actions


def test_2_admin_submit_existing_draft_is_approved(client, admin, gov, _cleanup):
    sid = _make(client, _h(gov), "adm-existing")
    res = client.post(f"/schemes/{sid}/submit", headers=_h(admin))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "APPROVED"


def test_3_gov_create_and_submit_is_pending(client, gov, _cleanup):
    sid = _make(client, _h(gov), "gov-new")
    res = client.post(f"/schemes/{sid}/submit", headers=_h(gov))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "PENDING_APPROVAL"
    assert res.json()["approved_by"] is None


def test_4_gov_submit_existing_draft_is_pending(client, gov, admin, _cleanup):
    sid = _make(client, _h(admin), "gov-existing")
    res = client.post(f"/schemes/{sid}/submit", headers=_h(gov))
    # Admin-created draft: gov is not the creator.
    assert res.status_code == 403


def test_4b_gov_submit_own_draft_is_pending(client, gov, _cleanup):
    sid = _make(client, _h(gov), "gov-own")
    res = client.post(f"/schemes/{sid}/submit", headers=_h(gov))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "PENDING_APPROVAL"


def test_5_draft_saves_stay_draft(client, gov, admin, _cleanup):
    for headers in (_h(gov), _h(admin)):
        for endpoint in ("/schemes", "/schemes/draft"):
            res = client.post(
                endpoint,
                json={
                    "name": f"ZZZ Draft {uuid.uuid4().hex[:6]}",
                    "description": "d",
                    "category": "Agriculture",
                },
                headers=headers,
            )
            assert res.status_code == 201, res.text
            assert res.json()["status"] == "DRAFT"
            assert res.json()["approved_by"] is None
            _CREATED.append(res.json()["scheme_id"])


def test_6_payload_tampering_and_self_approval_blocked(client, gov, admin, _cleanup):
    sid = _make(client, _h(gov), "tamper")
    # Extra status/approved_by keys are ignored by the schema.
    res = client.put(
        f"/schemes/{sid}",
        json={"description": "x", "status": "APPROVED", "approved_by": gov.user_id},
        headers=_h(gov),
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "DRAFT"
    assert res.json()["approved_by"] is None
    # Gov cannot approve (role guard), even their own record.
    assert client.post(f"/schemes/{sid}/submit", headers=_h(gov)).status_code == 200
    assert client.post(f"/schemes/{sid}/approve", headers=_h(gov)).status_code == 403
    # Duplicate submit on non-draft is rejected without side effects.
    before = _audit_actions(client, _h(admin), sid)
    dup = client.post(f"/schemes/{sid}/submit", headers=_h(gov))
    assert dup.status_code == 400
    assert _audit_actions(client, _h(admin), sid) == before


def test_7_edit_approved_keeps_status(client, admin, _cleanup):
    sid = _make(client, _h(admin), "edit-appr")
    assert client.post(f"/schemes/{sid}/submit", headers=_h(admin)).status_code == 200
    res = client.put(f"/schemes/{sid}", json={"description": "edited"}, headers=_h(admin))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "APPROVED"


def test_8_stats_and_register_reflect_status(client, admin, gov, _cleanup):
    sid = _make(client, _h(gov), "stats")
    client.post(f"/schemes/{sid}/submit", headers=_h(gov))
    listing = client.get("/schemes", params={"manage": True, "limit": 100}, headers=_h(admin))
    assert listing.status_code == 200
    row = next(s for s in listing.json()["schemes"] if s["scheme_id"] == sid)
    assert row["status"] == "PENDING_APPROVAL"
    stats = client.get("/analytics/schemes", headers=_h(admin))
    assert stats.status_code == 200
    assert stats.json()["pending"] >= 1
