"""add related_policy_id to schemes

Revision ID: schrelpol01
Revises: e3f9a56789a3
Create Date: 2026-10-12 10:50:00.000000

Nullable reference from a scheme to the policy it implements or
relates to. Existing rows keep NULL (optional relationship).

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'schrelpol01'
down_revision = 'e3f9a56789a3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE schemes
        ADD COLUMN IF NOT EXISTS related_policy_id BIGINT
        REFERENCES policies(policy_id) ON DELETE SET NULL;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_schemes_related_policy_id
        ON schemes (related_policy_id);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS ix_schemes_related_policy_id;
    """)
    op.execute("""
        ALTER TABLE schemes
        DROP COLUMN IF EXISTS related_policy_id;
    """)
