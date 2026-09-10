from datetime import datetime, timezone
from math import ceil

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.user import User
from app.schemas.policy import (
    PolicyCreate,
    PolicyUpdate,
)

# =========================================================
# CURRENT TIME
# =========================================================


def current_time() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# =========================================================
# CREATE POLICY
# =========================================================


def create_policy(
    db: Session,
    data: PolicyCreate,
    current_user: User,
) -> Policy:

    # -----------------------------------------------------
    # NORMALIZE VALUES
    # -----------------------------------------------------

    title = data.title.strip()

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

    sector = (
        data.sector.strip() if data.sector and data.sector.strip() else None
    )

    document_url = (
        data.document_url.strip()
        if data.document_url and data.document_url.strip()
        else None
    )

    source_url = (
        data.source_url.strip()
        if data.source_url and data.source_url.strip()
        else None
    )

    # -----------------------------------------------------
    # DUPLICATE CHECK
    #
    # Same:
    # title + ministry + department + state
    #
    # = duplicate
    # -----------------------------------------------------

    query = db.query(Policy).filter(Policy.title.ilike(title))

    # Ministry
    if ministry is None:
        query = query.filter(Policy.ministry.is_(None))
    else:
        query = query.filter(Policy.ministry.ilike(ministry))

    # Department
    if department is None:
        query = query.filter(Policy.department.is_(None))
    else:
        query = query.filter(Policy.department.ilike(department))

    # State
    if state is None:
        query = query.filter(Policy.state.is_(None))
    else:
        query = query.filter(Policy.state.ilike(state))

    existing_policy = query.first()

    if existing_policy:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "A policy with the same title, ministry, "
                "department, and state already exists."
            ),
        )

    # -----------------------------------------------------
    # CREATE POLICY
    # -----------------------------------------------------

    now = current_time()

    policy = Policy(
        title=title,
        description=data.description.strip(),
        category=data.category.strip(),
        ministry=ministry,
        department=department,
        state=state,
        sector=sector,
        publication_date=data.publication_date,
        effective_date=data.effective_date,
        # New policies always start as DRAFT
        status="DRAFT",
        document_url=document_url,
        source_url=source_url,
        created_by=current_user.user_id,
        approved_by=None,
        created_at=now,
        updated_at=now,
    )

    db.add(policy)

    try:
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "A policy with the same title, ministry, "
                "department, and state already exists."
            ),
        )

    except Exception:
        db.rollback()
        raise

    db.refresh(policy)

    return policy


# =========================================================
# GET POLICY
# =========================================================


def get_policy(
    db: Session,
    policy_id: int,
) -> Policy:

    policy = db.query(Policy).filter(Policy.policy_id == policy_id).first()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy not found",
        )

    return policy


# =========================================================
# UPDATE POLICY
# =========================================================


def update_policy(
    db: Session,
    policy: Policy,
    data: PolicyUpdate,
) -> Policy:

    updates = data.model_dump(exclude_unset=True)

    # -----------------------------------------------------
    # DETERMINE FINAL VALUES
    # -----------------------------------------------------

    new_title = updates.get(
        "title",
        policy.title,
    )

    new_ministry = updates.get(
        "ministry",
        policy.ministry,
    )

    new_department = updates.get(
        "department",
        policy.department,
    )

    new_state = updates.get(
        "state",
        policy.state,
    )

    # -----------------------------------------------------
    # NORMALIZE
    # -----------------------------------------------------

    if isinstance(new_title, str):
        new_title = new_title.strip()

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
    # Exclude current policy from the search.
    # -----------------------------------------------------

    query = db.query(Policy).filter(
        Policy.policy_id != policy.policy_id,
        Policy.title.ilike(new_title),
    )

    # Ministry
    if new_ministry is None:
        query = query.filter(Policy.ministry.is_(None))
    else:
        query = query.filter(Policy.ministry.ilike(new_ministry))

    # Department
    if new_department is None:
        query = query.filter(Policy.department.is_(None))
    else:
        query = query.filter(Policy.department.ilike(new_department))

    # State
    if new_state is None:
        query = query.filter(Policy.state.is_(None))
    else:
        query = query.filter(Policy.state.ilike(new_state))

    existing_policy = query.first()

    if existing_policy:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Another policy with the same title, "
                "ministry, department, and state "
                "already exists."
            ),
        )

    # -----------------------------------------------------
    # STORE NORMALIZED VALUES
    # -----------------------------------------------------

    if "title" in updates:
        updates["title"] = new_title

    if "ministry" in updates:
        updates["ministry"] = new_ministry

    if "department" in updates:
        updates["department"] = new_department

    if "state" in updates:
        updates["state"] = new_state

    # -----------------------------------------------------
    # STRIP OTHER TEXT FIELDS
    # -----------------------------------------------------

    text_fields = [
        "description",
        "category",
        "sector",
        "document_url",
        "source_url",
    ]

    for field in text_fields:

        if field in updates:

            value = updates[field]

            if isinstance(value, str):
                updates[field] = value.strip() if value.strip() else None

    # -----------------------------------------------------
    # APPLY UPDATE
    # -----------------------------------------------------

    for field, value in updates.items():
        setattr(
            policy,
            field,
            value,
        )

    policy.updated_at = current_time()

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
                "Another policy with the same title, "
                "ministry, department, and state "
                "already exists."
            ),
        )

    except Exception:
        db.rollback()
        raise

    db.refresh(policy)

    return policy


