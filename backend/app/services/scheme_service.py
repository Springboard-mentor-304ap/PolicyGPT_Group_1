from datetime import datetime, timezone

import re

from fastapi import HTTPException, status
from sqlalchemy import and_, cast, or_, String
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.scheme import Scheme
from app.models.user import User


def _normalize_role(value: object) -> str:
    try:
        from app.api.routes.auth import normalize_role as _nr

        return _nr(str(value or ""))
    except Exception:
        return str(value or "").strip().upper()


def _validate_scheme_url(field_name: str, value: object) -> str | None:
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


def _validate_scheme_eligibility(rules: object) -> object:
    if rules is None:
        return None
    if not isinstance(rules, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="eligibility_rules must be a list.",
        )
    _KNOWN = {
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
    for rule in rules:
        if not isinstance(rule, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each eligibility rule must be an object.",
            )
        rt_raw = rule.get("rule_type")
        if rt_raw is not None:
            rt = str(rt_raw).strip().upper()
            if not rt:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Eligibility rule 'rule_type' cannot be empty.",
                )
            if rt not in _KNOWN:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Unknown eligibility rule type '{rt_raw}'. "
                        f"Allowed: {', '.join(sorted(_KNOWN))}."
                    ),
                )
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
    return rules or None


def current_time() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ============================================================
# GLOBAL FREE-TEXT SEARCH HELPERS (mirrors policy_service)
# ============================================================


def _normalize_search_text(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def _search_tokens(normalized: str) -> list[str]:
    if not normalized:
        return []
    parts = [p for p in normalized.split(" ") if p]
    if len(parts) <= 1:
        return parts
    meaningful = [p for p in parts if len(p) >= 2]
    return meaningful or [normalized]


def _escape_like(token: str) -> str:
    return (
        token.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    )


def _scheme_token_condition(token: str):
    like = f"%{_escape_like(token)}%"
    esc = "\\"
    return or_(
        Scheme.name.ilike(like, escape=esc),
        Scheme.description.ilike(like, escape=esc),
        Scheme.category.ilike(like, escape=esc),
        Scheme.ministry.ilike(like, escape=esc),
        Scheme.department.ilike(like, escape=esc),
        Scheme.state.ilike(like, escape=esc),
        Scheme.documents_required.ilike(like, escape=esc),
        Scheme.application_process.ilike(like, escape=esc),
        cast(Scheme.benefits, String).ilike(like, escape=esc),
        cast(Scheme.eligibility_rules, String).ilike(like, escape=esc),
    )


def _apply_scheme_free_text(query, keyword: str | None):
    normalized = _normalize_search_text(keyword)
    if not normalized:
        return query
    tokens = _search_tokens(normalized)
    if not tokens:
        return query
    if len(tokens) == 1:
        return query.filter(_scheme_token_condition(tokens[0]))
    return query.filter(
        and_(*[_scheme_token_condition(t) for t in tokens])
    )


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

    # Trashed rows do not block name reuse; they are invisible everywhere
    # (parity with policy_service._validate_policy_duplicate).
    query = query.filter(Scheme.is_deleted.is_(False))

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
        application_url=_validate_scheme_url(
            "application_url", data.application_url
        ),
        source_url=_validate_scheme_url("source_url", data.source_url),
        eligibility_rules=_validate_scheme_eligibility(data.eligibility_rules),
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

        try:
            creator = db.query(User).filter(User.user_id == user_id).first()
            creator_role = str(getattr(creator, "role", "")
                               or "").strip().upper()
            if creator_role in (
                "GOVERNMENT_OFFICIAL", "GOVERNMENT_OFFICER", "GOVERNMENT"
            ):
                from app.services.notification_service import (
                    notify_scheme_created,
                )
                notify_scheme_created(
                    db=db,
                    scheme_id=scheme.scheme_id,
                    scheme_title=scheme.name,
                    created_by_id=user_id,
                    ministry=scheme.ministry,
                )
        except Exception as e:
            print(f"Notification error on scheme create: {e}")

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
    include_deleted: bool = False,
) -> Scheme | None:

    query = db.query(Scheme).filter(Scheme.scheme_id == scheme_id)
    if not include_deleted:
        query = query.filter(Scheme.is_deleted.is_(False))
    return query.first()


def update_scheme(
    db: Session,
    scheme: Scheme,
    data,
    current_user: User | None = None,
) -> Scheme:

    if (
        current_user
        and _normalize_role(getattr(current_user, "role", "")) == "GOVERNMENT_OFFICIAL"
    ):
        if scheme.created_by != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only edit schemes created by yourself.",
            )

    allowed_statuses = (
        {"DRAFT", "REJECTED", "ARCHIVED", "APPROVED"}
        if (
            current_user
            and _normalize_role(getattr(current_user, "role", "")) == "ADMIN"
        )
        else {"DRAFT", "REJECTED", "ARCHIVED"}
    )
    if scheme.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only DRAFT, REJECTED, ARCHIVED, or APPROVED schemes "
                "(by Admin) can be edited."
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
        # Trashed rows do not block name reuse; they are invisible everywhere.
        Scheme.is_deleted.is_(False),
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
    ]

    for field in text_fields:
        if field in update_data:
            value = update_data[field]

            if isinstance(value, str):
                update_data[field] = value.strip() if value.strip() else None

    if "application_url" in update_data:
        update_data["application_url"] = _validate_scheme_url(
            "application_url", update_data["application_url"]
        )

    if "source_url" in update_data:
        update_data["source_url"] = _validate_scheme_url(
            "source_url", update_data["source_url"]
        )

    if "eligibility_rules" in update_data:
        update_data["eligibility_rules"] = _validate_scheme_eligibility(
            update_data["eligibility_rules"]
        )

    for field, value in update_data.items():
        setattr(scheme, field, value)

    if scheme.status == "ARCHIVED":
        scheme.status = "DRAFT"

    scheme.updated_at = current_time()

    try:
        db.commit()
        db.refresh(scheme)

        if scheme.status == "APPROVED":
            try:
                from app.services.notification_service import (
                    notify_scheme_updated,
                )
                notify_scheme_updated(
                    db=db,
                    scheme_id=scheme.scheme_id,
                    scheme_title=scheme.name,
                    ministry=scheme.ministry,
                    action="updated",
                )
            except Exception as e:
                print(f"Notification error on scheme update: {e}")

        return scheme

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to update scheme.",
        )


def _purge_scheme_row(db: Session, scheme: Scheme) -> None:
    """Physically remove a scheme row and its transient dependents.

    Shared by permanent deletion and the 30-day auto-cleanup so both
    paths honor the same foreign-key behavior: transient in-app
    notifications go with the row, while any other referencing table
    (feedback, saved_schemes, scheme_applications, scheme_documents,
    eligibility_rules) still blocks the purge with an actionable 400.
    """
    from app.models.notification import Notification

    scheme_id = scheme.scheme_id

    try:
        # Notifications for this scheme hold a related_scheme_id FK, so
        # they must go first or the delete below is always refused. They
        # are transient UI messages about a row that is about to
        # disappear, so removing them loses nothing.
        db.query(Notification).filter(
            Notification.related_scheme_id == scheme_id
        ).delete(synchronize_session=False)

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


def delete_scheme(
    db: Session,
    scheme: Scheme,
    deleted_by: int | None = None,
) -> None:

    # Temporary (soft) delete: the row stays in the database with its
    # status and all other data preserved, hidden from every active
    # view, and recoverable from Deleted Schemes. Physical removal
    # happens exclusively via permanent_delete_scheme (Deleted modal)
    # or the 30-day auto-cleanup.
    scheme.is_deleted = True
    scheme.deleted_at = current_time()
    scheme.deleted_by = deleted_by
    scheme.updated_at = current_time()

    db.commit()


