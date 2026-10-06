"""Add profile photo columns to users (additive, non-destructive).

Revision ID: profile_photo_01
Revises: saved_eligibility_01

Stores the user's avatar image bytes plus its MIME type and an
update timestamp used for cache-busting. All columns are nullable
with no backfill, so existing users keep working and simply report
no photo (NULL) until they upload one.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "profile_photo_01"
down_revision: Sequence[str] | str = "saved_eligibility_01"
branch_labels: Sequence[str] | str | None = None
depends_on: Sequence[str] | str | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo BYTEA")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_mime VARCHAR(50)"
    )
    op.execute(
        "ALTER TABLE users "
        "ADD COLUMN IF NOT EXISTS profile_photo_updated_at "
        "TIMESTAMP WITHOUT TIME ZONE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS profile_photo_updated_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS profile_photo_mime")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS profile_photo")
