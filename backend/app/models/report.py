from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = {"schema": "extensions"}

    report_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True
    )

    generated_by: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("extensions.users.user_id"),
        nullable=False
    )

    report_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    report_format: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    parameters: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True
    )

    file_path: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    generated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )