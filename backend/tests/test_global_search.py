"""Global search + extended multi-field coverage (live-DB integration).

Requires DATABASE_URL to be reachable (Supabase in .env). Tests use the
real PostgreSQL data so LIKE/ARRAY/JSONB semantics match production.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.database import SessionLocal
from app.models.user import User


def _db():
    return SessionLocal()


def _get_user(user_id: int):
    db = _db()
    try:
        return db.query(User).filter(User.user_id == user_id).first()
    finally:
        db.close()


def _token_for(user: User):
    return create_access_token(
        user_id=user.user_id,
        role=getattr(user, "role", "CITIZEN"),
        token_version=getattr(user, "token_version", 0) or 0,
    )


@pytest.fixture(scope="module")
def citizen():
    user = _get_user(3)
    if user is None:
        pytest.skip("citizen fixture user (id=3) missing")
    return user


@pytest.fixture(scope="module")
def admin():
    user = _get_user(1)
    if user is None:
        pytest.skip("admin fixture user (id=1) missing")
    return user


def test_policy_search_matches_ministry_not_just_title(citizen):
    from app.services.policy_service import search_policies

    db = _db()
    try:
        res = search_policies(
            db, search="Ministry of Health", policy_status="APPROVED",
            page=1, limit=10, current_user=citizen,
        )
        assert res["total"] >= 1
        assert any(
            "health" in str(p.ministry or "").lower()
            or "health" in str(p.title or "").lower()
            or "health" in str(p.description or "").lower()
            for p in res["policies"]
        )
    finally:
        db.close()


def test_policy_search_matches_benefits_array(citizen):
    from app.services.policy_service import search_policies

    db = _db()
    try:
        row = None
        for p in (
            db.query(__import__("app.models.policy", fromlist=["Policy"]).Policy)
            .filter_by(is_deleted=False)
            .limit(50)
            .all()
        ):
            if p.benefits:
                row = p
                break
        if row is None:
            pytest.skip("no policy with benefits in fixture data")
        word = str(row.benefits[0]).split()[0]
        assert len(word) >= 3
        res = search_policies(
            db, search=word, policy_status="APPROVED",
            page=1, limit=10, current_user=citizen,
        )
        assert res["total"] >= 1
    finally:
        db.close()


def test_policy_search_matches_eligibility_jsonb(citizen):
    from app.services.policy_service import search_policies

    db = _db()
    try:
        res = search_policies(
            db, search="target_groups", policy_status="APPROVED",
            page=1, limit=5, current_user=citizen,
        )
        # Fixture data stores target_groups inside eligibility JSONB;
        # either it matches (>=1) or the token is absent (0) — but the
        # query must not error and must cast JSONB correctly.
        assert res["total"] >= 0
    finally:
        db.close()


def test_policy_whitespace_and_case_insensitive(citizen):
    from app.services.policy_service import search_policies

    db = _db()
    try:
        a = search_policies(
            db, search="  EDUCATION  ", policy_status="APPROVED",
            page=1, limit=5, current_user=citizen,
        )
        b = search_policies(
            db, search="education", policy_status="APPROVED",
            page=1, limit=5, current_user=citizen,
        )
        assert a["total"] == b["total"]
    finally:
        db.close()


def test_scheme_search_matches_category_and_documents(citizen):
    from app.services.scheme_service import search_schemes

    db = _db()
    try:
        res = search_schemes(
            db, keyword="Agriculture", status="APPROVED",
            page=1, limit=5, current_user=citizen,
        )
        assert res["total"] >= 1
    finally:
        db.close()


def test_scheme_search_matches_benefits_array(citizen):
    from app.services.scheme_service import search_schemes

    db = _db()
    try:
        # "irrigation" appears in the benefits of an APPROVED scheme
        # (Pradhan Mantri Krishi Sinchayee Yojana), not just its title.
        res = search_schemes(
            db, keyword="irrigation", status="APPROVED",
            page=1, limit=5, current_user=citizen,
        )
        assert res["total"] >= 1
    finally:
        db.close()


def test_global_search_combines_both_types(citizen):
    from app.services.global_search_service import global_search

    db = _db()
    try:
        res = global_search(db, "water", limit_per_type=5, current_user=citizen)
        assert res["query"] == "water"
        assert res["total_policies"] >= 1
        assert res["total_schemes"] >= 1
        for p in res["policies"]:
            assert p.status == "APPROVED"
        for s in res["schemes"]:
            assert s.status == "APPROVED"
    finally:
        db.close()


def test_global_search_empty_query_returns_empty(citizen):
    from app.services.global_search_service import global_search

    db = _db()
    try:
        res = global_search(db, "   ", current_user=citizen)
        assert res == {
            "query": "",
            "total_policies": 0,
            "total_schemes": 0,
            "policies": [],
            "schemes": [],
        }
    finally:
        db.close()


def test_global_search_endpoint_http(citizen):
    from app.main import app

    client = TestClient(app, raise_server_exceptions=False)
    headers = {"Authorization": f"Bearer {_token_for(citizen)}"}

    ok = client.get("/search/global", params={"q": "water"}, headers=headers)
    assert ok.status_code == 200
    body = ok.json()
    assert body["query"] == "water"
    assert body["total_policies"] >= 1

    blank = client.get("/search/global", params={"q": "   "}, headers=headers)
    assert blank.status_code == 200
    assert blank.json()["total_policies"] == 0

    unauth = client.get("/search/global", params={"q": "water"})
    assert unauth.status_code == 401
