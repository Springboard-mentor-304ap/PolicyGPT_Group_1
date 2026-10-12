from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class ChatbotConversation(Base):
    """One chat thread per user (guests own threads via their user row)."""

    __tablename__ = "chatbot_conversations"
    __table_args__ = {"schema": "extensions"}

    conversation_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("extensions.users.user_id"),
        nullable=True,
    )

    session_id: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )

    role: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="GUEST",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )


class ChatbotMessage(Base):
    """A single user/assistant turn inside a conversation."""

    __tablename__ = "chatbot_messages"
    __table_args__ = {"schema": "extensions"}

    message_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    conversation_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("extensions.chatbot_conversations.conversation_id"),
        nullable=False,
    )

    sender: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
    )

    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    intent: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    # Structured assistant payload (actions/results/data/sources) stored at
    # reply time so reopening a conversation restores its cards, buttons
    # and eligibility metadata exactly as answered. User turns store None.
    payload: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )


class ChatbotUsage(Base):
    """Server-side per-user message counter (drives the guest limit)."""

    __tablename__ = "chatbot_usage"
    __table_args__ = {"schema": "extensions"}

    usage_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("extensions.users.user_id"),
        nullable=True,
        unique=True,
    )

    session_id: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )

    message_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )
