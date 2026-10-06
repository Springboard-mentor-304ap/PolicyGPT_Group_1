from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, deferred, mapped_column

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    full_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    role: Mapped[str] = mapped_column(
        String(30),
        nullable=False
    )

    phone: Mapped[str | None] = mapped_column(
        String(20),
        unique=True,
        nullable=True
    )

    gender: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True
    )

    date_of_birth: Mapped[date | None] = mapped_column(
        Date,
        nullable=True
    )

    state: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    district: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    occupation: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True
    )

    organization: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True
    )

    token_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    # Profile photo bytes (TOASTed out of line, so the main tuple stays
    # small). NULL until the user uploads a photo. Served via
    # GET /auth/profile/photo, never embedded in JSON responses.
    # Deferred: ordinary queries (auth on every request, profile text
    # updates) must NOT pull up to 5 MB of bytes over the wire — the
    # bytes load lazily only when the photo endpoint accesses them.
    # No migration: query-time loading only, storage unchanged.
    profile_photo: Mapped[bytes | None] = deferred(
        mapped_column(
            LargeBinary,
            nullable=True,
        )
    )

    profile_photo_mime: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True
    )

    # Version signal for avatar caching: NULL means "no photo", any
    # change means "refetch". Stable while the photo is unchanged.
    profile_photo_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True
    )
