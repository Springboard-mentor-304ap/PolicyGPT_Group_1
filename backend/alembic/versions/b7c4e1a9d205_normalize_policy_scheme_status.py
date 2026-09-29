"""normalize legacy policy/scheme status values

Revision ID: b7c4e1a9d205
Revises: 21a945991063
Create Date: 2026-09-28 18:40:00.000000

Why
---
``policies.status`` and ``schemes.status`` are plain ``varchar(30)`` columns with
no CHECK constraint and no native enum, so the database happily accepts status
strings that are not part of the application contract. Two such rows had leaked
in out of band:

* ``policies`` row 27 ('Probe A') carried ``'PENDING'``
* ``schemes`` row 125 ('Expiry Probe 45') carried ``'ACTIVE'``

``GET /policies`` and ``GET /schemes`` return those rows unfiltered for staff
roles, and ``PolicyStatus`` / ``SchemeStatus`` only accept the canonical
vocabulary, so response validation failed with a 500.

Both legacy values are unambiguous aliases of a canonical status, so they are
normalized here rather than widening the Pydantic contract:

* ``PENDING`` -> ``PENDING_APPROVAL`` - ``submit_policy`` / ``submit_scheme``
  are the only writers of the awaiting-approval state and write
  ``PENDING_APPROVAL``; there is no second pending state.
* ``ACTIVE`` -> ``APPROVED`` - ``notification_service._public_live_status`` and
  ``scheme_expiry_service.LIVE_SCHEME_STATUSES`` already treat ``ACTIVE`` as an
  alias of the public/live status, and ``APPROVED`` is the only public status
  the application writes.

This is data only: no schema, model, schema-contract or workflow change.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b7c4e1a9d205"
down_revision = "21a945991063"
branch_labels = None
depends_on = None


#: Legacy value -> canonical value, per table.
NORMALIZE = {
    "policies": {"PENDING": "PENDING_APPROVAL"},
    "schemes": {"ACTIVE": "APPROVED"},
}


def upgrade() -> None:
    for table, mapping in NORMALIZE.items():
        for legacy, canonical in mapping.items():
            op.execute(
                sa.text(
                    f"UPDATE {table} SET status = :canonical "
                    f"WHERE status = :legacy"
                ).bindparams(canonical=canonical, legacy=legacy)
            )


def downgrade() -> None:
    # Intentionally a no-op.
    #
    # The reverse mapping is not information-preserving: rows that were
    # legitimately created as PENDING_APPROVAL / APPROVED by the application are
    # indistinguishable from the two rows this migration rewrote, so
    # "downgrading" would corrupt live records. The canonical vocabulary is the
    # intended end state, so there is nothing to roll back to.
    pass
