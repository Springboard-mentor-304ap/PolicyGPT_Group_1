from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.saved_policy import SavedPolicy
from app.models.saved_scheme import SavedScheme
from app.models.scheme import Scheme

# ============================================================
# SAVED POLICIES
# ============================================================


def get_saved_policies(
    db: Session,
    user_id: int,
) -> list[dict]:
    rows = (
        db.query(
            SavedPolicy.saved_id,
            SavedPolicy.policy_id,
            Policy.title,
            Policy.category,
            Policy.ministry,
            Policy.department,
            Policy.state,
            Policy.status,
            SavedPolicy.saved_at,
        )
        .join(
            Policy,
            Policy.policy_id == SavedPolicy.policy_id,
        )
        .filter(
            SavedPolicy.user_id == user_id,
        )
        .order_by(
            SavedPolicy.saved_at.desc(),
        )
        .all()
    )

    return [
        {
            "saved_id": row.saved_id,
            "policy_id": row.policy_id,
            "title": row.title,
            "category": row.category,
            "ministry": row.ministry,
            "department": row.department,
            "state": row.state,
            "status": row.status,
            "saved_at": row.saved_at,
        }
        for row in rows
    ]


def save_policy(
    db: Session,
    user_id: int,
    policy_id: int,
) -> SavedPolicy:
    existing = (
        db.query(SavedPolicy)
        .filter(
            SavedPolicy.user_id == user_id,
            SavedPolicy.policy_id == policy_id,
        )
        .first()
    )

    if existing:
        return existing

    saved_policy = SavedPolicy(
        user_id=user_id,
        policy_id=policy_id,
    )

    db.add(saved_policy)
    db.commit()
    db.refresh(saved_policy)

    return saved_policy


def unsave_policy(
    db: Session,
    user_id: int,
    policy_id: int,
) -> bool:
    saved_policy = (
        db.query(SavedPolicy)
        .filter(
            SavedPolicy.user_id == user_id,
            SavedPolicy.policy_id == policy_id,
        )
        .first()
    )

    if not saved_policy:
        return False

    db.delete(saved_policy)
    db.commit()

    return True


def is_policy_saved(
    db: Session,
    user_id: int,
    policy_id: int,
) -> bool:
    saved_policy = (
        db.query(SavedPolicy)
        .filter(
            SavedPolicy.user_id == user_id,
            SavedPolicy.policy_id == policy_id,
        )
        .first()
    )

    return saved_policy is not None


# ============================================================
# SAVED SCHEMES
# ============================================================


def get_saved_schemes(
    db: Session,
    user_id: int,
) -> list[dict]:
    rows = (
        db.query(
            SavedScheme.saved_id,
            SavedScheme.scheme_id,
            Scheme.name,
            Scheme.category,
            Scheme.ministry,
            Scheme.department,
            Scheme.state,
            Scheme.status,
            SavedScheme.saved_at,
        )
        .join(
            Scheme,
            Scheme.scheme_id == SavedScheme.scheme_id,
        )
        .filter(
            SavedScheme.user_id == user_id,
        )
        .order_by(
            SavedScheme.saved_at.desc(),
        )
        .all()
    )

    return [
        {
            "saved_id": row.saved_id,
            "scheme_id": row.scheme_id,
            "name": row.name,
            "category": row.category,
            "ministry": row.ministry,
            "department": row.department,
            "state": row.state,
            "status": row.status,
            "saved_at": row.saved_at,
        }
        for row in rows
    ]


def save_scheme(
    db: Session,
    user_id: int,
    scheme_id: int,
) -> SavedScheme:
    existing = (
        db.query(SavedScheme)
        .filter(
            SavedScheme.user_id == user_id,
            SavedScheme.scheme_id == scheme_id,
        )
        .first()
    )

    if existing:
        return existing

    saved_scheme = SavedScheme(
        user_id=user_id,
        scheme_id=scheme_id,
    )

    db.add(saved_scheme)
    db.commit()
    db.refresh(saved_scheme)

    return saved_scheme


def unsave_scheme(
    db: Session,
    user_id: int,
    scheme_id: int,
) -> bool:
    saved_scheme = (
        db.query(SavedScheme)
        .filter(
            SavedScheme.user_id == user_id,
            SavedScheme.scheme_id == scheme_id,
        )
        .first()
    )

    if not saved_scheme:
        return False

    db.delete(saved_scheme)
    db.commit()

    return True


def is_scheme_saved(
    db: Session,
    user_id: int,
    scheme_id: int,
) -> bool:
    saved_scheme = (
        db.query(SavedScheme)
        .filter(
            SavedScheme.user_id == user_id,
            SavedScheme.scheme_id == scheme_id,
        )
        .first()
    )

    return saved_scheme is not None
