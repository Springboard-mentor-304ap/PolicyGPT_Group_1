from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.routes.auth import (
    get_current_user,
    normalize_role,
)
from app.db.database import get_db
from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.user import User
from app.schemas.saved_item import (
    SavedPolicyItemResponse,
    SavedPolicyResponse,
    SavedSchemeItemResponse,
    SavedSchemeResponse,
    SavedStatusResponse,
    UnsaveResponse,
)
from app.services import saved_item_service

router = APIRouter(
    prefix="/saved-items",
    tags=["Saved Items"],
)


# ============================================================
# ALLOWED ROLES
# ============================================================

SAVED_ITEMS_ROLES = {
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
}


def require_saved_items_role(
    current_user: User = Depends(get_current_user),
) -> User:
    role = normalize_role(str(current_user.role or ""))

    if role not in SAVED_ITEMS_ROLES:
        raise HTTPException(
            status_code=403,
            detail=(
                "Saved Items is available only "
                "to Citizen, Researcher, and "
                "Organization users."
            ),
        )

    return current_user


# ============================================================
# GET SAVED POLICIES
# ============================================================


@router.get(
    "/policies",
    response_model=list[SavedPolicyItemResponse],
)
def list_saved_policies(
    current_user: User = Depends(
        require_saved_items_role,
    ),
    db: Session = Depends(get_db),
):
    return saved_item_service.get_saved_policies(
        db=db,
        user_id=current_user.user_id,
    )


# ============================================================
# GET SAVED SCHEMES
# ============================================================


@router.get(
    "/schemes",
    response_model=list[SavedSchemeItemResponse],
)
def list_saved_schemes(
    current_user: User = Depends(
        require_saved_items_role,
    ),
    db: Session = Depends(get_db),
):
    return saved_item_service.get_saved_schemes(
        db=db,
        user_id=current_user.user_id,
    )


# ============================================================
# SAVE POLICY
# ============================================================


@router.post(
    "/policies/{policy_id}",
    response_model=SavedPolicyResponse,
)
def save_policy(
    policy_id: int,
    current_user: User = Depends(
        require_saved_items_role,
    ),
    db: Session = Depends(get_db),
):
    policy = (
        db.query(Policy)
        .filter(
            Policy.policy_id == policy_id,
        )
        .first()
    )

    if not policy:
        raise HTTPException(
            status_code=404,
            detail="Policy not found.",
        )

    return saved_item_service.save_policy(
        db=db,
        user_id=current_user.user_id,
        policy_id=policy_id,
    )


# ============================================================
# SAVE SCHEME
# ============================================================


@router.post(
    "/schemes/{scheme_id}",
    response_model=SavedSchemeResponse,
)
def save_scheme(
    scheme_id: int,
    current_user: User = Depends(
        require_saved_items_role,
    ),
    db: Session = Depends(get_db),
):
    scheme = (
        db.query(Scheme)
        .filter(
            Scheme.scheme_id == scheme_id,
        )
        .first()
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found.",
        )

    return saved_item_service.save_scheme(
        db=db,
        user_id=current_user.user_id,
        scheme_id=scheme_id,
    )


# ============================================================
# CHECK POLICY SAVED STATUS
# ============================================================


@router.get(
    "/policies/{policy_id}/saved",
    response_model=SavedStatusResponse,
)
def check_policy_saved(
    policy_id: int,
    current_user: User = Depends(
        require_saved_items_role,
    ),
    db: Session = Depends(get_db),
):
    return {
        "saved": saved_item_service.is_policy_saved(
            db=db,
            user_id=current_user.user_id,
            policy_id=policy_id,
        )
    }


# ============================================================
# CHECK SCHEME SAVED STATUS
# ============================================================


@router.get(
    "/schemes/{scheme_id}/saved",
    response_model=SavedStatusResponse,
)
def check_scheme_saved(
    scheme_id: int,
    current_user: User = Depends(
        require_saved_items_role,
    ),
    db: Session = Depends(get_db),
):
    return {
        "saved": saved_item_service.is_scheme_saved(
            db=db,
            user_id=current_user.user_id,
            scheme_id=scheme_id,
        )
    }


# ============================================================
# UNSAVE POLICY
# ============================================================


@router.delete(
    "/policies/{policy_id}",
    response_model=UnsaveResponse,
)
def unsave_policy(
    policy_id: int,
    current_user: User = Depends(
        require_saved_items_role,
    ),
    db: Session = Depends(get_db),
):
    removed = saved_item_service.unsave_policy(
        db=db,
        user_id=current_user.user_id,
        policy_id=policy_id,
    )

    if not removed:
        raise HTTPException(
            status_code=404,
            detail="Policy is not saved.",
        )

    return {"message": "Policy removed from saved items."}


# ============================================================
# UNSAVE SCHEME
# ============================================================


@router.delete(
    "/schemes/{scheme_id}",
    response_model=UnsaveResponse,
)
def unsave_scheme(
    scheme_id: int,
    current_user: User = Depends(
        require_saved_items_role,
    ),
    db: Session = Depends(get_db),
):
    removed = saved_item_service.unsave_scheme(
        db=db,
        user_id=current_user.user_id,
        scheme_id=scheme_id,
    )

    if not removed:
        raise HTTPException(
            status_code=404,
            detail="Scheme is not saved.",
        )

    return {"message": "Scheme removed from saved items."}
