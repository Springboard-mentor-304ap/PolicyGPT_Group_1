from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from app.db.database import Base

# =========================================================
# OTP VERIFICATION MODEL
# =========================================================


class OTPVerification(Base):
    __tablename__ = "otp_verifications"
    __table_args__ = (
        # Hot paths: latest-unused OTP per (user, channel) and the hourly
        # rate-limit count per user.
        Index("ix_otp_user_channel_used", "user_id", "channel", "used"),
        {"schema": "extensions"},
    )

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
            "extensions.users.user_id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # =====================================================
    # OTP HASH
    # =====================================================

    otp_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # =====================================================
    # CHANNEL (email or sms)
    # =====================================================

    channel: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="email",
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
