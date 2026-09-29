"""enforce canonical policy/scheme status vocabulary with CHECK constraints

Revision ID: c3f8a0b6e914
Revises: b7c4e1a9d205
Create Date: 2026-09-28 19:10:00.000000

Why
---
``policies.status`` and ``schemes.status`` are plain ``varchar(30)`` columns, so
PostgreSQL accepted any string at all. That is what let two out-of-band rows
(``'PENDING'`` and ``'ACTIVE'``) reach the application and break
``GET /policies`` / ``GET /schemes`` with a ``ResponseValidationError`` -- the
regression fixed by revision ``b7c4e1a9d205``.

Revisions ``b7c4e1a9d205`` already normalized the data, so this migration only
closes the door. The constraint mirrors ``PolicyStatus`` in
``app/schemas/policy.py`` and ``SchemeStatus`` in ``app/schemas/scheme.py`` and
the column default in ``app/models/policy.py`` / ``app/models/scheme.py``; all
four stay the single source of truth for the vocabulary.

Scope
-----
Only the primary ``status`` column of ``policies`` and ``schemes``. The
``delete_requested_from_status`` columns are deliberately left unconstrained:
they are nullable, currently all NULL, and hold a narrower subset of the same
vocabulary.

If this migration ever fails, it means non-canonical rows are present. The
transaction rolls back and nothing is lost - fix the rows rather than widening
the vocabulary here.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c3f8a0b6e914"
down_revision = "b7c4e1a9d205"
branch_labels = None
depends_on = None


#: Mirrors PolicyStatus / SchemeStatus in app/schemas/policy.py and app/schemas/scheme.py.
CANONICAL_STATUSES = (
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "ARCHIVED",
    "ARCHIVE_REQUESTED",
    "DELETE_REQUESTED",
)

_ALLOWED_SQL = ", ".join(f"'{s}'" for s in CANONICAL_STATUSES)


def _constraint(table: str) -> str:
    return f"{table}_status_canonical_check"


def upgrade() -> None:
    for table in ("policies", "schemes"):
        op.execute(
            sa.text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {_constraint(table)}"))
        op.execute(
            sa.text(
                f"ALTER TABLE {table} ADD CONSTRAINT {_constraint(table)} "
                f"CHECK (status IN ({_ALLOWED_SQL}))"
            )
        )


def downgrade() -> None:
    for table in ("policies", "schemes"):
        op.execute(
            sa.text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {_constraint(table)}"))
