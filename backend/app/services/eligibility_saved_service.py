"""Per-user saved eligibility results.

Mirrors the Saved Items authorization pattern: every function takes the
authenticated ``user_id`` from the JWT (never from the request body), and
single-record reads/deletes filter by ``(saved_id, user_id)`` so one user
can never reach another user's rows (no IDOR).
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.saved_eligibility_result import SavedEligibilityResult
from app.schemas.eligibility import (
    EligibilityCheckRequest,
    EligibilityProfile,
)
from app.services.eligibility_service import check_eligibility

ALLOWED_ENTITY_TYPES = ("policy", "scheme")


def _profile_snapshot(profile: EligibilityProfile) -> dict:
    """JSON-safe copy of the inputs used for the check."""
    data = profile.model_dump(mode="json")
    income = data.get("annual_income")
    if income is not None:
        try:
            data["annual_income"] = float(income)
        except (TypeError, ValueError):
            data["annual_income"] = None
    return data


def list_saved_results(
    db: Session,
    user_id: int,
) -> list[SavedEligibilityResult]:
    return (
        db.query(SavedEligibilityResult)
        .filter(SavedEligibilityResult.user_id == user_id)
        .order_by(SavedEligibilityResult.saved_at.desc())
        .all()
    )


def get_saved_result(
    db: Session,
    user_id: int,
    saved_id: int,
) -> SavedEligibilityResult | None:
    """Single row scoped to its owner (IDOR prevention)."""
    return (
        db.query(SavedEligibilityResult)
        .filter(
            SavedEligibilityResult.saved_id == saved_id,
            SavedEligibilityResult.user_id == user_id,
        )
        .first()
    )


def save_eligibility_result(
    db: Session,
    user_id: int,
    entity_type: str,
    entity_id: int,
    profile: EligibilityProfile,
) -> tuple[SavedEligibilityResult, bool]:
    """Bookmark an eligibility outcome for the current user.

    The outcome is re-evaluated server-side via the real matching
    engine, so clients cannot store fabricated eligible/not-eligible
    rows. Saving the same entity twice returns the existing row
    (idempotent, like Saved Items).

    Exactly one entity fetch happens inside ``check_eligibility``; the
    stored name comes from its authoritative response (which also
    rejects missing/non-approved entities with 404), so no extra
    lookup round trip is spent here.
    """
    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise HTTPException(
            status_code=422,
            detail="entity_type must be 'policy' or 'scheme'.",
        )

    existing = (
        db.query(SavedEligibilityResult)
        .filter(
            SavedEligibilityResult.user_id == user_id,
            SavedEligibilityResult.entity_type == entity_type,
            SavedEligibilityResult.entity_id == entity_id,
        )
        .first()
    )
    if existing:
        return existing, False

    checked = check_eligibility(
        db=db,
        data=EligibilityCheckRequest(
            **profile.model_dump(),
            entity_type=entity_type,  # type: ignore[arg-type]
            entity_id=entity_id,
        ),
    )

    row = SavedEligibilityResult(
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=checked.entity_name,
        eligible=checked.eligible,
        message=checked.message,
        profile_data=_profile_snapshot(profile),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, True


def delete_saved_result(
    db: Session,
    user_id: int,
    saved_id: int,
) -> bool:
    row = get_saved_result(db, user_id, saved_id)
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True
