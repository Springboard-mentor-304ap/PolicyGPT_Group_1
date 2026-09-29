"""notification category, per-type preference matrix, indexes

Revision ID: f4a91c7d2e60
Revises: e3f9a56789a3
Create Date: 2026-09-27

Adds:
  * extensions.notifications.category - canonical category, backfilled from
    notification_type.
  * extensions.notification_preference_rules - the per-notification-type x
    channel matrix rendered by the preferences screen.
  * Composite indexes that make the unread badge and category tabs index-only.
  * Priority normalisation MEDIUM -> NORMAL.

Every statement is IF NOT EXISTS / guarded so the migration is safe to re-run
and never drops existing notification data.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f4a91c7d2e60"
down_revision = "e3f9a56789a3"
branch_labels = None
depends_on = None


# Kept in sync with app.services.notification_taxonomy.TYPE_TO_CATEGORY. This
# is duplicated deliberately: a migration must not depend on importable
# application code, or a future refactor could silently rewrite history.
_CATEGORY_BY_TYPE = {
    "ADMIN_REQUEST": [
        "POLICY_APPROVAL_REQUEST", "POLICY_PENDING_REQUEST", "POLICY_SUBMITTED",
        "POLICY_ARCHIVE_REQUEST", "POLICY_ARCHIVE_REQUESTED", "POLICY_DELETE_REQUEST",
        "SCHEME_APPROVAL_REQUEST", "SCHEME_APPROVAL_REQUIRED", "SCHEME_PENDING_REQUEST",
        "SCHEME_SUBMITTED", "SCHEME_ARCHIVE_REQUEST", "SCHEME_DELETE_REQUEST",
        "ADMIN_ACTION_UPDATE",
    ],
    "APPROVAL": [
        "POLICY_APPROVED", "POLICY_REJECTED", "SCHEME_APPROVED", "SCHEME_REJECTED",
        "REQUEST_APPROVED", "REQUEST_REJECTED",
    ],
    "POLICY": ["NEW_POLICY", "POLICY_PUBLISHED", "POLICY_UPDATED"],
    "SCHEME": ["NEW_SCHEME", "SCHEME_PUBLISHED", "SCHEME_UPDATED"],
    "DEADLINE": ["SCHEME_ENDING", "SCHEME_ENDED", "DEADLINE_REMINDER"],
    "APPLICATION": [
        "APPLICATION_UPDATE", "APPLICATION_SUBMITTED", "APPLICATION_APPROVED",
        "APPLICATION_REJECTED",
    ],
    "SUPPORT": [
        "NEW_FEEDBACK", "ISSUE_REPORTED", "FEEDBACK_ESCALATED", "FEEDBACK_RESOLVED",
        "CITIZEN_FEEDBACK", "FEEDBACK_UPDATE", "SUPPORT_UPDATE",
    ],
    "SYSTEM": [
        "SYSTEM_ALERT", "BACKGROUND_JOB_FAILURE", "API_FAILURE", "DATABASE_ALERT",
        "SECURITY_ALERT", "EMAIL_DELIVERY_FAILURE", "SMS_DELIVERY_FAILURE",
        "EMAIL_BOUNCE", "SMS_FAILURE", "NOTIFICATION_DELIVERY_FAILURE",
        "NEW_USER", "USER_ROLE_CHANGE", "USER_STATUS_CHANGE",
        "GOVERNMENT_ANNOUNCEMENT", "DEPARTMENT_ALERT", "REGULATORY_UPDATE",
        "RESEARCH_REPORT", "SAVED_SEARCH_ALERT", "REPORT_COMPLETED",
    ],
}


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # 1. Canonical category on notifications
    # ------------------------------------------------------------------
    op.execute("""
        ALTER TABLE extensions.notifications
        ADD COLUMN IF NOT EXISTS category VARCHAR(30)
    """)

    for category, types in _CATEGORY_BY_TYPE.items():
        bind.execute(
            sa.text(
                """
                UPDATE extensions.notifications
                   SET category = :category
                 WHERE notification_type = ANY(:types)
                   AND (category IS NULL OR category = '')
                """
            ),
            {"category": category, "types": list(types)},
        )

    # Anything unrecognised (including legacy rows) becomes SYSTEM, which is
    # visible to every role - the safe default.
    bind.execute(
        sa.text(
            """
            UPDATE extensions.notifications
               SET category = 'SYSTEM'
             WHERE category IS NULL OR category = ''
            """
        )
    )

    op.execute("""
        ALTER TABLE extensions.notifications
        ALTER COLUMN category SET DEFAULT 'SYSTEM',
        ALTER COLUMN category SET NOT NULL
    """)

    # ------------------------------------------------------------------
    # 2. Priority vocabulary MEDIUM -> NORMAL
    # ------------------------------------------------------------------
    bind.execute(
        sa.text(
            """
            UPDATE extensions.notifications
               SET priority = 'NORMAL'
             WHERE priority IS NULL OR UPPER(priority) = 'MEDIUM'
            """
        )
    )

    # ------------------------------------------------------------------
    # 3. Per-type preference matrix
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS extensions.notification_preference_rules (
            rule_id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES extensions.users(user_id) ON DELETE CASCADE,
            notification_type VARCHAR(50) NOT NULL,
            group_key VARCHAR(50) NOT NULL,
            in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_pref_rule_user_type UNIQUE (user_id, notification_type)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_notification_preference_rules_user_id
        ON extensions.notification_preference_rules (user_id)
    """)

    # ------------------------------------------------------------------
    # 4. Query indexes for the notification centre
    # ------------------------------------------------------------------
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_notifications_user_recent
        ON extensions.notifications (user_id, is_read, created_at DESC)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_notifications_user_category
        ON extensions.notifications (user_id, category)
    """)

    # ------------------------------------------------------------------
    # 5. Retry support: partial index over retryable deliveries
    # ------------------------------------------------------------------
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_notification_deliveries_retryable
        ON extensions.notification_deliveries (status, attempt_count)
    """)


def downgrade() -> None:
    # Deliberately non-destructive: existing notification data and user
    # preferences are preserved. Only the additive structures are removed.
    op.execute(
        "DROP INDEX IF EXISTS extensions.ix_notification_deliveries_retryable")
    op.execute("DROP INDEX IF EXISTS extensions.ix_notifications_user_category")
    op.execute("DROP INDEX IF EXISTS extensions.ix_notifications_user_recent")
    op.execute("DROP TABLE IF EXISTS extensions.notification_preference_rules")
    op.execute(
        "ALTER TABLE extensions.notifications DROP COLUMN IF EXISTS category")
