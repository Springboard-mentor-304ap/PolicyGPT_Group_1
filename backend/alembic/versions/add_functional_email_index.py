"""Add functional index for lower(trim(email)) on users table.

This index speeds up the login endpoint user lookup which uses
func.lower(func.trim(User.email)) to match emails case-insensitively.

Revision ID: add_functional_email_index
Revises: perf_hotpath_indexes_01
Branch Labels: None
Depends On: None

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "add_functional_email_index"
down_revision = "perf_hotpath_indexes_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_lower_trim_email "
        "ON users (lower(trim(email)))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_lower_trim_email")
