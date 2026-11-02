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
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):
    return create_scheme(
        db=db,
        data=data,
        user_id=current_user.user_id,
    )


@router.post(
    "/draft",
    response_model=SchemeResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_scheme_draft_route(
    data: SchemeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            "ADMIN",
            "GOVERNMENT_OFFICIAL",
        )
    ),
):
    return create_scheme(
        db=db,
        data=data,
        user_id=current_user.user_id,
    )



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

    role = current_user.role.upper()

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
            if status_filter is not None and status_filter.upper() != "APPROVED":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only view approved schemes.",
                )

            status_filter = "APPROVED"
            created_by = None
        else:
            if status_filter == "APPROVED":
                created_by = None
            elif role == "GOVERNMENT_OFFICIAL":
                created_by = current_user.user_id
            else:
                created_by = None

        include_archived = False

    return search_schemes(
        db=db,
        keyword=keyword,
        category=category,
        ministry=ministry,
        department=department,
        state=state,
        status=status_filter,
        page=page,
        limit=limit,
        include_archived=include_archived,
        created_by=created_by,
    )


@router.get(
    "/pending-approval",
    response_model=list[SchemeResponse],
)
def pending_approval(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return get_pending_schemes(db)


@router.get(
    "/archive-requests",
    response_model=list[SchemeResponse],
)
def archive_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return get_archive_requests(db)


@router.get(
    "/delete-requests",
    response_model=list[SchemeResponse],
)
def delete_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    return get_delete_requests(db)


@router.get(
    "/{scheme_id}",
    response_model=SchemeResponse,
)
def get_scheme_api(
    scheme_id: int,
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

    role = current_user.role.upper()

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
        if scheme.status != "APPROVED" and scheme.created_by != current_user.user_id:
            raise HTTPException(
                status_code=404,
                detail="Scheme not found",
            )

    return scheme


@router.put(
    "/{scheme_id}",
    response_model=SchemeResponse,
)
def update_scheme_api(
    scheme_id: int,
    data: SchemeUpdate,
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

    return update_scheme(
        db=db,
        scheme=scheme,
        data=data,
        current_user=current_user,
    )


@router.delete(
    "/{scheme_id}",
)
def delete_scheme_api(
    scheme_id: int,
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

    delete_scheme(
        db,
        scheme,
    )

    return {"message": "Scheme deleted successfully"}


@router.post(
    "/{scheme_id}/submit",
    response_model=SchemeResponse,
)
def submit_scheme_api(
    scheme_id: int,
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
        return submit_scheme(
            db,
            scheme,
            current_user=current_user,
        )

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
        return approve_scheme(
            db,
            scheme,
            current_user.user_id,
        )

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
        return reject_scheme(
            db,
            scheme,
            data.reason,
        )

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
        return archive_scheme(
            db,
            scheme,
        )

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
        return request_archive_scheme(
            db=db,
            scheme=scheme,
            user_id=current_user.user_id,
            reason=data.reason,
        )

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
        return approve_archive_scheme(
            db,
            scheme,
        )

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
        return reject_archive_scheme(
            db,
            scheme,
        )

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
        return restore_scheme(
            db,
            scheme,
        )

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
        return request_delete_scheme(
            db=db,
            scheme=scheme,
            user_id=current_user.user_id,
            reason=data.reason,
        )

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
        return reject_delete_scheme(
            db,
            scheme,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )
