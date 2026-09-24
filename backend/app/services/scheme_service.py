from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import cast, or_, String
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.scheme import Scheme
from app.models.user import User


def current_time() -> datetime:
    return datetime.utcnow()


def create_scheme(
    db: Session,
    data,
    user_id: int,
) -> Scheme:

    name = data.name.strip()
    description = data.description.strip()
    category = data.category.strip()

    ministry = (
        data.ministry.strip()
        if data.ministry and data.ministry.strip()
        else None
    )

    department = (
        data.department.strip()
        if data.department and data.department.strip()
        else None
    )

    state = data.state.strip() if data.state and data.state.strip() else None

    query = db.query(Scheme).filter(Scheme.name.ilike(name))

    if ministry is None:
        query = query.filter(Scheme.ministry.is_(None))
    else:
        query = query.filter(Scheme.ministry.ilike(ministry))

    if department is None:
        query = query.filter(Scheme.department.is_(None))
    else:
        query = query.filter(Scheme.department.ilike(department))

    if state is None:
        query = query.filter(Scheme.state.is_(None))
    else:
        query = query.filter(Scheme.state.ilike(state))

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "A scheme with the same name, ministry, "
                "department, and state already exists."
            ),
        )

    now = current_time()

    scheme = Scheme(
        name=name,
        description=description,
        category=category,
        ministry=ministry,
        department=department,
        state=state,
        benefits=data.benefits,
        documents_required=(
            data.documents_required.strip()
            if data.documents_required and data.documents_required.strip()
            else None
        ),
        application_process=(
            data.application_process.strip()
            if data.application_process and data.application_process.strip()
            else None
        ),
        application_url=(
            data.application_url.strip()
            if data.application_url and data.application_url.strip()
            else None
        ),
        source_url=(
            data.source_url.strip()
            if data.source_url and data.source_url.strip()
            else None
        ),
        eligibility_rules=data.eligibility_rules,
        status="DRAFT",
        created_by=user_id,
        approved_by=None,
        created_at=now,
        updated_at=now,
    )

    db.add(scheme)

    try:
        db.commit()
        db.refresh(scheme)
        return scheme

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to create scheme.",
        )


def get_scheme(
    db: Session,
    scheme_id: int,
) -> Scheme | None:

    return db.query(Scheme).filter(Scheme.scheme_id == scheme_id).first()


def update_scheme(
    db: Session,
    scheme: Scheme,
    data,
    current_user: User | None = None,
) -> Scheme:

    if current_user and current_user.role == "GOVERNMENT_OFFICIAL":
        if scheme.created_by != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only edit schemes created by yourself.",
            )

    if scheme.status not in {
        "DRAFT",
        "REJECTED",
        "ARCHIVED",
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only DRAFT, REJECTED, or ARCHIVED " "schemes can be edited."
            ),
        )

    update_data = data.model_dump(exclude_unset=True)

    new_name = update_data.get(
        "name",
        scheme.name,
    )

    new_ministry = update_data.get(
        "ministry",
        scheme.ministry,
    )

    new_department = update_data.get(
        "department",
        scheme.department,
    )

    new_state = update_data.get(
        "state",
        scheme.state,
    )

    if isinstance(new_name, str):
        new_name = new_name.strip()

    if isinstance(new_ministry, str):
        new_ministry = new_ministry.strip() if new_ministry.strip() else None

    if isinstance(new_department, str):
        new_department = (
            new_department.strip() if new_department.strip() else None
        )

    if isinstance(new_state, str):
        new_state = new_state.strip() if new_state.strip() else None

    query = db.query(Scheme).filter(
        Scheme.scheme_id != scheme.scheme_id,
        Scheme.name.ilike(new_name),
    )

    if new_ministry is None:
        query = query.filter(Scheme.ministry.is_(None))
    else:
        query = query.filter(Scheme.ministry.ilike(new_ministry))

    if new_department is None:
        query = query.filter(Scheme.department.is_(None))
    else:
        query = query.filter(Scheme.department.ilike(new_department))

    if new_state is None:
        query = query.filter(Scheme.state.is_(None))
    else:
        query = query.filter(Scheme.state.ilike(new_state))

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Another scheme with the same name, ministry, "
                "department, and state already exists."
            ),
        )

    if "name" in update_data:
        update_data["name"] = new_name

    if "ministry" in update_data:
        update_data["ministry"] = new_ministry

    if "department" in update_data:
        update_data["department"] = new_department

    if "state" in update_data:
        update_data["state"] = new_state

    text_fields = [
        "description",
        "category",
        "documents_required",
        "application_process",
        "application_url",
        "source_url",
    ]

    for field in text_fields:
        if field in update_data:
            value = update_data[field]

            if isinstance(value, str):
                update_data[field] = value.strip() if value.strip() else None

    for field, value in update_data.items():
        setattr(scheme, field, value)

    if scheme.status == "ARCHIVED":
        scheme.status = "DRAFT"

    scheme.updated_at = current_time()

    try:
        db.commit()
        db.refresh(scheme)
        return scheme

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to update scheme.",
        )


def delete_scheme(
    db: Session,
    scheme: Scheme,
) -> None:

    try:
        db.delete(scheme)
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This scheme cannot be permanently deleted "
                "because it is referenced by other records."
            ),
        )


def submit_scheme(
    db: Session,
    scheme: Scheme,
    current_user: User | None = None,
) -> Scheme:

    # Creator-only submission check: only the creator (or Admin) can submit
    if current_user and current_user.role != "ADMIN":
        if scheme.created_by != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You are not authorized to submit this scheme. "
                    "Only the user who created it can submit it for approval."
                ),
            )

    if scheme.status not in {
        "DRAFT",
        "REJECTED",
    }:
        raise ValueError("Only DRAFT or REJECTED schemes " "can be submitted.")

    scheme.status = "PENDING_APPROVAL"

    scheme.rejection_reason = None

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


def approve_scheme(
    db: Session,
    scheme: Scheme,
    admin_user_id: int,
) -> Scheme:

    if scheme.status != "PENDING_APPROVAL":
        raise ValueError("Only PENDING_APPROVAL schemes " "can be approved.")

    scheme.status = "APPROVED"
    scheme.approved_by = admin_user_id
    scheme.rejection_reason = None
    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


def reject_scheme(
    db: Session,
    scheme: Scheme,
    reason: str,
) -> Scheme:

    if scheme.status != "PENDING_APPROVAL":
        raise ValueError("Only PENDING_APPROVAL schemes " "can be rejected.")

    reason = reason.strip()

    if not reason:
        raise ValueError("Rejection reason is required.")

    scheme.status = "REJECTED"
    scheme.rejection_reason = reason
    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


def archive_scheme(
    db: Session,
    scheme: Scheme,
) -> Scheme:

    if scheme.status != "APPROVED":
        raise ValueError("Only APPROVED schemes can be archived.")

    scheme.status = "ARCHIVED"

    scheme.archive_reason = None
    scheme.archive_requested_by = None
    scheme.archive_requested_at = None

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


def request_archive_scheme(
    db: Session,
    scheme: Scheme,
    user_id: int,
    reason: str,
) -> Scheme:

    if scheme.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only request archive for schemes created by yourself.",
        )

    if scheme.status != "APPROVED":
        raise ValueError(
            "Only APPROVED schemes can have " "an archive request."
        )

    reason = reason.strip()

    if not reason:
        raise ValueError("Archive reason is required.")

    scheme.status = "ARCHIVE_REQUESTED"

    scheme.archive_reason = reason
    scheme.archive_requested_by = user_id
    scheme.archive_requested_at = current_time()

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


def get_archive_requests(
    db: Session,
):

    return (
        db.query(Scheme)
        .filter(Scheme.status == "ARCHIVE_REQUESTED")
        .order_by(Scheme.scheme_id.desc())
        .all()
    )


def approve_archive_scheme(
    db: Session,
    scheme: Scheme,
) -> Scheme:

    if scheme.status != "ARCHIVE_REQUESTED":
        raise ValueError(
            "Only ARCHIVE_REQUESTED schemes " "can be approved for archive."
        )

    scheme.status = "ARCHIVED"

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


def reject_archive_scheme(
    db: Session,
    scheme: Scheme,
) -> Scheme:

    if scheme.status != "ARCHIVE_REQUESTED":
        raise ValueError(
            "Only ARCHIVE_REQUESTED schemes "
            "can have their archive request rejected."
        )

    scheme.status = "APPROVED"

    scheme.archive_reason = None
    scheme.archive_requested_by = None
    scheme.archive_requested_at = None

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


def restore_scheme(
    db: Session,
    scheme: Scheme,
) -> Scheme:

    if scheme.status != "ARCHIVED":
        raise ValueError("Only ARCHIVED schemes can be restored.")

    scheme.status = "APPROVED"

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


def request_delete_scheme(
    db: Session,
    scheme: Scheme,
    user_id: int,
    reason: str,
) -> Scheme:

    if scheme.created_by != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only request deletion for schemes created by yourself.",
        )

    if scheme.status not in {
        "APPROVED",
        "ARCHIVED",
    }:
        raise ValueError(
            "Only APPROVED or ARCHIVED schemes " "can have a delete request."
        )

    reason = reason.strip()

    if not reason:
        raise ValueError("Delete reason is required.")

    scheme.delete_requested_from_status = scheme.status

    scheme.status = "DELETE_REQUESTED"

    scheme.delete_reason = reason
    scheme.delete_requested_by = user_id
    scheme.delete_requested_at = current_time()

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


def get_delete_requests(
    db: Session,
):

    return (
        db.query(Scheme)
        .filter(Scheme.status == "DELETE_REQUESTED")
        .order_by(Scheme.scheme_id.desc())
        .all()
    )


def approve_delete_scheme(
    db: Session,
    scheme: Scheme,
) -> None:

    if scheme.status != "DELETE_REQUESTED":
        raise ValueError(
            "Only DELETE_REQUESTED schemes " "can be permanently deleted."
        )

    try:
        db.delete(scheme)
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This scheme cannot be permanently deleted "
                "because it is referenced by other records."
            ),
        )


def reject_delete_scheme(
    db: Session,
    scheme: Scheme,
) -> Scheme:

    if scheme.status != "DELETE_REQUESTED":
        raise ValueError(
            "Only DELETE_REQUESTED schemes "
            "can have their delete request rejected."
        )

    previous_status = scheme.delete_requested_from_status

    if previous_status not in {
        "APPROVED",
        "ARCHIVED",
    }:
        raise ValueError("Previous scheme status is invalid.")

    scheme.status = previous_status

    scheme.delete_reason = None
    scheme.delete_requested_by = None
    scheme.delete_requested_at = None
    scheme.delete_requested_from_status = None

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


def search_schemes(
    db: Session,
    keyword: str | None = None,
    category: str | None = None,
    ministry: str | None = None,
    department: str | None = None,
    state: str | None = None,
    sector: str | None = None,
    publication_date: str | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 10,
    include_archived: bool = False,
    created_by: int | None = None,
    current_user: User | None = None,
):

    query = db.query(Scheme)

    # --------------------------------------------------------
    # DRAFT & PENDING APPROVAL PRIVACY RULE
    # Draft schemes can ONLY be seen by the user who created them.
    # When submitted (PENDING_APPROVAL), only Admin & creator can see them.
    # --------------------------------------------------------
    if current_user is not None:
        query = query.filter(
            or_(Scheme.status != "DRAFT", Scheme.created_by == current_user.user_id)
        )
        if str(current_user.role).strip().upper() != "ADMIN":
            query = query.filter(
                or_(Scheme.status != "PENDING_APPROVAL", Scheme.created_by == current_user.user_id)
            )

    if created_by is not None:
        query = query.filter(Scheme.created_by == created_by)

    if keyword:
        search = f"%{keyword.strip()}%"

        query = query.filter(
            or_(
                Scheme.name.ilike(search),
                Scheme.description.ilike(search),
                Scheme.category.ilike(search),
                Scheme.ministry.ilike(search),
                Scheme.department.ilike(search),
                Scheme.state.ilike(search),
                Scheme.documents_required.ilike(search),
                Scheme.application_process.ilike(search),
            )
        )

    if category:
        query = query.filter(Scheme.category.ilike(category.strip()))

    if sector:
        query = query.filter(Scheme.category.ilike(sector.strip()))

    if ministry:
        query = query.filter(Scheme.ministry.ilike(ministry.strip()))

    if department:
        query = query.filter(Scheme.department.ilike(department.strip()))

    if state:
        query = query.filter(Scheme.state.ilike(state.strip()))

    if publication_date:
        query = query.filter(
            cast(Scheme.created_at, String).ilike(f"%{publication_date.strip()}%")
        )

    if status and status.upper() != "ALL":
        query = query.filter(Scheme.status == status.upper())

    elif not include_archived:
        query = query.filter(Scheme.status != "ARCHIVED")

    total = query.count()

    offset = (page - 1) * limit

    schemes = (
        query.order_by(Scheme.scheme_id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    pages = (total + limit - 1) // limit if total > 0 else 1

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "schemes": schemes,
    }


def get_pending_schemes(
    db: Session,
):

    return (
        db.query(Scheme)
        .filter(Scheme.status == "PENDING_APPROVAL")
        .order_by(Scheme.scheme_id.desc())
        .all()
    )
