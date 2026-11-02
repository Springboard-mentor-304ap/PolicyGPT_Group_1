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
from app.services.audit_log_service import (
    ACTION_APPROVAL_EVENT,
    ACTION_REJECTION_EVENT,
    attach_actor_display_names,
    log_request_action,
    resolve_user_display_name,
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
    background_tasks: BackgroundTasks,
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
        current_user=current_user,
        background_tasks=background_tasks,
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
    background_tasks: BackgroundTasks,
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
        current_user=current_user,
        background_tasks=background_tasks,
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
    "/deleted",
    response_model=SchemeListResponse,
)
def get_deleted_schemes_api(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
    page: int = 1,
    limit: int = 100,
    search: str | None = None,
):
    from app.services.scheme_service import get_deleted_schemes

    result = get_deleted_schemes(
        db=db,
        page=page,
        limit=limit,
        search=search,
        current_user=current_user,
    )

    return result


@router.post(
    "/maintenance/purge-deleted",
)
def purge_deleted_schemes_api(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
    retention_days: int = 30,
):
    from app.services.deletion_cleanup_service import (
        process_deleted_cleanup,
    )

    summary = process_deleted_cleanup(
        db=db,
        retention_days=retention_days,
        triggered_by=current_user.user_id,
    )

    log_request_action(
        request,
        db,
        current_user,
        "SCHEME_PURGE_RUN",
        "SCHEME",
        None,
        f"Deleted-schemes purge run: {summary['schemes_purged']} purged, "
        f"{summary['schemes_skipped_errors']} errors.",
    )

    return summary


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

    attach_actor_display_names(db, scheme)

    return scheme


@router.put(
    "/{scheme_id}",
    response_model=SchemeResponse,
)
def update_scheme_api(
    scheme_id: int,
    data: SchemeUpdate,
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

    scheme = get_scheme(
        db,
        scheme_id,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    # DRAFT/REJECTED/ARCHIVED editable by staff; APPROVED additionally
    # editable by Admin (mirrors update_scheme service + Policy behavior).
    # Other statuses (PENDING_APPROVAL/ARCHIVE_REQUESTED/DELETE_REQUESTED)
    # remain locked for everyone.
    _role = normalize_role(getattr(current_user, "role", ""))
    if scheme.status not in {
        "DRAFT",
        "REJECTED",
        "ARCHIVED",
    } and not (_role == "ADMIN" and scheme.status == "APPROVED"):
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
        background_tasks=background_tasks,
    )

    # Concise change summary (field names only, never values) so the
    # timeline shows what was edited without duplicating data.
    changed_fields = sorted(data.model_dump(exclude_unset=True).keys())
    change_suffix = (
        f" Changed fields: {', '.join(changed_fields)}." if changed_fields else ""
    )

    log_request_action(
        request,
        db,
        current_user,
        "SCHEME_UPDATED",
        "SCHEME",
        scheme_id,
        f"Scheme '{scheme.name}' updated.{change_suffix}",
    )

    return result


@router.delete(
    "/{scheme_id}",
)
def delete_scheme_api(
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

    # Direct deletion: Admins keep the existing behavior; Government
    # Officials may directly delete only their own DRAFT schemes.
    # Every other status keeps the request/approval workflow.
    _role = normalize_role(getattr(current_user, "role", ""))
    if _role != "ADMIN":
        if scheme.status != "DRAFT":
            raise HTTPException(
                status_code=400,
                detail=(
                    "Only DRAFT schemes can be deleted directly. "
                    "Use the deletion-request workflow for other statuses."
                ),
            )
        if scheme.created_by != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You are not authorized to delete this scheme. "
                    "Only the user who created it can delete it."
                ),
            )

    scheme_name = scheme.name

    # Creator snapshot for future Deleted-records views (the row and its
    # created_by link disappear with the permanent delete).
    creator_name = resolve_user_display_name(
        db, getattr(scheme, "created_by", None)
    )
    creator_suffix = f" Created by {creator_name}." if creator_name else ""

    delete_scheme(
        db,
        scheme,
        deleted_by=current_user.user_id,
    )

    log_request_action(
        request,
        db,
        current_user,
        "SCHEME_DELETED",
        "SCHEME",
        scheme_id,
        f"Scheme '{scheme_name}' moved to Deleted Schemes.{creator_suffix}",
    )

    return {"message": "Scheme moved to Deleted Schemes"}


