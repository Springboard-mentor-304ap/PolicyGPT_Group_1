from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_generated_by", "generated_by"),
        Index("ix_reports_generated_at", "generated_at"),
        Index("ix_reports_type_format", "report_type", "report_format"),
        {"schema": "extensions"},
    )

    report_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True
    )

    generated_by: Mapped[int] = mapped_column(
        BigInteger,
        # Unqualified on purpose. `User.__tablename__` is "users" with no
        # explicit schema, so SQLAlchemy's metadata holds it under "users";
        # a qualified "extensions.users.user_id" here fails to resolve at
        # flush time with NoReferencedTableError. The connection's
        # search_path already points at `extensions`, so the emitted DDL
        # and the live constraint both resolve correctly.
        # Live DB: extensions.reports.generated_by -> users(user_id).
        ForeignKey("users.user_id"),
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

    title: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="COMPLETED",
        server_default=text("'COMPLETED'"),
    )

    parameters: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True
    )

    file_path: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    file_size: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True
    )

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True
    )

    generated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
    )
