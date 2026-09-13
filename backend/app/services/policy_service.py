from datetime import datetime, timezone
from math import ceil
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.user import User
from app.schemas.policy import PolicyCreate, PolicyUpdate

# ============================================================
# HELPERS
# ============================================================


def _now() -> datetime:
    """
    Database uses TIMESTAMP WITHOUT TIME ZONE.
    Store naive UTC datetime.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _clean_benefits(
    benefits: list[str] | None,
) -> list[str] | None:

    if benefits is None:
        return None

    cleaned = []

    for benefit in benefits:

        if benefit is None:
            continue

        value = str(benefit).strip()

        if value:
            cleaned.append(value)

    return cleaned or None


def _clean_eligibility_rules(
    rules: list[dict[str, Any]] | None,
) -> list[dict[str, Any]] | None:

    if rules is None:
        return None

    if not isinstance(rules, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="eligibility_rules must be a list.",
        )

    cleaned = []

    for rule in rules:

        if not isinstance(rule, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each eligibility rule must be an object.",
            )

        cleaned.append(rule)

    return cleaned or None


def _policy_or_404(
    db: Session,
    policy_id: int,
) -> Policy:

    policy = db.query(Policy).filter(Policy.policy_id == policy_id).first()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy not found.",
        )

    return policy


def _calculate_pages(
    total: int,
    limit: int,
) -> int:

    if total == 0:
        return 0

    return ceil(total / limit)


def _validate_policy_duplicate(
    db: Session,
    title: str,
    exclude_policy_id: int | None = None,
) -> None:

    query = db.query(Policy).filter(
        func.lower(Policy.title) == title.strip().lower()
    )

    if exclude_policy_id is not None:
        query = query.filter(Policy.policy_id != exclude_policy_id)

    existing = query.first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A policy with this title already exists.",
        )


# ============================================================
# CREATE POLICY
# ============================================================


def create_policy(
    db: Session,
    data: PolicyCreate,
    current_user: User,
) -> Policy:

    _validate_policy_duplicate(
        db=db,
        title=data.title,
    )

    now = _now()

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
        status="DRAFT",
        document_url=(
            data.document_url.strip() if data.document_url else None
        ),
        source_url=(data.source_url.strip() if data.source_url else None),
        benefits=_clean_benefits(data.benefits),
        eligibility_rules=_clean_eligibility_rules(data.eligibility_rules),
        created_by=current_user.user_id,
        approved_by=None,
        rejection_reason=None,
        archive_reason=None,
        archive_requested_by=None,
        archive_requested_at=None,
        delete_reason=None,
        delete_requested_by=None,
        delete_requested_at=None,
        delete_requested_from_status=None,
        created_at=now,
        updated_at=now,
    )

    db.add(policy)
    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# GET SINGLE POLICY
# ============================================================


def get_policy(
    db: Session,
    policy_id: int,
) -> Policy:

    return _policy_or_404(
        db=db,
        policy_id=policy_id,
    )


# ============================================================
# UPDATE POLICY
#
# Allowed:
# DRAFT
# REJECTED
# ARCHIVED
#
# ARCHIVED -> DRAFT after edit
# REJECTED stays REJECTED until resubmitted
# ============================================================


def update_policy(
    db: Session,
    policy_id: int,
    data: PolicyUpdate,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status not in {
        "DRAFT",
        "REJECTED",
        "ARCHIVED",
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Policy can only be edited when its status "
                "is DRAFT, REJECTED, or ARCHIVED."
            ),
        )

    old_status = policy.status

    update_data = data.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided for update.",
        )

    # --------------------------------------------------------
    # TITLE
    # --------------------------------------------------------

    if "title" in update_data:

        title = update_data["title"]

        if title is None or not str(title).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Policy title cannot be empty.",
            )

        _validate_policy_duplicate(
            db=db,
            title=str(title),
            exclude_policy_id=policy_id,
        )

        policy.title = str(title).strip()

    # --------------------------------------------------------
    # DESCRIPTION
    # --------------------------------------------------------

    if "description" in update_data:

        description = update_data["description"]

        if description is None or not str(description).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Policy description cannot be empty.",
            )

        policy.description = str(description).strip()

    # --------------------------------------------------------
    # CATEGORY
    # --------------------------------------------------------

    if "category" in update_data:

        category = update_data["category"]

        if category is None or not str(category).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Policy category cannot be empty.",
            )

        policy.category = str(category).strip()

    # --------------------------------------------------------
    # MINISTRY
    # --------------------------------------------------------

    if "ministry" in update_data:

        policy.ministry = (
            str(update_data["ministry"]).strip()
            if update_data["ministry"]
            else None
        )

    # --------------------------------------------------------
    # DEPARTMENT
    # --------------------------------------------------------

    if "department" in update_data:

        policy.department = (
            str(update_data["department"]).strip()
            if update_data["department"]
            else None
        )

    # --------------------------------------------------------
    # STATE
    # --------------------------------------------------------

    if "state" in update_data:

        policy.state = (
            str(update_data["state"]).strip() if update_data["state"] else None
        )

    # --------------------------------------------------------
    # SECTOR
    # --------------------------------------------------------

    if "sector" in update_data:

        policy.sector = (
            str(update_data["sector"]).strip()
            if update_data["sector"]
            else None
        )

    # --------------------------------------------------------
    # DATES
    # --------------------------------------------------------

    if "publication_date" in update_data:
        policy.publication_date = update_data["publication_date"]

    if "effective_date" in update_data:
        policy.effective_date = update_data["effective_date"]

    # --------------------------------------------------------
    # DOCUMENT URL
    # --------------------------------------------------------

    if "document_url" in update_data:

        policy.document_url = (
            str(update_data["document_url"]).strip()
            if update_data["document_url"]
            else None
        )

    # --------------------------------------------------------
    # SOURCE URL
    # --------------------------------------------------------

    if "source_url" in update_data:

        policy.source_url = (
            str(update_data["source_url"]).strip()
            if update_data["source_url"]
            else None
        )

    # --------------------------------------------------------
    # BENEFITS
    # --------------------------------------------------------

    if "benefits" in update_data:

        policy.benefits = _clean_benefits(update_data["benefits"])

    # --------------------------------------------------------
    # ELIGIBILITY RULES
    # --------------------------------------------------------

    if "eligibility_rules" in update_data:

        policy.eligibility_rules = _clean_eligibility_rules(
            update_data["eligibility_rules"]
        )

    # --------------------------------------------------------
    # IMPORTANT STATUS LOGIC
    #
    # Archived policy edited:
    #
    # ARCHIVED -> DRAFT
    #
    # It must go through approval again.
    # --------------------------------------------------------

    if old_status == "ARCHIVED":

        policy.status = "DRAFT"

        # Previous approval is no longer valid
        policy.approved_by = None

        # Clear old archive request information
        policy.archive_reason = None
        policy.archive_requested_by = None
        policy.archive_requested_at = None

    # --------------------------------------------------------
    # Rejected policy edited
    #
    # REJECTED remains REJECTED until /submit.
    # Clear old rejection reason because the policy was modified.
    # --------------------------------------------------------

    elif old_status == "REJECTED":

        policy.rejection_reason = None

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# DIRECT DELETE
#
# ADMIN ONLY
# ============================================================


def delete_policy(
    db: Session,
    policy_id: int,
    current_user: User,
) -> None:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    try:

        db.delete(policy)
        db.commit()

    except Exception as exc:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Policy could not be deleted. "
                "It may be referenced by another record. "
                "Consider archiving it instead."
            ),
        ) from exc


# ============================================================
# SUBMIT POLICY
#
# DRAFT / REJECTED
#        ↓
# PENDING_APPROVAL
# ============================================================


def submit_policy(
    db: Session,
    policy_id: int,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status not in {
        "DRAFT",
        "REJECTED",
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only DRAFT or REJECTED policies "
                "can be submitted for approval."
            ),
        )

    policy.status = "PENDING_APPROVAL"

    policy.rejection_reason = None

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# APPROVE POLICY
#
# PENDING_APPROVAL -> APPROVED
# ============================================================


def approve_policy(
    db: Session,
    policy_id: int,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status != "PENDING_APPROVAL":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only policies pending approval " "can be approved."),
        )

    policy.status = "APPROVED"

    policy.approved_by = current_user.user_id

    policy.rejection_reason = None

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# REJECT POLICY
#
# PENDING_APPROVAL -> REJECTED
# ============================================================


def reject_policy(
    db: Session,
    policy_id: int,
    reason: str,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status != "PENDING_APPROVAL":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only policies pending approval " "can be rejected."),
        )

    if not reason or not reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rejection reason is required.",
        )

    policy.status = "REJECTED"

    policy.rejection_reason = reason.strip()

    policy.approved_by = None

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# REQUEST ARCHIVE
#
# GOVERNMENT OFFICIAL ONLY
#
# APPROVED -> ARCHIVE_REQUESTED
# ============================================================


def request_archive_policy(
    db: Session,
    policy_id: int,
    reason: str,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only APPROVED policies can have " "an archive request."),
        )

    if not reason or not reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archive reason is required.",
        )

    policy.status = "ARCHIVE_REQUESTED"

    policy.archive_reason = reason.strip()

    policy.archive_requested_by = current_user.user_id

    policy.archive_requested_at = _now()

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# GET ARCHIVE REQUESTS
#
# ADMIN ONLY
# ============================================================


def get_archive_requests(
    db: Session,
    page: int = 1,
    limit: int = 10,
) -> dict:

    query = (
        db.query(Policy)
        .filter(Policy.status == "ARCHIVE_REQUESTED")
        .order_by(Policy.updated_at.desc())
    )

    total = query.count()

    pages = _calculate_pages(
        total=total,
        limit=limit,
    )

    policies = query.offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "policies": policies,
    }


# ============================================================
# APPROVE ARCHIVE REQUEST
#
# ADMIN ONLY
#
# ARCHIVE_REQUESTED -> ARCHIVED
# ============================================================


def approve_archive_policy(
    db: Session,
    policy_id: int,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status != "ARCHIVE_REQUESTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only policies with an "
                "ARCHIVE_REQUESTED status can be archived."
            ),
        )

    policy.status = "ARCHIVED"

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# REJECT ARCHIVE REQUEST
#
# ADMIN ONLY
#
# ARCHIVE_REQUESTED -> APPROVED
# ============================================================


def reject_archive_policy(
    db: Session,
    policy_id: int,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status != "ARCHIVE_REQUESTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only policies with an "
                "ARCHIVE_REQUESTED status can have "
                "their archive request rejected."
            ),
        )

    policy.status = "APPROVED"

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# RESTORE POLICY
#
# ADMIN ONLY
#
# ARCHIVED -> APPROVED
# ============================================================


def restore_policy(
    db: Session,
    policy_id: int,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status != "ARCHIVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only ARCHIVED policies can be restored."),
        )

    policy.status = "APPROVED"

    policy.approved_by = current_user.user_id

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# REQUEST DELETE
#
# GOVERNMENT OFFICIAL ONLY
#
# APPROVED / ARCHIVED -> DELETE_REQUESTED
# ============================================================


def request_delete_policy(
    db: Session,
    policy_id: int,
    reason: str,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status not in {
        "APPROVED",
        "ARCHIVED",
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Deletion can only be requested for "
                "APPROVED or ARCHIVED policies."
            ),
        )

    if not reason or not reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deletion reason is required.",
        )

    # Save the previous status.
    policy.delete_requested_from_status = policy.status

    policy.status = "DELETE_REQUESTED"

    policy.delete_reason = reason.strip()

    policy.delete_requested_by = current_user.user_id

    policy.delete_requested_at = _now()

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# GET DELETE REQUESTS
#
# ADMIN ONLY
# ============================================================


def get_delete_requests(
    db: Session,
    page: int = 1,
    limit: int = 10,
) -> dict:

    query = (
        db.query(Policy)
        .filter(Policy.status == "DELETE_REQUESTED")
        .order_by(Policy.updated_at.desc())
    )

    total = query.count()

    pages = _calculate_pages(
        total=total,
        limit=limit,
    )

    policies = query.offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "policies": policies,
    }


# ============================================================
# APPROVE DELETE REQUEST
#
# ADMIN ONLY
#
# DELETE_REQUESTED -> PHYSICAL DELETE
# ============================================================


def approve_delete_policy(
    db: Session,
    policy_id: int,
    current_user: User,
) -> None:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status != "DELETE_REQUESTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only policies with a DELETE_REQUESTED "
                "status can be permanently deleted."
            ),
        )

    try:

        db.delete(policy)

        db.commit()

    except Exception as exc:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Policy could not be permanently deleted. "
                "It may be referenced by another record."
            ),
        ) from exc


# ============================================================
# REJECT DELETE REQUEST
#
# ADMIN ONLY
#
# DELETE_REQUESTED -> PREVIOUS STATUS
#
# APPROVED -> DELETE_REQUESTED -> APPROVED
#
# ARCHIVED -> DELETE_REQUESTED -> ARCHIVED
# ============================================================


def reject_delete_policy(
    db: Session,
    policy_id: int,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status != "DELETE_REQUESTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only policies with a DELETE_REQUESTED "
                "status can have their deletion request rejected."
            ),
        )

    previous_status = policy.delete_requested_from_status

    if previous_status not in {
        "APPROVED",
        "ARCHIVED",
    }:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Previous policy status for the delete "
                "request could not be determined."
            ),
        )

    policy.status = previous_status

    # Clear active delete-request data.
    policy.delete_reason = None
    policy.delete_requested_by = None
    policy.delete_requested_at = None
    policy.delete_requested_from_status = None

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    return policy


# ============================================================
# SEARCH POLICIES
# ============================================================


def search_policies(
    db: Session,
    search: str | None = None,
    category: str | None = None,
    ministry: str | None = None,
    department: str | None = None,
    state: str | None = None,
    sector: str | None = None,
    policy_status: str | None = None,
    page: int = 1,
    limit: int = 10,
) -> dict:

    query = db.query(Policy)

    # --------------------------------------------------------
    # SEARCH
    # --------------------------------------------------------

    if search:

        search_term = f"%{search.strip()}%"

        query = query.filter(
            or_(
                Policy.title.ilike(search_term),
                Policy.description.ilike(search_term),
                Policy.category.ilike(search_term),
                Policy.ministry.ilike(search_term),
                Policy.department.ilike(search_term),
                Policy.sector.ilike(search_term),
            )
        )

    # --------------------------------------------------------
    # FILTERS
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # STATUS
    # --------------------------------------------------------

    if policy_status:

        query = query.filter(Policy.status == policy_status.strip().upper())

    else:

        # Normal search does not show archived policies.
        query = query.filter(Policy.status != "ARCHIVED")

    # --------------------------------------------------------
    # COUNT
    # --------------------------------------------------------

    total = query.count()

    pages = _calculate_pages(
        total=total,
        limit=limit,
    )

    # --------------------------------------------------------
    # PAGINATION
    # --------------------------------------------------------

    policies = (
        query.order_by(Policy.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "policies": policies,
    }


# ============================================================
# GET PENDING APPROVAL POLICIES
#
# ADMIN ONLY
# ============================================================


def get_pending_approval_policies(
    db: Session,
    page: int = 1,
    limit: int = 10,
) -> dict:

    query = (
        db.query(Policy)
        .filter(Policy.status == "PENDING_APPROVAL")
        .order_by(Policy.updated_at.desc())
    )

    total = query.count()

    pages = _calculate_pages(
        total=total,
        limit=limit,
    )

    policies = query.offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "policies": policies,
    }


# ============================================================
# GET ARCHIVED POLICIES
#
# Optional helper if you want a dedicated admin page.
# ============================================================


def get_archived_policies(
    db: Session,
    page: int = 1,
    limit: int = 10,
) -> dict:

    query = (
        db.query(Policy)
        .filter(Policy.status == "ARCHIVED")
        .order_by(Policy.updated_at.desc())
    )

    total = query.count()

    pages = _calculate_pages(
        total=total,
        limit=limit,
    )

    policies = query.offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "policies": policies,
    }
