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


class SavedScheme(Base):
    __tablename__ = "saved_schemes"
    __table_args__ = (
        # Drives role-analytics aggregations: per-user counts, trend
        # buckets and windowed joins on (user_id, saved_at).
        Index("ix_saved_schemes_user_saved", "user_id", "saved_at"),
        {"schema": "extensions"},
    )

    saved_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "extensions.users.user_id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    scheme_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "extensions.schemes.scheme_id",
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
