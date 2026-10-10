"""Pytest bootstrap: dummy env so app import never needs real Postgres."""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://test:test@localhost:5432/test"
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("ALGORITHM", "HS256")
