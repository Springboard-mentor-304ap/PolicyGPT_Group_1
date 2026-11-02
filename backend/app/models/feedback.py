from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Feedback(Base):
    __tablename__ = "feedback"
    __table_args__ = {"schema": "extensions"}

    feedback_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("extensions.users.user_id"),
        nullable=False
    )

    policy_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True
    )

    scheme_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True
    )

    feedback_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    subject: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    message: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    admin_response: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )