from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, String, Text, select
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, column_property, mapped_column

from app.db.database import Base
from app.models.policy import Policy


class Scheme(Base):
    __tablename__ = "schemes"
    __table_args__ = {"schema": "extensions"}

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

    eligibility_state: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    benefits: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
    )

    key_highlights: Mapped[list[str] | None] = mapped_column(
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

    application_process: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    application_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    application_source_url: Mapped[str | None] = mapped_column(
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

    launch_date: Mapped[date | None] = mapped_column(
        Date,
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
        ForeignKey("extensions.users.user_id"),
        nullable=True,
    )

    approved_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("extensions.users.user_id"),
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
        ForeignKey("extensions.users.user_id"),
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
        ForeignKey("extensions.users.user_id"),
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
    # RELATED POLICY (OPTIONAL)
    # ========================================================
    # Nullable reference to the policy this scheme implements or
    # relates to. Never stores a title: display info is resolved via
    # the correlated title below. ON DELETE SET NULL (migration)
    # preserves scheme rows when a policy is purged.
    related_policy_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("extensions.policies.policy_id"),
        nullable=True,
    )

    # Transient display title for the referenced policy (None when no
    # reference or the policy row is gone). Rendered as a correlated
    # scalar subquery so every read path (single, list, trash) carries
    # it without extra queries or per-endpoint enrichment.
    related_policy_title: Mapped[str | None] = column_property(
        select(Policy.title)
        .where(Policy.policy_id == related_policy_id)
        .scalar_subquery(),
        deferred=False,
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
