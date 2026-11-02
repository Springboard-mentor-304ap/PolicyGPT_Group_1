"""PolicyGPT Assistant: persist structured reply payloads.

Revision ID: d4e5f6a7b8c9
Revises: c8a7b6d5e4f3
Create Date: 2026-10-04

Adds a nullable JSONB `payload` column to extensions.chatbot_messages so
reopening a conversation restores its structured cards, action buttons
and eligibility metadata exactly as answered. Additive only: the column
is nullable, existing rows read back as None, and no existing table or
data is touched. The inspector guard keeps the migration safe to re-run.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = "d4e5f6a7b8c9"
down_revision = "c8a7b6d5e4f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {
        column["name"]
        for column in inspector.get_columns(
            "chatbot_messages", schema="extensions"
        )
    }
    if "payload" not in existing:
        op.add_column(
            "chatbot_messages",
            sa.Column("payload", JSONB(), nullable=True),
            schema="extensions",
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {
        column["name"]
        for column in inspector.get_columns(
            "chatbot_messages", schema="extensions"
        )
    }
    if "payload" in existing:
        op.drop_column("chatbot_messages", "payload", schema="extensions")
