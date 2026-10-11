from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Scheme(Base):
    __tablename__ = "schemes"

    scheme_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    name: Mapped[str] = mapped_column(
        String(300),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    category: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    ministry: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    department: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    state: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    benefits: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
    )

    documents_required: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    application_process: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    application_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    application_end_date: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    source_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="DRAFT",
    )

    eligibility_rules: Mapped[list | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    created_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id"),
        nullable=True,
    )

    approved_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id"),
        nullable=True,
    )

    rejection_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    archive_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    archive_requested_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id"),
        nullable=True,
    )

    archive_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    delete_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    delete_requested_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id"),
        nullable=True,
    )

    delete_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    delete_requested_from_status: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    # ========================================================
    # SOFT DELETE (TRASH)
    # ========================================================
    # Normal deletions only flag the row; the status and all other
    # data are preserved. Physical removal happens exclusively via the
    # Deleted modal permanent-delete action or the 30-day auto-cleanup.
    # deleted_by is intentionally FK-less (application-managed) so user
    # administration can never be blocked by trash references.

    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    deleted_by: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )
