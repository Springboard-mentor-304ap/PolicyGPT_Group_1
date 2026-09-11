from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user, require_roles
from app.db.database import get_db
from app.models.user import User
from app.schemas.eligibility import (
    EligibilityCheckRequest,
    EligibilityCheckResponse,
    EligibilityRuleCreate,
    EligibilityRuleResponse,
    EligibilityRuleUpdate,
    SchemeMatchRequest,
    SchemeMatchResponse,
    PolicyEligibilityCheckRequest,
    PolicyEligibilityCheckResponse,
    PolicyMatchRequest,
    PolicyMatchResponse,
    PolicyEligibilityRuleResponse,
)
from app.services.eligibility_service import (
    check_eligibility,
    create_eligibility_rule,
    delete_eligibility_rule,
    get_eligibility_rules,
    match_schemes,
    update_eligibility_rule,
    check_policy_eligibility,
    get_policy_eligibility_rules,
    create_policy_eligibility_rule,
    match_policies,
    update_policy_eligibility_rule,
    delete_policy_eligibility_rule,
)


router = APIRouter(
    prefix="/eligibility",
    tags=["Eligibility"],
)


# =========================================================
# POLICY ELIGIBILITY
# =========================================================

@router.post(
    "/policy/check",
    response_model=PolicyEligibilityCheckResponse,
)
def check_policy(
    data: PolicyEligibilityCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return check_policy_eligibility(
        db=db,
        data=data,
    )


@router.post(
    "/policy/match",
    response_model=PolicyMatchResponse,
)
def match_user_with_policies(
    data: PolicyMatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return match_policies(
        db=db,
        data=data,
    )


@router.get(
    "/policy/{policy_id}",
    response_model=list[PolicyEligibilityRuleResponse],
)
def get_policy_eligibility(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_policy_eligibility_rules(
        db=db,
        policy_id=policy_id,
    )


@router.post(
    "/policy/{policy_id}",
    response_model=PolicyEligibilityRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_policy_eligibility_rule_route(
    policy_id: int,
    data: EligibilityRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):
    return create_policy_eligibility_rule(
        db=db,
        policy_id=policy_id,
        data=data,
    )


@router.put(
    "/policy/rule/{rule_id}",
    response_model=PolicyEligibilityRuleResponse,
)
def update_policy_eligibility_rule_route(
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
    return update_policy_eligibility_rule(
        db=db,
        rule_id=rule_id,
        data=data,
    )


@router.delete(
    "/policy/rule/{rule_id}",
)
def delete_policy_eligibility_rule_route(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN")
    ),
):
    return delete_policy_eligibility_rule(
        db=db,
        rule_id=rule_id,
    )


# =========================================================
# GET ELIGIBILITY RULES FOR A SCHEME
# =========================================================

@router.get(
    "/{scheme_id}",
    response_model=list[EligibilityRuleResponse],
)
def get_scheme_eligibility(
    scheme_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_eligibility_rules(
        db=db,
        scheme_id=scheme_id,
    )


# =========================================================
# CHECK ELIGIBILITY
# =========================================================

@router.post(
    "/check",
    response_model=EligibilityCheckResponse,
)
def check_scheme_eligibility(
    data: EligibilityCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return check_eligibility(
        db=db,
        data=data,
    )


# =========================================================
# MATCH USER WITH ALL APPROVED SCHEMES
# =========================================================

@router.post(
    "/match",
    response_model=SchemeMatchResponse,
)
def match_user_with_schemes(
    data: SchemeMatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return match_schemes(
        db=db,
        data=data,
    )


# =========================================================
# CREATE ELIGIBILITY RULE
# ADMIN + GOVERNMENT OFFICIAL
# =========================================================

@router.post(
    "/{scheme_id}",
    response_model=EligibilityRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_scheme_eligibility_rule(
    scheme_id: int,
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
        scheme_id=scheme_id,
        data=data,
    )


# =========================================================
# UPDATE ELIGIBILITY RULE
# =========================================================

@router.put(
    "/rule/{rule_id}",
    response_model=EligibilityRuleResponse,
)
def update_scheme_eligibility_rule(
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
# DELETE ELIGIBILITY RULE
# =========================================================

@router.delete(
    "/rule/{rule_id}",
)
def delete_scheme_eligibility_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN")
    ),
):
    return delete_eligibility_rule(
        db=db,
        rule_id=rule_id,
    )