from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"
    __table_args__ = {"schema": "extensions"}

    delivery_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True
    )

    notification_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("extensions.notifications.notification_id",
                   ondelete="CASCADE"),
        nullable=False
    )

    channel: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="INTERNAL"
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="PENDING"
    )

    provider_message_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    attempt_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1
    )

    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True
    )

    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True
    )

    failed_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True
    )

    failure_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )

