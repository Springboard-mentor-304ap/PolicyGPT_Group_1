from fastapi import (
    APIRouter,
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
from app.services.audit_log_service import (
    ACTION_APPROVAL_EVENT,
    ACTION_REJECTION_EVENT,
    log_request_action,
)

from app.schemas.scheme import (
    SchemeArchiveRequest,
    SchemeCreate,
    SchemeDeleteRequest,
    SchemeListResponse,
    SchemeRejectRequest,
    SchemeResponse,
    SchemeUpdate,
)

from app.services.scheme_service import (
    approve_archive_scheme,
    approve_delete_scheme,
    approve_scheme,
    archive_scheme,
    create_scheme,
    delete_scheme,
    get_archive_requests,
    get_delete_requests,
    get_pending_schemes,
    get_scheme,
    reject_archive_scheme,
    reject_delete_scheme,
    reject_scheme,
    request_archive_scheme,
    request_delete_scheme,
    restore_scheme,
    search_schemes,
    submit_scheme,
    update_scheme,
)

router = APIRouter(
    prefix="/schemes",
    tags=["Schemes"],
)


@router.post(
    "",
    response_model=SchemeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_scheme_api(
    data: SchemeCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):
    result = create_scheme(
        db=db,
        data=data,
        user_id=current_user.user_id,
    )

    log_request_action(
        request,
        db,
        current_user,
        "SCHEME_CREATED",
        "SCHEME",
        result.scheme_id,
        f"Scheme '{result.name}' created.",
    )

    return result


@router.post(
    "/draft",
    response_model=SchemeResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_scheme_draft_route(
    data: SchemeCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):
    result = create_scheme(
        db=db,
        data=data,
        user_id=current_user.user_id,
    )

    log_request_action(
        request,
        db,
        current_user,
        "SCHEME_DRAFT_SAVED",
        "SCHEME",
        result.scheme_id,
        f"Scheme draft '{result.name}' saved.",
    )

    return result



@router.get(
    "",
    response_model=SchemeListResponse,
)
def list_schemes(
    keyword: str | None = None,
    category: str | None = None,
    ministry: str | None = None,
    department: str | None = None,
    state: str | None = None,
    sector: str | None = None,
    publication_date: str | None = None,
    status_filter: str | None = Query(
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

    role = normalize_role(current_user.role) or ""

    public_roles = {
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
        "GUEST",
    }

    if manage:
        if role in public_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to manage schemes.",
            )

        if role == "ADMIN":
            created_by = None
        elif role == "GOVERNMENT_OFFICIAL":
            created_by = current_user.user_id
        else:
            created_by = current_user.user_id

        include_archived = True
    else:
        # Search / discovery
        if role in public_roles:
            if (
                status_filter is not None
                and status_filter.upper() != "APPROVED"
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only view approved schemes.",
                )

            status_filter = "APPROVED"
            created_by = None
        elif role in ("ADMIN", "GOVERNMENT_OFFICIAL"):
            if (
                status_filter == "APPROVED"
                or status_filter == "ALL"
                or not status_filter
            ):
                created_by = None
            elif role == "GOVERNMENT_OFFICIAL":
                created_by = current_user.user_id
            else:
                created_by = None
        else:
            # Fail closed for unknown roles: public-safe view only.
            status_filter = "APPROVED"
            created_by = None

        include_archived = False

    return search_schemes(
        db=db,
        keyword=keyword,
        category=category,
        ministry=ministry,
        department=department,
        state=state,
        sector=sector,
        publication_date=publication_date,
        status=status_filter,
        page=page,
        limit=limit,
        include_archived=include_archived,
        created_by=created_by,
        current_user=current_user,
    )


@router.get(
    "/pending-approval",
    response_model=list[SchemeResponse],
)
def pending_approval(
    page: int | None = Query(default=None, ge=1),
    limit: int | None = Query(default=None, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return get_pending_schemes(db, page=page, limit=limit)


@router.get(
    "/archive-requests",
    response_model=list[SchemeResponse],
)
def archive_requests(
    page: int | None = Query(default=None, ge=1),
    limit: int | None = Query(default=None, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return get_archive_requests(db, page=page, limit=limit)


@router.get(
    "/delete-requests",
    response_model=list[SchemeResponse],
)
def delete_requests(
    page: int | None = Query(default=None, ge=1),
    limit: int | None = Query(default=None, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return get_delete_requests(db, page=page, limit=limit)


@router.get(
    "/{scheme_id}",
    response_model=SchemeResponse,
)
def get_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    role = normalize_role(current_user.role) or ""

    if role in {
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
        "GUEST",
    }:
        if scheme.status != "APPROVED":
            raise HTTPException(
                status_code=404,
                detail="Scheme not found",
            )
    elif role == "GOVERNMENT_OFFICIAL":
        if scheme.status != "APPROVED" and (
            scheme.created_by != current_user.user_id
        ):
            raise HTTPException(
                status_code=404,
                detail="Scheme not found",
            )
    elif role != "ADMIN":
        # Fail closed: unknown roles get the public-safe view only.
        if scheme.status != "APPROVED":
            raise HTTPException(
                status_code=404,
                detail="Scheme not found",
            )

    # View tracking (observability only): one SCHEME_VIEW per user/scheme
    # per 30 minutes, so refetches and double renders never inflate Usage
    # Statistics counts. Never affects the response.
    window_start = datetime.now(timezone.utc).replace(
        tzinfo=None
    ) - timedelta(minutes=30)
    recent_view = (
        db.query(AuditLog.audit_id)
        .filter(
            AuditLog.action == "SCHEME_VIEW",
            AuditLog.entity_type == "SCHEME",
            AuditLog.entity_id == scheme_id,
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
            "SCHEME_VIEW",
            "SCHEME",
            scheme_id,
            f"Scheme '{scheme.name}' viewed.",
        )

    return scheme


@router.put(
    "/{scheme_id}",
    response_model=SchemeResponse,
)
def update_scheme_api(
    scheme_id: int,
    data: SchemeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    if scheme.status not in {
        "DRAFT",
        "REJECTED",
        "ARCHIVED",
    }:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only DRAFT, REJECTED, or ARCHIVED " "schemes can be edited."
            ),
        )

    result = update_scheme(
        db=db,
        scheme=scheme,
        data=data,
        current_user=current_user,
    )

    log_request_action(
        request,
        db,
        current_user,
        "SCHEME_UPDATED",
        "SCHEME",
        scheme_id,
        f"Scheme '{scheme.name}' updated.",
    )

    return result


@router.delete(
    "/{scheme_id}",
)
def delete_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    scheme_name = scheme.name

    delete_scheme(
        db,
        scheme,
    )

    log_request_action(
        request,
        db,
        current_user,
        "SCHEME_DELETED",
        "SCHEME",
        scheme_id,
        f"Scheme '{scheme_name}' permanently deleted by administrator.",
    )

    return {"message": "Scheme deleted successfully"}


@router.post(
    "/{scheme_id}/submit",
    response_model=SchemeResponse,
)
def submit_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        result = submit_scheme(
            db,
            scheme,
            current_user=current_user,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_SUBMITTED",
            "SCHEME",
            scheme_id,
            f"Scheme '{scheme.name}' submitted for approval.",
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{scheme_id}/approve",
    response_model=SchemeResponse,
)
def approve_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        result = approve_scheme(
            db,
            scheme,
            current_user.user_id,
            actor_name=current_user.full_name,
        )

        log_request_action(
            request,
            db,
            current_user,
            ACTION_APPROVAL_EVENT,
            "SCHEME",
            scheme_id,
            f"Scheme '{scheme.name}' approved by admin "
            f"{current_user.user_id}.",
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{scheme_id}/reject",
    response_model=SchemeResponse,
)
def reject_scheme_api(
    scheme_id: int,
    data: SchemeRejectRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        result = reject_scheme(
            db,
            scheme,
            data.reason,
            actor_id=current_user.user_id,
            actor_name=current_user.full_name,
        )

        log_request_action(
            request,
            db,
            current_user,
            ACTION_REJECTION_EVENT,
            "SCHEME",
            scheme_id,
            f"Scheme '{scheme.name}' rejected by admin "
            f"{current_user.user_id}.",
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{scheme_id}/archive",
    response_model=SchemeResponse,
)
def archive_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        result = archive_scheme(
            db,
            scheme,
            actor_id=current_user.user_id,
            actor_name=current_user.full_name,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_ARCHIVED",
            "SCHEME",
            scheme_id,
            f"Scheme '{scheme.name}' archived by administrator.",
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{scheme_id}/request-archive",
    response_model=SchemeResponse,
)
def request_archive_scheme_api(
    scheme_id: int,
    data: SchemeArchiveRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        result = request_archive_scheme(
            db=db,
            scheme=scheme,
            user_id=current_user.user_id,
            reason=data.reason,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_ARCHIVE_REQUESTED",
            "SCHEME",
            scheme_id,
            f"Archive requested for scheme '{scheme.name}'.",
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{scheme_id}/approve-archive",
    response_model=SchemeResponse,
)
def approve_archive_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        result = approve_archive_scheme(
            db,
            scheme,
            actor_id=current_user.user_id,
            actor_name=current_user.full_name,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_ARCHIVE_APPROVED",
            "SCHEME",
            scheme_id,
            f"Archive approved for scheme '{scheme.name}'.",
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{scheme_id}/reject-archive",
    response_model=SchemeResponse,
)
def reject_archive_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        result = reject_archive_scheme(
            db,
            scheme,
            actor_id=current_user.user_id,
            actor_name=current_user.full_name,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_ARCHIVE_REJECTED",
            "SCHEME",
            scheme_id,
            f"Archive rejected for scheme '{scheme.name}'.",
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{scheme_id}/restore",
    response_model=SchemeResponse,
)
def restore_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        result = restore_scheme(
            db,
            scheme,
            actor_id=current_user.user_id,
            actor_name=current_user.full_name,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_RESTORED",
            "SCHEME",
            scheme_id,
            f"Scheme '{scheme.name}' restored from archive.",
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{scheme_id}/request-delete",
    response_model=SchemeResponse,
)
def request_delete_scheme_api(
    scheme_id: int,
    data: SchemeDeleteRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("GOVERNMENT_OFFICIAL")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        result = request_delete_scheme(
            db=db,
            scheme=scheme,
            user_id=current_user.user_id,
            reason=data.reason,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_DELETE_REQUESTED",
            "SCHEME",
            scheme_id,
            f"Delete requested for scheme '{scheme.name}'.",
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{scheme_id}/approve-delete",
)
def approve_delete_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        approve_delete_scheme(
            db,
            scheme,
            actor_id=current_user.user_id,
            actor_name=current_user.full_name,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_DELETE_APPROVED",
            "SCHEME",
            scheme_id,
            f"Delete approved; scheme #{scheme_id} permanently deleted.",
        )

        return {
            "message": (
                "Scheme deletion approved " "and scheme permanently deleted."
            )
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


@router.post(
    "/{scheme_id}/reject-delete",
    response_model=SchemeResponse,
)
def reject_delete_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    try:
        result = reject_delete_scheme(
            db,
            scheme,
            actor_id=current_user.user_id,
            actor_name=current_user.full_name,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_DELETE_REJECTED",
            "SCHEME",
            scheme_id,
            f"Delete rejected for scheme '{scheme.name}'.",
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )
