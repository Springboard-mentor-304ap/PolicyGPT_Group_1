"""Policy document upload validation and persistence.

Ownership rule (mirrors Saved Items and profile photos): every function
takes the policy row and the authenticated ``User`` resolved from the
JWT by the route layer. Government officials may only manage documents
for policies they created; admins are exempt.

Storage notes: no external storage credentials exist in this
deployment, so file bytes persist in a TOASTed, deferred BYTEA column
on the pre-existing ``policy_documents`` table (mirroring user profile
photos) instead of Base64 in JSON or an ephemeral local directory.
Metadata only ever leaves the API; downloads stream bytes through the
authorized download endpoint.

Validation never trusts the client: extension allowlist, 10 MB cap,
then PDF magic-byte verification of the actual content (catches
renamed executables/text). One current row per policy; replacements
validate first and commit atomically, so a failed upload can never
destroy the existing file.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.policy_document import PolicyDocument
from app.models.user import User

logger = logging.getLogger("uvicorn.error")

#: Absolute upload cap (also enforced client-side).
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

#: PDF magic header; checked at the start of the content.
PDF_MAGIC = b"%PDF-"

ALLOWED_DOCUMENT_EXTENSIONS = {"pdf"}

CANONICAL_PDF_MIME = "application/pdf"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_admin_role(role: object) -> bool:
    return str(role or "").strip().upper() in {"ADMIN", "ADMINISTRATOR"}


def assert_can_manage_documents(
    policy: Policy,
    current_user: User,
) -> None:
    """Creators manage their own policy documents; admins manage all."""
    if _is_admin_role(getattr(current_user, "role", "")):
        return
    if (
        getattr(policy, "created_by", None) is not None
        and policy.created_by != current_user.user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage documents for policies created by yourself.",
        )


def validate_pdf_upload(
    filename: str | None,
    content: bytes,
    content_type: str | None = None,
) -> tuple[str, str]:
    """Validate raw PDF upload bytes. Returns (safe_name, canonical MIME).

    Raises 422 for empty/non-PDF content and 413 for oversize content.
    """
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Policy document must be 10 MB or smaller.",
        )

    raw_name = (filename or "").strip().rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    ext = raw_name.rsplit(".", 1)[-1].strip().lower() if "." in raw_name else ""
    if ext not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only PDF documents (.pdf) are accepted.",
        )
    if content_type and content_type.split(";")[0].strip().lower() not in {
        CANONICAL_PDF_MIME,
        "application/x-pdf",
    }:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file must be a PDF document.",
        )

    # Verify actual content, not just the extension/MIME: a genuine PDF
    # starts with the %PDF- magic header (allowing leading whitespace).
    head = content.lstrip()[: len(PDF_MAGIC)]
    if head != PDF_MAGIC:
        logger.warning("Rejected non-PDF policy upload: magic mismatch")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File content is not a valid PDF document.",
        )

    safe_name = raw_name[:255] or "policy-document.pdf"
    return safe_name, CANONICAL_PDF_MIME


def get_policy_document(db: Session, policy_id: int) -> PolicyDocument | None:
    """Current uploaded document for a policy, if any (no bytes loaded)."""
    return (
        db.query(PolicyDocument)
        .filter(PolicyDocument.policy_id == policy_id)
        .order_by(PolicyDocument.document_id.desc())
        .first()
    )


def to_metadata(doc: PolicyDocument) -> dict:
    """Public metadata shape (never includes file bytes)."""
    return {
        "document_id": doc.document_id,
        "policy_id": doc.policy_id,
        "document_name": doc.document_name,
        "document_type": doc.document_type,
        "mime_type": doc.mime_type,
        "file_size": doc.file_size,
        "uploaded_by": doc.uploaded_by,
        "created_at": doc.created_at.isoformat()
        if getattr(doc, "created_at", None)
        else None,
    }


def upload_policy_document(
    db: Session,
    policy: Policy,
    current_user: User,
    content: bytes,
    filename: str | None,
    content_type: str | None = None,
) -> PolicyDocument:
    """Validate and atomically store (or replace) a policy's document.

    Validation runs before any row is touched; the delete-old/insert-new
    pair commits once, so failures never orphan or destroy data.
    """
    assert_can_manage_documents(policy, current_user)
    safe_name, mime = validate_pdf_upload(filename, content, content_type)

    now = _now()
    try:
        db.query(PolicyDocument).filter(
            PolicyDocument.policy_id == policy.policy_id
        ).delete(synchronize_session=False)
        doc = PolicyDocument(
            policy_id=policy.policy_id,
            document_name=safe_name,
            document_type="PDF",
            document_url=None,
            uploaded_by=getattr(current_user, "user_id", None),
            file_data=bytes(content),
            file_size=len(content),
            mime_type=mime,
            created_at=now,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return doc
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception(
            "Failed to store document for policy %s: %s",
            policy.policy_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not store the uploaded document. Please try again.",
        ) from exc


def delete_policy_document(db: Session, policy: Policy) -> bool:
    """Remove a policy's uploaded document. Returns True when one existed."""
    doc = get_policy_document(db, policy.policy_id)
    if doc is None:
        return False
    try:
        db.delete(doc)
        db.commit()
        return True
    except Exception as exc:
        db.rollback()
        logger.exception(
            "Failed to delete document for policy %s: %s",
            policy.policy_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete the uploaded document. Please try again.",
        ) from exc
