"""policy supplementary details (add-policy steps 2 & 4)

Revision ID: policy_details_01
Revises: soft_delete_01
Create Date: 2026-10-11 00:00:00.000000

Persists Add Policy fields that were previously collected by the form
but dropped at submission: key objectives, additional info, important
notes, compliance documents, and the implementation workflow. All
columns are nullable so existing rows read as absent and the details
page hides those sections.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'policy_details_01'
down_revision = 'soft_delete_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS key_objectives TEXT[];
    """)
    op.execute("""
        ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS additional_info TEXT;
    """)
    op.execute("""
        ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS important_notes TEXT;
    """)
    op.execute("""
        ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS documents_required TEXT;
    """)
    op.execute("""
        ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS implementation_process TEXT;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE policies DROP COLUMN IF EXISTS implementation_process;")
    op.execute("ALTER TABLE policies DROP COLUMN IF EXISTS documents_required;")
    op.execute("ALTER TABLE policies DROP COLUMN IF EXISTS important_notes;")
    op.execute("ALTER TABLE policies DROP COLUMN IF EXISTS additional_info;")
    op.execute("ALTER TABLE policies DROP COLUMN IF EXISTS key_objectives;")
