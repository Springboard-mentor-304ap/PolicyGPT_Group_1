"""enhanced notification module

Revision ID: c1f7b92345d1
Revises: eb51975cb3ea
Create Date: 2026-09-24 23:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1f7b92345d1'
down_revision = 'eb51975cb3ea'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Update extensions.notifications table
    op.execute("""
        ALTER TABLE extensions.notifications 
        ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'MEDIUM',
        ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'IN_APP',
        ADD COLUMN IF NOT EXISTS action_url VARCHAR(500),
        ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
        ADD COLUMN IF NOT EXISTS entity_id BIGINT,
        ADD COLUMN IF NOT EXISTS source_name VARCHAR(200);
    """)

    # 2. Update extensions.notification_preferences table
    op.execute("""
        ALTER TABLE extensions.notification_preferences
        ADD COLUMN IF NOT EXISTS application_updates BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS government_announcements BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS regulatory_updates BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS research_reports BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS system_alerts BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS frequency VARCHAR(30) DEFAULT 'INSTANT';
    """)

    # 3. Create extensions.notification_deliveries table
    op.execute("""
        CREATE TABLE IF NOT EXISTS extensions.notification_deliveries (
            delivery_id BIGSERIAL PRIMARY KEY,
            notification_id BIGINT REFERENCES extensions.notifications(notification_id) ON DELETE CASCADE,
            channel VARCHAR(20) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
            provider_message_id VARCHAR(255),
            attempt_count INT DEFAULT 1,
            sent_at TIMESTAMP,
            delivered_at TIMESTAMP,
            failed_at TIMESTAMP,
            failure_reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS extensions.notification_deliveries;")
    op.execute("""
        ALTER TABLE extensions.notification_preferences
        DROP COLUMN IF EXISTS application_updates,
        DROP COLUMN IF EXISTS government_announcements,
        DROP COLUMN IF EXISTS regulatory_updates,
        DROP COLUMN IF EXISTS research_reports,
        DROP COLUMN IF EXISTS system_alerts,
        DROP COLUMN IF EXISTS frequency;
    """)
    op.execute("""
        ALTER TABLE extensions.notifications
        DROP COLUMN IF EXISTS priority,
        DROP COLUMN IF EXISTS channel,
        DROP COLUMN IF EXISTS action_url,
        DROP COLUMN IF EXISTS entity_type,
        DROP COLUMN IF EXISTS entity_id,
        DROP COLUMN IF EXISTS source_name;
    """)
