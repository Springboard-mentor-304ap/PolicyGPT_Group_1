from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Policy(Base):

    __tablename__ = "policies"

    # ========================================================
    # PRIMARY KEY
    # ========================================================

    policy_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    # ========================================================
    # BASIC INFORMATION
    # ========================================================

    title: Mapped[str] = mapped_column(
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

    sector: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # ========================================================
    # DATES
    # ========================================================

    publication_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    effective_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    # ========================================================
    # STATUS
    # ========================================================

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="DRAFT",
    )

    # ========================================================
    # DOCUMENT / SOURCE
    # ========================================================

    document_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    source_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ========================================================
    # BENEFITS
    # ========================================================

    benefits: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
    )

    # ========================================================
    # ELIGIBILITY RULES
    # ========================================================

    eligibility_rules: Mapped[list | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    # ========================================================
    # USERS
    # ========================================================

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

    # ========================================================
    # REJECTION
    # ========================================================

    rejection_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ========================================================
    # ARCHIVE REQUEST
    # ========================================================

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

    # ========================================================
    # DELETE REQUEST
    # ========================================================

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

    # ========================================================
    # IMPORTANT:
    # Stores status before delete request.
    #
    # APPROVED -> DELETE_REQUESTED -> APPROVED
    #
    # OR
    #
    # ARCHIVED -> DELETE_REQUESTED -> ARCHIVED
    # ========================================================

    delete_requested_from_status: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    # ========================================================
    # TIMESTAMPS
    # ========================================================

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )
