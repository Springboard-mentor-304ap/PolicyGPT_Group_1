from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.scheme import Scheme

# =========================================================
# CURRENT TIME
# =========================================================


def current_time() -> datetime:
    return datetime.utcnow()


# =========================================================
# CREATE
# =========================================================


def create_scheme(
    db: Session,
    data,
    user_id: int,
) -> Scheme:

    # -----------------------------------------------------
    # NORMALIZE VALUES
    # -----------------------------------------------------

    name = data.name.strip()

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

    # -----------------------------------------------------
    # DUPLICATE CHECK
    #
    # Same:
    # name + ministry + department + state
    #
    # is considered duplicate.
    # -----------------------------------------------------

    query = db.query(Scheme).filter(Scheme.name.ilike(name))

    # Ministry
    if ministry is None:
        query = query.filter(Scheme.ministry.is_(None))
    else:
        query = query.filter(Scheme.ministry.ilike(ministry))

    # Department
    if department is None:
        query = query.filter(Scheme.department.is_(None))
    else:
        query = query.filter(Scheme.department.ilike(department))

    # State
    if state is None:
        query = query.filter(Scheme.state.is_(None))
    else:
        query = query.filter(Scheme.state.ilike(state))

    existing_scheme = query.first()

    if existing_scheme:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "A scheme with the same name, ministry, "
                "department, and state already exists."
            ),
        )

    # -----------------------------------------------------
    # CREATE SCHEME
    # -----------------------------------------------------

    now = current_time()

    scheme = Scheme(
        name=name,
        description=data.description.strip(),
        category=data.category.strip(),
        ministry=ministry,
        department=department,
        state=state,
        benefits=(
            data.benefits.strip()
            if data.benefits and data.benefits.strip()
            else None
        ),
        documents_required=(
            data.documents_required.strip()
            if (data.documents_required and data.documents_required.strip())
            else None
        ),
        application_process=(
            data.application_process.strip()
            if (data.application_process and data.application_process.strip())
            else None
        ),
        application_url=(
            data.application_url.strip()
            if (data.application_url and data.application_url.strip())
            else None
        ),
        source_url=(
            data.source_url.strip()
            if (data.source_url and data.source_url.strip())
            else None
        ),
        status="DRAFT",
        created_by=user_id,
        created_at=now,
        updated_at=now,
    )

    db.add(scheme)

    try:
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "A scheme with the same name, ministry, "
                "department, and state already exists."
            ),
        )

    except Exception:
        db.rollback()
        raise

    db.refresh(scheme)

    return scheme


# =========================================================
# GET ONE
# =========================================================


def get_scheme(
    db: Session,
    scheme_id: int,
) -> Scheme | None:

    return db.query(Scheme).filter(Scheme.scheme_id == scheme_id).first()


# =========================================================
# UPDATE
# =========================================================


def update_scheme(
    db: Session,
    scheme: Scheme,
    data,
) -> Scheme:

    update_data = data.model_dump(exclude_unset=True)

    # -----------------------------------------------------
    # DETERMINE FINAL VALUES
    # -----------------------------------------------------

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

    # -----------------------------------------------------
    # NORMALIZE
    # -----------------------------------------------------

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

    # -----------------------------------------------------
    # DUPLICATE CHECK
    #
    # Exclude the current scheme itself.
    # -----------------------------------------------------

    query = db.query(Scheme).filter(
        Scheme.scheme_id != scheme.scheme_id,
        Scheme.name.ilike(new_name),
    )

    # Ministry
    if new_ministry is None:
        query = query.filter(Scheme.ministry.is_(None))
    else:
        query = query.filter(Scheme.ministry.ilike(new_ministry))

    # Department
    if new_department is None:
        query = query.filter(Scheme.department.is_(None))
    else:
        query = query.filter(Scheme.department.ilike(new_department))

    # State
    if new_state is None:
        query = query.filter(Scheme.state.is_(None))
    else:
        query = query.filter(Scheme.state.ilike(new_state))

    existing_scheme = query.first()

    if existing_scheme:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Another scheme with the same name, ministry, "
                "department, and state already exists."
            ),
        )

    # -----------------------------------------------------
    # STORE NORMALIZED VALUES
    # -----------------------------------------------------

    if "name" in update_data:
        update_data["name"] = new_name

    if "ministry" in update_data:
        update_data["ministry"] = new_ministry

    if "department" in update_data:
        update_data["department"] = new_department

    if "state" in update_data:
        update_data["state"] = new_state

    # -----------------------------------------------------
    # STRIP OTHER TEXT FIELDS
    # -----------------------------------------------------

    text_fields = [
        "description",
        "category",
        "benefits",
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

    # -----------------------------------------------------
    # APPLY UPDATE
    # -----------------------------------------------------

    for field, value in update_data.items():
        setattr(
            scheme,
            field,
            value,
        )

    scheme.updated_at = current_time()

    # -----------------------------------------------------
    # SAVE
    # -----------------------------------------------------

    try:
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Another scheme with the same name, ministry, "
                "department, and state already exists."
            ),
        )

    except Exception:
        db.rollback()
        raise

    db.refresh(scheme)

    return scheme


# =========================================================
# DELETE
# =========================================================


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
                "This scheme cannot be deleted because it "
                "is referenced by other records. "
                "Archive it instead."
            ),
        )


# =========================================================
# SUBMIT
# =========================================================


def submit_scheme(
    db: Session,
    scheme: Scheme,
) -> Scheme:

    if scheme.status not in {
        "DRAFT",
        "REJECTED",
    }:
        raise ValueError("Only DRAFT or REJECTED schemes " "can be submitted.")

    scheme.status = "PENDING_APPROVAL"
    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


# =========================================================
# APPROVE
# =========================================================


def approve_scheme(
    db: Session,
    scheme: Scheme,
) -> Scheme:

    if scheme.status != "PENDING_APPROVAL":
        raise ValueError("Only PENDING_APPROVAL schemes " "can be approved.")

    scheme.status = "APPROVED"
    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


# =========================================================
# REJECT
# =========================================================


def reject_scheme(
    db: Session,
    scheme: Scheme,
) -> Scheme:

    if scheme.status != "PENDING_APPROVAL":
        raise ValueError("Only PENDING_APPROVAL schemes " "can be rejected.")

    scheme.status = "REJECTED"
    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


# =========================================================
# ARCHIVE
# =========================================================


def archive_scheme(
    db: Session,
    scheme: Scheme,
) -> Scheme:

    if scheme.status != "APPROVED":
        raise ValueError("Only APPROVED schemes can be archived.")

    scheme.status = "ARCHIVED"
    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    return scheme


# =========================================================
# RESTORE
# =========================================================


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


# =========================================================
# SEARCH / FILTER
# =========================================================


def search_schemes(
    db: Session,
    keyword: str | None = None,
    category: str | None = None,
    ministry: str | None = None,
    department: str | None = None,
    state: str | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 10,
    include_archived: bool = False,
):

    query = db.query(Scheme)

    # -----------------------------------------------------
    # KEYWORD
    # -----------------------------------------------------

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
                Scheme.benefits.ilike(search),
                Scheme.documents_required.ilike(search),
                Scheme.application_process.ilike(search),
            )
        )

    # -----------------------------------------------------
    # FILTERS
    # -----------------------------------------------------

    if category:
        query = query.filter(Scheme.category.ilike(category.strip()))

    if ministry:
        query = query.filter(Scheme.ministry.ilike(ministry.strip()))

    if department:
        query = query.filter(Scheme.department.ilike(department.strip()))

    if state:
        query = query.filter(Scheme.state.ilike(state.strip()))

    if status:
        query = query.filter(Scheme.status == status.upper())

    elif not include_archived:
        query = query.filter(Scheme.status != "ARCHIVED")

    # -----------------------------------------------------
    # TOTAL
    # -----------------------------------------------------

    total = query.count()

    # -----------------------------------------------------
    # PAGINATION
    # -----------------------------------------------------

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


# =========================================================
# PENDING APPROVAL
# =========================================================


def get_pending_schemes(
    db: Session,
):

    return (
        db.query(Scheme)
        .filter(Scheme.status == "PENDING_APPROVAL")
        .order_by(Scheme.scheme_id.desc())
        .all()
    )
