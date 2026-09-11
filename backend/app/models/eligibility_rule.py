from datetime import datetime

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

    # =========================================================
    # PRIMARY KEY
    # =========================================================

    rule_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    # =========================================================
    # PARENT ENTITY
    # Exactly ONE should be populated
    # =========================================================

    policy_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(
            "policies.policy_id",
            ondelete="CASCADE",
        ),
        nullable=True,
    )

    scheme_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(
            "schemes.scheme_id",
            ondelete="CASCADE",
        ),
        nullable=True,
    )

    # =========================================================
    # ELIGIBILITY CONDITIONS
    # =========================================================

    min_age: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    max_age: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    gender: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    max_income: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    occupation: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    education: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    state: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    social_category: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    disability_status: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )

    # =========================================================
    # ACTIVE / INACTIVE
    # =========================================================

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    # =========================================================
    # TIMESTAMPS
    # =========================================================

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )
