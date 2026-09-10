from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Policy(Base):
    __tablename__ = "policies"

    policy_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    title: Mapped[str] = mapped_column(String(300), nullable=False)

    description: Mapped[str] = mapped_column(Text, nullable=False)

    category: Mapped[str] = mapped_column(String(100), nullable=False)

    ministry: Mapped[str | None] = mapped_column(String(200), nullable=True)

    department: Mapped[str | None] = mapped_column(String(200), nullable=True)

    state: Mapped[str | None] = mapped_column(String(100), nullable=True)

    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)

    publication_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="DRAFT")

    document_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True
    )

    approved_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
