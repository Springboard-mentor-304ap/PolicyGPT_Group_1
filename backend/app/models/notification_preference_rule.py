from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class NotificationPreferenceRule(Base):
    """Per-notification-type channel override.

    The parent ``notification_preferences`` row holds the global master
    switches (email_enabled / sms_enabled / in_app_enabled) and the
    pre-existing topical booleans. This table holds the fine-grained
    matrix the preferences screen renders: one row per
    (user, notification_type) with an explicit channel decision.

    A type with no row here inherits its group default, and the global
    master switch still gates every channel - a rule can only ever turn a
    channel *off* below the global setting, never on above it.
    """

    __tablename__ = "notification_preference_rules"
    __table_args__ = (
        UniqueConstraint("user_id", "notification_type",
                         name="uq_pref_rule_user_type"),
        {"schema": "extensions"},
    )

    rule_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("extensions.users.user_id", ondelete="CASCADE"),
        nullable=False,
    )

    notification_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    group_key: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    in_app_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    email_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    sms_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
