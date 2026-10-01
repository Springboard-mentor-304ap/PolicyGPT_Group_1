import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import chatbot as chatbot_routes
from app.api.routes.auth import get_current_user
from app.db.database import get_db
from app.services import chatbot_service as service
from tests.fakes import FakeSession, make_user

SESSION = FakeSession()
CURRENT_USER = {"user": make_user(user_id=1, role="CITIZEN")}


def _build_client():
    app = FastAPI()
    app.include_router(chatbot_routes.router)

    async def override_get_db():
        yield SESSION

    async def override_user():
        return CURRENT_USER["user"]

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_user
    return TestClient(app, raise_server_exceptions=False)


client = _build_client()


def _as_role(role: str, user_id: int = 1):
    CURRENT_USER["user"] = make_user(user_id=user_id, role=role)


def test_unauthenticated_rejected():
    from fastapi import FastAPI as FreshApp
    from app.api.routes import chatbot as routes

    bare = FreshApp()
    bare.include_router(routes.router)
    lonely = TestClient(bare, raise_server_exceptions=False)
    response = lonely.post("/chatbot/message", json={"message": "hi"})
    assert response.status_code in (401, 403)


def test_authenticated_message_round_trip():
    _as_role("CITIZEN", user_id=11)
    response = client.post(
        "/chatbot/message", json={"message": "Hello there"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["conversation_id"] > 0
    assert body["intent"] == "GREETING"
    assert isinstance(body["message"], str) and body["message"]


def test_guest_limit_end_to_end(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "CHATBOT_GUEST_MESSAGE_LIMIT", 2)
    _as_role("GUEST", user_id=21)
    first = client.post("/chatbot/message", json={"message": "scholarships"})
    assert first.status_code == 200
    assert first.json()["guest_remaining"] == 1
    second = client.post("/chatbot/message", json={"message": "policies"})
    assert second.status_code == 200
    assert second.json()["guest_remaining"] == 0
    third = client.post("/chatbot/message", json={"message": "one more"})
    assert third.status_code == 403
    assert "guest" in third.json()["detail"].lower()


def test_message_too_long_rejected():
    _as_role("CITIZEN", user_id=31)
    response = client.post("/chatbot/message", json={"message": "x" * 5000})
    assert response.status_code == 413


def test_invalid_request_rejected():
    _as_role("CITIZEN", user_id=32)
    response = client.post("/chatbot/message", json={"message": ""})
    assert response.status_code == 422


def test_history_returns_own_messages():
    _as_role("CITIZEN", user_id=41)
    posted = client.post("/chatbot/message", json={"message": "Hi"})
    conversation_id = posted.json()["conversation_id"]
    history = client.get("/chatbot/history")
    assert history.status_code == 200
    body = history.json()
    assert body["conversation_id"] == conversation_id
    assert [m["sender"] for m in body["messages"]] == ["user", "assistant"]


def test_history_other_users_conversation_rejected():
    _as_role("CITIZEN", user_id=51)
    posted = client.post("/chatbot/message", json={"message": "Hi"})
    foreign_id = posted.json()["conversation_id"]
    _as_role("CITIZEN", user_id=52)
    response = client.get(f"/chatbot/history?conversation_id={foreign_id}")
    assert response.status_code == 404


def test_delete_history_clears_but_keeps_usage():
    _as_role("GUEST", user_id=61)
    client.post("/chatbot/message", json={"message": "Hi"})
    deleted = client.delete("/chatbot/history")
    assert deleted.status_code == 200
    history = client.get("/chatbot/history")
    assert history.json()["messages"] == []
    usage = client.get("/chatbot/usage")
    assert usage.json()["message_count"] == 1
    assert usage.json()["guest_remaining"] is not None


def test_config_and_usage_endpoints():
    _as_role("RESEARCHER", user_id=71)
    config = client.get("/chatbot/config")
    assert config.status_code == 200
    assert config.json()["guest_message_limit"] >= 1
    assert config.json()["max_message_length"] >= 100
    usage = client.get("/chatbot/usage")
    assert usage.json()["guest_limit"] is None
    assert usage.json()["guest_remaining"] is None