def submit_scheme(
    db: Session,
    scheme: Scheme,
    current_user: User | None = None,
) -> Scheme:

    # Creator-only submission check: only the creator (or Admin) can submit
    is_admin = current_user and str(getattr(current_user, "role", "")).strip().upper() in {"ADMIN", "ADMINISTRATOR"}
    if current_user and not is_admin:
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

    try:
        from app.services.notification_service import notify_scheme_submitted
        notify_scheme_submitted(
            db=db,
            scheme_id=scheme.scheme_id,
            scheme_title=getattr(scheme, "name", getattr(
                scheme, "scheme_name", "Public Scheme")),
            submitted_by_id=(
                current_user.user_id
                if current_user is not None
                else (scheme.created_by or 0)
            ),
            ministry=scheme.ministry,
        )
    except Exception as e:
        print(f"Notification error on scheme submit: {e}")

    return scheme


def approve_scheme(
    db: Session,
    scheme: Scheme,
    admin_user_id: int,
    actor_name: str | None = None,
) -> Scheme:

    if scheme.status != "PENDING_APPROVAL":
        raise ValueError("Only PENDING_APPROVAL schemes " "can be approved.")

    # Self-approval is forbidden: the creator can never approve their own
    # record, even when the creator also holds an Admin role.
    if (
        getattr(scheme, "created_by", None) is not None
        and scheme.created_by == admin_user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You cannot approve your own scheme. "
                "A different administrator must review it."
            ),
        )

    scheme.status = "APPROVED"
    scheme.approved_by = admin_user_id
    scheme.rejection_reason = None
    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    try:
        from app.services.notification_service import notify_scheme_approved
        notify_scheme_approved(
            db=db,
            scheme_id=scheme.scheme_id,
            scheme_title=getattr(scheme, "name", getattr(
                scheme, "scheme_name", "Public Scheme")),
            creator_id=scheme.created_by,
            ministry=scheme.ministry,
            actor_id=admin_user_id,
            actor_name=actor_name,
        )
    except Exception as e:
        print(f"Notification error on scheme approve: {e}")

    return scheme


