"""soft delete (trash) flags for policies and schemes

Revision ID: soft_delete_01
Revises: faq_audience_01
Create Date: 2026-10-11 00:00:00.000000

Normal deletions flag rows instead of removing them. Physical removal
happens exclusively via the Deleted modal permanent-delete action or
the 30-day auto-cleanup, both of which read these columns.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'soft_delete_01'
down_revision = 'faq_audience_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    """)
    op.execute("""
        ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE;
    """)
    op.execute("""
        ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_policies_is_deleted
        ON policies (is_deleted);
    """)
    op.execute("""
        ALTER TABLE schemes
        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    """)
    op.execute("""
        ALTER TABLE schemes
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITHOUT TIME ZONE;
    """)
    op.execute("""
        ALTER TABLE schemes
        ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_schemes_is_deleted
        ON schemes (is_deleted);
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_schemes_is_deleted;")
    op.execute("ALTER TABLE schemes DROP COLUMN IF EXISTS deleted_by;")
    op.execute("ALTER TABLE schemes DROP COLUMN IF EXISTS deleted_at;")
    op.execute("ALTER TABLE schemes DROP COLUMN IF EXISTS is_deleted;")
    op.execute("DROP INDEX IF EXISTS ix_policies_is_deleted;")
    op.execute("ALTER TABLE policies DROP COLUMN IF EXISTS deleted_by;")
    op.execute("ALTER TABLE policies DROP COLUMN IF EXISTS deleted_at;")
    op.execute("ALTER TABLE policies DROP COLUMN IF EXISTS is_deleted;")
