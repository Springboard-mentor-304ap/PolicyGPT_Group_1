from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SavedPolicy(Base):
    __tablename__ = "saved_policies"
    __table_args__ = (
        # Drives role-analytics aggregations: per-user counts, trend
        # buckets and windowed joins on (user_id, saved_at).
        Index("ix_saved_policies_user_saved", "user_id", "saved_at"),
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

    policy_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "policies.policy_id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    saved_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.current_timestamp(),
    )
