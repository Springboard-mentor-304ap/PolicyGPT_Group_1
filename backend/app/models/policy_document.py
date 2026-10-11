from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import BYTEA
from sqlalchemy.orm import Mapped, deferred, mapped_column

from app.db.database import Base


class PolicyDocument(Base):
    """Uploaded policy document (metadata + bytes).

    One current row per policy: replacements overwrite atomically, so
    a failed upload can never orphan or destroy the existing file.
    ``file_data`` is deferred/TOASTed and never serialized into JSON;
    downloads stream through the authorized download endpoint.
    """

    __tablename__ = "policy_documents"

    document_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    policy_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("policies.policy_id", ondelete="CASCADE"),
        nullable=False,
    )

    document_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    document_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    document_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    uploaded_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id"),
        nullable=True,
    )

    file_data: Mapped[bytes | None] = deferred(
        mapped_column(BYTEA, nullable=True)
    )

    file_size: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )

    mime_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        nullable=False,
    )
