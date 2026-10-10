from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy.orm import Session

from datetime import datetime, timedelta, timezone

from app.api.routes.auth import (
    get_current_user,
    normalize_role,
    require_roles,
)
from app.db.database import get_db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.services.audit_log_service import log_request_action

from app.schemas.policy import (
    PolicyArchiveRequest,
    PolicyComparisonResponse,
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
    archive_policy,
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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):

    result = create_policy(
        db=db,
        data=data,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_CREATED",
        "POLICY",
        result.policy_id,
        f"Policy '{result.title}' created.",
    )

    return result


# ============================================================
# COMPARE TWO POLICIES
#
# ALL AUTHENTICATED USERS
#
# Only APPROVED policies can be compared.
# Data is fetched directly from PostgreSQL.
# ============================================================


@router.get(
    "/compare",
    response_model=PolicyComparisonResponse,
)
def compare_policies_route(
    policy_id_1: int = Query(...),
    policy_id_2: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    policy_1 = get_policy(
        db=db,
        policy_id=policy_id_1,
    )

    policy_2 = get_policy(
        db=db,
        policy_id=policy_id_2,
    )

    public_roles = {
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
        "GUEST",
    }

    role = normalize_role(current_user.role)

    if role in public_roles:
        if policy_1.status != "APPROVED":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Policy 1 not found.",
            )

        if policy_2.status != "APPROVED":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Policy 2 not found.",
            )

    return {
        "policy_1": policy_1,
        "policy_2": policy_2,
    }


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
    publication_date: str | None = Query(default=None),
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
    manage: bool = Query(
        default=False,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    role = normalize_role(current_user.role)

    public_roles = {
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
        "GUEST",
    }

    # --------------------------------------------------------
    # MANAGE POLICIES VIEW
    # --------------------------------------------------------
    if manage:
        if role in public_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to manage policies.",
            )

        if role == "ADMIN":
            # Administrator: sees ALL policies across all statuses and creators
            created_by = None
        elif role == "GOVERNMENT_OFFICIAL":
            # Government Official: sees ONLY policies created by themselves
            created_by = current_user.user_id
        else:
            created_by = current_user.user_id

    # --------------------------------------------------------
    # SEARCH / DISCOVERY POLICIES VIEW
    # --------------------------------------------------------
    else:
        if role in public_roles:
            if policy_status is not None and policy_status.upper() != "APPROVED":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only view approved policies.",
                )

            policy_status = "APPROVED"
            created_by = None
        else:
            # Staff roles (ADMIN, GOVERNMENT_OFFICIAL)
            if (
                policy_status == "APPROVED"
                or policy_status == "ALL"
                or not policy_status
            ):
                created_by = None
            elif role == "GOVERNMENT_OFFICIAL":
                created_by = current_user.user_id
            else:
                created_by = None

    return search_policies(
        db=db,
        search=search,
        category=category,
        ministry=ministry,
        department=department,
        state=state,
        sector=sector,
        publication_date=publication_date,
        policy_status=policy_status,
        page=page,
        limit=limit,
        created_by=created_by,
        current_user=current_user,
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
# SAVE POLICY AS DRAFT
#
# ADMIN + GOVERNMENT OFFICIAL
#
# POST /policies/draft
#
# Creates a new policy with DRAFT status.
#
# IMPORTANT:
# This static route must appear before /{policy_id}.
# ============================================================


@router.post(
    "/draft",
    response_model=PolicyResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_policy_draft_route(
    data: PolicyCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):
    result = create_policy(
        db=db,
        data=data,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_DRAFT_SAVED",
        "POLICY",
        result.policy_id,
        f"Policy draft '{result.title}' saved.",
    )

    return result


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    role = normalize_role(current_user.role)

    public_roles = {
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
        "GUEST",
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
    elif role == "GOVERNMENT_OFFICIAL":
        # Officials may read APPROVED records plus their own unpublished
        # workflow records. Other officials' DRAFT/PENDING_APPROVAL rows
        # are 404-masked (no existence leak), mirroring schemes.
        if policy.status != "APPROVED" and (
            policy.created_by != current_user.user_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Policy not found.",
            )
    elif role != "ADMIN":
        # Fail closed: unknown roles get the public-safe view only.
        if policy.status != "APPROVED":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Policy not found.",
            )

    # View tracking (observability only): one POLICY_VIEW per user/policy
    # per 30 minutes, so workflow refetches and double renders never
    # inflate Usage Statistics counts. Never affects the response.
    window_start = datetime.now(timezone.utc).replace(
        tzinfo=None
    ) - timedelta(minutes=30)
    recent_view = (
        db.query(AuditLog.audit_id)
        .filter(
            AuditLog.action == "POLICY_VIEW",
            AuditLog.entity_type == "POLICY",
            AuditLog.entity_id == policy_id,
            AuditLog.user_id == current_user.user_id,
            AuditLog.created_at >= window_start,
        )
        .first()
    )
    if recent_view is None:
        log_request_action(
            request,
            db,
            current_user,
            "POLICY_VIEW",
            "POLICY",
            policy_id,
            f"Policy '{policy.title}' viewed.",
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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):

    result = update_policy(
        db=db,
        policy_id=policy_id,
        data=data,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_UPDATED",
        "POLICY",
        policy_id,
        f"Policy '{result.title}' updated.",
    )

    return result


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    delete_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_DELETED",
        "POLICY",
        policy_id,
        f"Policy #{policy_id} permanently deleted by administrator.",
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
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):

    result = submit_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
        background_tasks=background_tasks,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_SUBMITTED",
        "POLICY",
        policy_id,
        f"Policy '{result.title}' submitted for approval.",
    )

    # Admin direct approval (DRAFT -> APPROVED) is also recorded as an
    # approval, mirroring POST /policies/{id}/approve.
    if result.status == "APPROVED":
        log_request_action(
            request,
            db,
            current_user,
            "POLICY_APPROVED",
            "POLICY",
            policy_id,
            f"Policy '{result.title}' approved by admin {current_user.user_id}.",
        )

    return result


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    result = approve_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_APPROVED",
        "POLICY",
        policy_id,
        f"Policy '{result.title}' approved by admin {current_user.user_id}.",
    )

    return result


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    result = reject_policy(
        db=db,
        policy_id=policy_id,
        reason=data.reason,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_REJECTED",
        "POLICY",
        policy_id,
        f"Policy '{result.title}' rejected by admin {current_user.user_id}.",
    )

    return result


