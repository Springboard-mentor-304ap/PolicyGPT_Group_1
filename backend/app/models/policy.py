from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, String, Text
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
    # SUPPLEMENTARY DETAILS (ADD POLICY FORM, STEPS 2 & 4)
    # ========================================================
    # Collected by the Add Policy form (key objectives, additional
    # info/notes, compliance documents, implementation workflow) and
    # shown on the Policy Details page. All optional; older rows read
    # as None.

    key_objectives: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
    )

    additional_info: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    important_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    documents_required: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    implementation_process: Mapped[str | None] = mapped_column(
        Text,
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

    # Latest editor (draft ownership). created_by never changes;
    # updated_by tracks who last saved the record so draft lists can
    # attribute ownership to the latest editor. FK-less
    # (application-managed, like deleted_by) so user administration
    # can never be blocked by these references.
    updated_by: Mapped[int | None] = mapped_column(
        BigInteger,
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
