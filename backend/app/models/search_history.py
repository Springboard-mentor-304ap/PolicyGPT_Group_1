from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SearchHistory(Base):
    __tablename__ = "search_history"
    __table_args__ = {"schema": "extensions"}

    history_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        # Unqualified on purpose (see AuditLog/Report). The live
        # constraint is extensions.search_history.user_id -> users(user_id)
        # resolved via search_path.
        ForeignKey("users.user_id"),
        nullable=False
    )

    search_query: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    search_type: Mapped[str] = mapped_column(
        String,
        nullable=False
    )

    filters: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True
    )

    searched_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )