"""Profile photo tests (no live DB writes beyond mocked sessions).

Covers: magic-byte validation (JPEG/PNG/WEBP accept; exe/SVG/text/
empty/oversize/truncated reject), service set/remove, router
ownership (own photo only, guest 403, unauthenticated 401, missing
photo 404), and response contract (photo bytes never in JSON,
photo_updated_at present, existing users default NULL).
"""

import io
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.api.routes.auth import get_current_user
from app.db.database import get_db
from app.models.user import User


def _user(**over):
    base = dict(
        user_id=11,
        full_name="Citizen One",
        email="citizen11@example.com",
        password_hash="x",
        role="CITIZEN",
        is_active=True,
        created_at=datetime(2026, 1, 1, 0, 0, 0),
        updated_at=datetime(2026, 1, 2, 0, 0, 0),
    )
    base.update(over)
    return User(**base)


def _image_bytes(fmt="PNG", size=(8, 8), color="red"):
    buf = io.BytesIO()
    Image.new("RGB", size, color=color).save(buf, format=fmt)
    return buf.getvalue()


def _client_for(user=None):
    app.dependency_overrides.clear()
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: MagicMock()
    return TestClient(app, raise_server_exceptions=False)


def teardown_function():
    app.dependency_overrides.clear()


# --------------------------------------------------
# Validation
# --------------------------------------------------


def test_valid_jpeg_png_webp_accepted():
    from app.services.profile_photo_service import validate_image_upload

    for fmt, name in [("JPEG", "a.jpg"), ("PNG", "a.png"), ("WEBP", "a.webp")]:
        ext, mime = validate_image_upload(name, _image_bytes(fmt))
        assert mime in ("image/jpeg", "image/png", "image/webp")
        assert ext == name.rsplit(".", 1)[-1]


def test_executable_rejected():
    from app.services.profile_photo_service import validate_image_upload

    with pytest.raises(HTTPException) as exc:
        validate_image_upload("evil.png", b"MZ\x90\x00malware-body")
    assert exc.value.status_code == 422


def test_svg_and_text_rejected():
    from app.services.profile_photo_service import validate_image_upload

    svg = b'<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    with pytest.raises(HTTPException) as exc:
        validate_image_upload("pic.svg", svg)
    assert exc.value.status_code == 422
    with pytest.raises(HTTPException):
        validate_image_upload("pic.png", b"just some text, not an image")


def test_empty_and_oversize_rejected():
    from app.services.profile_photo_service import (
        MAX_PHOTO_BYTES,
        validate_image_upload,
    )

    assert MAX_PHOTO_BYTES == 5 * 1024 * 1024
    with pytest.raises(HTTPException) as exc:
        validate_image_upload("a.png", b"")
    assert exc.value.status_code == 422
    with pytest.raises(HTTPException) as exc2:
        validate_image_upload("a.png", _image_bytes("PNG") + b"\x00" * MAX_PHOTO_BYTES)
    assert exc2.value.status_code == 413


def test_extension_must_match_content():
    from app.services.profile_photo_service import validate_image_upload

    with pytest.raises(HTTPException) as exc:
        validate_image_upload("a.jpg", _image_bytes("PNG"))
    assert exc.value.status_code == 422


def test_truncated_image_rejected():
    from app.services.profile_photo_service import validate_image_upload

    full = _image_bytes("PNG")
    with pytest.raises(HTTPException):
        validate_image_upload("a.png", full[:20])


# --------------------------------------------------
# Service set/remove
# --------------------------------------------------


def test_set_profile_photo_stores_bytes_and_version():
    from app.services.profile_photo_service import set_profile_photo

    user = _user()
    db = MagicMock()
    content = _image_bytes("JPEG")
    out = set_profile_photo(db, user, "me.jpg", content)
    assert out.profile_photo == content
    assert out.profile_photo_mime == "image/jpeg"
    assert out.profile_photo_updated_at is not None
    assert db.commit.called


