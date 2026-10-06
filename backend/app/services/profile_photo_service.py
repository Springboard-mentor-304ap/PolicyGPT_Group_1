"""User profile-photo upload validation and persistence.

Ownership rule (mirrors Saved Items): every function takes the
authenticated ``User`` row resolved from the JWT by the route layer.
No ``user_id`` is ever accepted from the client, so a user can only
ever read or change their own photo.

Validation is defense in depth and never trusts the client:
extension allowlist, 5 MB cap, then Pillow integrity verification of
the actual bytes (catches executables/SVG/text renamed to .png).
"""

import io
import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.models.user import User

logger = logging.getLogger("uvicorn.error")

#: Absolute upload cap (also enforced client-side).
MAX_PHOTO_BYTES = 5 * 1024 * 1024

#: Pillow format -> (canonical MIME, matching extensions).
ALLOWED_IMAGE_FORMATS = {
    "JPEG": ("image/jpeg", {"jpg", "jpeg"}),
    "PNG": ("image/png", {"png"}),
    "WEBP": ("image/webp", {"webp"}),
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def validate_image_upload(
    filename: str | None,
    content: bytes,
) -> tuple[str, str]:
    """Validate raw upload bytes. Returns (extension, canonical MIME).

    Raises 422 for empty/undetectable/unsupported content and 413 for
    oversize content.
    """
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Profile photo must be 5 MB or smaller.",
        )

    ext = (
        (filename or "").rsplit(".", 1)[-1].strip().lower()
        if "." in (filename or "")
        else ""
    )
    try:
        with Image.open(io.BytesIO(content)) as img:
            img.verify()
        # verify() leaves the image unusable; reopen for format read.
        with Image.open(io.BytesIO(content)) as img:
            detected = (img.format or "").upper()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        logger.warning("Rejected non-image profile upload: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File is not a valid JPEG, PNG, or WEBP image.",
        )

    allowed = ALLOWED_IMAGE_FORMATS.get(detected)
    if allowed is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only JPEG, PNG, and WEBP images are allowed.",
        )
    mime, extensions = allowed
    if ext not in extensions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"File extension does not match image content (detected {detected})."
            ),
        )
    return ext, mime


def set_profile_photo(
    db: Session,
    user: User,
    filename: str | None,
    content: bytes,
) -> User:
    """Validate and persist a new photo for the authenticated user.

    No refresh: the new bytes/mime/version are already in memory, and
    a full refresh would SELECT the just-written multi-MB BYTEA straight
    back over the wire for no reason.
    """
    _, mime = validate_image_upload(filename, content)
    now = _now()
    user.profile_photo = content
    user.profile_photo_mime = mime
    user.profile_photo_updated_at = now
    user.updated_at = now
    db.commit()
    return user


def remove_profile_photo(db: Session, user: User) -> User:
    """Clear the authenticated user's photo (bytes + version signal)."""
    user.profile_photo = None
    user.profile_photo_mime = None
    user.profile_photo_updated_at = None
    user.updated_at = _now()
    db.commit()
    return user
