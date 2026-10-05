from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.routes.auth import (
    get_current_user,
    normalize_role,
    require_roles,
)
from app.db.database import get_db
from app.models.user import User

from app.schemas.eligibility import (
    EligibilityCheckRequest,
    EligibilityCheckResponse,
    EligibilityMatchRequest,
    EligibilityMatchResponse,
    EligibilityRuleCreate,
    EligibilityRuleResponse,
    EligibilityRuleUpdate,
    SavedEligibilityCreate,
    SavedEligibilityResponse,
)

from app.services import eligibility_saved_service
from app.services.eligibility_service import (
    check_eligibility,
    create_eligibility_rule,
    delete_eligibility_rule,
    get_eligibility_rules,
    match_entities,
    update_eligibility_rule,
)

router = APIRouter(
    prefix="/eligibility",
    tags=["Eligibility"],
)


# =========================================================
# SAVED ELIGIBILITY RESULTS (per-user bookmarks)
# =========================================================
# Declared BEFORE /{entity_type}/{entity_id} so "/saved" is never
# captured as an entity_type path parameter.

SAVED_RESULTS_ROLES = {
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
}


def require_saved_results_role(
    current_user: User = Depends(get_current_user),
) -> User:
    # Same authorization pattern as the Saved Items module: identity
    # comes from the JWT, never from a frontend-supplied user_id.
    role = normalize_role(str(current_user.role or ""))

    if role not in SAVED_RESULTS_ROLES:
        raise HTTPException(
            status_code=403,
            detail=(
                "Saved Results is available only "
                "to Citizen, Researcher, and "
                "Organization users."
            ),
        )

    return current_user


@router.get(
    "/saved",
    response_model=list[SavedEligibilityResponse],
)
def list_saved_results(
    current_user: User = Depends(require_saved_results_role),
    db: Session = Depends(get_db),
):
    """List the current user's saved eligibility results."""
    return eligibility_saved_service.list_saved_results(
        db=db,
        user_id=current_user.user_id,
    )


@router.post(
    "/saved",
    response_model=SavedEligibilityResponse,
)
def create_saved_result(
    data: SavedEligibilityCreate,
    response: Response,
    current_user: User = Depends(require_saved_results_role),
    db: Session = Depends(get_db),
):
    """Bookmark an eligibility outcome for the current user.

    The outcome is re-evaluated server-side; saving the same entity
    twice returns the existing row (201 on create, 200 on duplicate).
    """
    row, created = eligibility_saved_service.save_eligibility_result(
        db=db,
        user_id=current_user.user_id,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        profile=data.profile,
    )
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return row


@router.get(
    "/saved/{saved_id}",
    response_model=SavedEligibilityResponse,
)
def get_saved_result(
    saved_id: int,
    current_user: User = Depends(require_saved_results_role),
    db: Session = Depends(get_db),
):
    row = eligibility_saved_service.get_saved_result(
        db=db,
        user_id=current_user.user_id,
        saved_id=saved_id,
    )
    if not row:
        raise HTTPException(
            status_code=404,
            detail="Saved result not found.",
        )
    return row


@router.delete(
    "/saved/{saved_id}",
)
def delete_saved_result(
    saved_id: int,
    current_user: User = Depends(require_saved_results_role),
    db: Session = Depends(get_db),
):
    removed = eligibility_saved_service.delete_saved_result(
        db=db,
        user_id=current_user.user_id,
        saved_id=saved_id,
    )
    if not removed:
        raise HTTPException(
            status_code=404,
            detail="Saved result not found.",
        )
    return {"message": "Saved result removed."}


# =========================================================
# GET RULES
# =========================================================


@router.get(
    "/{entity_type}/{entity_id}",
    response_model=list[EligibilityRuleResponse],
)
def get_rules(
    entity_type: str,
    entity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_eligibility_rules(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
    )


# =========================================================
# CREATE RULE
# ADMIN + GOVERNMENT OFFICIAL
# =========================================================


@router.post(
    "/{entity_type}/{entity_id}",
    response_model=EligibilityRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_rule(
    entity_type: str,
    entity_id: int,
    data: EligibilityRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):
    return create_eligibility_rule(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
        data=data,
    )


# =========================================================
# UPDATE RULE
# ADMIN + GOVERNMENT OFFICIAL
# =========================================================


@router.put(
    "/rule/{rule_id}",
    response_model=EligibilityRuleResponse,
)
def update_rule(
    rule_id: int,
    data: EligibilityRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):
    return update_eligibility_rule(
        db=db,
        rule_id=rule_id,
        data=data,
    )


# =========================================================
# HARD DELETE RULE
# ADMIN ONLY
# =========================================================


@router.delete(
    "/rule/{rule_id}",
)
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return delete_eligibility_rule(
        db=db,
        rule_id=rule_id,
    )


# =========================================================
# CHECK ONE POLICY OR SCHEME
# =========================================================


@router.post(
    "/check",
    response_model=EligibilityCheckResponse,
)
def check_entity(
    data: EligibilityCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return check_eligibility(
        db=db,
        data=data,
    )


# =========================================================
# MATCH ALL POLICIES OR SCHEMES
# =========================================================


@router.post(
    "/match",
    response_model=EligibilityMatchResponse,
)
def match_all(
    data: EligibilityMatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return match_entities(
        db=db,
        data=data,
    )