def test_remove_profile_photo_clears_all_columns():
    from app.services.profile_photo_service import remove_profile_photo

    user = _user(
        profile_photo=b"bytes",
        profile_photo_mime="image/png",
        profile_photo_updated_at=datetime(2026, 1, 1),
    )
    db = MagicMock()
    out = remove_profile_photo(db, user)
    assert out.profile_photo is None
    assert out.profile_photo_mime is None
    assert out.profile_photo_updated_at is None
    assert db.commit.called


# --------------------------------------------------
# Router: ownership + contract
# --------------------------------------------------


def test_upload_own_photo_returns_user_with_version_no_bytes():
    png = _image_bytes("PNG")
    c = _client_for(_user())
    with patch("app.services.profile_photo_service.set_profile_photo") as mock_set:
        saved = _user(profile_photo_updated_at=datetime(2026, 5, 1, 12, 0, 0))
        mock_set.return_value = saved
        with patch("app.api.routes.auth.log_request_action"):
            res = c.put(
                "/auth/profile/photo",
                files={"file": ("me.png", png, "image/png")},
            )
    assert res.status_code == 200, res.text[:200]
    body = res.json()
    assert body["user_id"] == 11
    assert body["profile_photo_updated_at"] is not None
    assert "profile_photo" not in body  # bytes never in JSON
    assert "password_hash" not in body
    # Service received the JWT user, not a client user_id.
    assert mock_set.call_args[1]["user"].user_id == 11
    assert mock_set.call_args[1]["content"] == png


def test_upload_rejects_invalid_file_with_422():
    c = _client_for(_user())
    res = c.put(
        "/auth/profile/photo",
        files={"file": ("evil.png", b"MZ\x90malware", "image/png")},
    )
    assert res.status_code == 422


def test_guest_upload_and_delete_forbidden():
    c = _client_for(_user(role="GUEST"))
    png = _image_bytes("PNG")
    assert (
        c.put(
            "/auth/profile/photo",
            files={"file": ("me.png", png, "image/png")},
        ).status_code
        == 403
    )
    assert c.delete("/auth/profile/photo").status_code == 403


def test_unauthenticated_rejected():
    c = _client_for(None)
    assert c.get("/auth/profile/photo").status_code in (401, 403)
    assert c.delete("/auth/profile/photo").status_code in (401, 403)


def test_get_own_photo_bytes_and_missing_404():
    c = _client_for(_user(profile_photo=b"imgbytes", profile_photo_mime="image/png"))
    res = c.get("/auth/profile/photo")
    assert res.status_code == 200
    assert res.content == b"imgbytes"
    assert res.headers["content-type"] == "image/png"

    c2 = _client_for(_user())
    assert c2.get("/auth/profile/photo").status_code == 404


def test_delete_own_photo_returns_version_null():
    c = _client_for(
        _user(profile_photo=b"x", profile_photo_updated_at=datetime(2026, 1, 1))
    )
    with patch("app.services.profile_photo_service.remove_profile_photo") as mock_rm:
        mock_rm.return_value = _user()
        with patch("app.api.routes.auth.log_request_action"):
            res = c.delete("/auth/profile/photo")
    assert res.status_code == 200
    assert res.json()["profile_photo_updated_at"] is None


def test_me_includes_photo_version_and_existing_default():
    c = _client_for(_user(profile_photo_updated_at=datetime(2026, 3, 2, 3, 4, 5)))
    body = c.get("/auth/me").json()
    assert body["profile_photo_updated_at"] is not None

    c2 = _client_for(_user())
    body2 = c2.get("/auth/me").json()
    assert body2["profile_photo_updated_at"] is None
    assert "profile_photo" not in body2


def test_profile_update_persists_gender():
    from app.schemas.auth import ProfileUpdateRequest

    assert ProfileUpdateRequest(gender="Female").gender == "Female"
    assert ProfileUpdateRequest().gender is None

    c = _client_for(_user())
    with patch("app.api.routes.auth.log_request_action"):
        res = c.put("/auth/profile", json={"gender": "Female"})
    assert res.status_code == 200
    assert res.json()["gender"] == "Female"
