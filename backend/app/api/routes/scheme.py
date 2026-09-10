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
    SchemeCreate,
    SchemeListResponse,
    SchemeRejectRequest,
    SchemeResponse,
    SchemeUpdate,
)
from app.services.scheme_service import (
    approve_scheme,
    archive_scheme,
    create_scheme,
    delete_scheme,
    get_pending_schemes,
    get_scheme,
    reject_scheme,
    restore_scheme,
    search_schemes,
    submit_scheme,
    update_scheme,
)

router = APIRouter(
    prefix="/schemes",
    tags=["Schemes"],
)


# =========================================================
# CREATE
# =========================================================


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


# =========================================================
# GET ALL / SEARCH
# =========================================================


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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    role = current_user.role.upper()

    # Public roles can only see APPROVED
    if role in {
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
    }:

        status_filter = "APPROVED"

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
        include_archived=False,
    )


# =========================================================
# PENDING APPROVAL
# IMPORTANT: BEFORE /{scheme_id}
# =========================================================


@router.get(
    "/pending-approval",
    response_model=list[SchemeResponse],
)
def pending_approval(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):

    return get_pending_schemes(db)


# =========================================================
# GET ONE
# =========================================================


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

    # Public users can only see APPROVED
    if role in {
        "CITIZEN",
        "RESEARCHER",
        "ORGANIZATION",
    }:
        if scheme.status != "APPROVED":
            raise HTTPException(
                status_code=404,
                detail="Scheme not found",
            )

    return scheme


# =========================================================
# UPDATE
# =========================================================


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

    # Government Official editing an approved scheme
    # sends it back to draft.
    if (
        current_user.role.upper() == "GOVERNMENT_OFFICIAL"
        and scheme.status == "APPROVED"
    ):
        scheme.status = "DRAFT"

    return update_scheme(
        db=db,
        scheme=scheme,
        data=data,
    )


# =========================================================
# DELETE
# =========================================================


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


# =========================================================
# SUBMIT
# =========================================================


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
        )

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


# =========================================================
# APPROVE
# =========================================================


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
        )

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


# =========================================================
# REJECT
# =========================================================


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

        # Reason is validated by Pydantic.
        # Current DB has no rejection_reason column.
        return reject_scheme(
            db,
            scheme,
        )

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


# =========================================================
# ARCHIVE
# =========================================================


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


# =========================================================
# RESTORE
# =========================================================


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
