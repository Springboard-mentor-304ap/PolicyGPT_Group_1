"""PolicyGPT Assistant (chatbot) tables — additive only.

Revision ID: c8a7b6d5e4f3
Revises: 21a945991063
Create Date: 2026-10-01

Adds (all under the extensions schema, matching existing conventions):
  * extensions.chatbot_conversations - one thread per user
  * extensions.chatbot_messages - user/assistant turns with intents
  * extensions.chatbot_usage - server-side per-user message counters

Uses checkfirst guards so the migration is safe to re-run and never
touches existing tables or data.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c8a7b6d5e4f3"
down_revision = "21a945991063"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chatbot_conversations",
        sa.Column("conversation_id", sa.BigInteger(), autoincrement=True,
                  nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.user_id"], name="fk_chatbot_conversations_user",
        ),
        sa.PrimaryKeyConstraint("conversation_id"),
        schema="extensions",
        **{"checkfirst": True},
    )
    op.create_table(
        "chatbot_messages",
        sa.Column("message_id", sa.BigInteger(), autoincrement=True,
                  nullable=False),
        sa.Column("conversation_id", sa.BigInteger(), nullable=False),
        sa.Column("sender", sa.String(length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("intent", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["extensions.chatbot_conversations.conversation_id"],
            name="fk_chatbot_messages_conversation",
        ),
        sa.PrimaryKeyConstraint("message_id"),
        schema="extensions",
        **{"checkfirst": True},
    )
    op.create_table(
        "chatbot_usage",
        sa.Column("usage_id", sa.BigInteger(), autoincrement=True,
                  nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("message_count", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.user_id"], name="fk_chatbot_usage_user",
        ),
        sa.PrimaryKeyConstraint("usage_id"),
        sa.UniqueConstraint("user_id", name="uq_chatbot_usage_user"),
        schema="extensions",
        **{"checkfirst": True},
    )
    op.create_index(
        "ix_chatbot_messages_conversation_created",
        "chatbot_messages",
        ["conversation_id", "created_at"],
        unique=False,
        schema="extensions",
        **{"checkfirst": True},
    )


def downgrade() -> None:
    op.drop_index(
        "ix_chatbot_messages_conversation_created",
        table_name="chatbot_messages",
        schema="extensions",
    )
    op.drop_table("chatbot_usage", schema="extensions")
    op.drop_table("chatbot_messages", schema="extensions")
    op.drop_table("chatbot_conversations", schema="extensions")
