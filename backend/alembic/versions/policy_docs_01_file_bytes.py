"""policy document file bytes (upload feature)

Revision ID: policy_docs_01
Revises: policy_details_01
Create Date: 2026-10-11 00:00:00.000000

The ``policy_documents`` metadata table predates this feature; these
columns persist the uploaded PDF itself. Binary content lives in a
TOASTed, deferred BYTEA column (mirroring user profile photos) so
ordinary JSON responses never carry file bytes — downloads stream
through an authorized endpoint instead. No external storage
credentials exist in this deployment, so no separate provider is
introduced.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'policy_docs_01'
down_revision = 'policy_details_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE policy_documents
        ADD COLUMN IF NOT EXISTS file_data BYTEA;
    """)
    op.execute("""
        ALTER TABLE policy_documents
        ADD COLUMN IF NOT EXISTS file_size BIGINT;
    """)
    op.execute("""
        ALTER TABLE policy_documents
        ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE policy_documents DROP COLUMN IF EXISTS mime_type;")
    op.execute("ALTER TABLE policy_documents DROP COLUMN IF EXISTS file_size;")
    op.execute("ALTER TABLE policy_documents DROP COLUMN IF EXISTS file_data;")
