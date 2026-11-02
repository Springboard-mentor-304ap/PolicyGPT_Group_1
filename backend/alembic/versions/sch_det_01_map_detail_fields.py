"""map existing scheme detail columns (no-op if already present)

Revision ID: schdet01
Revises: schlaunch01
Create Date: 2026-10-12 13:10:00.000000

key_highlights / additional_info / important_notes already exist on
some deployments (e.g. production Supabase) but were never mapped by
the ORM. This migration only guarantees their presence for fresh
databases; existing data is untouched.

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'schdet01'
down_revision = 'schlaunch01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE schemes
        ADD COLUMN IF NOT EXISTS key_highlights TEXT[],
        ADD COLUMN IF NOT EXISTS additional_info TEXT,
        ADD COLUMN IF NOT EXISTS important_notes TEXT;
    """)


def downgrade() -> None:
    # Data-preserving: leave the columns in place.
    pass
