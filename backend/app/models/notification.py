from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        # Drives the notification centre's default ordering + unread badge.
        Index(
            "ix_notifications_user_recent",
            "user_id",
            "is_read",
            sa.desc("created_at"),
        ),
        # Drives the category tab filters.
        Index("ix_notifications_user_category", "user_id", "category"),
        {"schema": "extensions"},
    )

    notification_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True
    )

    user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id"),
        nullable=True
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False
    )

    message: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    notification_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    # Canonical category resolved from notification_type by
    # app.services.notification_taxonomy. Denormalised so the notification
    # centre can filter by category without a per-row Python function call.
    category: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="SYSTEM",
        server_default="SYSTEM",
    )

    priority: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="MEDIUM"
    )

    channel: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="IN_APP"
    )

    action_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True
    )

    entity_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True
    )

    entity_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True
    )

    source_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True
    )

    related_policy_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True
    )

    related_scheme_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True
    )

    is_read: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False
    )

    read_at: Mapped[datetime | None] = mapped_column(
        DateTime,
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

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True
    )