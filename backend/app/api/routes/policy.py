from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.orm import Session

from app.api.routes.auth import (
    get_current_user,
    require_roles,
)
from app.db.database import get_db
from app.models.user import User

from app.schemas.policy import (
    PolicyArchiveRequest,
    PolicyCreate,
    PolicyDeleteRequest,
    PolicyListResponse,
    PolicyRejectRequest,
    PolicyResponse,
    PolicyUpdate,
)

from app.services.policy_service import (
    approve_archive_policy,
    approve_delete_policy,
    approve_policy,
    create_policy,
    delete_policy,
    get_archive_requests,
    get_delete_requests,
    get_pending_approval_policies,
    get_policy,
    reject_archive_policy,
    reject_delete_policy,
    reject_policy,
    request_archive_policy,
    request_delete_policy,
    restore_policy,
    search_policies,
    submit_policy,
    update_policy,
)

router = APIRouter(
    prefix="/policies",
    tags=["Policies"],
)


# ============================================================
# CREATE POLICY
#
# ADMIN + GOVERNMENT OFFICIAL
# ============================================================


@router.post(
    "",
    response_model=PolicyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_policy_route(
    data: PolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):

    return create_policy(
        db=db,
        data=data,
        current_user=current_user,
    )


# ============================================================
# SEARCH / LIST POLICIES
#
# ALL AUTHENTICATED USERS
#
# Citizen / Researcher / Organization:
# APPROVED ONLY
# ============================================================


@router.get(
    "",
    response_model=PolicyListResponse,
)
def search_policy_route(
    search: str | None = Query(default=None),
    category: str | None = Query(default=None),
    ministry: str | None = Query(default=None),
    department: str | None = Query(default=None),
    state: str | None = Query(default=None),
    sector: str | None = Query(default=None),
    policy_status: str | None = Query(
        default=None,
        alias="status",
    ),
    page: int = Query(
        default=1,
        ge=1,
    ),
    limit: int = Query(
        default=10,
        ge=1,
        le=100,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    role = str(current_user.role).strip().upper()

    public_roles = {
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
    }

    # --------------------------------------------------------
    # PUBLIC ROLES
    # --------------------------------------------------------

    if role in public_roles:

        if policy_status is not None and policy_status.upper() != "APPROVED":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=("You can only view approved policies."),
            )

        policy_status = "APPROVED"

    return search_policies(
        db=db,
        search=search,
        category=category,
        ministry=ministry,
        department=department,
        state=state,
        sector=sector,
        policy_status=policy_status,
        page=page,
        limit=limit,
    )


# ============================================================
# PENDING APPROVAL
#
# ADMIN ONLY
#
# IMPORTANT:
# Must be before /{policy_id}
# ============================================================


@router.get(
    "/pending-approval",
    response_model=PolicyListResponse,
)
def pending_approval_route(
    page: int = Query(
        default=1,
        ge=1,
    ),
    limit: int = Query(
        default=10,
        ge=1,
        le=100,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    return get_pending_approval_policies(
        db=db,
        page=page,
        limit=limit,
    )


# ============================================================
# ARCHIVE REQUESTS
#
# ADMIN ONLY
#
# IMPORTANT:
# Must be before /{policy_id}
# ============================================================


@router.get(
    "/archive-requests",
    response_model=PolicyListResponse,
)
def archive_requests_route(
    page: int = Query(
        default=1,
        ge=1,
    ),
    limit: int = Query(
        default=10,
        ge=1,
        le=100,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    return get_archive_requests(
        db=db,
        page=page,
        limit=limit,
    )


# ============================================================
# DELETE REQUESTS
#
# ADMIN ONLY
#
# IMPORTANT:
# Must be before /{policy_id}
# ============================================================


@router.get(
    "/delete-requests",
    response_model=PolicyListResponse,
)
def delete_requests_route(
    page: int = Query(
        default=1,
        ge=1,
    ),
    limit: int = Query(
        default=10,
        ge=1,
        le=100,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    return get_delete_requests(
        db=db,
        page=page,
        limit=limit,
    )


# ============================================================
# GET SINGLE POLICY
#
# ALL AUTHENTICATED USERS
#
# PUBLIC ROLES:
# APPROVED ONLY
# ============================================================


@router.get(
    "/{policy_id}",
    response_model=PolicyResponse,
)
def get_policy_route(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    role = str(current_user.role).strip().upper()

    public_roles = {
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
    }

    policy = get_policy(
        db=db,
        policy_id=policy_id,
    )

    if role in public_roles:

        if policy.status != "APPROVED":

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Policy not found.",
            )

    return policy


# ============================================================
# UPDATE POLICY
#
# ADMIN + GOVERNMENT OFFICIAL
#
# DRAFT
# REJECTED
# ARCHIVED
#
# ARCHIVED -> DRAFT after editing
# ============================================================


@router.put(
    "/{policy_id}",
    response_model=PolicyResponse,
)
def update_policy_route(
    policy_id: int,
    data: PolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):

    return update_policy(
        db=db,
        policy_id=policy_id,
        data=data,
        current_user=current_user,
    )


# ============================================================
# DIRECT PERMANENT DELETE
#
# ADMIN ONLY
#
# This bypasses request workflow.
# Use only for direct administrative deletion.
# ============================================================


@router.delete(
    "/{policy_id}",
)
def delete_policy_route(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    delete_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )

    return {"message": "Policy deleted successfully."}


# ============================================================
# SUBMIT POLICY
#
# ADMIN + GOVERNMENT OFFICIAL
#
# DRAFT / REJECTED -> PENDING_APPROVAL
# ============================================================


@router.post(
    "/{policy_id}/submit",
    response_model=PolicyResponse,
)
def submit_policy_route(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):

    return submit_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )


# ============================================================
# APPROVE POLICY
#
# ADMIN ONLY
#
# PENDING_APPROVAL -> APPROVED
# ============================================================


@router.post(
    "/{policy_id}/approve",
    response_model=PolicyResponse,
)
def approve_policy_route(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    return approve_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )


# ============================================================
# REJECT POLICY
#
# ADMIN ONLY
#
# PENDING_APPROVAL -> REJECTED
# ============================================================


@router.post(
    "/{policy_id}/reject",
    response_model=PolicyResponse,
)
def reject_policy_route(
    policy_id: int,
    data: PolicyRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    return reject_policy(
        db=db,
        policy_id=policy_id,
        reason=data.reason,
        current_user=current_user,
    )


# ============================================================
# REQUEST ARCHIVE
#
# GOVERNMENT OFFICIAL ONLY
#
# APPROVED -> ARCHIVE_REQUESTED
# ============================================================


@router.post(
    "/{policy_id}/request-archive",
    response_model=PolicyResponse,
)
def request_archive_policy_route(
    policy_id: int,
    data: PolicyArchiveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):

    return request_archive_policy(
        db=db,
        policy_id=policy_id,
        reason=data.reason,
        current_user=current_user,
    )


# ============================================================
# APPROVE ARCHIVE
#
# ADMIN ONLY
#
# ARCHIVE_REQUESTED -> ARCHIVED
# ============================================================


@router.post(
    "/{policy_id}/approve-archive",
    response_model=PolicyResponse,
)
def approve_archive_policy_route(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    return approve_archive_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )


# ============================================================
# REJECT ARCHIVE
#
# ADMIN ONLY
#
# ARCHIVE_REQUESTED -> APPROVED
# ============================================================


@router.post(
    "/{policy_id}/reject-archive",
    response_model=PolicyResponse,
)
def reject_archive_policy_route(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    return reject_archive_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )


# ============================================================
# RESTORE POLICY
#
# ADMIN ONLY
#
# ARCHIVED -> APPROVED
# ============================================================


@router.post(
    "/{policy_id}/restore",
    response_model=PolicyResponse,
)
def restore_policy_route(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    return restore_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )


# ============================================================
# REQUEST DELETE
#
# GOVERNMENT OFFICIAL ONLY
#
# APPROVED / ARCHIVED -> DELETE_REQUESTED
# ============================================================


@router.post(
    "/{policy_id}/request-delete",
    response_model=PolicyResponse,
)
def request_delete_policy_route(
    policy_id: int,
    data: PolicyDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):

    return request_delete_policy(
        db=db,
        policy_id=policy_id,
        reason=data.reason,
        current_user=current_user,
    )


# ============================================================
# APPROVE DELETE
#
# ADMIN ONLY
#
# DELETE_REQUESTED -> PERMANENT DELETE
# ============================================================


@router.post(
    "/{policy_id}/approve-delete",
)
def approve_delete_policy_route(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    approve_delete_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )

    return {
        "message": (
            "Policy deletion approved and " "policy permanently deleted."
        )
    }


# ============================================================
# REJECT DELETE
#
# ADMIN ONLY
#
# DELETE_REQUESTED -> PREVIOUS STATUS
# ============================================================


@router.post(
    "/{policy_id}/reject-delete",
    response_model=PolicyResponse,
)
def reject_delete_policy_route(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    return reject_delete_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )
