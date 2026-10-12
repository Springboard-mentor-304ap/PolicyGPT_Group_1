"""Workflow timeline + audit identity (live-DB integration).

Exercises the real flow: gov creates -> updates -> submits ->
admin rejects (reason) -> gov resubmits -> admin approves, then
asserts the chronological timeline, actor enrichment, RBAC, and
that failed ops leave no events. Cleans up all created rows.
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
        assert user is not None, f"fixture user {user_id} missing"
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


@pytest.fixture(scope="module")
def citizen():
    return _user(3)


def _h(user: User) -> dict:
    return {"Authorization": f"Bearer {_token(user)}"}


def _timeline(client, headers, entity_type, entity_id, **params):
    return client.get(
        f"/audit-logs/entity/{entity_type}/{entity_id}",
        params=params,
        headers=headers,
    )


@pytest.fixture(scope="module")
def policy_flow(client, gov, admin):
    """Gov creates/updates/submits; admin rejects; gov resubmits;
    admin approves. Returns ids + checkpoints."""
    suffix = uuid.uuid4().hex[:8]
    title = f"ZZZ Timeline Policy {suffix}"
    created = client.post(
        "/policies",
        json={
            "title": title,
            "description": "Timeline verification policy.",
            "category": "Health",
            "ministry": "Ministry of Health and Family Welfare",
            "department": "Department of Health",
            "state": "All India",
            "sector": "Healthcare",
        },
        headers=_h(gov),
    )
    assert created.status_code == 201, created.text
    pid = created.json()["policy_id"]

    # Enrichment visible immediately on single GET.
    detail = client.get(f"/policies/{pid}", headers=_h(admin))
    assert detail.status_code == 200
    body = detail.json()
    assert body["created_by_name"] == "Test Government Official"
    assert body["created_by_role"] == "GOVERNMENT_OFFICIAL"

    upd = client.put(
        f"/policies/{pid}", json={"description": "Updated description."}, headers=_h(gov)
    )
    assert upd.status_code == 200, upd.text

    sub1 = client.post(f"/policies/{pid}/submit", headers=_h(gov))
    assert sub1.status_code == 200, sub1.text

    rej = client.post(
        f"/policies/{pid}/reject", json={"reason": "Needs more data."}, headers=_h(admin)
    )
    assert rej.status_code == 200, rej.text

    # Reason attached while REJECTED.
    mid = _timeline(client, _h(admin), "POLICY", pid)
    assert mid.status_code == 200
    rej_events = [e for e in mid.json()["events"] if e["action"] == "POLICY_REJECTED"]
    assert len(rej_events) == 1
    assert rej_events[0]["reason"] == "Needs more data."
    assert rej_events[0]["from_status"] == "PENDING_APPROVAL"
    assert rej_events[0]["to_status"] == "REJECTED"

    sub2 = client.post(f"/policies/{pid}/submit", headers=_h(gov))
    assert sub2.status_code == 200, sub2.text

    app = client.post(f"/policies/{pid}/approve", headers=_h(admin))
    assert app.status_code == 200, app.text

    # Archive request -> approve -> restore -> delete request -> reject.
    ra = client.post(
        f"/policies/{pid}/request-archive",
        json={"reason": "Outdated content."},
        headers=_h(gov),
    )
    assert ra.status_code == 200, ra.text
    aa = client.post(f"/policies/{pid}/approve-archive", headers=_h(admin))
    assert aa.status_code == 200, aa.text
    rs = client.post(f"/policies/{pid}/restore", headers=_h(admin))
    assert rs.status_code == 200, rs.text
    rd = client.post(
        f"/policies/{pid}/request-delete",
        json={"reason": "Duplicate record."},
        headers=_h(gov),
    )
    assert rd.status_code == 200, rd.text
    jr = client.post(f"/policies/{pid}/reject-delete", headers=_h(admin))
    assert jr.status_code == 200, jr.text

    yield {"policy_id": pid, "title": title}

    # ---- cleanup: remove audit rows + the entity itself ----
    db = _db()
    try:
        db.query(AuditLog).filter(
            AuditLog.entity_type == "POLICY", AuditLog.entity_id == pid
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()
    client.delete(f"/policies/{pid}", headers=_h(admin))
    client.delete(f"/policies/{pid}/permanent", headers=_h(admin))
    db = _db()
    try:
        db.query(AuditLog).filter(
            AuditLog.entity_type == "POLICY", AuditLog.entity_id == pid
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def test_policy_timeline_chronological_and_labeled(client, admin, policy_flow):
    pid = policy_flow["policy_id"]
    res = _timeline(client, _h(admin), "POLICY", pid, limit=50)
    assert res.status_code == 200
    body = res.json()
    actions = [e["action"] for e in body["events"]]
    for expected in (
        "POLICY_CREATED",
        "POLICY_UPDATED",
        "POLICY_SUBMITTED",
        "POLICY_REJECTED",
        "POLICY_SUBMITTED",
        "POLICY_APPROVED",
        "POLICY_ARCHIVE_REQUESTED",
        "POLICY_ARCHIVE_APPROVED",
        "POLICY_RESTORED",
        "POLICY_DELETE_REQUESTED",
        "POLICY_DELETE_REJECTED",
    ):
        assert expected in actions
    # Chronological ascending.
    stamps = [e["created_at"] for e in body["events"]]
    assert stamps == sorted(stamps)
    # Actor enrichment inlined (no per-event lookups needed).
    creators = [e for e in body["events"] if e["action"] == "POLICY_CREATED"][0]
    assert creators["user_name"] == "Test Government Official"
    assert creators["user_role"] == "GOVERNMENT_OFFICIAL"
    approvers = [e for e in body["events"] if e["action"] == "POLICY_APPROVED"][0]
    assert approvers["user_name"] == "Test Admin"
    # Labels + transitions served by the API.
    assert creators["action_label"] == "Policy created"
    assert creators["to_status"] == "DRAFT"
    submits = [e for e in body["events"] if e["action"] == "POLICY_SUBMITTED"]
    assert submits[0]["to_status"] == "PENDING_APPROVAL"
    # Resubmission worded distinctly from first submission.
    assert "submitted for approval" in submits[0]["description"]
    assert "resubmitted for approval" in submits[1]["description"]
    # Update records changed field names, not values.
    updates = [e for e in body["events"] if e["action"] == "POLICY_UPDATED"][0]
    assert "Changed fields: description." in updates["description"]
    assert "Updated description." not in updates["description"]
    # No view noise in the workflow timeline.
    assert not [a for a in actions if a.endswith("_VIEW")]


def test_policy_timeline_pagination(client, admin, policy_flow):
    pid = policy_flow["policy_id"]
    p1 = _timeline(client, _h(admin), "POLICY", pid, limit=2, page=1)
    assert p1.status_code == 200
    assert p1.json()["pages"] >= 3
    assert len(p1.json()["events"]) == 2
    p2 = _timeline(client, _h(admin), "POLICY", pid, limit=2, page=2)
    assert p2.status_code == 200
    ids1 = {e["audit_id"] for e in p1.json()["events"]}
    ids2 = {e["audit_id"] for e in p2.json()["events"]}
    assert ids1.isdisjoint(ids2)


def test_policy_timeline_gov_and_denied(client, gov, admin, citizen, policy_flow):
    pid = policy_flow["policy_id"]
    # Creator official sees own-entity history.
    assert _timeline(client, _h(gov), "POLICY", pid).status_code == 200
    # Public roles are rejected (internal governance data).
    assert _timeline(client, _h(citizen), "POLICY", pid).status_code == 403
    # No token at all.
    assert client.get(f"/audit-logs/entity/POLICY/{pid}").status_code in (401, 403)
    # Bad type / missing entity.
    assert _timeline(client, _h(admin), "NOPE", pid).status_code == 422
    assert _timeline(client, _h(admin), "POLICY", 999999999).status_code == 404


def test_failed_operation_leaves_no_event(client, gov, admin, policy_flow):
    pid = policy_flow["policy_id"]
    before = _timeline(client, _h(admin), "POLICY", pid).json()["total"]
    # Already APPROVED: submit must fail and log nothing.
    bad = client.post(f"/policies/{pid}/submit", headers=_h(gov))
    assert bad.status_code == 400
    after = _timeline(client, _h(admin), "POLICY", pid).json()["total"]
    assert after == before


def test_scheme_flow_and_timeline(client, gov, admin, citizen):
    suffix = uuid.uuid4().hex[:8]
    name = f"ZZZ Timeline Scheme {suffix}"
    created = client.post(
        "/schemes",
        json={
            "name": name,
            "description": "Timeline verification scheme.",
            "category": "Agriculture",
        },
        headers=_h(gov),
    )
    assert created.status_code == 201, created.text
    sid = created.json()["scheme_id"]
    try:
        assert client.post(f"/schemes/{sid}/submit", headers=_h(gov)).status_code == 200
        assert client.post(f"/schemes/{sid}/approve", headers=_h(admin)).status_code == 200

        res = _timeline(client, _h(admin), "SCHEME", sid)
        assert res.status_code == 200
        actions = [e["action"] for e in res.json()["events"]]
        assert "SCHEME_CREATED" in actions
        assert "SCHEME_SUBMITTED" in actions
        assert "APPROVAL_EVENT" in actions
        created_ev = [e for e in res.json()["events"] if e["action"] == "SCHEME_CREATED"][0]
        assert created_ev["user_name"] == "Test Government Official"
        assert created_ev["action_label"] == "Scheme created"

        detail = client.get(f"/schemes/{sid}", headers=_h(admin)).json()
        assert detail["created_by_name"] == "Test Government Official"
        assert detail["approved_by_name"] == "Test Admin"

        assert _timeline(client, _h(citizen), "SCHEME", sid).status_code == 403
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


def test_gov_cannot_read_foreign_unpublished_timeline(client, gov, admin):
    db = _db()
    try:
        draft = (
            db.query(__import__("app.models.policy", fromlist=["Policy"]).Policy)
            .filter_by(is_deleted=False, status="DRAFT", created_by=1)
            .first()
        )
    finally:
        db.close()
    if draft is None:
        pytest.skip("no admin-owned draft available")
    res = _timeline(client, _h(gov), "POLICY", draft.policy_id)
    assert res.status_code == 404
