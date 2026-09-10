from datetime import datetime, timezone
from math import ceil

from fastapi import HTTPException, status
from sqlalchemy import or_
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

    now = current_time()

    policy = Policy(
        title=data.title.strip(),
        description=data.description.strip(),
        category=data.category.strip(),
        ministry=(data.ministry.strip() if data.ministry else None),
        department=(data.department.strip() if data.department else None),
        state=(data.state.strip() if data.state else None),
        sector=(data.sector.strip() if data.sector else None),
        publication_date=data.publication_date,
        effective_date=data.effective_date,
        # New policies always begin as DRAFT.
        status="DRAFT",
        document_url=data.document_url,
        source_url=data.source_url,
        created_by=current_user.user_id,
        approved_by=None,
        created_at=now,
        updated_at=now,
    )

    db.add(policy)
    db.commit()
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
            status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
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

    for field, value in updates.items():

        if isinstance(value, str):
            value = value.strip()

        setattr(policy, field, value)

    policy.updated_at = current_time()

    db.commit()
    db.refresh(policy)

    return policy


# =========================================================
# DELETE POLICY
# =========================================================


def delete_policy(
    db: Session,
    policy: Policy,
) -> None:

    db.delete(policy)
    db.commit()


# =========================================================
# SUBMIT POLICY
# =========================================================


def submit_policy(
    db: Session,
    policy: Policy,
) -> Policy:

    if policy.status not in ["DRAFT", "REJECTED"]:
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

    if policy.status == "ARCHIVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Policy is already archived"
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
            detail="Only archived policies can be restored",
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
        query.order_by(Policy.created_at.desc()).offset(offset).limit(limit).all()
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
