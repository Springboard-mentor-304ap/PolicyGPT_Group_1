"""reports v1 foundation: status/title/metadata + indexes

Revision ID: r3p0rtsv1found01
Revises: c3f8a0b6e914
Create Date: 2026-09-29

Part 1 of Reports & Export:
- Additive only. No drop/recreate, no data deletion.
- extensions.reports gains: title, status (PENDING/COMPLETED/FAILED),
  error_message, file_size, expires_at.
- Existing rows backfill to status COMPLETED.
- Indexes for report queries: generated_by, generated_at,
  (report_type, report_format).
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "r3p0rtsv1found01"
down_revision = "c3f8a0b6e914"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column("title", sa.String(255), nullable=True),
        schema="extensions",
    )
    op.add_column(
        "reports",
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="COMPLETED",
        ),
        schema="extensions",
    )
    op.add_column(
        "reports",
        sa.Column("error_message", sa.Text(), nullable=True),
        schema="extensions",
    )
    op.add_column(
        "reports",
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        schema="extensions",
    )
    op.add_column(
        "reports",
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        schema="extensions",
    )

    # Existing rows (if any) predate the status column contract.
    op.execute(
        "UPDATE extensions.reports SET status = 'COMPLETED' "
        "WHERE status IS NULL"
    )

    op.create_index(
        "ix_reports_generated_by",
        "reports",
        ["generated_by"],
        schema="extensions",
    )
    op.create_index(
        "ix_reports_generated_at",
        "reports",
        ["generated_at"],
        schema="extensions",
    )
    op.create_index(
        "ix_reports_type_format",
        "reports",
        ["report_type", "report_format"],
        schema="extensions",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_reports_type_format",
        table_name="reports",
        schema="extensions",
    )
    op.drop_index(
        "ix_reports_generated_at",
        table_name="reports",
        schema="extensions",
    )
    op.drop_index(
        "ix_reports_generated_by",
        table_name="reports",
        schema="extensions",
    )
    op.drop_column("reports", "expires_at", schema="extensions")
    op.drop_column("reports", "file_size", schema="extensions")
    op.drop_column("reports", "error_message", schema="extensions")
    op.drop_column("reports", "status", schema="extensions")
    op.drop_column("reports", "title", schema="extensions")
