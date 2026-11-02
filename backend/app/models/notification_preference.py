from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = {"schema": "extensions"}

    preference_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("extensions.users.user_id"),
        nullable=False
    )

    email_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True
    )

    sms_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False
    )

    in_app_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True
    )

    policy_alerts: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True
    )

    scheme_updates: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True
    )

    deadline_reminders: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )