from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.routes.auth import (
    get_current_user,
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
)

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