# ============================================================
# DIRECT ARCHIVE
#
# ADMIN ONLY
#
# APPROVED -> ARCHIVED (no request needed)
#
# Mirrors POST /schemes/{id}/archive so both modules share the same
# direct-archive workflow.
# ============================================================


@router.post(
    "/{policy_id}/archive",
    response_model=PolicyResponse,
)
def archive_policy_route(
    policy_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    result = archive_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_ARCHIVED",
        "POLICY",
        policy_id,
        f"Policy '{result.title}' archived by administrator.",
    )

    return result


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):

    result = request_archive_policy(
        db=db,
        policy_id=policy_id,
        reason=data.reason,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_ARCHIVE_REQUESTED",
        "POLICY",
        policy_id,
        f"Archive requested for policy '{result.title}'.",
    )

    return result


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    result = approve_archive_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_ARCHIVE_APPROVED",
        "POLICY",
        policy_id,
        f"Archive approved for policy '{result.title}'.",
    )

    return result


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    result = reject_archive_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_ARCHIVE_REJECTED",
        "POLICY",
        policy_id,
        f"Archive rejected for policy '{result.title}'.",
    )

    return result


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    result = restore_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_RESTORED",
        "POLICY",
        policy_id,
        f"Policy '{result.title}' restored from archive.",
    )

    return result


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):

    result = request_delete_policy(
        db=db,
        policy_id=policy_id,
        reason=data.reason,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_DELETE_REQUESTED",
        "POLICY",
        policy_id,
        f"Delete requested for policy '{result.title}'.",
    )

    return result


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    approve_delete_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_DELETE_APPROVED",
        "POLICY",
        policy_id,
        f"Delete approved; policy #{policy_id} permanently deleted.",
    )

    return {"message": ("Policy deletion approved and policy permanently deleted.")}


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
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    result = reject_delete_policy(
        db=db,
        policy_id=policy_id,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "POLICY_DELETE_REJECTED",
        "POLICY",
        policy_id,
        f"Delete rejected for policy '{result.title}'.",
    )

    return result
