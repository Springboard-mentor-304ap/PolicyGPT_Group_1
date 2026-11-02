from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from app.db.database import Base


# =========================================================
# PASSWORD RESET TOKEN MODEL
# =========================================================

class PasswordResetToken(Base):

    __tablename__ = "password_reset_tokens"

    # =====================================================
    # ID
    # =====================================================

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # =====================================================
    # USER ID
    # =====================================================

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.user_id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # =====================================================
    # TOKEN HASH
    # =====================================================

    token_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # =====================================================
    # EXPIRATION
    # =====================================================

    expires_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    # =====================================================
    # USED
    # =====================================================

    used: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    # =====================================================
    # CREATED AT
    # =====================================================

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )
