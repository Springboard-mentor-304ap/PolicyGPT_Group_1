"""add channel to otp_verifications

Revision ID: f7c2a91b44d0
Revises: r3p0rtsv1found01
Create Date: 2026-10-05 00:00:00.000000

The OTPVerification model selects a non-nullable ``channel`` column
(email|sms), but production tables created before the column existed
never received it. Every forgot-password / send-otp / verify-otp query
filters on ``channel``, so the missing column raises an unhandled 500
(which Starlette serves without CORS headers, surfacing in the browser
as a missing Access-Control-Allow-Origin error on POST
/auth/forgot-password).
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'f7c2a91b44d0'
down_revision = 'r3p0rtsv1found01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE otp_verifications
        ADD COLUMN IF NOT EXISTS channel VARCHAR(10) DEFAULT 'email';
    """)
    op.execute("""
        UPDATE otp_verifications SET channel = 'email' WHERE channel IS NULL;
    """)
    op.execute("""
        ALTER TABLE otp_verifications
        ALTER COLUMN channel SET DEFAULT 'email';
    """)
    op.execute("""
        ALTER TABLE otp_verifications
        ALTER COLUMN channel SET NOT NULL;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE otp_verifications
        DROP COLUMN IF EXISTS channel;
    """)
