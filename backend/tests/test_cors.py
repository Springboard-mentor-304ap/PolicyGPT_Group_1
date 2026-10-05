"""CORS regression tests for the forgot-password workflow.

Uses Starlette TestClient (no live browser, no real email): verifies the
centralized CORSMiddleware on the actual app instance handles the Angular
dev origin correctly for preflight, success, and application-generated
error responses, and rejects unlisted origins without a wildcard.
"""

from fastapi.testclient import TestClient

from app.main import app

ALLOWED = "http://localhost:4200"
ALLOWED2 = "http://127.0.0.1:4200"
DENIED = "http://evil.example.com"

client = TestClient(app, raise_server_exceptions=False)


def test_cors_middleware_registered_once_with_explicit_origins():
    cors = [
        m for m in app.user_middleware
        if m.cls.__name__ == "CORSMiddleware"
    ]
    assert len(cors) == 1
    opts = cors[0].kwargs
    assert ALLOWED in opts["allow_origins"]
    assert ALLOWED2 in opts["allow_origins"]
    assert "*" not in opts["allow_origins"]
    assert opts["allow_credentials"] is True


def test_preflight_allows_forgot_password_post():
    r = client.options(
        "/auth/forgot-password",
        headers={
            "Origin": ALLOWED,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == ALLOWED


def test_forgot_password_success_carries_cors_headers():
    r = client.post(
        "/auth/forgot-password",
        json={"email": "nobody@example.com"},
        headers={"Origin": ALLOWED},
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == ALLOWED
    assert "If an account exists" in r.text


def test_forgot_password_422_error_carries_cors_headers():
    r = client.post(
        "/auth/forgot-password",
        json={"channel": "email"},
        headers={"Origin": ALLOWED},
    )
    assert r.status_code == 422
    assert r.headers.get("access-control-allow-origin") == ALLOWED


def test_disallowed_origin_gets_no_cors_header():
    r = client.post(
        "/auth/forgot-password",
        json={"email": "nobody@example.com"},
        headers={"Origin": DENIED},
    )
    assert r.headers.get("access-control-allow-origin") is None


def test_second_allowed_origin_works():
    r = client.post(
        "/auth/forgot-password",
        json={"email": "nobody@example.com"},
        headers={"Origin": ALLOWED2},
    )
    assert r.headers.get("access-control-allow-origin") == ALLOWED2
