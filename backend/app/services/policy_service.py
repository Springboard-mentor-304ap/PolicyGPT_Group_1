from datetime import datetime, timezone
from math import ceil
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import cast, func, or_, String
from sqlalchemy.orm import Session

from app.models.policy import Policy
from app.models.user import User
from app.schemas.policy import PolicyCreate, PolicyUpdate
from app.api.routes.auth import normalize_role

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

    # Known rule types emitted by the Angular forms. Unknown types are
    # rejected so malformed data cannot be persisted merely because the
    # client sent it. Existing well-formed rows (these same types) pass
    # unchanged.
    _KNOWN_RULE_TYPES = {
        "TARGET_BENEFICIARIES",
        "AGE_CRITERIA",
        "GENDER",
        "ANNUAL_INCOME_LIMIT",
        "EDUCATION",
        "OCCUPATION",
        "SOCIAL_CATEGORY",
        "DISABILITY_STATUS",
        "CUSTOM_CONDITION",
    }

    cleaned = []

    for rule in rules:
        if not isinstance(rule, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each eligibility rule must be an object.",
            )

        rule_type = rule.get("rule_type")

        if rule_type is not None:
            rt = str(rule_type).strip().upper()
            if not rt:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Eligibility rule 'rule_type' cannot be empty.",
                )
            if rt not in _KNOWN_RULE_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Unknown eligibility rule type '{rule_type}'. "
                        f"Allowed: {', '.join(sorted(_KNOWN_RULE_TYPES))}."
                    ),
                )
            # Light value validation for the structured types.
            if rt == "AGE_CRITERIA":
                min_age = rule.get("min_age")
                max_age = rule.get("max_age")
                for label, val in (("min_age", min_age), ("max_age", max_age)):
                    if val is not None and (
                        not isinstance(val, (int, float)) or val < 0 or val > 120
                    ):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"AGE_CRITERIA '{label}' must be 0-120.",
                        )
                if (
                    min_age is not None
                    and max_age is not None
                    and min_age > max_age
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="AGE_CRITERIA min_age cannot exceed max_age.",
                    )

        cleaned.append(rule)

    return cleaned or None


def _validate_url_field(field_name: str, value: str | None) -> str | None:
    """Validate optional URL reference fields (no fake URLs persisted).

    Still plain string references (no binary upload provider is configured
    in this deployment) but rejects empty-after-strip values passed as
    whitespace, over-long values, and non-http(s) schemes so a failed
    upload cannot be disguised as a valid reference.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) > 2000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} is too long (max 2000 characters).",
        )
    lowered = text.lower()
    if not (lowered.startswith("http://") or lowered.startswith("https://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a valid http(s) URL.",
        )
    return text


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

    query = db.query(Policy).filter(func.lower(Policy.title) == title.strip().lower())

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
        document_url=_validate_url_field("document_url", data.document_url),
        source_url=_validate_url_field("source_url", data.source_url),
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

    norm_role = str(getattr(current_user, "role", "") or "").strip().upper()
    if norm_role in ("GOVERNMENT_OFFICIAL", "GOVERNMENT_OFFICER", "GOVERNMENT"):
        try:
            from app.services.notification_service import notify_policy_created

            notify_policy_created(
                db=db,
                policy_id=policy.policy_id,
                policy_title=policy.title,
                created_by_id=current_user.user_id,
                department=policy.department or policy.ministry,
            )
        except Exception as e:
            print(f"Notification error on policy create: {e}")

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

    # Ownership: a government official may only mutate policies they
    # created (mirrors scheme_service.update_scheme). Admins are exempt.
    if (
        current_user
        and normalize_role(getattr(current_user, "role", "")) == ("GOVERNMENT_OFFICIAL")
        and getattr(policy, "created_by", None) is not None
        and policy.created_by != current_user.user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit policies created by yourself.",
        )

    allowed_statuses = (
        {"DRAFT", "REJECTED", "ARCHIVED", "APPROVED"}
        if (
            current_user
            and normalize_role(getattr(current_user, "role", "")) == "ADMIN"
        )
        else {"DRAFT", "REJECTED", "ARCHIVED"}
    )
    if policy.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Policy can only be edited when its status "
                "is DRAFT, REJECTED, ARCHIVED, or by an Administrator."
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
            str(update_data["ministry"]).strip() if update_data["ministry"] else None
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
            str(update_data["sector"]).strip() if update_data["sector"] else None
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
        policy.document_url = _validate_url_field(
            "document_url", update_data["document_url"]
        )

    # --------------------------------------------------------
    # SOURCE URL
    # --------------------------------------------------------

    if "source_url" in update_data:
        policy.source_url = _validate_url_field(
            "source_url", update_data["source_url"]
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

    if policy.status == "APPROVED":
        try:
            from app.services.notification_service import notify_policy_updated

            notify_policy_updated(
                db=db, policy_id=policy.policy_id, policy_title=policy.title
            )
        except Exception as e:
            print(f"Notification error on policy update: {e}")

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
# Role-based status transition (role from authenticated user):
#
# ADMIN:                DRAFT -> APPROVED (direct approval)
#                       REJECTED -> PENDING_APPROVAL (unchanged)
# GOVERNMENT_OFFICIAL:  DRAFT / REJECTED -> PENDING_APPROVAL (unchanged)
# ============================================================


def submit_policy(
    db: Session,
    policy_id: int,
    current_user: User,
    background_tasks=None,
) -> Policy:
    """Submit a policy (see status table above).

    Notification fan-out is noncritical side-effect work: when a FastAPI
    ``background_tasks`` instance is supplied (HTTP route), it runs after
    the response is sent so the request only pays for the business
    transaction + essential audit. Without it (tests, direct callers) the
    notifications stay fully synchronous, exactly as before.
    """

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    # Creator-only submission check: only the creator (or Admin) can submit
    is_admin = current_user and str(
        getattr(current_user, "role", "")
    ).strip().upper() in {"ADMIN", "ADMINISTRATOR"}
    if current_user and not is_admin:
        if policy.created_by != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You are not authorized to submit this policy. "
                    "Only the user who created it can submit it for approval."
                ),
            )

    if policy.status not in {
        "DRAFT",
        "REJECTED",
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only DRAFT or REJECTED policies can be submitted for approval."),
        )

    # Admin submitting a draft approves it directly: no PENDING_APPROVAL
    # stopover, approved_by recorded. Every other submission keeps the
    # existing approval workflow (approved_by untouched until real approval).
    direct_approve = bool(is_admin) and policy.status == "DRAFT"

    if direct_approve:
        policy.status = "APPROVED"

        policy.approved_by = current_user.user_id
    else:
        policy.status = "PENDING_APPROVAL"

    policy.rejection_reason = None

    policy.updated_at = _now()

    try:
        db.commit()
        db.refresh(policy)
    except Exception:
        db.rollback()
        raise

    # Scalars for the deferred fan-out (the request session closes before
    # background tasks run, so nothing lazy may cross that boundary).
    notify_args = {
        "policy_id": policy.policy_id,
        "policy_title": policy.title,
        "ministry": policy.ministry,
        "department": policy.department,
        "created_by": policy.created_by,
        "actor_id": current_user.user_id,
        "actor_name": getattr(current_user, "full_name", None),
        "direct_approve": direct_approve,
    }

    if background_tasks is not None:
        background_tasks.add_task(_run_submit_notifications, notify_args)
        return policy

    _run_submit_notifications(notify_args, db=db)

    return policy


def _run_submit_notifications(args: dict, db: Session | None = None) -> None:
    """Fan out submit notifications (IN_APP rows + external delivery legs).

    Runs inline when called with the request session, or after the
    response with its own short-lived session when scheduled as a
    background task. Never raises into the caller.
    """
    close_after = False
    if db is None:
        from app.db.database import SessionLocal

        db = SessionLocal()
        close_after = True
    try:
        if args["direct_approve"]:
            try:
                from app.services.notification_service import (
                    notify_policy_approved,
                )

                notify_policy_approved(
                    db=db,
                    policy_id=args["policy_id"],
                    policy_title=args["policy_title"],
                    creator_id=args["created_by"],
                    ministry=args["ministry"],
                    actor_id=args["actor_id"],
                    actor_name=args["actor_name"],
                )
            except Exception as e:
                print(f"Notification error on policy direct approve: {e}")
        else:
            try:
                from app.services.notification_service import (
                    notify_policy_submitted,
                )

                notify_policy_submitted(
                    db=db,
                    policy_id=args["policy_id"],
                    policy_title=args["policy_title"],
                    submitted_by_id=args["actor_id"],
                    department=args["department"],
                )
            except Exception as e:
                print(f"Notification error on policy submit: {e}")
    finally:
        if close_after:
            db.close()


# ============================================================
# APPROVE POLICY
#
# PENDING_APPROVAL -> APPROVED
# ============================================================


def approve_policy(
    db: Session,
    policy_id: int,
    current_user: User,
    background_tasks=None,
) -> Policy:
    """Approve a PENDING_APPROVAL policy (see section header).

    Notification fan-out is noncritical side-effect work: when a FastAPI
    ``background_tasks`` instance is supplied (HTTP route), it runs after
    the response is sent so the request only pays for the business
    transaction + essential audit. Without it (tests, direct callers) the
    notifications stay fully synchronous, exactly as before.
    """

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status != "PENDING_APPROVAL":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only policies pending approval can be approved."),
        )

    # Self-approval is forbidden: the creator can never approve their own
    # record, even when the creator also holds an Admin role. A different
    # authorized approver is required.
    if (
        current_user is not None
        and getattr(policy, "created_by", None) is not None
        and policy.created_by == current_user.user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You cannot approve your own policy. "
                "A different administrator must review it."
            ),
        )

    policy.status = "APPROVED"

    policy.approved_by = current_user.user_id

    policy.rejection_reason = None

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    # Scalars for the deferred fan-out (the request session closes before
    # background tasks run, so nothing lazy may cross that boundary).
    notify_args = {
        "policy_id": policy.policy_id,
        "policy_title": policy.title,
        "creator_id": policy.created_by,
        "ministry": policy.ministry,
        "actor_id": current_user.user_id,
        "actor_name": current_user.full_name,
    }

    if background_tasks is not None:
        background_tasks.add_task(_run_approve_notifications, notify_args)
        return policy

    _run_approve_notifications(notify_args, db=db)

    return policy


def _run_approve_notifications(args: dict, db: Session | None = None) -> None:
    """Fan out approval notifications (IN_APP rows + external legs).

    Runs inline when called with the request session, or after the
    response with its own short-lived session when scheduled as a
    background task. Never raises into the caller.
    """
    close_after = False
    if db is None:
        from app.db.database import SessionLocal

        db = SessionLocal()
        close_after = True
    try:
        try:
            from app.services.notification_service import notify_policy_approved

            notify_policy_approved(
                db=db,
                policy_id=args["policy_id"],
                policy_title=args["policy_title"],
                creator_id=args["creator_id"],
                ministry=args["ministry"],
                actor_id=args["actor_id"],
                actor_name=args["actor_name"],
            )
        except Exception as e:
            print(f"Notification error on policy approve: {e}")
    finally:
        if close_after:
            db.close()


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
            detail=("Only policies pending approval can be rejected."),
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

    try:
        from app.services.notification_service import notify_policy_rejected

        notify_policy_rejected(
            db=db,
            policy_id=policy.policy_id,
            policy_title=policy.title,
            creator_id=policy.created_by,
            reason=policy.rejection_reason,
            actor_id=current_user.user_id,
            actor_name=current_user.full_name,
        )
    except Exception as e:
        print(f"Notification error on policy reject: {e}")

    return policy


# ============================================================
# DIRECT ARCHIVE
#
# ADMIN ONLY
#
# APPROVED -> ARCHIVED (no request needed)
#
# Mirrors scheme_service.archive_scheme so both modules share the same
# direct-archive workflow. Distinct from the request flow below.
# ============================================================


def archive_policy(
    db: Session,
    policy_id: int,
    current_user: User,
) -> Policy:

    policy = _policy_or_404(
        db=db,
        policy_id=policy_id,
    )

    if policy.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only APPROVED policies can be archived directly."),
        )

    policy.status = "ARCHIVED"

    # Direct archival supersedes any pending request metadata.
    policy.archive_reason = None
    policy.archive_requested_by = None
    policy.archive_requested_at = None

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

    # Creator-only: any caller (Government Official or Admin via superuser
    # bypass) may only request archive for records they created. Admins
    # archive other records via the direct archive endpoint instead.
    if (
        getattr(policy, "created_by", None) is not None
        and policy.created_by != current_user.user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=("You can only request archive for policies created by yourself."),
        )

    if policy.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=("Only APPROVED policies can have an archive request."),
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

    try:
        from app.services.notification_service import (
            notify_policy_archive_requested,
        )

        notify_policy_archive_requested(
            db=db,
            policy_id=policy.policy_id,
            policy_title=policy.title,
            requested_by_id=current_user.user_id,
            reason=policy.archive_reason,
        )
    except Exception as e:
        print(f"Notification error on policy archive request: {e}")

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
            detail=("Only policies with an ARCHIVE_REQUESTED status can be archived."),
        )

    req_user = policy.archive_requested_by
    title = policy.title

    policy.status = "ARCHIVED"

    # Decision clears the pending-request metadata (parity with schemes)
    # while the decision itself is preserved in the audit trail.
    policy.archive_reason = None
    policy.archive_requested_by = None
    policy.archive_requested_at = None

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    if req_user:
        try:
            from app.services.notification_service import (
                notify_request_decision,
            )

            notify_request_decision(
                db=db,
                user_id=req_user,
                request_type="Policy Archive Request",
                decision="APPROVED",
                entity_type="POLICY",
                entity_id=policy.policy_id,
                entity_title=title,
                decision_by=current_user.full_name or "Administrator",
                actor_id=current_user.user_id,
            )
        except Exception as e:
            print(f"Notification error on policy archive approve: {e}")

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

    req_user = policy.archive_requested_by
    title = policy.title

    policy.status = "APPROVED"

    # Rejection clears the pending-request metadata (parity with schemes).
    policy.archive_reason = None
    policy.archive_requested_by = None
    policy.archive_requested_at = None

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    if req_user:
        try:
            from app.services.notification_service import (
                notify_request_decision,
            )

            notify_request_decision(
                db=db,
                user_id=req_user,
                request_type="Policy Archive Request",
                decision="REJECTED",
                entity_type="POLICY",
                entity_id=policy.policy_id,
                entity_title=title,
                decision_by=current_user.full_name or "Administrator",
                actor_id=current_user.user_id,
            )
        except Exception as e:
            print(f"Notification error on policy archive reject: {e}")

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

    if policy.created_by:
        try:
            from app.services.notification_service import (
                notify_request_decision,
            )

            notify_request_decision(
                db=db,
                user_id=policy.created_by,
                request_type="Policy Restoration",
                decision="APPROVED",
                entity_type="POLICY",
                entity_id=policy.policy_id,
                entity_title=policy.title,
                reason="Policy has been restored to active status.",
                decision_by=current_user.full_name or "Administrator",
                actor_id=current_user.user_id,
            )
        except Exception as e:
            print(f"Notification error on policy restore: {e}")

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

    # Creator-only (parity with schemes): Admins delete other records via
    # the direct delete endpoint instead of the request flow.
    if (
        getattr(policy, "created_by", None) is not None
        and policy.created_by != current_user.user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=("You can only request deletion for policies created by yourself."),
        )

    if policy.status not in {
        "APPROVED",
        "ARCHIVED",
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Deletion can only be requested for APPROVED or ARCHIVED policies."
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

    try:
        from app.services.notification_service import (
            notify_policy_delete_requested,
        )

        notify_policy_delete_requested(
            db=db,
            policy_id=policy.policy_id,
            policy_title=policy.title,
            requested_by_id=current_user.user_id,
            reason=policy.delete_reason,
        )
    except Exception as e:
        print(f"Notification error on policy delete request: {e}")

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

    req_user = policy.delete_requested_by
    title = policy.title

    try:
        # Notifications for this policy hold a related_policy_id FK, so
        # they must go first or the delete below is always refused. They are
        # transient UI messages about a row that is about to disappear, so
        # removing them loses nothing. Any *other* referencing table (feedback,
        # saved_policies, eligibility_rules, policy_documents) still blocks the
        # delete and still surfaces the 400 below, which is the intended
        # behaviour.
        from app.models.notification import Notification

        db.query(Notification).filter(
            Notification.related_policy_id == policy_id
        ).delete(synchronize_session=False)

        db.delete(policy)

        db.commit()

        if req_user:
            try:
                from app.services.notification_service import (
                    notify_request_decision,
                )

                notify_request_decision(
                    db=db,
                    user_id=req_user,
                    request_type="Policy Deletion Request",
                    decision="APPROVED",
                    entity_type="POLICY",
                    entity_id=policy_id,
                    entity_title=title,
                    decision_by=current_user.full_name or "Administrator",
                    actor_id=current_user.user_id,
                    link_entity=False,
                )
            except Exception as e:
                print(f"Notification error on policy delete approve: {e}")

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
                "Previous policy status for the delete request could not be determined."
            ),
        )

    req_user = policy.delete_requested_by
    title = policy.title

    policy.status = previous_status

    # Clear active delete-request data.
    policy.delete_reason = None
    policy.delete_requested_by = None
    policy.delete_requested_at = None
    policy.delete_requested_from_status = None

    policy.updated_at = _now()

    db.commit()
    db.refresh(policy)

    if req_user:
        try:
            from app.services.notification_service import (
                notify_request_decision,
            )

            notify_request_decision(
                db=db,
                user_id=req_user,
                request_type="Policy Deletion Request",
                decision="REJECTED",
                entity_type="POLICY",
                entity_id=policy.policy_id,
                entity_title=title,
                decision_by=current_user.full_name or "Administrator",
                actor_id=current_user.user_id,
            )
        except Exception as e:
            print(f"Notification error on policy delete reject: {e}")

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
    publication_date: str | None = None,
    policy_status: str | None = None,
    page: int = 1,
    limit: int = 10,
    created_by: int | None = None,
    current_user: User | None = None,
) -> dict:

    query = db.query(Policy)

    # --------------------------------------------------------
    # DRAFT & PENDING APPROVAL PRIVACY RULE
    # Draft policies can ONLY be seen by the user who created them.
    # When submitted (PENDING_APPROVAL), only Admin & creator can see them.
    # --------------------------------------------------------
    if current_user is not None:
        query = query.filter(
            or_(
                Policy.status != "DRAFT",
                Policy.created_by == current_user.user_id,
            )
        )
        if str(current_user.role).strip().upper() != "ADMIN":
            query = query.filter(
                or_(
                    Policy.status != "PENDING_APPROVAL",
                    Policy.created_by == current_user.user_id,
                )
            )

    # --------------------------------------------------------
    # CREATED BY (ROLE-BASED OWNERSHIP FILTER)
    # --------------------------------------------------------

    if created_by is not None:
        query = query.filter(Policy.created_by == created_by)

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
        query = query.filter(
            or_(
                Policy.sector.ilike(sector.strip()),
                Policy.category.ilike(sector.strip()),
            )
        )

    if publication_date:
        query = query.filter(
            cast(Policy.publication_date, String).ilike(f"%{publication_date.strip()}%")
        )

    # --------------------------------------------------------
    # STATUS
    # --------------------------------------------------------

    if policy_status and policy_status.strip().upper() != "ALL":
        query = query.filter(Policy.status == policy_status.strip().upper())

    # NOTE: When no status filter is given, staff (ADMIN / GOVERNMENT_OFFICIAL)
    # see ALL statuses including ARCHIVED, so the Manage Policies stats and
    # archive restore work. Public roles never reach this branch because the
    # route forces status=APPROVED for them.

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


def compare_policies(
    db: Session,
    policy_id_1: int,
    policy_id_2: int,
):
    policy_1 = db.query(Policy).filter(Policy.policy_id == policy_id_1).first()

    policy_2 = db.query(Policy).filter(Policy.policy_id == policy_id_2).first()

    if not policy_1:
        raise HTTPException(
            status_code=404,
            detail=f"Policy {policy_id_1} not found.",
        )

    if not policy_2:
        raise HTTPException(
            status_code=404,
            detail=f"Policy {policy_id_2} not found.",
        )

    if policy_1.status != "APPROVED":
        raise HTTPException(
            status_code=404,
            detail=f"Policy {policy_id_1} is not available for comparison.",
        )

    if policy_2.status != "APPROVED":
        raise HTTPException(
            status_code=404,
            detail=f"Policy {policy_id_2} is not available for comparison.",
        )

    return {
        "policy_1": policy_1,
        "policy_2": policy_2,
    }
