"""track latest editor on policies and schemes

Revision ID: ownupd01
Revises: schfields01
Create Date: 2026-10-12 09:55:00.000000

Adds nullable updated_by columns (no FK constraint, matching the
application-managed deleted_by convention). Existing rows keep NULL,
which readers treat as "owned by the creator".

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'ownupd01'
down_revision = 'schfields01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS updated_by BIGINT;
    """)
    op.execute("""
        ALTER TABLE schemes
        ADD COLUMN IF NOT EXISTS updated_by BIGINT;
    """)


def downgrade() -> None:
    # Data-preserving: leave the columns in place.
    pass