def reject_scheme(
    db: Session,
    scheme: Scheme,
    reason: str,
    actor_id: int | None = None,
    actor_name: str | None = None,
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

    try:
        from app.services.notification_service import notify_scheme_rejected
        notify_scheme_rejected(
            db=db,
            scheme_id=scheme.scheme_id,
            scheme_title=getattr(scheme, "name", getattr(
                scheme, "scheme_name", "Public Scheme")),
            creator_id=scheme.created_by or 0,
            reason=reason,
            actor_id=actor_id,
            actor_name=actor_name,
        )
    except Exception as e:
        print(f"Notification error on scheme reject: {e}")

    return scheme


def archive_scheme(
    db: Session,
    scheme: Scheme,
    actor_id: int | None = None,
    actor_name: str | None = None,
) -> Scheme:

    if scheme.status != "APPROVED":
        raise ValueError("Only APPROVED schemes can be archived.")

    req_user = scheme.archive_requested_by
    title = getattr(scheme, "name", getattr(
        scheme, "scheme_name", "Public Scheme"))

    scheme.status = "ARCHIVED"

    scheme.archive_reason = None
    scheme.archive_requested_by = None
    scheme.archive_requested_at = None

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    if req_user:
        try:
            from app.services.notification_service import (
                notify_request_decision,
            )
            notify_request_decision(
                db=db,
                user_id=req_user,
                request_type="Scheme Archive Request",
                decision="APPROVED",
                entity_type="SCHEME",
                entity_id=scheme.scheme_id,
                entity_title=title,
                decision_by=actor_name or "Administrator",
                actor_id=actor_id,
            )
        except Exception as e:
            print(f"Notification error on scheme archive approve: {e}")

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
            detail=(
                "You can only request archive for schemes created "
                "by yourself."
            ),
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

    try:
        from app.services.notification_service import (
            notify_scheme_archive_requested,
        )
        notify_scheme_archive_requested(
            db=db,
            scheme_id=scheme.scheme_id,
            scheme_title=getattr(scheme, "name", getattr(
                scheme, "scheme_name", "Public Scheme")),
            requested_by_id=user_id,
            reason=reason,
        )
    except Exception as e:
        print(f"Notification error on scheme archive request: {e}")

    return scheme


def get_archive_requests(
    db: Session,
    page: int | None = None,
    limit: int | None = None,
):

    query = (
        db.query(Scheme)
        .filter(Scheme.is_deleted.is_(False))
        .filter(Scheme.status == "ARCHIVE_REQUESTED")
        .order_by(Scheme.scheme_id.desc())
    )
    if page is not None and limit is not None:
        query = query.offset(max(0, (page - 1) * limit)).limit(limit)
    return query.all()


def approve_archive_scheme(
    db: Session,
    scheme: Scheme,
    actor_id: int | None = None,
    actor_name: str | None = None,
) -> Scheme:

    if scheme.status != "ARCHIVE_REQUESTED":
        raise ValueError(
            "Only ARCHIVE_REQUESTED schemes " "can be approved for archive."
        )

    req_user = scheme.archive_requested_by
    title = getattr(scheme, "name", getattr(
        scheme, "scheme_name", "Public Scheme"))

    scheme.status = "ARCHIVED"
    scheme.archive_reason = None
    scheme.archive_requested_by = None
    scheme.archive_requested_at = None
    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    if req_user:
        try:
            from app.services.notification_service import (
                notify_request_decision,
            )
            notify_request_decision(
                db=db,
                user_id=req_user,
                request_type="Scheme Archive Request",
                decision="APPROVED",
                entity_type="SCHEME",
                entity_id=scheme.scheme_id,
                entity_title=title,
                decision_by=actor_name or "Administrator",
                actor_id=actor_id,
            )
        except Exception as e:
            print(f"Notification error on scheme archive approve: {e}")

    return scheme


def reject_archive_scheme(
    db: Session,
    scheme: Scheme,
    actor_id: int | None = None,
    actor_name: str | None = None,
) -> Scheme:

    if scheme.status != "ARCHIVE_REQUESTED":
        raise ValueError(
            "Only ARCHIVE_REQUESTED schemes "
            "can have their archive request rejected."
        )

    req_user = scheme.archive_requested_by
    title = scheme.name

    scheme.status = "APPROVED"

    scheme.archive_reason = None
    scheme.archive_requested_by = None
    scheme.archive_requested_at = None

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    if req_user:
        try:
            from app.services.notification_service import (
                notify_request_decision,
            )
            notify_request_decision(
                db=db,
                user_id=req_user,
                request_type="Scheme Archive Request",
                decision="REJECTED",
                entity_type="SCHEME",
                entity_id=scheme.scheme_id,
                entity_title=title,
                decision_by=actor_name or "Administrator",
                actor_id=actor_id,
            )
        except Exception as e:
            print(f"Notification error on scheme archive reject: {e}")

    return scheme


def restore_scheme(
    db: Session,
    scheme: Scheme,
    actor_id: int | None = None,
    actor_name: str | None = None,
) -> Scheme:

    if scheme.is_deleted:
        # Trash restore: return to the active set with preserved status
        # and data untouched.
        scheme.is_deleted = False
        scheme.deleted_at = None
        scheme.deleted_by = None
        scheme.updated_at = current_time()

        db.commit()
        db.refresh(scheme)

        return scheme

    if scheme.status != "ARCHIVED":
        raise ValueError("Only temporarily deleted or ARCHIVED schemes can be restored.")

    scheme.status = "APPROVED"

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    if scheme.created_by:
        try:
            from app.services.notification_service import (
                notify_request_decision,
            )
            notify_request_decision(
                db=db,
                user_id=scheme.created_by,
                request_type="Scheme Restoration",
                decision="APPROVED",
                entity_type="SCHEME",
                entity_id=scheme.scheme_id,
                entity_title=scheme.name,
                reason="Scheme has been restored to active status.",
                decision_by=actor_name or "Administrator",
                actor_id=actor_id,
            )
        except Exception as e:
            print(f"Notification error on scheme restore: {e}")

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
            detail=(
                "You can only request deletion for schemes created "
                "by yourself."
            ),
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

    try:
        from app.services.notification_service import (
            notify_scheme_delete_requested,
        )
        notify_scheme_delete_requested(
            db=db,
            scheme_id=scheme.scheme_id,
            scheme_title=getattr(scheme, "name", getattr(
                scheme, "scheme_name", "Public Scheme")),
            requested_by_id=user_id,
            reason=reason,
        )
    except Exception as e:
        print(f"Notification error on scheme delete request: {e}")

    return scheme


def get_delete_requests(
    db: Session,
    page: int | None = None,
    limit: int | None = None,
):

    query = (
        db.query(Scheme)
        .filter(Scheme.is_deleted.is_(False))
        .filter(Scheme.status == "DELETE_REQUESTED")
        .order_by(Scheme.scheme_id.desc())
    )
    if page is not None and limit is not None:
        query = query.offset(max(0, (page - 1) * limit)).limit(limit)
    return query.all()


def approve_delete_scheme(
    db: Session,
    scheme: Scheme,
    actor_id: int | None = None,
    actor_name: str | None = None,
) -> None:

    if scheme.status != "DELETE_REQUESTED":
        raise ValueError(
            "Only DELETE_REQUESTED schemes "
            "can have deletion approved."
        )

    req_user = scheme.delete_requested_by
    title = getattr(scheme, "name", getattr(
        scheme, "scheme_name", "Public Scheme"))
    scheme_id = scheme.scheme_id

    # Approved deletions are temporary (soft): the row keeps its status
    # and data, leaves every active view, and remains restorable from
    # Deleted Schemes. Physical removal happens exclusively via
    # permanent_delete_scheme (Deleted modal) or the 30-day auto-cleanup.
    scheme.is_deleted = True
    scheme.deleted_at = current_time()
    scheme.deleted_by = actor_id
    scheme.updated_at = current_time()

    db.commit()

    if req_user:
        try:
            from app.services.notification_service import (
                notify_request_decision,
            )
            notify_request_decision(
                db=db,
                user_id=req_user,
                request_type="Scheme Deletion Request",
                decision="APPROVED",
                entity_type="SCHEME",
                entity_id=scheme_id,
                entity_title=title,
                decision_by=actor_name or "Administrator",
                actor_id=actor_id,
                link_entity=False,
            )
        except Exception as e:
            print(f"Notification error on scheme delete approve: {e}")


def reject_delete_scheme(
    db: Session,
    scheme: Scheme,
    actor_id: int | None = None,
    actor_name: str | None = None,
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

    req_user = scheme.delete_requested_by
    title = getattr(scheme, "name", getattr(
        scheme, "scheme_name", "Public Scheme"))

    scheme.status = previous_status

    scheme.delete_reason = None
    scheme.delete_requested_by = None
    scheme.delete_requested_at = None
    scheme.delete_requested_from_status = None

    scheme.updated_at = current_time()

    db.commit()
    db.refresh(scheme)

    if req_user:
        try:
            from app.services.notification_service import (
                notify_request_decision,
            )
            notify_request_decision(
                db=db,
                user_id=req_user,
                request_type="Scheme Deletion Request",
                decision="REJECTED",
                entity_type="SCHEME",
                entity_id=scheme.scheme_id,
                entity_title=title,
                decision_by=actor_name or "Administrator",
                actor_id=actor_id,
            )
        except Exception as e:
            print(f"Notification error on scheme delete reject: {e}")

    return scheme


# ============================================================
# PERMANENT DELETE (TRASH ONLY)
#
# Physically removes a temporarily deleted row. Only trash rows are
# eligible: live rows must be soft-deleted first. Retries are safe —
# a second call finds no row and the route 404s instead of
# duplicating history.
# ============================================================


def permanent_delete_scheme(db: Session, scheme: Scheme) -> None:

    if not scheme.is_deleted:
        raise ValueError(
            "Only temporarily deleted schemes can be permanently deleted. "
            "Delete the scheme first to move it to Deleted Schemes."
        )

    _purge_scheme_row(db, scheme)


# ============================================================
# TRASH LISTING
# ============================================================


def get_deleted_schemes(
    db: Session,
    page: int = 1,
    limit: int = 100,
    search: str | None = None,
    current_user: User | None = None,
) -> dict:
    """Temporarily deleted schemes visible to the caller.

    Admins see every trashed row; other roles see only rows they
    created. Results carry the full record plus transient display
    names, newest deletions first.
    """

    query = db.query(Scheme).filter(Scheme.is_deleted.is_(True))

    if (
        current_user is not None
        and _normalize_role(getattr(current_user, "role", "")) not in {"ADMIN", "ADMINISTRATOR"}
    ):
        query = query.filter(Scheme.created_by == current_user.user_id)

    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Scheme.name.ilike(search_term),
                Scheme.description.ilike(search_term),
                Scheme.category.ilike(search_term),
            )
        )

    total = query.count()

    page = max(1, page)
    limit = max(1, min(limit, 100))
    pages = -(-total // limit) if total else 0

    rows = (
        query.order_by(Scheme.deleted_at.desc())
        .offset((page - 1) * limit)
        .all()
    )

    _attach_creator_names(db, rows)

    return {
        "schemes": rows,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
    }


def _attach_creator_names(db: Session, rows: list[Scheme]) -> None:
    """Populate transient created_by_name/deleted_by_name for trash rows."""
    try:
        ids = {
            uid
            for row in rows
            for uid in (row.created_by, row.deleted_by, row.delete_requested_by)
            if uid is not None
        }
        names = (
            {u.user_id: u.full_name for u in db.query(User).filter(User.user_id.in_(ids)).all()}
            if ids
            else {}
        )
        for row in rows:
            row.created_by_name = names.get(row.created_by)
            row.deleted_by_name = names.get(row.deleted_by)
            row.requested_by_name = names.get(row.delete_requested_by)
    except Exception as e:
        print(f"Trash display-name enrichment failed: {e}")


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

    # Soft-deleted rows are invisible to every active view; they surface
    # only through get_deleted_schemes.
    query = query.filter(Scheme.is_deleted.is_(False))

    # --------------------------------------------------------
    # DRAFT & PENDING APPROVAL PRIVACY RULE
    # Draft schemes can ONLY be seen by the user who created them.
    # When submitted (PENDING_APPROVAL), only Admin & creator can see them.
    # --------------------------------------------------------
    if current_user is not None:
        query = query.filter(
            or_(
                    Scheme.status != "DRAFT",
                    Scheme.created_by == current_user.user_id,
                )
        )
        if str(current_user.role).strip().upper() != "ADMIN":
            query = query.filter(
                or_(Scheme.status != "PENDING_APPROVAL",
                    Scheme.created_by == current_user.user_id)
            )

    if created_by is not None:
        query = query.filter(Scheme.created_by == created_by)

    if keyword and _normalize_search_text(keyword):
        query = _apply_scheme_free_text(query, keyword)

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
            cast(Scheme.created_at, String).ilike(
                f"%{publication_date.strip()}%")
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
    page: int | None = None,
    limit: int | None = None,
):

    query = (
        db.query(Scheme)
        .filter(Scheme.is_deleted.is_(False))
        .filter(Scheme.status == "PENDING_APPROVAL")
        .order_by(Scheme.scheme_id.desc())
    )
    if page is not None and limit is not None:
        query = query.offset(max(0, (page - 1) * limit)).limit(limit)
    return query.all()
