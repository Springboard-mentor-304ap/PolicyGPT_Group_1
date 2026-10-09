from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class FAQ(Base):
    __tablename__ = "faqs"
    __table_args__ = {"schema": "extensions"}

    faq_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True
    )

    question: Mapped[str] = mapped_column(
        String(500),
        nullable=False
    )

    answer: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    category: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="PUBLISHED",
    )

    display_order: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
    )

    # Role visibility: canonical role codes allowed to see this FAQ,
    # or ["ALL"] for FAQs visible to everyone (including guests).
    # Canonical values: ALL, ADMIN, GOVERNMENT_OFFICIAL, CITIZEN,
    # RESEARCHER, ORGANIZATION, GUEST. Matches the ARRAY(String)
    # convention used by Policy.benefits / Scheme.benefits.
    target_roles: Mapped[list[str]] = mapped_column(
        ARRAY(String(50)),
        nullable=False,
        default=list,
        server_default=text("'{ALL}'"),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )