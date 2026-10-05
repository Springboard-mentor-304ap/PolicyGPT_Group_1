"""Add saved_eligibility_results table (additive, non-destructive).

Revision ID: saved_eligibility_01
Revises: perf_hotpath_indexes_01

Per-user eligibility bookmarks, mirroring the Saved Items pattern:
identity always comes from the JWT, rows are looked up by
(user_id, saved_id), and deleting the user cascades their rows.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "saved_eligibility_01"
down_revision: Sequence[str] | str = "perf_hotpath_indexes_01"
branch_labels: Sequence[str] | str | None = None
depends_on: Sequence[str] | str | None = None


def upgrade() -> None:
    op.create_table(
        "saved_eligibility_results",
        sa.Column(
            "saved_id",
            sa.BigInteger(),
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "entity_name",
            sa.String(length=300),
            nullable=False,
            server_default="",
        ),
        sa.Column("eligible", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "profile_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "saved_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("saved_id"),
    )
    op.create_index(
        "ix_saved_eligibility_user_saved",
        "saved_eligibility_results",
        ["user_id", "saved_at"],
    )
    op.create_index(
        "ix_saved_eligibility_user_entity",
        "saved_eligibility_results",
        ["user_id", "entity_type", "entity_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_saved_eligibility_user_entity",
        table_name="saved_eligibility_results",
    )
    op.drop_index(
        "ix_saved_eligibility_user_saved",
        table_name="saved_eligibility_results",
    )
    op.drop_table("saved_eligibility_results")
