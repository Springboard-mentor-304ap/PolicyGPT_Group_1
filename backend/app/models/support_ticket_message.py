from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class SupportTicketMessage(Base):
    """Threaded conversation messages on a support ticket.

    Replaces the single ``SupportQuery.response`` text column as the
    conversation record: every user reply and every admin reply is an
    individual row. The legacy ``response`` column is preserved for
    backward compatibility (latest admin response is mirrored there).
    """

    __tablename__ = "support_ticket_messages"
    __table_args__ = (
        Index(
            "ix_support_ticket_messages_ticket_created",
            "ticket_id",
            "created_at",
        ),
        {"schema": "extensions"},
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    ticket_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("extensions.support_queries.query_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    sender_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )

    sender_role: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    ticket = relationship(
        "SupportQuery",
        back_populates="messages",
        passive_deletes=True,
    )

    sender = relationship(
        "User",
        foreign_keys=[sender_id],
        passive_deletes=True,
    )
