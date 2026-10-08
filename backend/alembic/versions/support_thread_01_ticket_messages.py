"""Threaded support ticket conversation (additive, non-destructive).

Revision ID: support_thread_01
Revises: profile_gender_01

The ticket conversation was a single ``support_queries.response`` text
column. This adds ``extensions.support_ticket_messages`` so every user
and admin reply is an individual auditable row. The legacy ``response``
column is preserved (latest admin response keeps being mirrored there),
so existing data and reads are untouched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "support_thread_01"
down_revision: Sequence[str] | str = "profile_gender_01"
branch_labels: Sequence[str] | str | None = None
depends_on: Sequence[str] | str | None = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS extensions")
    op.create_table(
        "support_ticket_messages",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("ticket_id", sa.BigInteger(), nullable=False),
        sa.Column("sender_id", sa.BigInteger(), nullable=False),
        sa.Column("sender_role", sa.String(length=30), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["ticket_id"],
            ["extensions.support_queries.query_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sender_id"],
            ["users.user_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="extensions",
        if_not_exists=True,
    )
    op.create_index(
        "ix_support_ticket_messages_ticket_created",
        "support_ticket_messages",
        ["ticket_id", "created_at"],
        unique=False,
        schema="extensions",
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_support_ticket_messages_ticket_created",
        table_name="support_ticket_messages",
        schema="extensions",
        if_exists=True,
    )
    op.drop_table(
        "support_ticket_messages",
        schema="extensions",
        if_exists=True,
    )
