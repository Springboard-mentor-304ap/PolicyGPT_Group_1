from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class EligibilityRule(Base):
    __tablename__ = "eligibility_rules"

    rule_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    policy_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("policies.policy_id"),
        nullable=True,
    )

    scheme_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("schemes.scheme_id"),
        nullable=True,
    )

    min_age: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    max_age: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    gender: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    max_income: Mapped[Decimal | None] = mapped_column(
        Numeric,
        nullable=True,
    )

    occupation: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    education: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    state: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    social_category: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )

    disability_status: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )