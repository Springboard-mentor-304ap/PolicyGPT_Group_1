"""Centralized, transaction-safe user removal service for PolicyGPT.

Handles all related database records safely according to data-retention rules:
- Preserves accountability, analytical, and audit history (reports, feedback,
  support queries, ticket messages, scheme applications, audit logs,
  notifications, chatbot conversation logs, reviewer/approver references) by
  anonymizing / disassociating the removed user's identity (setting user/author
  foreign keys to NULL).
- Safely deletes personal temporary / disposable user records (search history,
  saved policies, saved schemes, saved eligibility results, notification
  preferences, OTP verifications, password reset tokens, profiles).
- Enforces security rules: only authorized Admins can invoke removal; Admins
  cannot remove their own active account.
- Identifies truly blocking business relationships (e.g. active policy or scheme
  authorship) with clear, actionable error messages and supported reassignment.
- Supports authorized ownership reassignment of authored policies and schemes
  to an active Government Official prior to or during user removal.
- Executes within an atomic database transaction, recording the removal in the
  audit system and rolling back completely on any failure.
"""

from datetime import datetime, timezone
import logging
from typing import Any
from fastapi import HTTPException, Request, status
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app.models.feedback import Feedback
from app.models.policy import Policy
from app.models.report import Report
from app.models.scheme import Scheme
from app.models.support_query import SupportQuery
from app.models.user import User

logger = logging.getLogger(__name__)


def check_user_removal_dependencies(
    user: User,
    admin_user: User,
    db: Session,
) -> dict[str, Any]:
    """Inspect all dependent records for a user and determine removal blockers
    and eligible Government Officials for ownership reassignment.
    """
    from app.api.routes.auth import normalize_role

    admin_role = normalize_role(getattr(admin_user, "role", None))
    if admin_role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can perform user removal checks.",
        )

    # Prevent accidental self-removal (by ID or case-insensitive email)
    is_same_id = user.user_id == admin_user.user_id
    is_same_email = (
        bool(user.email)
        and bool(admin_user.email)
        and user.email.strip().lower() == admin_user.email.strip().lower()
    )
    if is_same_id or is_same_email:
        return {
            "can_remove": False,
            "self_removal": True,
            "message": "You cannot remove your own administrator account.",
            "target_user": {
                "user_id": user.user_id,
                "full_name": user.full_name or "Unknown User",
                "email": user.email or "",
                "role": user.role or "",
            },
            "blockers": [],
            "reassignable_count": 0,
            "unreassignable_count": 0,
            "eligible_officials": [],
        }

    blockers: list[dict[str, Any]] = []

    # 1. Policies inspection
    policies = (
        db.query(Policy)
        .filter(
            or_(
                Policy.created_by == user.user_id,
                Policy.approved_by == user.user_id,
                Policy.archive_requested_by == user.user_id,
                Policy.delete_requested_by == user.user_id,
            )
        )
        .all()
    )
    for p in policies:
        pid = getattr(p, "policy_id", None)
        title = getattr(p, "title", None) or "Untitled Policy"
        pstatus = getattr(p, "status", None) or "Active"
        if getattr(p, "created_by", None) == user.user_id:
            blockers.append({
                "entity_type": "POLICY",
                "entity_id": pid,
                "title": title,
                "status": pstatus,
                "relationship": "Author",
                "can_reassign": True,
                "action_needed": "Reassign ownership to an active Government Official",
            })
        if getattr(p, "approved_by", None) == user.user_id:
            blockers.append({
                "entity_type": "POLICY",
                "entity_id": pid,
                "title": title,
                "status": pstatus,
                "relationship": "Approver",
                "can_reassign": False,
                "action_needed": "Historical approver audit record cannot be reassigned; preserved for regulatory compliance",
            })
        if getattr(p, "archive_requested_by", None) == user.user_id:
            blockers.append({
                "entity_type": "POLICY",
                "entity_id": pid,
                "title": title,
                "status": pstatus,
                "relationship": "Archive Requester",
                "can_reassign": True,
                "action_needed": "Reassign archive request to an active Government Official",
            })
        if getattr(p, "delete_requested_by", None) == user.user_id:
            blockers.append({
                "entity_type": "POLICY",
                "entity_id": pid,
                "title": title,
                "status": pstatus,
                "relationship": "Delete Requester",
                "can_reassign": True,
                "action_needed": "Reassign delete request to an active Government Official",
            })

    # 2. Schemes inspection
    schemes = (
        db.query(Scheme)
        .filter(
            or_(
                Scheme.created_by == user.user_id,
                Scheme.approved_by == user.user_id,
                Scheme.archive_requested_by == user.user_id,
                Scheme.delete_requested_by == user.user_id,
            )
        )
        .all()
    )
    for s in schemes:
        sid = getattr(s, "scheme_id", None)
        stitle = getattr(s, "name", None) or getattr(s, "title", None) or "Untitled Scheme"
        sstatus = getattr(s, "status", None) or "Active"
        if getattr(s, "created_by", None) == user.user_id:
            blockers.append({
                "entity_type": "SCHEME",
                "entity_id": sid,
                "title": stitle,
                "status": sstatus,
                "relationship": "Author",
                "can_reassign": True,
                "action_needed": "Reassign ownership to an active Government Official",
            })
        if getattr(s, "approved_by", None) == user.user_id:
            blockers.append({
                "entity_type": "SCHEME",
                "entity_id": sid,
                "title": stitle,
                "status": sstatus,
                "relationship": "Approver",
                "can_reassign": False,
                "action_needed": "Historical approver audit record cannot be reassigned; preserved for regulatory compliance",
            })
        if getattr(s, "archive_requested_by", None) == user.user_id:
            blockers.append({
                "entity_type": "SCHEME",
                "entity_id": sid,
                "title": stitle,
                "status": sstatus,
                "relationship": "Archive Requester",
                "can_reassign": True,
                "action_needed": "Reassign archive request to an active Government Official",
            })
        if getattr(s, "delete_requested_by", None) == user.user_id:
            blockers.append({
                "entity_type": "SCHEME",
                "entity_id": sid,
                "title": stitle,
                "status": sstatus,
                "relationship": "Delete Requester",
                "can_reassign": True,
                "action_needed": "Reassign delete request to an active Government Official",
            })

    # 3. Eligible Government Officials for ownership reassignment (targeted SQL query)
    candidates = (
        db.query(User.user_id, User.full_name, User.email, User.role)
        .filter(
            User.is_active.is_(True),
            User.user_id != user.user_id,
            func.upper(User.role).in_(["GOVERNMENT_OFFICIAL", "GOVERNMENT", "ADMIN", "ADMINISTRATOR"]),
        )
        .order_by(User.full_name.asc())
        .all()
    )
    eligible_officials: list[dict[str, Any]] = [
        {
            "user_id": getattr(cand, "user_id", None),
            "full_name": getattr(cand, "full_name", None) or "Government Official",
            "email": getattr(cand, "email", None) or "",
            "role": getattr(cand, "role", None) or "",
        }
        for cand in candidates
    ]

    reassignable_count = sum(1 for b in blockers if b["can_reassign"])
    unreassignable_count = sum(1 for b in blockers if not b["can_reassign"])
    can_remove = len(blockers) == 0

    return {
        "can_remove": can_remove,
        "self_removal": False,
        "message": None if can_remove else f"Account has {len(blockers)} blocking record assignment(s).",
        "target_user": {
            "user_id": user.user_id,
            "full_name": user.full_name or "Unknown User",
            "email": user.email or "",
            "role": user.role or "",
        },
        "blockers": blockers,
        "reassignable_count": reassignable_count,
        "unreassignable_count": unreassignable_count,
        "eligible_officials": eligible_officials,
    }


def reassign_user_ownership(
    source_user: User,
    target_user: User,
    admin_user: User,
    request: Request | None,
    db: Session,
) -> dict[str, Any]:
    """Reassign ownership of all authored policies and schemes from source_user
    to target_user, updating timestamps and recording audit logs.
    """
    from app.api.routes.auth import log_request_action, normalize_role

    admin_role = normalize_role(getattr(admin_user, "role", None))
    if admin_role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can reassign policy/scheme ownership.",
        )

    if source_user.user_id == target_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reassign ownership to the same user.",
        )

    if not target_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reassign ownership to an inactive user.",
        )

    target_role = normalize_role(getattr(target_user, "role", None))
    if target_role not in ("GOVERNMENT_OFFICIAL", "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target user must be an active Government Official or Administrator.",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    reassigned_policies = 0
    reassigned_schemes = 0

    try:
        # Reassign authored policies
        authored_policies = (
            db.query(Policy)
            .filter(Policy.created_by == source_user.user_id)
            .all()
        )
        for p in authored_policies:
            old_author_id = p.created_by
            p.created_by = target_user.user_id
            p.updated_at = now
            reassigned_policies += 1
            log_request_action(
                request,
                db,
                admin_user,
                "POLICY_OWNERSHIP_REASSIGNED",
                "POLICY",
                p.policy_id,
                f"Ownership of policy #{p.policy_id} ('{p.title}') reassigned from user {old_author_id} to user {target_user.user_id} by Admin {admin_user.user_id}.",
                commit=False,
            )

        # Reassign policy archive/delete requests
        policy_requests = (
            db.query(Policy)
            .filter(
                or_(
                    Policy.archive_requested_by == source_user.user_id,
                    Policy.delete_requested_by == source_user.user_id,
                )
            )
            .all()
        )
        for p in policy_requests:
            if p.archive_requested_by == source_user.user_id:
                p.archive_requested_by = target_user.user_id
            if p.delete_requested_by == source_user.user_id:
                p.delete_requested_by = target_user.user_id
            p.updated_at = now

        # Reassign authored schemes
        authored_schemes = (
            db.query(Scheme)
            .filter(Scheme.created_by == source_user.user_id)
            .all()
        )
        for s in authored_schemes:
            old_author_id = s.created_by
            s.created_by = target_user.user_id
            s.updated_at = now
            reassigned_schemes += 1
            stitle = getattr(s, "name", None) or getattr(s, "title", "Untitled Scheme")
            log_request_action(
                request,
                db,
                admin_user,
                "SCHEME_OWNERSHIP_REASSIGNED",
                "SCHEME",
                s.scheme_id,
                f"Ownership of scheme #{s.scheme_id} ('{stitle}') reassigned from user {old_author_id} to user {target_user.user_id} by Admin {admin_user.user_id}.",
                commit=False,
            )

        # Reassign scheme archive/delete requests
        scheme_requests = (
            db.query(Scheme)
            .filter(
                or_(
                    Scheme.archive_requested_by == source_user.user_id,
                    Scheme.delete_requested_by == source_user.user_id,
                )
            )
            .all()
        )
        for s in scheme_requests:
            if s.archive_requested_by == source_user.user_id:
                s.archive_requested_by = target_user.user_id
            if s.delete_requested_by == source_user.user_id:
                s.delete_requested_by = target_user.user_id
            s.updated_at = now

        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to reassign ownership: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reassign ownership due to a database error.",
        ) from exc

    return {
        "message": f"Successfully reassigned {reassigned_policies} policy record(s) and {reassigned_schemes} scheme record(s) to {target_user.full_name}.",
        "reassigned_policies": reassigned_policies,
        "reassigned_schemes": reassigned_schemes,
        "target_user": {
            "user_id": target_user.user_id,
            "full_name": target_user.full_name,
            "email": target_user.email,
        },
    }


def remove_user_safely(
    user: User,
    admin_user: User,
    request: Request | None,
    db: Session,
    reassign_to_user_id: int | None = None,
) -> dict[str, Any]:
    """Safely and comprehensively remove a user account.

    Parameters:
    - user: Target user model to remove
    - admin_user: Authenticated administrator performing the removal
    - request: FastAPI / Starlette request for client IP resolution
    - db: Active SQLAlchemy database session
    - reassign_to_user_id: Optional ID of eligible official to atomically receive
      ownership of policies/schemes during removal

    Returns:
    - dict with success message and removed user identifying info
    """
    from app.api.routes.auth import log_request_action, normalize_role

    # -----------------------------------------------------
    # 1. SECURITY & SELF-REMOVAL VALIDATION
    # -----------------------------------------------------
    admin_role = normalize_role(getattr(admin_user, "role", None))
    if admin_role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an administrator can perform user removal.",
        )

    # Prevent accidental self-removal (by ID or case-insensitive email)
    is_same_id = user.user_id == admin_user.user_id
    is_same_email = (
        bool(user.email)
        and bool(admin_user.email)
        and user.email.strip().lower() == admin_user.email.strip().lower()
    )
    if is_same_id or is_same_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own administrator account.",
        )

    target_official: User | None = None
    if reassign_to_user_id is not None:
        target_official = db.query(User).filter(User.user_id == reassign_to_user_id).first()
        if not target_official:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target official for ownership reassignment was not found.",
            )
        if target_official.user_id == user.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reassign ownership to the same user being removed.",
            )
        if not target_official.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target official for ownership reassignment is inactive.",
            )
        target_role = normalize_role(getattr(target_official, "role", None))
        if target_role not in ("GOVERNMENT_OFFICIAL", "ADMIN"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target user must be an active Government Official or Administrator.",
            )

    # -----------------------------------------------------
    # 2. INSPECT POLICY AND SCHEME ASSOCIATIONS (IF NOT REASSIGNING)
    # -----------------------------------------------------
    if target_official is None:
        has_policy = (
            db.query(Policy)
            .filter(
                or_(
                    Policy.created_by == user.user_id,
                    Policy.approved_by == user.user_id,
                    Policy.archive_requested_by == user.user_id,
                    Policy.delete_requested_by == user.user_id,
                )
            )
            .first()
        )
        if has_policy:
            user_policies = (
                db.query(Policy)
                .filter(
                    or_(
                        Policy.created_by == user.user_id,
                        Policy.approved_by == user.user_id,
                        Policy.archive_requested_by == user.user_id,
                        Policy.delete_requested_by == user.user_id,
                    )
                )
                .all()
            )
            if not isinstance(user_policies, list) or not user_policies:
                user_policies = [has_policy]

            details = []
            for p in user_policies[:5]:
                pid = getattr(p, "policy_id", None) or (p[0] if isinstance(p, (tuple, list)) else "N/A")
                title = getattr(p, "title", None) or "Untitled Policy"
                pstatus = getattr(p, "status", None) or "Active"
                roles = []
                if getattr(p, "created_by", None) == user.user_id:
                    roles.append("Author")
                if getattr(p, "approved_by", None) == user.user_id:
                    roles.append("Approver")
                if getattr(p, "archive_requested_by", None) == user.user_id:
                    roles.append("Archive Requester")
                if getattr(p, "delete_requested_by", None) == user.user_id:
                    roles.append("Delete Requester")
                role_desc = "/".join(roles) if roles else "Author"
                details.append(f"Policy #{pid} '{title}' (Status: {pstatus}, Role: {role_desc})")
            if len(user_policies) > 5:
                details.append(f"and {len(user_policies) - 5} more")

            record_list = "; ".join(details)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Cannot delete user with active policy assignments. "
                    f"Account is associated with {len(user_policies)} policy record(s): {record_list}. "
                    "Please reassign or archive these policies before removing this user."
                ),
            )

        has_scheme = (
            db.query(Scheme)
            .filter(
                or_(
                    Scheme.created_by == user.user_id,
                    Scheme.approved_by == user.user_id,
                    Scheme.archive_requested_by == user.user_id,
                    Scheme.delete_requested_by == user.user_id,
                )
            )
            .first()
        )
        if has_scheme:
            user_schemes = (
                db.query(Scheme)
                .filter(
                    or_(
                        Scheme.created_by == user.user_id,
                        Scheme.approved_by == user.user_id,
                        Scheme.archive_requested_by == user.user_id,
                        Scheme.delete_requested_by == user.user_id,
                    )
                )
                .all()
            )
            if not isinstance(user_schemes, list) or not user_schemes:
                user_schemes = [has_scheme]

            details = []
            for s in user_schemes[:5]:
                sid = getattr(s, "scheme_id", None) or (s[0] if isinstance(s, (tuple, list)) else "N/A")
                title = getattr(s, "name", None) or getattr(s, "title", None) or "Untitled Scheme"
                sstatus = getattr(s, "status", None) or "Active"
                roles = []
                if getattr(s, "created_by", None) == user.user_id:
                    roles.append("Author")
                if getattr(s, "approved_by", None) == user.user_id:
                    roles.append("Approver")
                if getattr(s, "archive_requested_by", None) == user.user_id:
                    roles.append("Archive Requester")
                if getattr(s, "delete_requested_by", None) == user.user_id:
                    roles.append("Delete Requester")
                role_desc = "/".join(roles) if roles else "Author"
                details.append(f"Scheme #{sid} '{title}' (Status: {sstatus}, Role: {role_desc})")
            if len(user_schemes) > 5:
                details.append(f"and {len(user_schemes) - 5} more")

            record_list = "; ".join(details)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Cannot delete user with active scheme assignments. "
                    f"Account is associated with {len(user_schemes)} scheme record(s): {record_list}. "
                    "Please reassign or archive these schemes before removing this user."
                ),
            )

    removed_id = user.user_id
    removed_email = user.email
    removed_phone = user.phone
    removed_role = user.role

    # -----------------------------------------------------
    # 3. ATOMIC TRANSACTION: REASSIGN (IF PROVIDED), DISASSOCIATE & CLEAN UP
    # -----------------------------------------------------
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        if target_official is not None:
            # Reassign policies authored by user
            for p in db.query(Policy).filter(Policy.created_by == removed_id).all():
                p.created_by = target_official.user_id
                p.updated_at = now
                log_request_action(
                    request,
                    db,
                    admin_user,
                    "POLICY_OWNERSHIP_REASSIGNED",
                    "POLICY",
                    p.policy_id,
                    f"Ownership of policy #{p.policy_id} ('{p.title}') reassigned from user {removed_id} to user {target_official.user_id} by Admin {admin_user.user_id}.",
                    commit=False,
                )
            # Reassign policy requests
            for p in db.query(Policy).filter(
                or_(
                    Policy.archive_requested_by == removed_id,
                    Policy.delete_requested_by == removed_id,
                )
            ).all():
                if p.archive_requested_by == removed_id:
                    p.archive_requested_by = target_official.user_id
                if p.delete_requested_by == removed_id:
                    p.delete_requested_by = target_official.user_id
                p.updated_at = now

            # Reassign schemes authored by user
            for s in db.query(Scheme).filter(Scheme.created_by == removed_id).all():
                s.created_by = target_official.user_id
                s.updated_at = now
                stitle = getattr(s, "name", None) or getattr(s, "title", "Untitled Scheme")
                log_request_action(
                    request,
                    db,
                    admin_user,
                    "SCHEME_OWNERSHIP_REASSIGNED",
                    "SCHEME",
                    s.scheme_id,
                    f"Ownership of scheme #{s.scheme_id} ('{stitle}') reassigned from user {removed_id} to user {target_official.user_id} by Admin {admin_user.user_id}.",
                    commit=False,
                )
            # Reassign scheme requests
            for s in db.query(Scheme).filter(
                or_(
                    Scheme.archive_requested_by == removed_id,
                    Scheme.delete_requested_by == removed_id,
                )
            ).all():
                if s.archive_requested_by == removed_id:
                    s.archive_requested_by = target_official.user_id
                if s.delete_requested_by == removed_id:
                    s.delete_requested_by = target_official.user_id
                s.updated_at = now

            # Ensure user is not an approver of any policy or scheme (regulatory compliance)
            has_approver = (
                db.query(Policy).filter(Policy.approved_by == removed_id).first()
                or db.query(Scheme).filter(Scheme.approved_by == removed_id).first()
            )
            if has_approver:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot delete user with historical approval records. Approver history is required for regulatory audit compliance.",
                )

        # A & B. Accountability disassociation & disposable records cleanup in one batch script
        batch_cleanup_sql = """
        UPDATE audit_logs SET user_id = NULL WHERE user_id = :uid;
        UPDATE notifications SET user_id = NULL WHERE user_id = :uid;
        UPDATE reports SET generated_by = NULL WHERE generated_by = :uid;
        UPDATE feedback SET user_id = NULL WHERE user_id = :uid;
        UPDATE support_queries SET user_id = NULL WHERE user_id = :uid;
        UPDATE support_queries SET assigned_to = NULL WHERE assigned_to = :uid;
        UPDATE support_ticket_messages SET sender_id = NULL WHERE sender_id = :uid;
        UPDATE scheme_applications SET user_id = NULL WHERE user_id = :uid;
        UPDATE chatbot_conversations SET user_id = NULL WHERE user_id = :uid;
        UPDATE chatbot_usage SET user_id = NULL WHERE user_id = :uid;
        UPDATE policy_documents SET uploaded_by = NULL WHERE uploaded_by = :uid;
        UPDATE scheme_documents SET uploaded_by = NULL WHERE uploaded_by = :uid;
        DELETE FROM search_history WHERE user_id = :uid;
        DELETE FROM saved_policies WHERE user_id = :uid;
        DELETE FROM saved_schemes WHERE user_id = :uid;
        DELETE FROM saved_eligibility_results WHERE user_id = :uid;
        DELETE FROM notification_preference_rules WHERE user_id = :uid;
        DELETE FROM notification_preferences WHERE user_id = :uid;
        DELETE FROM otp_verifications WHERE user_id = :uid;
        DELETE FROM password_reset_tokens WHERE user_id = :uid;
        DELETE FROM user_profiles WHERE user_id = :uid;
        """
        db.execute(text(batch_cleanup_sql), {"uid": removed_id})

        # C. Delete target user row and commit atomically
        db.delete(user)
        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Admin delete user failed for user_id=%s: %s", removed_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete user due to a database error. Transaction rolled back.",
        ) from exc

    # -----------------------------------------------------
    # 4. AUDIT LOGGING (AFTER SUCCESSFUL COMMIT)
    # -----------------------------------------------------
    # Audit log records the deletion event with entity_id = removed_id for
    # permanent count tracking in the Past Users statistic.
    log_request_action(
        request,
        db,
        admin_user,
        "AUTH_ADMIN_USER_DELETED",
        "USER",
        removed_id,
        f"Admin deleted user {removed_email or removed_phone} ({removed_role}, user_id {removed_id}).",
    )

    response_payload: dict[str, Any] = {"message": "User deleted successfully"}
    if removed_email:
        response_payload["email"] = removed_email
    if removed_phone:
        response_payload["phone"] = removed_phone
    return response_payload
