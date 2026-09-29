"""add application_end_date to schemes

Revision ID: e3f9a56789a3
Revises: d2e8c45678f2
Create Date: 2026-09-25 15:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e3f9a56789a3'
down_revision = 'd2e8c45678f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE schemes 
        ADD COLUMN IF NOT EXISTS application_end_date TIMESTAMP WITHOUT TIME ZONE;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE schemes 
        DROP COLUMN IF EXISTS application_end_date;
    """)
