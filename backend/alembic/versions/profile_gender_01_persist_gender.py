"""Persist profile gender (additive, non-destructive).

Revision ID: profile_gender_01
Revises: profile_photo_01

The Edit Profile form collects gender as a required field, but the
backend had no column for it: every save silently dropped the value
and reopening the form failed required validation, blocking any
subsequent save (including photo removal). This adds a nullable
gender column; existing users default to NULL.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "profile_gender_01"
down_revision: Sequence[str] | str = "profile_photo_01"
branch_labels: Sequence[str] | str | None = None
depends_on: Sequence[str] | str | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(30)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS gender")
