"""Add role visibility (target_roles) to FAQs (additive, non-destructive).

Revision ID: faq_audience_01
Revises: support_thread_01

Each FAQ gains a ``target_roles`` PostgreSQL ARRAY of canonical role
codes (or ["ALL"] for FAQs visible to everyone, including guests).
Existing rows keep their content and are backfilled to '{"ALL"}' so no
FAQ data is lost and current visibility is preserved.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "faq_audience_01"
down_revision: Sequence[str] | str = "support_thread_01"
branch_labels: Sequence[str] | str | None = None
depends_on: Sequence[str] | str | None = None


def upgrade() -> None:
    op.add_column(
        "faqs",
        sa.Column(
            "target_roles",
            postgresql.ARRAY(sa.String(50)),
            nullable=True,
        ),
        schema="extensions",
    )
    # Preserve existing FAQs: everything published so far stays visible
    # to everyone.
    op.execute(
        sa.text(
            "UPDATE extensions.faqs "
            "SET target_roles = '{ALL}' WHERE target_roles IS NULL"
        )
    )
    op.alter_column(
        "faqs",
        "target_roles",
        existing_type=postgresql.ARRAY(sa.String(50)),
        nullable=False,
        server_default=sa.text("'{ALL}'"),
        schema="extensions",
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_faqs_target_roles "
            "ON extensions.faqs USING GIN (target_roles)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS extensions.ix_faqs_target_roles"))
    op.drop_column("faqs", "target_roles", schema="extensions")
