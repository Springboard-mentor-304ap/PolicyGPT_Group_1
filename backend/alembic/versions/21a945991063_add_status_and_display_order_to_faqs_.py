"""add_status_and_display_order_to_faqs_and_category_to_support_queries

Revision ID: 21a945991063
Revises: f4a91c7d2e60
Create Date: 2026-09-28 02:12:15.648278

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '21a945991063'
down_revision: Union[str, Sequence[str], None] = 'f4a91c7d2e60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'faqs',
        sa.Column('status', sa.String(length=50),
                  server_default=sa.text("'PUBLISHED'"), nullable=False),
        schema='extensions',
    )
    op.add_column(
        'faqs',
        sa.Column('display_order', sa.Integer(),
                  server_default=sa.text('0'), nullable=False),
        schema='extensions',
    )
    op.add_column(
        'support_queries',
        sa.Column('category', sa.String(length=100),
                  server_default=sa.text("'General'"), nullable=False),
        schema='extensions',
    )
    op.add_column(
        'support_queries',
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text(
            'CURRENT_TIMESTAMP'), nullable=False),
        schema='extensions',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('support_queries', 'updated_at', schema='extensions')
    op.drop_column('support_queries', 'category', schema='extensions')
    op.drop_column('faqs', 'display_order', schema='extensions')
    op.drop_column('faqs', 'status', schema='extensions')

