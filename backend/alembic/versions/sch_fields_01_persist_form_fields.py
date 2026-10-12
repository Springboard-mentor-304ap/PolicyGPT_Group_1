"""persist remaining scheme form fields

Revision ID: schfields01
Revises: schdet01
Create Date: 2026-10-12 13:20:00.000000

The Add/Edit Scheme forms render Eligibility State and an additional
Source URL, but no columns existed so values were silently dropped on
save. Adds both as nullable columns; existing rows keep NULL.

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'schfields01'
down_revision = 'schdet01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE schemes
        ADD COLUMN IF NOT EXISTS eligibility_state VARCHAR(100),
        ADD COLUMN IF NOT EXISTS application_source_url TEXT;
    """)


def downgrade() -> None:
    # Data-preserving: leave the columns in place.
    pass
