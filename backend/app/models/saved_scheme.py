from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SavedScheme(Base):
    __tablename__ = "saved_schemes"

    saved_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "users.user_id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    scheme_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(
            "schemes.scheme_id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    saved_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        server_default=func.current_timestamp(),
    )
