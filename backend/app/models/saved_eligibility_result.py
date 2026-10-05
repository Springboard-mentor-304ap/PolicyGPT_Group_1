from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SavedEligibilityResult(Base):
    """Eligibility results bookmarked by a user.

    One row per (user, entity): the authoritative eligibility outcome is
    re-evaluated server-side at save time, so stored rows can never be
    fabricated by the client. ``profile_data`` keeps the input snapshot
    used for the check so the result stays explainable.
    """

    __tablename__ = "saved_eligibility_results"
    __table_args__ = (
        # Per-user list ordering + the (user, entity) dedupe lookup.
        Index("ix_saved_eligibility_user_saved", "user_id", "saved_at"),
        Index(
            "ix_saved_eligibility_user_entity",
            "user_id",
            "entity_type",
            "entity_id",
        ),
    )

    saved_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "users.user_id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    entity_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    entity_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    entity_name: Mapped[str] = mapped_column(
        String(300),
        nullable=False,
        default="",
    )

    eligible: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    profile_data: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    saved_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.current_timestamp(),
    )
