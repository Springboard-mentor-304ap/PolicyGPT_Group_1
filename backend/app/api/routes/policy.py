from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.routes.auth import (
    get_current_user,
    require_roles,
)

from app.db.database import get_db

from app.models.policy import Policy
from app.models.user import User

from app.schemas.policy import (
    PolicyCreate,
    PolicyRejectRequest,
    PolicyResponse,
    PolicyUpdate,
    PolicyListResponse,
)

from app.services.policy_service import (
    approve_policy,
    archive_policy,
    create_policy,
    delete_policy,
    get_pending_policies,
    get_policy,
    reject_policy,
    restore_policy,
    search_policies,
    submit_policy,
    update_policy,
)

# =========================================================
# ROUTER
# =========================================================

router = APIRouter(
    prefix="/policies",
    tags=["Policies"],
)


# =========================================================
# CREATE POLICY
# =========================================================


@router.post(
    "",
    response_model=PolicyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_policy_api(
    data: PolicyCreate,
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
    db: Session = Depends(get_db),
):

    return create_policy(
        db=db,
        data=data,
        current_user=current_user,
    )


# =========================================================
# GET / SEARCH POLICIES
# =========================================================


@router.get(
    "",
    response_model=PolicyListResponse,
)
def get_policies_api(
    keyword: str | None = Query(default=None),
    category: str | None = Query(default=None),
    ministry: str | None = Query(default=None),
    department: str | None = Query(default=None),
    state: str | None = Query(default=None),
    sector: str | None = Query(default=None),
    policy_status: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    include_archived: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    normalized_role = str(current_user.role).strip().upper()

    # -----------------------------------------------------
    # CITIZENS / RESEARCHERS / ORGANIZATIONS
    # CAN ONLY SEE APPROVED POLICIES
    # -----------------------------------------------------

    if normalized_role in [
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
    ]:

        if policy_status and (policy_status.upper() not in ["APPROVED"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=("You can only view approved policies"),
            )

        policy_status = "APPROVED"
        include_archived = False

    return search_policies(
        db=db,
        keyword=keyword,
        category=category,
        ministry=ministry,
        department=department,
        state=state,
        sector=sector,
        policy_status=policy_status,
        page=page,
        limit=limit,
        include_archived=include_archived,
    )


# =========================================================
# PENDING APPROVAL
# =========================================================


@router.get(
    "/pending-approval",
    response_model=list[PolicyResponse],
)
def pending_approval_api(
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):

    return get_pending_policies(db)


# =========================================================
# GET POLICY BY ID
# =========================================================


@router.get(
    "/{policy_id}",
    response_model=PolicyResponse,
)
def get_policy_api(
    policy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    policy = get_policy(
        db=db,
        policy_id=policy_id,
    )

    normalized_role = str(current_user.role).strip().upper()

    # -----------------------------------------------------
    # PUBLIC ROLES
    # -----------------------------------------------------

    if normalized_role in [
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
    ]:

        if policy.status != "APPROVED":

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=("This policy is not available " "for your role"),
            )

    return policy


# =========================================================
# UPDATE POLICY
# =========================================================


@router.put(
    "/{policy_id}",
    response_model=PolicyResponse,
)
def update_policy_api(
    policy_id: int,
    data: PolicyUpdate,
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
    db: Session = Depends(get_db),
):

    policy = get_policy(
        db=db,
        policy_id=policy_id,
    )

    # -----------------------------------------------------
    # ARCHIVED POLICY
    # -----------------------------------------------------

    if policy.status == "ARCHIVED":

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Archived policies cannot be updated. " "Restore the policy first."
            ),
        )

    # -----------------------------------------------------
    # APPROVED POLICY
    # -----------------------------------------------------

    # Government officials editing an approved policy
    # must send it through approval again.
    if (
        policy.status == "APPROVED"
        and str(current_user.role).strip().upper() != "ADMIN"
    ):
        policy.status = "DRAFT"
        policy.approved_by = None

    return update_policy(
        db=db,
        policy=policy,
        data=data,
    )


# =========================================================
# DELETE POLICY
# =========================================================


@router.delete(
    "/{policy_id}",
)
def delete_policy_api(
    policy_id: int,
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):

    policy = get_policy(
        db=db,
        policy_id=policy_id,
    )

    delete_policy(
        db=db,
        policy=policy,
    )

    return {
        "message": "Policy deleted successfully",
        "policy_id": policy_id,
    }


# =========================================================
# SUBMIT FOR APPROVAL
# =========================================================


@router.post(
    "/{policy_id}/submit",
    response_model=PolicyResponse,
)
def submit_policy_api(
    policy_id: int,
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
    db: Session = Depends(get_db),
):

    policy = get_policy(
        db=db,
        policy_id=policy_id,
    )

    return submit_policy(
        db=db,
        policy=policy,
    )


# =========================================================
# APPROVE
# =========================================================


@router.post(
    "/{policy_id}/approve",
    response_model=PolicyResponse,
)
def approve_policy_api(
    policy_id: int,
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):

    policy = get_policy(
        db=db,
        policy_id=policy_id,
    )

    return approve_policy(
        db=db,
        policy=policy,
        current_user=current_user,
    )


# =========================================================
# REJECT
# =========================================================


@router.post(
    "/{policy_id}/reject",
    response_model=PolicyResponse,
)
def reject_policy_api(
    policy_id: int,
    data: PolicyRejectRequest,
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):

    policy = get_policy(
        db=db,
        policy_id=policy_id,
    )

    return reject_policy(
        db=db,
        policy=policy,
        reason=data.reason,
    )


# =========================================================
# ARCHIVE
# =========================================================


@router.post(
    "/{policy_id}/archive",
    response_model=PolicyResponse,
)
def archive_policy_api(
    policy_id: int,
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):

    policy = get_policy(
        db=db,
        policy_id=policy_id,
    )

    return archive_policy(
        db=db,
        policy=policy,
    )


# =========================================================
# RESTORE
# =========================================================


@router.post(
    "/{policy_id}/restore",
    response_model=PolicyResponse,
)
def restore_policy_api(
    policy_id: int,
    current_user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):

    policy = get_policy(
        db=db,
        policy_id=policy_id,
    )

    return restore_policy(
        db=db,
        policy=policy,
    )
