"""Merge heads + add hot-path indexes (idempotent, non-destructive).

Revision ID: perf_hotpath_indexes_01
Revises: f7c2a91b44d0, d4e5f6a7b8c9

Adds only indexes backing verified hot query patterns:
- extensions.notification_deliveries (channel, status, attempt_count)
  for the bounded retry sweep; (notification_id) for per-notification
  delivery lookups.
- otp_verifications (user_id, channel, used) for latest-unused OTP
  fetch + hourly rate-limit count.
- password_reset_tokens (token_hash) for reset-link validation.
- extensions.support_queries (user_id, created_at) for user ticket
  lists + retry-window dedupe.

Uses CREATE INDEX IF NOT EXISTS so the migration is safe to re-run and
a no-op where the indexes already exist. Drops them on downgrade.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "perf_hotpath_indexes_01"
down_revision: Sequence[str] | str = ("f7c2a91b44d0", "d4e5f6a7b8c9")
branch_labels: Sequence[str] | str | None = None
depends_on: Sequence[str] | str | None = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_notification_deliveries_retry "
        "ON extensions.notification_deliveries (channel, status, "
        "attempt_count)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_notification_deliveries_notification "
        "ON extensions.notification_deliveries (notification_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_otp_user_channel_used "
        "ON otp_verifications (user_id, channel, used)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_password_reset_token_hash "
        "ON password_reset_tokens (token_hash)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_support_queries_user_created "
        "ON extensions.support_queries (user_id, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS extensions.ix_support_queries_user_created")
    op.execute("DROP INDEX IF EXISTS ix_password_reset_token_hash")
    op.execute("DROP INDEX IF EXISTS ix_otp_user_channel_used")
    op.execute(
        "DROP INDEX IF EXISTS extensions.ix_notification_deliveries_notification"
    )
    op.execute("DROP INDEX IF EXISTS extensions.ix_notification_deliveries_retry")