# ============================================================
# PERMANENT DELETE (TRASH ONLY)
#
# ADMIN ONLY
#
# Physically removes a temporarily deleted row. Live rows are
# rejected: delete them first to move them to Deleted Schemes.
# ============================================================


@router.delete(
    "/{scheme_id}/permanent",
)
def permanent_delete_scheme_api(
    scheme_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    from app.services.scheme_service import permanent_delete_scheme

    scheme = get_scheme(
        db,
        scheme_id,
        include_deleted=True,
    )

    if not scheme:
        raise HTTPException(
            status_code=404,
            detail="Scheme not found",
        )

    permanent_delete_scheme(db, scheme)

    log_request_action(
        request,
        db,
        current_user,
        "SCHEME_PERMANENTLY_DELETED",
        "SCHEME",
        scheme_id,
        f"Scheme #{scheme_id} permanently deleted from trash.",
    )

    return {"message": "Scheme permanently deleted."}


@router.post(
    "/{scheme_id}/submit",
    response_model=SchemeResponse,
)
def submit_scheme_api(
    scheme_id: int,
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
        was_rejected = scheme.status == "REJECTED"
        result = submit_scheme(
            db,
            scheme,
            current_user=current_user,
            background_tasks=background_tasks,
        )

        submit_verb = (
            "resubmitted for approval"
            if was_rejected
            else "submitted for approval"
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_SUBMITTED",
            "SCHEME",
            scheme_id,
            f"Scheme '{scheme.name}' {submit_verb}.",
        )

        # Admin direct approval (DRAFT -> APPROVED) is also recorded as
        # an approval, mirroring POST /schemes/{id}/approve.
        if result.status == "APPROVED":
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
    "/{scheme_id}/approve",
    response_model=SchemeResponse,
)
def approve_scheme_api(
    scheme_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
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
            background_tasks=background_tasks,
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
    background_tasks: BackgroundTasks,
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
            background_tasks=background_tasks,
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
    background_tasks: BackgroundTasks,
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
            background_tasks=background_tasks,
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
    background_tasks: BackgroundTasks,
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
            background_tasks=background_tasks,
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
    background_tasks: BackgroundTasks,
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
            background_tasks=background_tasks,
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
    background_tasks: BackgroundTasks,
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
            background_tasks=background_tasks,
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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    scheme = get_scheme(
        db,
        scheme_id,
        include_deleted=True,
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
            background_tasks=background_tasks,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_RESTORED",
            "SCHEME",
            scheme_id,
            f"Scheme '{scheme.name}' restored successfully.",
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
    background_tasks: BackgroundTasks,
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
            background_tasks=background_tasks,
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
    background_tasks: BackgroundTasks,
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
        creator_name = resolve_user_display_name(
            db, getattr(scheme, "created_by", None)
        )
        creator_suffix = f" Created by {creator_name}." if creator_name else ""

        approve_delete_scheme(
            db,
            scheme,
            actor_id=current_user.user_id,
            actor_name=current_user.full_name,
            background_tasks=background_tasks,
        )

        log_request_action(
            request,
            db,
            current_user,
            "SCHEME_DELETE_APPROVED",
            "SCHEME",
            scheme_id,
            f"Delete approved for scheme '{scheme.name}' (#{scheme_id}); moved to Deleted Schemes.{creator_suffix}",
        )

        return {
            "message": (
                "Scheme deletion approved " "and scheme moved to Deleted Schemes."
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
    background_tasks: BackgroundTasks,
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
            background_tasks=background_tasks,
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
