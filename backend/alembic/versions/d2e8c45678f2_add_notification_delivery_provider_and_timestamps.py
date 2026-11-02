"""add notification delivery provider and timestamps

Revision ID: d2e8c45678f2
Revises: c1f7b92345d1
Create Date: 2026-09-25 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd2e8c45678f2'
down_revision = 'c1f7b92345d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Update extensions.notifications table
    op.execute("""
        ALTER TABLE extensions.notifications 
        ADD COLUMN IF NOT EXISTS read_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
    """)

    # 2. Update extensions.notification_deliveries table
    op.execute("""
        ALTER TABLE extensions.notification_deliveries
        ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'INTERNAL',
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE extensions.notification_deliveries
        DROP COLUMN IF EXISTS provider,
        DROP COLUMN IF EXISTS updated_at;
    """)
    op.execute("""
        ALTER TABLE extensions.notifications
        DROP COLUMN IF EXISTS read_at,
        DROP COLUMN IF EXISTS updated_at,
        DROP COLUMN IF EXISTS expires_at;
    """)
