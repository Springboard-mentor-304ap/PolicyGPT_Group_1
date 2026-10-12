"""add launch_date to schemes

Revision ID: schlaunch01
Revises: schrelpol01
Create Date: 2026-10-12 12:30:00.000000

Nullable launch/publication date for schemes. Existing rows keep NULL.

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'schlaunch01'
down_revision = 'schrelpol01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE schemes
        ADD COLUMN IF NOT EXISTS launch_date DATE;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE schemes
        DROP COLUMN IF EXISTS launch_date;
    """)