# =========================================================
# DELETE POLICY
# =========================================================


def delete_policy(
    db: Session,
    policy: Policy,
) -> None:

    try:
        db.delete(policy)
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This policy cannot be deleted because it "
                "is referenced by other records. "
                "Archive it instead."
            ),
        )


# =========================================================
# SUBMIT POLICY
# =========================================================


def submit_policy(
    db: Session,
    policy: Policy,
) -> Policy:

    if policy.status not in [
        "DRAFT",
        "REJECTED",
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only DRAFT or REJECTED policies " "can be submitted"),
        )

    policy.status = "PENDING_APPROVAL"
    policy.updated_at = current_time()

    db.commit()
    db.refresh(policy)

    return policy


# =========================================================
# APPROVE POLICY
# =========================================================


def approve_policy(
    db: Session,
    policy: Policy,
    current_user: User,
) -> Policy:

    if policy.status != "PENDING_APPROVAL":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only policies pending approval " "can be approved"),
        )

    policy.status = "APPROVED"

    policy.approved_by = current_user.user_id

    policy.updated_at = current_time()

    db.commit()
    db.refresh(policy)

    return policy


# =========================================================
# REJECT POLICY
# =========================================================


def reject_policy(
    db: Session,
    policy: Policy,
    reason: str,
) -> Policy:

    if policy.status != "PENDING_APPROVAL":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only policies pending approval " "can be rejected"),
        )

    if not reason or not reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rejection reason is required",
        )

    policy.status = "REJECTED"

    policy.approved_by = None

    policy.updated_at = current_time()

    db.commit()
    db.refresh(policy)

    return policy


# =========================================================
# ARCHIVE POLICY
# =========================================================


def archive_policy(
    db: Session,
    policy: Policy,
) -> Policy:

    if policy.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only APPROVED policies " "can be archived"),
        )

    policy.status = "ARCHIVED"

    policy.updated_at = current_time()

    db.commit()
    db.refresh(policy)

    return policy


# =========================================================
# RESTORE POLICY
# =========================================================


def restore_policy(
    db: Session,
    policy: Policy,
) -> Policy:

    if policy.status != "ARCHIVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only archived policies " "can be restored"),
        )

    policy.status = "APPROVED"

    policy.updated_at = current_time()

    db.commit()
    db.refresh(policy)

    return policy


# =========================================================
# SEARCH POLICIES
# =========================================================


def search_policies(
    db: Session,
    keyword: str | None = None,
    category: str | None = None,
    ministry: str | None = None,
    department: str | None = None,
    state: str | None = None,
    sector: str | None = None,
    policy_status: str | None = None,
    page: int = 1,
    limit: int = 10,
    include_archived: bool = False,
):

    query = db.query(Policy)

    # -----------------------------------------------------
    # ARCHIVED FILTER
    # -----------------------------------------------------

    if not include_archived:
        query = query.filter(Policy.status != "ARCHIVED")

    # -----------------------------------------------------
    # KEYWORD
    # -----------------------------------------------------

    if keyword:

        search = f"%{keyword.strip()}%"

        query = query.filter(
            or_(
                Policy.title.ilike(search),
                Policy.description.ilike(search),
                Policy.category.ilike(search),
                Policy.ministry.ilike(search),
                Policy.department.ilike(search),
                Policy.state.ilike(search),
                Policy.sector.ilike(search),
            )
        )

    # -----------------------------------------------------
    # FILTERS
    # -----------------------------------------------------

    if category:
        query = query.filter(Policy.category.ilike(category.strip()))

    if ministry:
        query = query.filter(Policy.ministry.ilike(ministry.strip()))

    if department:
        query = query.filter(Policy.department.ilike(department.strip()))

    if state:
        query = query.filter(Policy.state.ilike(state.strip()))

    if sector:
        query = query.filter(Policy.sector.ilike(sector.strip()))

    if policy_status:
        query = query.filter(Policy.status == policy_status.upper())

    # -----------------------------------------------------
    # TOTAL
    # -----------------------------------------------------

    total = query.count()

    # -----------------------------------------------------
    # PAGINATION
    # -----------------------------------------------------

    offset = (page - 1) * limit

    policies = (
        query.order_by(Policy.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    pages = ceil(total / limit) if total else 0

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "policies": policies,
    }


# =========================================================
# PENDING APPROVAL
# =========================================================


def get_pending_policies(
    db: Session,
):

    return (
        db.query(Policy)
        .filter(Policy.status == "PENDING_APPROVAL")
        .order_by(Policy.created_at.asc())
        .all()
    )
