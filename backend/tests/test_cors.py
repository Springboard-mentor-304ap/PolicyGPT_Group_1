"""CORS preflight + error-response header regression tests (no seed data needed)."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


def test_preflight_localhost(client):
    res = client.options(
        "/schemes",
        headers={
            "Origin": "http://localhost:4200",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization,Content-Type",
        },
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:4200"


def test_preflight_loopback(client):
    res = client.options(
        "/schemes",
        headers={
            "Origin": "http://127.0.0.1:4200",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res.headers.get("access-control-allow-origin") == "http://127.0.0.1:4200"


def test_unknown_origin_gets_no_cors_header(client):
    res = client.options(
        "/schemes",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res.headers.get("access-control-allow-origin") is None
