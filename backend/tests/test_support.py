from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.faq import FAQ
from app.models.support_query import SupportQuery
from app.models.user import User
from app.core.security import create_access_token
from app.db.database import SessionLocal


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def citizen_user(db: Session):
    user = db.query(User).filter(
        User.email == "citizen_support_test@example.com").first()
    if not user:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        user = User(
            email="citizen_support_test@example.com",
            full_name="Citizen Tester",
            role="CITIZEN",
            is_active=True,
            token_version=1,
            password_hash="testhash",
            created_at=now,
            updated_at=now,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@pytest.fixture
def admin_user(db: Session):
    user = db.query(User).filter(
        User.email == "admin_support_test@example.com").first()
    if not user:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        user = User(
            email="admin_support_test@example.com",
            full_name="Admin Tester",
            role="ADMIN",
            is_active=True,
            token_version=1,
            password_hash="testhash",
            created_at=now,
            updated_at=now,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@pytest.fixture
def sample_faqs(db: Session):
    # Ensure a published and draft FAQ exist
    pub = db.query(FAQ).filter(
        FAQ.question == "Published Test Question?").first()
    if not pub:
        pub = FAQ(
            question="Published Test Question?",
            answer="This is a published answer for public users.",
            category="Testing",
            status="PUBLISHED",
            display_order=1,
            created_at=db.query(FAQ).first().created_at if db.query(
                FAQ).first() else None,
            updated_at=db.query(FAQ).first().updated_at if db.query(
                FAQ).first() else None,
        )
        if not pub.created_at:
            pub.created_at = datetime.now(timezone.utc).replace(tzinfo=None)
            pub.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(pub)

    draft = db.query(FAQ).filter(
        FAQ.question == "Draft Internal Question?").first()
    if not draft:
        draft = FAQ(
            question="Draft Internal Question?",
            answer="This is draft content not meant for citizens.",
            category="Internal",
            status="DRAFT",
            display_order=99,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(draft)
    db.commit()
    return {"published": pub, "draft": draft}


def test_public_guest_can_list_published_faqs(client: TestClient, sample_faqs):
    res = client.get("/support/faqs")
    assert res.status_code == 200
    faqs = res.json()
    assert isinstance(faqs, list)
    # Draft should not be in response
    questions = [f["question"] for f in faqs]
    assert "Published Test Question?" in questions
    assert "Draft Internal Question?" not in questions


def test_public_guest_search_and_category(client: TestClient, sample_faqs):
    # Search
    res = client.get("/support/faqs", params={"search": "Published Test"})
    assert res.status_code == 200
    faqs = res.json()
    assert len(faqs) >= 1
    assert any("Published Test" in f["question"] for f in faqs)

    # Category
    res_cat = client.get("/support/faqs", params={"category": "Testing"})
    assert res_cat.status_code == 200
    cat_faqs = res_cat.json()
    assert len(cat_faqs) >= 1
    assert all(f["category"].lower() == "testing" for f in cat_faqs)


def test_admin_cannot_access_support_faqs(client: TestClient, admin_user):
    token = create_access_token(
        admin_user.user_id, admin_user.role, admin_user.token_version)
    res = client.get(
        "/support/faqs", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
    assert "Admin FAQ Management" in res.json()["detail"]


def test_citizen_submit_and_view_support_requests(client: TestClient, citizen_user):
    token = create_access_token(
        citizen_user.user_id, citizen_user.role, citizen_user.token_version)
    # Submit request
    payload = {
        "category": "Application Assistance",
        "subject": "Need help with scheme application status",
        "description": "My scheme application is currently stuck in verification step.",
        "priority": "HIGH",
    }
    create_res = client.post(
        "/support/requests", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["subject"] == payload["subject"]
    assert created["status"] == "OPEN"
    assert created["request_id"].startswith("SUP-2026-")
    query_id = created["query_id"]

    # List requests
    list_res = client.get("/support/requests",
                          headers={"Authorization": f"Bearer {token}"})
    assert list_res.status_code == 200
    items = list_res.json()
    assert any(item["query_id"] == query_id for item in items)

    # Single request detail
    get_res = client.get(
        f"/support/requests/{query_id}", headers={"Authorization": f"Bearer {token}"})
    assert get_res.status_code == 200
    assert get_res.json()["query_id"] == query_id


def test_admin_cannot_submit_support_request(client: TestClient, admin_user):
    token = create_access_token(
        admin_user.user_id, admin_user.role, admin_user.token_version)
    payload = {
        "category": "General",
        "subject": "Admin should not submit here",
        "description": "Admin has separate administration channels.",
        "priority": "LOW",
    }
    res = client.post("/support/requests", json=payload,
                      headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403
