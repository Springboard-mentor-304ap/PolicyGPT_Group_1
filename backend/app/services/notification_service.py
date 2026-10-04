from datetime import datetime, timedelta, timezone
import logging
from typing import Any
from sqlalchemy import case, or_, and_, func
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.feedback import Feedback
from app.models.notification import Notification
from app.models.notification_delivery import NotificationDelivery
from app.schemas.notification import NotificationCreate
from app.services.notification_delivery_service import (
    NotificationDeliveryService,
)
from app.services import notification_taxonomy as tax
from app.services import audit_log_service as audit

logger = logging.getLogger("uvicorn.error")

# Role visibility sets and the type->category map live in
# app.services.notification_taxonomy so the notification centre, the
# preferences matrix and the delivery pipeline can never disagree.
ADMIN_NOTIFICATION_TYPES = tax.ADMIN_NOTIFICATION_TYPES
GOVT_NOTIFICATION_TYPES = tax.GOVT_NOTIFICATION_TYPES
PUBLIC_NOTIFICATION_TYPES = tax.PUBLIC_NOTIFICATION_TYPES


def normalize_role(role: str | None) -> str:
    if not role:
        return "CITIZEN"
    clean = str(role).strip().upper()
    if clean in ("ADMIN", "ADMINISTRATOR"):
        return "ADMIN"
    if clean in ("GOVERNMENT_OFFICIAL", "GOVERNMENT_OFFICER", "GOVERNMENT"):
        return "GOVERNMENT_OFFICIAL"
    if clean in ("CITIZEN", "USER"):
        return "CITIZEN"
    if clean == "RESEARCHER":
        return "RESEARCHER"
    if clean in ("ORGANIZATION", "ORGANISATION"):
        return "ORGANIZATION"
    if clean in ("GUEST", "GUEST_USER"):
        return "GUEST_USER"
    return clean


def get_base_notification_filter(user_id: int, user_role: str):
    """
    Constructs the base query filter for notifications.
    Any notification specifically addressed to a user_id is accessible
    by that user.
    Broadcast notifications (user_id is None) are filtered according to
    the user's role.
    """
    norm_role = normalize_role(user_role)
    if norm_role == "ADMIN":
        return or_(
            Notification.user_id == user_id,
            and_(
                Notification.user_id.is_(None),
                Notification.notification_type.in_(ADMIN_NOTIFICATION_TYPES),
            ),
        )
    elif norm_role == "GOVERNMENT_OFFICIAL":
        return or_(
            Notification.user_id == user_id,
            and_(
                Notification.user_id.is_(None),
                Notification.notification_type.in_(GOVT_NOTIFICATION_TYPES),
            ),
        )
    else:
        # CITIZEN, RESEARCHER, ORGANIZATION
        return or_(
            Notification.user_id == user_id,
            and_(
                Notification.user_id.is_(None),
                Notification.notification_type.in_(PUBLIC_NOTIFICATION_TYPES),
            ),
        )


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def in_app_suppressed_types(
    db: Session, user_id: int, user_role: str
) -> set[str]:
    """Notification types this user has switched off for the in-app channel.

    Two database queries, then pure in-memory resolution. The result is cached
    for the life of the session because it can only change when the user saves
    their preferences, and the cache is dropped by ``update_preferences`` /
    ``reset_preferences`` / the rules API.
    """
    from app.services.notification_preference_rule_service import (
        resolve_in_app_suppressed_types,
    )

    cache = _SUPPRESSION_CACHE
    key = (user_id, normalize_role(user_role))
    cached = cache.get(key)
    if cached is not None:
        return cached

    suppressed = frozenset(
        resolve_in_app_suppressed_types(db, user_id, normalize_role(user_role))
    )
    cache[key] = suppressed
    return suppressed


def invalidate_preference_cache(user_id: int | None = None) -> None:
    """Drop cached channel decisions after a preference change."""
    if user_id is None:
        _SUPPRESSION_CACHE.clear()
        return
    for key in [k for k in _SUPPRESSION_CACHE if k[0] == user_id]:
        _SUPPRESSION_CACHE.pop(key, None)


#: user_id -> frozenset[notification_type]. Session-scoped; never persisted.
_SUPPRESSION_CACHE: dict[tuple[int, str], frozenset[str]] = {}


def _prefetched_lookup(prefetch, kind, entity_id, fetch_fn):
    """Batch-friendly single-row lookup.

    When a list caller prefetched rows into ``prefetch[kind]`` dicts, serve
    from memory; otherwise fall back to the original query. Single-row
    callers pass no prefetch and behave exactly as before.
    """
    if prefetch is not None and entity_id is not None:
        bucket = prefetch.get(kind)
        if bucket is not None and entity_id in bucket:
            return bucket[entity_id]
    return fetch_fn()


def build_enrichment_prefetch(db: Session, notifs) -> dict[str, dict]:
    """Prefetch entity rows for a notification list in ~4 queries.

    Collects every policy/scheme/user id referenced by the page, then loads
    each table once with IN (including approver/creator second-level ids),
    replacing up to 4 sequential lookups per row.
    """
    policy_ids: set = set()
    scheme_ids: set = set()
    user_ids: set = set()
    for n in notifs:
        pid = n.related_policy_id or (
            n.entity_id if n.entity_type == "POLICY" else None
        )
        if pid is not None:
            policy_ids.add(pid)
        sid = n.related_scheme_id or (
            n.entity_id if n.entity_type == "SCHEME" else None
        )
        if sid is not None:
            scheme_ids.add(sid)
        if n.entity_type == "USER" and n.entity_id is not None:
            user_ids.add(n.entity_id)

    policies = (
        {
            p.policy_id: p
            for p in db.query(Policy)
            .filter(Policy.policy_id.in_(policy_ids))
            .all()
        }
        if policy_ids
        else {}
    )
    schemes = (
        {
            s.scheme_id: s
            for s in db.query(Scheme)
            .filter(Scheme.scheme_id.in_(scheme_ids))
            .all()
        }
        if scheme_ids
        else {}
    )
    staff_ids: set = set()
    for p in policies.values():
        if p.approved_by is not None:
            staff_ids.add(p.approved_by)
        if p.created_by is not None:
            staff_ids.add(p.created_by)
    for s in schemes.values():
        if s.approved_by is not None:
            staff_ids.add(s.approved_by)
        if s.created_by is not None:
            staff_ids.add(s.created_by)
    wanted_users = user_ids | staff_ids
    users = (
        {
            u.user_id: u
            for u in db.query(User).filter(User.user_id.in_(wanted_users)).all()
        }
        if wanted_users
        else {}
    )
    return {"policies": policies, "schemes": schemes, "users": users}


def enrich_notification(
    db: Session,
    notif: Notification,
    prefetch: dict | None = None,
    user_role: str = "CITIZEN",
    user_id: int | None = None,
) -> dict[str, Any]:
    (
        "Enrich notification model with dynamic entity details from "
        "Policy, Scheme, User, etc."
    )
    norm_role = normalize_role(user_role)
    data = {
        "notification_id": notif.notification_id,
        "user_id": notif.user_id,
        "title": notif.title,
        "message": notif.message,
        "notification_type": notif.notification_type,
        "category": notif.category
        or tax.resolve_category(notif.notification_type),
        "priority": tax.normalize_priority(notif.priority),
        "channel": notif.channel or "IN_APP",
        "action_url": notif.action_url,
        "entity_type": notif.entity_type,
        "entity_id": notif.entity_id,
        "source_name": notif.source_name,
        "related_policy_id": notif.related_policy_id,
        "related_scheme_id": notif.related_scheme_id,
        "is_read": notif.is_read,
        "read_at": notif.read_at,
        "created_at": notif.created_at,
        "updated_at": notif.updated_at,
        "expires_at": notif.expires_at,
        # Dynamic Enriched Fields
        "entity_title": None,
        "entity_status": None,
        "entity_ministry": None,
        "entity_department": None,
        "entity_category": None,
        "entity_description": None,
        "entity_benefits": None,
        "entity_state": None,
        "entity_published_date": None,
        "decision_by_name": None,
        "decision_date": None,
        "decision_reason": None,
        "submitted_by_name": None,
        "submitted_date": None,
        "deadline_date": None,
        "days_remaining": None,
        "application_url": None,
        "request_type": None,
        "feedback_status": None,
        "feedback_subject": None,
        "feedback_message": None,
        "feedback_response": None,
        "feedback_created_at": None,
    }

    # Policy Entity Lookup (role-gated: public roles see APPROVED only,
    # officials see APPROVED plus their own submissions).
    policy_id = notif.related_policy_id or (
        notif.entity_id if notif.entity_type == "POLICY" else None
    )
    if policy_id:
        policy = _prefetched_lookup(
            prefetch,
            "policies",
            policy_id,
            lambda: db.query(Policy)
            .filter(Policy.policy_id == policy_id)
            .first(),
        )
        if policy and _entity_visible(policy, norm_role, user_id):
            data["entity_title"] = policy.title
            data["entity_ministry"] = policy.ministry
            data["entity_department"] = policy.department
            data["entity_category"] = policy.category
            data["entity_description"] = policy.description
            data["entity_benefits"] = policy.benefits or []
            data["entity_state"] = policy.state
            if policy.publication_date:
                data["entity_published_date"] = policy.publication_date.isoformat()
            if not data["action_url"]:
                data["action_url"] = f"/policies/{policy.policy_id}"
            if not _is_public_role(norm_role):
                data["entity_status"] = policy.status
                data["decision_reason"] = (
                    policy.rejection_reason
                    or policy.delete_reason
                    or policy.archive_reason
                )

                if policy.approved_by:
                    approver = _prefetched_lookup(
                        prefetch,
                        "users",
                        policy.approved_by,
                        lambda: db.query(User)
                        .filter(User.user_id == policy.approved_by)
                        .first(),
                    )
                    if approver:
                        data["decision_by_name"] = (
                            approver.full_name or approver.email
                        )
                        data["decision_date"] = policy.updated_at

                if policy.created_by:
                    creator = _prefetched_lookup(
                        prefetch,
                        "users",
                        policy.created_by,
                        lambda: db.query(User)
                        .filter(User.user_id == policy.created_by)
                        .first(),
                    )
                    if creator:
                        data["submitted_by_name"] = (
                            creator.full_name or creator.email
                        )
                        data["submitted_date"] = policy.created_at

    # Scheme Entity Lookup
    scheme_id = notif.related_scheme_id or (
        notif.entity_id if notif.entity_type == "SCHEME" else None
    )
    if scheme_id:
        scheme = _prefetched_lookup(
            prefetch,
            "schemes",
            scheme_id,
            lambda: db.query(Scheme)
            .filter(Scheme.scheme_id == scheme_id)
            .first(),
        )
        if scheme and _entity_visible(scheme, norm_role, user_id):
            data["entity_title"] = scheme.name
            data["entity_ministry"] = scheme.ministry
            data["entity_department"] = scheme.department
            data["entity_category"] = scheme.category
            data["entity_description"] = scheme.description
            data["entity_benefits"] = scheme.benefits or []
            data["entity_state"] = scheme.state
            data["application_url"] = scheme.application_url
            if not data["action_url"]:
                data["action_url"] = f"/schemes/{scheme.scheme_id}"

            if not _is_public_role(norm_role):
                data["entity_status"] = scheme.status
                data["decision_reason"] = (
                    scheme.rejection_reason
                    or scheme.delete_reason
                    or scheme.archive_reason
                )

            if scheme.application_end_date:
                data["deadline_date"] = scheme.application_end_date.strftime(
                    "%d %B %Y"
                )
                remaining = (
                    scheme.application_end_date.replace(tzinfo=None)
                    - datetime.now().replace(tzinfo=None)
                ).days
                data["days_remaining"] = max(0, remaining)

            if not _is_public_role(norm_role) and scheme.approved_by:
                approver = _prefetched_lookup(
                    prefetch,
                    "users",
                    scheme.approved_by,
                    lambda: db.query(User)
                    .filter(User.user_id == scheme.approved_by)
                    .first(),
                )
                if approver:
                    data["decision_by_name"] = (
                        approver.full_name or approver.email
                    )
                    data["decision_date"] = scheme.updated_at

            if not _is_public_role(norm_role) and scheme.created_by:
                creator = _prefetched_lookup(
                    prefetch,
                    "users",
                    scheme.created_by,
                    lambda: db.query(User)
                    .filter(User.user_id == scheme.created_by)
                    .first(),
                )
                if creator:
                    data["submitted_by_name"] = (
                        creator.full_name or creator.email
                    )
                    data["submitted_date"] = scheme.created_at

    # User Entity Lookup (staff-only: never expose user records to
    # public roles through enrichment).
    if (
        notif.entity_type == "USER"
        and notif.entity_id
        and not _is_public_role(norm_role)
    ):
        target_user = _prefetched_lookup(
            prefetch,
            "users",
            notif.entity_id,
            lambda: db.query(User)
            .filter(User.user_id == notif.entity_id)
            .first(),
        )
        if target_user:
            data["entity_title"] = target_user.full_name or target_user.email
            data["entity_status"] = (
                "ACTIVE" if target_user.is_active else "INACTIVE"
            )
            data["entity_department"] = target_user.role

    # Request Type derivation
    nt = notif.notification_type
    if "DELETE" in nt:
        data["request_type"] = "DELETE_REQUEST"
    elif "ARCHIVE" in nt:
        data["request_type"] = "ARCHIVE_REQUEST"
    elif "APPROVAL" in nt or "SUBMITTED" in nt or "PENDING" in nt:
        data["request_type"] = "APPROVAL_REQUEST"

    # Deadline Info if attached to a visible related scheme.
    if "DEADLINE" in nt and not data.get("deadline_date"):
        if notif.related_scheme_id:
            s_lookup = _prefetched_lookup(
                prefetch,
                "schemes",
                notif.related_scheme_id,
                lambda: db.query(Scheme)
                .filter(Scheme.scheme_id == notif.related_scheme_id)
                .first(),
            )
            if (
                s_lookup
                and s_lookup.application_end_date
                and _entity_visible(s_lookup, norm_role, user_id)
            ):
                data["deadline_date"] = s_lookup.application_end_date.strftime(
                    "%d %B %Y"
                )
                remaining = (
                    s_lookup.application_end_date.replace(tzinfo=None)
                    - datetime.now().replace(tzinfo=None)
                ).days
                data["days_remaining"] = max(0, remaining)

    # Feedback Entity Lookup (owner or admin only, mirroring the
    # feedback detail endpoint's ownership rule).
    if notif.entity_type == "FEEDBACK" and notif.entity_id:
        feedback = (
            db.query(Feedback)
            .filter(Feedback.feedback_id == notif.entity_id)
            .first()
        )
        if feedback and (
            norm_role == "ADMIN" or feedback.user_id == user_id
        ):
            data["feedback_status"] = feedback.status
            data["feedback_subject"] = feedback.subject
            data["feedback_message"] = feedback.message
            data["feedback_response"] = feedback.admin_response
            data["feedback_created_at"] = feedback.created_at

    return data


_PUBLIC_VISIBILITY_ROLES = frozenset(
    {"CITIZEN", "RESEARCHER", "ORGANIZATION", "GUEST", "GUEST_USER"}
)


def _is_public_role(norm_role: str) -> bool:
    """True for roles restricted to approved, public-facing records."""
    return (norm_role or "").upper() in _PUBLIC_VISIBILITY_ROLES


def _entity_visible(entity, norm_role: str, user_id: int | None) -> bool:
    """Mirror the policy/scheme detail-route visibility rules.

    Public roles see APPROVED records only. Government officials see
    APPROVED records plus their own submissions. Admins see everything.
    Unknown roles default to the public restriction (fail closed).
    """
    status = str(getattr(entity, "status", "") or "").upper()
    if norm_role == "ADMIN":
        return True
    if norm_role == "GOVERNMENT_OFFICIAL":
        return status == "APPROVED" or (
            user_id is not None
            and getattr(entity, "created_by", None) == user_id
        )
    return status == "APPROVED"


def create_notification(
    db: Session,
    data: NotificationCreate,
) -> Notification:
    """Create in-app notification in DB and trigger delivery pipeline."""
    now = _now()
    notification = Notification(
        user_id=data.user_id,
        title=data.title,
        message=data.message,
        notification_type=data.notification_type,
        priority=tax.normalize_priority(data.priority),
        channel=data.channel or "IN_APP",
        action_url=data.action_url,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        source_name=data.source_name,
        related_policy_id=data.related_policy_id,
        related_scheme_id=data.related_scheme_id,
        category=tax.resolve_category(data.notification_type),
        is_read=False,
        read_at=None,
        created_at=now,
        updated_at=now,
    )

    db.add(notification)
    db.commit()
    db.refresh(notification)

    _audit(
        db,
        action=audit.ACTION_NOTIFICATION_GENERATED,
        user_id=notification.user_id,
        entity_type=notification.entity_type,
        entity_id=notification.entity_id,
        description=(
            f"{notification.notification_type} -> user {notification.user_id} "
            f"({notification.category}, "
            f"{tax.normalize_priority(notification.priority)})"
        ),
    )

    # Deliver according to user channels and preferences
    try:
        NotificationDeliveryService.deliver(db=db, notification=notification)
    except Exception as e:
        logger.error(f"Unified delivery execution error: {e}")

    # Push to any live WebSocket so the bell and list update without a refresh.
    _publish_notification(notification)

    return notification


def _audit(db: Session, **kwargs: Any) -> None:
    """Write an audit row, swallowing any failure."""
    try:
        from app.services.audit_log_service import log_action

        log_action(db, **kwargs)
    except Exception as exc:  # audit must never break the pipeline
        logger.debug("Audit skipped: %s", exc)


# ---------------------------------------------------------------------------
# Dispatch: role + preference + dedupe aware creation
#
# `create_notification` stays the low-level primitive (always creates, always
# delivers) so existing callers and tests keep working. Every business-event
# producer goes through `dispatch_notification` instead, which is where the
# per-recipient preference check lives.
# ---------------------------------------------------------------------------

#: How long an identical (user, type, entity) notification is suppressed.
DEDUPE_WINDOW_MINUTES = 10


def _dedupe_key(data: NotificationCreate) -> tuple:
    return (
        data.user_id,
        str(data.notification_type or "").strip().upper(),
        data.entity_type,
        data.entity_id,
    )


def _is_duplicate(db: Session, data: NotificationCreate) -> bool:
    (
        "Guard against a repeated business event producing a second "
        "notification."
    )
    if not data.user_id or data.entity_id is None:
        return False
    since = _now() - timedelta(minutes=DEDUPE_WINDOW_MINUTES)
    existing = (
        db.query(Notification.notification_id)
        .filter(
            Notification.user_id == data.user_id,
            Notification.notification_type
            == str(data.notification_type or "").strip().upper(),
            Notification.entity_type == data.entity_type,
            Notification.entity_id == data.entity_id,
            Notification.created_at >= since,
        )
        .first()
    )
    return existing is not None


def _publish_notification(notification: Notification) -> None:
    """Emit a live event for this recipient. Never raises."""
    if not notification.user_id:
        return
    try:
        from app.services.notification_realtime import manager

        manager.publish(
            int(notification.user_id),
            {
                "type": "notification",
                "data": {
                    "notification_id": notification.notification_id,
                    "title": notification.title,
                    "message": notification.message,
                    "notification_type": notification.notification_type,
                    "category": notification.category,
                    "priority": tax.normalize_priority(notification.priority),
                    "action_url": notification.action_url,
                    "entity_type": notification.entity_type,
                    "entity_id": notification.entity_id,
                    "source_name": notification.source_name,
                    "created_at": (
                        notification.created_at.isoformat()
                        if notification.created_at
                        else None
                    ),
                    "is_read": bool(notification.is_read),
                },
            },
        )
    except Exception as exc:  # realtime must never break delivery
        logger.debug("Realtime publish skipped: %s", exc)


def dispatch_notification(
    db: Session,
    data: NotificationCreate,
    respect_preferences: bool = True,
) -> Notification | None:
    """Create a notification for a single recipient, honouring their settings.

    Returns ``None`` when the recipient has switched every channel off for
    this notification type, or when an identical notification was already
    issued inside the dedupe window.
    """
    if respect_preferences and data.user_id:
        from app.services.notification_preference_rule_service import (
            resolve_channels_for_user,
        )

        channels = resolve_channels_for_user(
            db=db,
            user_id=data.user_id,
            notification_type=data.notification_type,
        )
        if not any(channels.values()):
            logger.debug(
                "Notification suppressed by preference: user=%s type=%s",
                data.user_id,
                data.notification_type,
            )
            _audit(
                db,
                action=audit.ACTION_NOTIFICATION_SUPPRESSED,
                user_id=data.user_id,
                entity_type=data.entity_type,
                entity_id=data.entity_id,
                description=(
                    f"{data.notification_type} - all channels disabled "
                    "by preference"
                ),
            )
            return None

    if _is_duplicate(db, data):
        logger.debug(
            "Notification suppressed as duplicate: user=%s type=%s "
            "entity=%s/%s",
            data.user_id,
            data.notification_type,
            data.entity_type,
            data.entity_id,
        )
        return None

    return create_notification(db, data)


def dispatch_to_users(
    db: Session,
    items: list[NotificationCreate],
) -> list[Notification]:
    """Fan a batch out, applying preference + dedupe per recipient."""
    created: list[Notification] = []
    for item in items:
        result = dispatch_notification(db, item)
        if result is not None:
            created.append(result)
    return created


def public_audience(
    db: Session,
    notification_type: str,
    exclude_user_ids: set[int] | None = None,
) -> list[User]:
    """Citizen / Researcher / Organization users eligible for a public event.

    Enforces the two hard business rules before returning:
      * the event must not be an internal workflow type, and
      * the user must not have every channel switched off for it.
    """
    from app.services.notification_preference_rule_service import (
        resolve_channels_for_user,
    )

    if tax.is_internal_only(notification_type):
        logger.warning(
            "Refusing to broadcast internal type %s to public roles",
            notification_type,
        )
        return []

    exclude = exclude_user_ids or set()
    candidates = (
        db.query(User)
        .filter(
            User.role.in_(
                ["CITIZEN", "RESEARCHER", "ORGANIZATION", "ORGANISATION"]
            ),
            or_(User.is_active.is_(True), User.is_active.is_(None)),
        )
        .all()
    )

    eligible: list[User] = []
    for user in candidates:
        if user.user_id in exclude:
            continue
        if not user.is_active:
            continue
        channels = resolve_channels_for_user(
            db=db,
            user_id=user.user_id,
            notification_type=notification_type,
        )
        if any(channels.values()):
            eligible.append(user)
    return eligible


def admin_audience(
    db: Session,
    notification_type: str,
    exclude_user_ids: set[int] | None = None,
) -> list[User]:
    """Active administrators, optionally minus the actor who just acted.

    The exclusion is what stops an administrator being told about their own
    action (spec section 21). The actor is identified by the authenticated
    user's id, never by a hard-coded name.
    """
    exclude = exclude_user_ids or set()
    admins = (
        db.query(User).filter(User.role.in_(["ADMIN", "ADMINISTRATOR"])).all()
    )
    return [a for a in admins if a.user_id not in exclude and a.is_active]


def create_bulk_notifications(
    db: Session,
    items: list[NotificationCreate],
) -> list[Notification]:
    """Create multiple notifications for targeted groups."""
    created = []
    for item in items:
        notif = dispatch_notification(db, item)
        if notif is not None:
            created.append(notif)
    return created


def get_user_notifications(
    db: Session,
    user_id: int,
    user_role: str,
    search: str | None = None,
    category: str | None = None,
    is_read: bool | None = None,
    priority: str | None = None,
    channel: str | None = None,
    date_range: str | None = None,
    sort_by: str = "latest",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    norm_role = normalize_role(user_role)

    # Guest users have no personalized notifications
    if norm_role == "GUEST_USER":
        return {
            "items": [],
            "total": 0,
            "page": 1,
            "page_size": page_size,
            "total_pages": 1,
            "unread_count": 0,
            "summary": {"total": 0, "unread": 0, "read": 0, "this_week": 0},
        }

    # Role-aware base query
    base_filter = get_base_notification_filter(user_id, norm_role)
    query = db.query(Notification).filter(base_filter)

    # Types this user has switched off in-app never surface in the centre.
    # Applied here and in the unread count so the badge and the list
    # always agree.
    suppressed = in_app_suppressed_types(db, user_id, norm_role)
    if suppressed:
        query = query.filter(
            Notification.notification_type.notin_(sorted(suppressed))
        )

    # Search filter
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Notification.title.ilike(term),
                Notification.message.ilike(term),
                Notification.notification_type.ilike(term),
                Notification.source_name.ilike(term),
                Notification.entity_type.ilike(term),
            )
        )

    # Category / Role-aware tab filter
    if category and category.lower() != "all":
        cat = category.lower().strip()
        canonical = {c.value.lower() for c in tax.NotificationCategory}
        if cat in canonical:
            # Canonical category tab: one indexed column, identical for
            # every role.
            query = query.filter(Notification.category == cat.upper())
        elif cat == "unread":
            query = query.filter(Notification.is_read.is_(False))
        elif norm_role == "ADMIN":
            if cat in ("policy_requests", "policy", "workflow"):
                query = query.filter(
                    Notification.notification_type.in_(
                        [
                            "POLICY_PENDING_REQUEST",
                            "POLICY_APPROVAL_REQUEST",
                            "POLICY_DELETE_REQUEST",
                            "POLICY_ARCHIVE_REQUEST",
                            "POLICY_SUBMITTED",
                            "POLICY_ARCHIVE_REQUESTED",
                        ]
                    )
                )
            elif cat in ("scheme_requests", "scheme"):
                query = query.filter(
                    Notification.notification_type.in_(
                        [
                            "SCHEME_PENDING_REQUEST",
                            "SCHEME_APPROVAL_REQUEST",
                            "SCHEME_DELETE_REQUEST",
                            "SCHEME_ARCHIVE_REQUEST",
                            "SCHEME_SUBMITTED",
                            "SCHEME_APPROVAL_REQUIRED",
                        ]
                    )
                )
            elif cat in ("user_alerts", "user"):
                query = query.filter(
                    Notification.notification_type.in_(
                        [
                            "NEW_USER",
                            "USER_ROLE_CHANGE",
                            "USER_STATUS_CHANGE",
                        ]
                    )
                )
            elif cat in ("feedback_issues", "feedback", "issues"):
                query = query.filter(
                    Notification.notification_type.in_(
                        [
                            "NEW_FEEDBACK",
                            "ISSUE_REPORTED",
                            "FEEDBACK_ESCALATED",
                            "FEEDBACK_RESOLVED",
                            "CITIZEN_FEEDBACK",
                            "FEEDBACK_UPDATE",
                        ]
                    )
                )
            elif cat in ("system_alerts", "system"):
                query = query.filter(
                    Notification.notification_type.in_(
                        [
                            "SYSTEM_ALERT",
                            "BACKGROUND_JOB_FAILURE",
                            "API_FAILURE",
                            "DATABASE_ALERT",
                            "SECURITY_ALERT",
                        ]
                    )
                )
            elif cat in ("deliveries", "delivery_monitoring"):
                query = query.filter(
                    Notification.notification_type.in_(
                        [
                            "EMAIL_DELIVERY_FAILURE",
                            "SMS_DELIVERY_FAILURE",
                            "EMAIL_BOUNCE",
                            "SMS_FAILURE",
                            "NOTIFICATION_DELIVERY_FAILURE",
                        ]
                    )
                )
            else:
                query = query.filter(
                    Notification.notification_type.ilike(f"%{cat}%")
                )
        elif norm_role == "GOVERNMENT_OFFICIAL":
            if cat in ("policy_decisions", "policy"):
                query = query.filter(
                    Notification.notification_type.in_(
                        ["POLICY_APPROVED", "POLICY_REJECTED"]
                    )
                )
            elif cat in ("scheme_decisions", "scheme"):
                query = query.filter(
                    Notification.notification_type.in_(
                        ["SCHEME_APPROVED", "SCHEME_REJECTED"]
                    )
                )
            elif cat in ("request_decisions", "request"):
                query = query.filter(
                    Notification.notification_type.in_(
                        ["REQUEST_APPROVED", "REQUEST_REJECTED"]
                    )
                )
            else:
                query = query.filter(
                    Notification.notification_type.ilike(f"%{cat}%")
                )
        else:
            # CITIZEN, RESEARCHER, ORGANIZATION
            if cat in ("policy_alerts", "policy"):
                query = query.filter(
                    Notification.notification_type.in_(
                        ["NEW_POLICY", "POLICY_UPDATE"]
                    )
                )
            elif cat in ("scheme_updates", "scheme"):
                query = query.filter(
                    Notification.notification_type.in_(
                        ["NEW_SCHEME", "SCHEME_UPDATE"]
                    )
                )
            elif cat in ("deadline_reminders", "deadline"):
                query = query.filter(
                    Notification.notification_type.in_(["DEADLINE_REMINDER"])
                )
            else:
                query = query.filter(
                    Notification.notification_type.ilike(f"%{cat}%")
                )

    # Read / Unread filter
    if is_read is not None:
        query = query.filter(Notification.is_read == is_read)

    # Priority filter. NORMAL is the canonical spelling; rows written before
    # the rename still hold MEDIUM, so both are matched.
    if priority and priority.upper() != "ALL":
        wanted = tax.normalize_priority(priority)
        if wanted == tax.NotificationPriority.NORMAL.value:
            query = query.filter(Notification.priority.in_([wanted, "MEDIUM"]))
        else:
            query = query.filter(Notification.priority == wanted)

    # Channel filter
    if channel and channel.upper() != "ALL":
        query = query.filter(Notification.channel == channel.upper())

    # Date range filter
    if date_range:
        now = _now()
        if date_range == "today":
            start_of_day = datetime(now.year, now.month, now.day)
            query = query.filter(Notification.created_at >= start_of_day)
        elif date_range == "this_week":
            week_ago = now - timedelta(days=7)
            query = query.filter(Notification.created_at >= week_ago)
        elif date_range == "this_month":
            month_ago = now - timedelta(days=30)
            query = query.filter(Notification.created_at >= month_ago)

    # Sorting
    if sort_by == "oldest":
        query = query.order_by(Notification.created_at.asc())
    elif sort_by == "unread_first":
        query = query.order_by(
            Notification.is_read.asc(), Notification.created_at.desc()
        )
    else:  # default "latest"
        query = query.order_by(Notification.created_at.desc())

    total = query.count()

    # Pagination
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20

    offset = (page - 1) * page_size
    raw_items = query.offset(offset).limit(page_size).all()
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    # Enrich each notification with dynamic backend data.
    # Entity rows are prefetched once (~4 queries) instead of up to 4
    # sequential lookups per row. Role scoping matches the detail route.
    prefetch = build_enrichment_prefetch(db, raw_items)
    enriched_items = [
        enrich_notification(db, item, prefetch, norm_role, user_id)
        for item in raw_items
    ]

    summary = get_notification_summary(db, user_id, user_role)
    unread_count = summary["unread"]

    return {
        "items": enriched_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "unread_count": unread_count,
        "summary": summary,
    }


def _get_notification_record(
    db: Session,
    notification_id: int,
    user_id: int,
    user_role: str = "CITIZEN",
) -> Notification | None:
    (
        "Internal helper to fetch the raw notification with strict "
        "role ownership validation."
    )
    base_filter = get_base_notification_filter(user_id, user_role)
    return (
        db.query(Notification)
        .filter(
            Notification.notification_id == notification_id,
            base_filter,
        )
        .first()
    )


def get_notification_by_id(
    db: Session,
    notification_id: int,
    user_id: int,
    user_role: str = "CITIZEN",
) -> dict[str, Any] | None:
    (
        "Retrieve full-width notification details enriched with actual "
        "backend entity data."
    )
    notif = _get_notification_record(db, notification_id, user_id, user_role)
    if not notif:
        return None
    return enrich_notification(db, notif, None, user_role, user_id)


def mark_notification_read(
    db: Session,
    notification_id: int,
    user_id: int,
    user_role: str = "CITIZEN",
) -> dict[str, Any] | None:
    notification = _get_notification_record(
        db, notification_id, user_id, user_role
    )
    if not notification:
        return None

    notification.is_read = True
    notification.read_at = _now()
    notification.updated_at = _now()
    db.commit()
    db.refresh(notification)
    return enrich_notification(db, notification, None, user_role, user_id)


def mark_notification_unread(
    db: Session,
    notification_id: int,
    user_id: int,
    user_role: str = "CITIZEN",
) -> dict[str, Any] | None:
    notification = _get_notification_record(
        db, notification_id, user_id, user_role
    )
    if not notification:
        return None

    notification.is_read = False
    notification.read_at = None
    notification.updated_at = _now()
    db.commit()
    db.refresh(notification)
    return enrich_notification(db, notification, None, user_role, user_id)


def mark_all_notifications_read(
    db: Session,
    user_id: int,
    user_role: str = "CITIZEN",
) -> dict[str, Any]:
    now = _now()
    base_filter = get_base_notification_filter(user_id, user_role)

    # Bulk UPDATE instead of fetching every unread row and looping.
    updated_count = (
        db.query(Notification)
        .filter(base_filter, Notification.is_read.is_(False))
        .update(
            {Notification.is_read: True, Notification.read_at: now, Notification.updated_at: now},
            synchronize_session=False,
        )
    )
    db.commit()

    return {
        "message": "All notifications marked as read",
        "updated_count": updated_count,
    }


def delete_notification(
    db: Session,
    notification_id: int,
    user_id: int,
    user_role: str = "CITIZEN",
) -> dict[str, Any] | None:
    notification = _get_notification_record(
        db, notification_id, user_id, user_role
    )
    if not notification:
        return None

    id_val = notification.notification_id
    db.delete(notification)
    db.commit()

    return {
        "message": "Notification deleted successfully",
        "notification_id": id_val,
    }


def _visibility_filter(
    db: Session,
    user_id: int,
    user_role: str,
) -> Any:
    """Role-visible rows minus anything the user muted in-app.

    Shared by the list, the unread count and the summary so the bell badge can
    never disagree with the notification centre.
    """
    norm_role = normalize_role(user_role)
    filters = [get_base_notification_filter(user_id, norm_role)]
    suppressed = in_app_suppressed_types(db, user_id, norm_role)
    if suppressed:
        filters.append(
            Notification.notification_type.notin_(sorted(suppressed))
        )
    return and_(*filters)


def get_unread_count(
    db: Session,
    user_id: int,
    user_role: str = "CITIZEN",
) -> int:
    if normalize_role(user_role) == "GUEST_USER":
        return 0
    return (
        db.query(func.count(Notification.notification_id))
        .filter(
            _visibility_filter(db, user_id, user_role),
            Notification.is_read.is_(False),
        )
        .scalar()
        or 0
    )


def get_notification_summary(
    db: Session,
    user_id: int,
    user_role: str = "CITIZEN",
) -> dict[str, int]:
    if normalize_role(user_role) == "GUEST_USER":
        return {"total": 0, "unread": 0, "read": 0, "this_week": 0}

    base_filter = _visibility_filter(db, user_id, user_role)

    # Single conditional-aggregation query instead of 3 COUNTs.
    row = (
        db.query(
            func.count(Notification.notification_id),
            func.sum(
                case((Notification.is_read.is_(False), 1), else_=0)
            ),
            func.sum(
                case(
                    (
                        Notification.created_at
                        >= _now() - timedelta(days=7),
                        1,
                    ),
                    else_=0,
                )
            ),
        )
        .filter(base_filter)
        .first()
    )
    total = row[0] or 0
    unread = int(row[1] or 0)
    read = max(0, total - unread)
    this_week = int(row[2] or 0)

    return {
        "total": total,
        "unread": unread,
        "read": read,
        "this_week": this_week,
    }


# ============================================================
# ADMIN DIAGNOSTICS & DELIVERY MONITORING
# ============================================================


def get_admin_notification_stats(db: Session) -> dict[str, int]:
    (
        "Retrieve system-wide delivery monitoring statistics for "
        "ADMINISTRATOR."
    )
    total_notifications = (
        db.query(func.count(Notification.notification_id)).scalar() or 0
    )
    # Single GROUP BY instead of 8 COUNTs over notification_delivery.
    delivery_rows = (
        db.query(
            NotificationDelivery.channel,
            NotificationDelivery.status,
            func.count(NotificationDelivery.delivery_id),
        )
        .group_by(NotificationDelivery.channel, NotificationDelivery.status)
        .all()
    )
    by_channel_status = {(c, s): n for c, s, n in delivery_rows}

    def _d(channel: str, statuses) -> int:
        if isinstance(statuses, str):
            statuses = [statuses]
        return sum(
            by_channel_status.get((channel, s), 0) for s in statuses
        )

    in_app_count = sum(
        n for (c, _s), n in by_channel_status.items() if c == "IN_APP"
    )
    email_sent = _d("EMAIL", ["SENT", "DELIVERED"])
    email_failed = _d("EMAIL", "FAILED")
    sms_sent = _d("SMS", ["SENT", "DELIVERED"])
    sms_failed = _d("SMS", "FAILED")
    pending_deliveries = sum(
        n for (_c, s), n in by_channel_status.items() if s == "PENDING"
    )
    delivered_count = sum(
        n for (_c, s), n in by_channel_status.items() if s == "DELIVERED"
    )
    skipped_count = sum(
        n for (_c, s), n in by_channel_status.items() if s == "SKIPPED"
    )

    return {
        "total_notifications": total_notifications,
        "in_app_count": in_app_count,
        "email_sent": email_sent,
        "email_failed": email_failed,
        "sms_sent": sms_sent,
        "sms_failed": sms_failed,
        "pending_deliveries": pending_deliveries,
        "delivered_count": delivered_count,
        "skipped_count": skipped_count,
    }


def get_admin_deliveries(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    channel: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    """List recent delivery logs with filters for Admin Delivery Monitoring."""
    query = db.query(NotificationDelivery)
    if channel and channel.upper() != "ALL":
        query = query.filter(NotificationDelivery.channel == channel.upper())
    if status and status.upper() != "ALL":
        query = query.filter(NotificationDelivery.status == status.upper())

    query = query.order_by(NotificationDelivery.created_at.desc())
    total = query.count()
    offset = max(0, (page - 1) * page_size)
    items = query.offset(offset).limit(page_size).all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (
            (total + page_size - 1) // page_size if total > 0 else 1
        ),
    }


# ============================================================
# EVENT-DRIVEN NOTIFICATION TRIGGERS (ROLE-BASED)
# ============================================================

# ============================================================
# ADMIN WORKFLOW
# ============================================================


def _display_name(user: User | None) -> str:
    if user is None:
        return "Government Official"
    for attr in ("full_name", "name", "username", "email"):
        value = getattr(user, attr, None)
        if value:
            return str(value)
    return f"User #{user.user_id}"


def _user_by_id(db: Session, user_id: int | None) -> User | None:
    if not user_id:
        return None
    return db.query(User).filter(User.user_id == user_id).first()


def _role_label(role: str | None) -> str:
    return (role or "GOVERNMENT_OFFICIAL").replace("_", " ").title()


def notify_admin_action_on_request(
    db: Session,
    entity_type: str,
    entity_id: int,
    entity_title: str,
    action: str,
    actor_id: int,
    actor_name: str | None = None,
    reason: str | None = None,
    link_entity: bool = True,
) -> list[Notification]:
    """Tell the *other* administrators that one of them just acted.

    The actor is identified by their authenticated user id and excluded from
    the fan-out, so nobody is notified about their own click. When only one
    administrator exists this is a no-op, which is the correct behaviour.

    Pass ``link_entity=False`` once the row has been deleted, so the
    ``related_policy_id`` / ``related_scheme_id`` foreign keys stay NULL rather
    than pointing at a row that no longer exists.
    """
    actor = _user_by_id(db, actor_id)
    if actor is None:
        return []

    others = admin_audience(
        db, "ADMIN_ACTION_UPDATE", exclude_user_ids={int(actor_id)}
    )
    if not others:
        return []

    approved = action.lower().startswith("approv")
    if approved:
        title = f"{entity_type.title()} Request Approved"
        verb = "approved"
    else:
        title = f"{entity_type.title()} Request Rejected"
        verb = "rejected"

    reason_str = f" Reason: {reason}" if reason else ""
    resolved_actor = actor_name or _display_name(actor)

    return dispatch_to_users(
        db,
        [
            NotificationCreate(
                user_id=other.user_id,
                title=title,
                message=(
                    f"{resolved_actor} {verb} the {entity_type.lower()} "
                    f'request for "{entity_title}".{reason_str}'
                ),
                notification_type="ADMIN_ACTION_UPDATE",
                priority=tax.PRIORITY_APPROVAL_RESULT.value,
                channel="IN_APP",
                action_url=(
                    f"/{'policies' if entity_type == 'POLICY' else 'schemes'}"
                    f"/{entity_id}"
                ),
                entity_type=entity_type,
                entity_id=entity_id,
                source_name=resolved_actor,
                related_policy_id=(
                    entity_id
                    if (link_entity and entity_type == "POLICY")
                    else None
                ),
                related_scheme_id=(
                    entity_id
                    if (link_entity and entity_type == "SCHEME")
                    else None
                ),
            )
            for other in others
        ],
    )


def _notify_admins_of_request(
    db: Session,
    notification_type: str,
    title: str,
    message: str,
    entity_type: str,
    entity_id: int,
    requester: User | None,
    priority: str,
    source_name: str | None = None,
    exclude_user_ids: set[int] | None = None,
) -> list[Notification]:
    """Shared fan-out for every 'a government official asked for something'
    event. Every eligible administrator receives it."""
    admins = admin_audience(
        db, notification_type, exclude_user_ids=exclude_user_ids
    )
    if not admins:
        logger.warning(
            "No active administrators to notify for %s", notification_type
        )
        return []

    requester_name = _display_name(requester)
    requester_role = _role_label(getattr(requester, "role", None))
    full_message = (
        f"{message}\n"
        f"Request type: {notification_type.replace('_', ' ').title()}\n"
        f"Requested by: {requester_name} ({requester_role})\n"
        f"Submitted at: {_now().strftime('%d %b %Y, %I:%M %p')}\n"
        f"Current status: Pending review"
    )

    return dispatch_to_users(
        db,
        [
            NotificationCreate(
                user_id=admin.user_id,
                title=title,
                message=full_message,
                notification_type=notification_type,
                priority=priority,
                channel="IN_APP",
                action_url=(
                    f"/{'policies' if entity_type == 'POLICY' else 'schemes'}"
                    f"/{entity_id}"
                ),
                entity_type=entity_type,
                entity_id=entity_id,
                source_name=source_name or requester_name,
                related_policy_id=(
                    entity_id if entity_type == "POLICY" else None
                ),
                related_scheme_id=(
                    entity_id if entity_type == "SCHEME" else None
                ),
            )
            for admin in admins
        ],
    )


def notify_policy_created(
    db: Session,
    policy_id: int,
    policy_title: str,
    created_by_id: int,
    department: str | None = None,
) -> None:
    (
        "Notify every administrator when a Government Official "
        "creates/adds a policy."
    )
    _notify_admins_of_request(
        db=db,
        notification_type="POLICY_PENDING_REQUEST",
        title="New Policy Request",
        message=(
            f"Government Official "
            f"{_display_name(_user_by_id(db, created_by_id))}"
            f" submitted policy "
            f'"{policy_title}".'
            + (f" Department: {department}." if department else "")
        ),
        entity_type="POLICY",
        entity_id=policy_id,
        requester=_user_by_id(db, created_by_id),
        priority=tax.PRIORITY_ADMIN_APPROVAL_REQUEST.value,
        source_name=department or "Policy Administration",
    )


def notify_policy_submitted(
    db: Session,
    policy_id: int,
    policy_title: str,
    submitted_by_id: int,
    department: str | None = None,
) -> None:
    (
        "Notify every administrator when a Government Official "
        "submits a policy."
    )
    _notify_admins_of_request(
        db=db,
        notification_type="POLICY_APPROVAL_REQUEST",
        title="Policy Approval Request",
        message=(
            f"Government Official "
            f"{_display_name(_user_by_id(db, submitted_by_id))}"
            f" submitted "
            f'"{policy_title}" for approval.'
            + (f" Department: {department}." if department else "")
        ),
        entity_type="POLICY",
        entity_id=policy_id,
        requester=_user_by_id(db, submitted_by_id),
        priority=tax.PRIORITY_ADMIN_APPROVAL_REQUEST.value,
        source_name=department or "Policy Review Board",
    )


def notify_policy_approved(
    db: Session,
    policy_id: int,
    policy_title: str,
    creator_id: int | None = None,
    ministry: str | None = None,
    actor_id: int | None = None,
    actor_name: str | None = None,
) -> None:
    """An administrator approved a policy.

    Three distinct audiences, none of which leaks into the others:
      1. the submitting official -> POLICY_APPROVED,
      2. the *other* administrators -> ADMIN_ACTION_UPDATE (actor excluded),
      3. the public -> NEW_POLICY, only if the policy is actually published.
    """
    if creator_id and creator_id != actor_id:
        dispatch_notification(
            db,
            NotificationCreate(
                user_id=creator_id,
                title="Policy Approved",
                message=(
                    f'Your policy "{policy_title}" has been approved'
                    + (
                        f" by {actor_name}."
                        if actor_name
                        else " by the Administrator."
                    )
                ),
                notification_type="POLICY_APPROVED",
                priority=tax.PRIORITY_APPROVAL_RESULT.value,
                channel="IN_APP",
                action_url=f"/policies/{policy_id}",
                entity_type="POLICY",
                entity_id=policy_id,
                source_name=ministry or "Ministry Review Board",
                related_policy_id=policy_id,
            ),
        )

    if actor_id:
        notify_admin_action_on_request(
            db=db,
            entity_type="POLICY",
            entity_id=policy_id,
            entity_title=policy_title,
            action="approved",
            actor_id=actor_id,
            actor_name=actor_name,
        )
        _audit(
            db,
            action=audit.ACTION_APPROVAL_EVENT,
            user_id=actor_id,
            entity_type="POLICY",
            entity_id=policy_id,
            description=(
                f'Policy "{policy_title}" approved by admin {actor_id}'
            ),
        )

    notify_policy_published(db, policy_id, policy_title, ministry=ministry)


def notify_policy_rejected(
    db: Session,
    policy_id: int,
    policy_title: str,
    creator_id: int,
    reason: str | None = None,
    actor_id: int | None = None,
    actor_name: str | None = None,
) -> None:
    (
        "An administrator rejected a policy. No public notification "
        "is emitted."
    )
    reason_text = f" Reason: {reason}" if reason else ""

    if creator_id and creator_id != actor_id:
        dispatch_notification(
            db,
            NotificationCreate(
                user_id=creator_id,
                title="Policy Rejected",
                message=(
                    f'Your policy "{policy_title}" was rejected.{reason_text}'
                ),
                notification_type="POLICY_REJECTED",
                priority=tax.PRIORITY_APPROVAL_RESULT.value,
                channel="IN_APP",
                action_url=f"/policies/{policy_id}",
                entity_type="POLICY",
                entity_id=policy_id,
                source_name=ministry_label(actor_name)
                or "Ministry Review Board",
                related_policy_id=policy_id,
            ),
        )

    if actor_id:
        notify_admin_action_on_request(
            db=db,
            entity_type="POLICY",
            entity_id=policy_id,
            entity_title=policy_title,
            action="rejected",
            actor_id=actor_id,
            actor_name=actor_name,
            reason=reason,
        )
        _audit(
            db,
            action=audit.ACTION_REJECTION_EVENT,
            user_id=actor_id,
            entity_type="POLICY",
            entity_id=policy_id,
            description=(
                f'Policy "{policy_title}" rejected by admin {actor_id}'
                + (f": {reason}" if reason else "")
            ),
        )


def ministry_label(actor_name: str | None) -> str | None:
    return actor_name or None


def notify_policy_delete_requested(
    db: Session,
    policy_id: int,
    policy_title: str,
    requested_by_id: int,
    reason: str | None = None,
) -> None:
    """Notify administrators when deletion of a policy is requested."""
    _notify_admins_of_request(
        db=db,
        notification_type="POLICY_DELETE_REQUEST",
        title="Policy Delete Request",
        message=(
            f"Government Official "
            f"{_display_name(_user_by_id(db, requested_by_id))}"
            f" requested deletion of "
            f'"{policy_title}".'
            + (f" Reason: {reason}" if reason else "")
        ),
        entity_type="POLICY",
        entity_id=policy_id,
        requester=_user_by_id(db, requested_by_id),
        priority=tax.PRIORITY_ADMIN_APPROVAL_REQUEST.value,
        source_name="Policy Administration",
    )


def notify_policy_archive_requested(
    db: Session,
    policy_id: int,
    policy_title: str,
    requested_by_id: int,
    reason: str | None = None,
) -> None:
    """Notify administrators when archival of a policy is requested."""
    _notify_admins_of_request(
        db=db,
        notification_type="POLICY_ARCHIVE_REQUEST",
        title="Policy Archive Request",
        message=(
            f"Government Official "
            f"{_display_name(_user_by_id(db, requested_by_id))}"
            f" requested archival of "
            f'"{policy_title}".'
            + (f" Reason: {reason}" if reason else "")
        ),
        entity_type="POLICY",
        entity_id=policy_id,
        requester=_user_by_id(db, requested_by_id),
        priority=tax.PRIORITY_APPROVAL_RESULT.value,
        source_name="Policy Administration",
    )


def notify_scheme_created(
    db: Session,
    scheme_id: int,
    scheme_title: str,
    created_by_id: int,
    ministry: str | None = None,
) -> None:
    (
        "Notify every administrator when a Government Official "
        "creates/adds a scheme."
    )
    _notify_admins_of_request(
        db=db,
        notification_type="SCHEME_PENDING_REQUEST",
        title="New Scheme Request",
        message=(
            f"Government Official "
            f"{_display_name(_user_by_id(db, created_by_id))}"
            f" submitted scheme "
            f'"{scheme_title}".'
            + (f" Ministry: {ministry}." if ministry else "")
        ),
        entity_type="SCHEME",
        entity_id=scheme_id,
        requester=_user_by_id(db, created_by_id),
        priority=tax.PRIORITY_ADMIN_APPROVAL_REQUEST.value,
        source_name=ministry or "Scheme Formulation Board",
    )


def notify_scheme_submitted(
    db: Session,
    scheme_id: int,
    scheme_title: str,
    submitted_by_id: int,
    ministry: str | None = None,
) -> None:
    (
        "Notify every administrator when a Government Official "
        "submits a scheme."
    )
    _notify_admins_of_request(
        db=db,
        notification_type="SCHEME_APPROVAL_REQUEST",
        title="Scheme Approval Request",
        message=(
            f"Government Official "
            f"{_display_name(_user_by_id(db, submitted_by_id))}"
            f" submitted "
            f'"{scheme_title}" for approval.'
            + (f" Ministry: {ministry}." if ministry else "")
        ),
        entity_type="SCHEME",
        entity_id=scheme_id,
        requester=_user_by_id(db, submitted_by_id),
        priority=tax.PRIORITY_ADMIN_APPROVAL_REQUEST.value,
        source_name=ministry or "Scheme Formulation Board",
    )


def notify_scheme_approved(
    db: Session,
    scheme_id: int,
    scheme_title: str,
    creator_id: int | None = None,
    ministry: str | None = None,
    actor_id: int | None = None,
    actor_name: str | None = None,
) -> None:
    """An administrator approved a scheme. Mirrors notify_policy_approved."""
    if creator_id and creator_id != actor_id:
        dispatch_notification(
            db,
            NotificationCreate(
                user_id=creator_id,
                title="Scheme Approved",
                message=(
                    f'Your scheme "{scheme_title}" has been approved'
                    + (
                        f" by {actor_name}."
                        if actor_name
                        else " by the Administrator."
                    )
                ),
                notification_type="SCHEME_APPROVED",
                priority=tax.PRIORITY_APPROVAL_RESULT.value,
                channel="IN_APP",
                action_url=f"/schemes/{scheme_id}",
                entity_type="SCHEME",
                entity_id=scheme_id,
                source_name=ministry or "Ministry Review Board",
                related_scheme_id=scheme_id,
            ),
        )

    if actor_id:
        notify_admin_action_on_request(
            db=db,
            entity_type="SCHEME",
            entity_id=scheme_id,
            entity_title=scheme_title,
            action="approved",
            actor_id=actor_id,
            actor_name=actor_name,
        )

    notify_scheme_published(db, scheme_id, scheme_title, ministry=ministry)


def notify_scheme_rejected(
    db: Session,
    scheme_id: int,
    scheme_title: str,
    creator_id: int,
    reason: str | None = None,
    actor_id: int | None = None,
    actor_name: str | None = None,
) -> None:
    (
        "An administrator rejected a scheme. No public notification "
        "is emitted."
    )
    reason_text = f" Reason: {reason}" if reason else ""

    if creator_id and creator_id != actor_id:
        dispatch_notification(
            db,
            NotificationCreate(
                user_id=creator_id,
                title="Scheme Rejected",
                message=(
                    f'Your scheme "{scheme_title}" was rejected.{reason_text}'
                ),
                notification_type="SCHEME_REJECTED",
                priority=tax.PRIORITY_APPROVAL_RESULT.value,
                channel="IN_APP",
                action_url=f"/schemes/{scheme_id}",
                entity_type="SCHEME",
                entity_id=scheme_id,
                source_name=actor_name or "Ministry Review Board",
                related_scheme_id=scheme_id,
            ),
        )

    if actor_id:
        notify_admin_action_on_request(
            db=db,
            entity_type="SCHEME",
            entity_id=scheme_id,
            entity_title=scheme_title,
            action="rejected",
            actor_id=actor_id,
            actor_name=actor_name,
            reason=reason,
        )


def notify_scheme_delete_requested(
    db: Session,
    scheme_id: int,
    scheme_title: str,
    requested_by_id: int,
    reason: str | None = None,
) -> None:
    """Notify administrators when deletion of a scheme is requested."""
    _notify_admins_of_request(
        db=db,
        notification_type="SCHEME_DELETE_REQUEST",
        title="Scheme Delete Request",
        message=(
            f"Government Official "
            f"{_display_name(_user_by_id(db, requested_by_id))}"
            f" requested deletion of "
            f'"{scheme_title}".'
            + (f" Reason: {reason}" if reason else "")
        ),
        entity_type="SCHEME",
        entity_id=scheme_id,
        requester=_user_by_id(db, requested_by_id),
        priority=tax.PRIORITY_ADMIN_APPROVAL_REQUEST.value,
        source_name="Scheme Administration",
    )


def notify_scheme_archive_requested(
    db: Session,
    scheme_id: int,
    scheme_title: str,
    requested_by_id: int,
    reason: str | None = None,
) -> None:
    """Notify administrators when archival of a scheme is requested."""
    _notify_admins_of_request(
        db=db,
        notification_type="SCHEME_ARCHIVE_REQUEST",
        title="Scheme Archive Request",
        message=(
            f"Government Official "
            f"{_display_name(_user_by_id(db, requested_by_id))}"
            f" requested archival of "
            f'"{scheme_title}".'
            + (f" Reason: {reason}" if reason else "")
        ),
        entity_type="SCHEME",
        entity_id=scheme_id,
        requester=_user_by_id(db, requested_by_id),
        priority=tax.PRIORITY_APPROVAL_RESULT.value,
        source_name="Scheme Administration",
    )


def notify_request_decision(
    db: Session,
    user_id: int,
    request_type: str,
    decision: str,
    entity_type: str,
    entity_id: int,
    entity_title: str,
    reason: str | None = None,
    decision_by: str | None = None,
    actor_id: int | None = None,
    link_entity: bool = True,
) -> Notification | None:
    """Report an archive/delete decision to the requester.

    Also informs the other administrators, so a team of three all sees that
    Admin 2 has already cleared the queue item.

    Pass ``link_entity=False`` for a permanent-deletion approval, which runs
    after the row is gone, so the ``related_policy_id`` / ``related_scheme_id``
    foreign keys are left NULL instead of dangling.
    """
    is_approved = decision.upper() == "APPROVED"
    notif_type = "REQUEST_APPROVED" if is_approved else "REQUEST_REJECTED"
    title = f"{request_type} {'Approved' if is_approved else 'Rejected'}"
    reason_str = f" Reason: {reason}" if reason else ""
    by_str = f" by {decision_by}" if decision_by else ""
    action = "approved" if is_approved else "rejected"
    msg = (
        f'Your {request_type.lower()} request for {entity_type.lower()} '
        f'"{entity_title}" has been {action}{by_str}.{reason_str}'
    )

    action_url = (
        f"/policies/{entity_id}"
        if entity_type == "POLICY"
        else f"/schemes/{entity_id}"
    )

    created = None
    if user_id != actor_id:
        created = dispatch_notification(
            db,
            NotificationCreate(
                user_id=user_id,
                title=title,
                message=msg,
                notification_type=notif_type,
                priority=tax.PRIORITY_APPROVAL_RESULT.value,
                channel="IN_APP",
                action_url=action_url,
                entity_type=entity_type,
                entity_id=entity_id,
                source_name=decision_by or "Administrative Review Board",
                related_policy_id=(
                    entity_id
                    if (link_entity and entity_type == "POLICY")
                    else None
                ),
                related_scheme_id=(
                    entity_id
                    if (link_entity and entity_type == "SCHEME")
                    else None
                ),
            ),
        )

    if actor_id:
        notify_admin_action_on_request(
            db=db,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_title=entity_title,
            action=action,
            actor_id=actor_id,
            actor_name=decision_by,
            reason=reason,
            link_entity=link_entity,
        )

    return created


# ============================================================
# PUBLIC POLICY / SCHEME LIFECYCLE
# ============================================================


def _public_live_status() -> tuple[str, ...]:
    """Statuses that represent content the public is allowed to be told about.

    ``APPROVED`` is the only public status, matching the canonical vocabulary
    enforced by the ``policies_status_canonical_check`` /
    ``schemes_status_canonical_check`` constraints and by ``PolicyStatus`` /
    ``SchemeStatus`` in the response schemas. Nothing writes ``PUBLISHED`` or
    ``ACTIVE`` to either table.
    """
    return ("APPROVED",)


def notify_policy_published(
    db: Session,
    policy_id: int,
    policy_title: str,
    ministry: str | None = None,
) -> list[Notification]:
    """Tell Citizen / Researcher / Organization that a policy went public.

    Refuses to fire for anything that is not in a public status, so a draft or
    a rejected policy can never reach the public feed.
    """
    policy = db.query(Policy).filter(Policy.policy_id == policy_id).first()
    if (
        policy is not None
        and (policy.status or "").upper() not in _public_live_status()
    ):
        logger.info(
            "Skipping NEW_POLICY for policy %s: status=%s is not public",
            policy_id,
            policy.status,
        )
        return []

    recipients = public_audience(db, "NEW_POLICY")
    if not recipients:
        return []

    ministry_name = (
        ministry or (policy.ministry if policy else None) or "the Government"
    )
    return dispatch_to_users(
        db,
        [
            NotificationCreate(
                user_id=recipient.user_id,
                title="New Policy Published",
                message=(
                    f'New policy "{policy_title}" is now available, '
                    f"published by {ministry_name}."
                ),
                notification_type="NEW_POLICY",
                priority=tax.PRIORITY_NEW_PUBLICATION.value,
                channel="IN_APP",
                action_url=f"/policies/{policy_id}",
                entity_type="POLICY",
                entity_id=policy_id,
                source_name=ministry_name,
                related_policy_id=policy_id,
            )
            for recipient in recipients
        ],
    )


def notify_policy_updated(
    db: Session,
    policy_id: int,
    policy_title: str | None = None,
    change_summary: str | None = None,
) -> list[Notification]:
    """Tell the public that an already published policy changed."""
    policy = db.query(Policy).filter(Policy.policy_id == policy_id).first()
    if policy is None:
        return []
    if (policy.status or "").upper() not in _public_live_status():
        logger.info(
            "Skipping POLICY_UPDATED for policy %s: status=%s is not public",
            policy_id,
            policy.status,
        )
        return []

    title = policy_title or policy.title
    recipients = public_audience(db, "POLICY_UPDATED")
    if not recipients:
        return []

    detail = f" {change_summary}" if change_summary else ""
    return dispatch_to_users(
        db,
        [
            NotificationCreate(
                user_id=recipient.user_id,
                title="Policy Updated",
                message=f'The policy "{title}" has been updated.{detail}',
                notification_type="POLICY_UPDATED",
                priority=tax.PRIORITY_UPDATE.value,
                channel="IN_APP",
                action_url=f"/policies/{policy_id}",
                entity_type="POLICY",
                entity_id=policy_id,
                source_name=policy.ministry or "Government Gazette",
                related_policy_id=policy_id,
            )
            for recipient in recipients
        ],
    )


def notify_scheme_published(
    db: Session,
    scheme_id: int,
    scheme_title: str,
    ministry: str | None = None,
) -> list[Notification]:
    """Tell Citizen / Researcher / Organization that a scheme went public."""
    scheme = db.query(Scheme).filter(Scheme.scheme_id == scheme_id).first()
    if (
        scheme is not None
        and (scheme.status or "").upper() not in _public_live_status()
    ):
        logger.info(
            "Skipping NEW_SCHEME for scheme %s: status=%s is not public",
            scheme_id,
            scheme.status,
        )
        return []

    recipients = public_audience(db, "NEW_SCHEME")
    if not recipients:
        return []

    ministry_name = (
        ministry or (scheme.ministry if scheme else None) or "the Government"
    )
    return dispatch_to_users(
        db,
        [
            NotificationCreate(
                user_id=recipient.user_id,
                title="New Scheme Available",
                message=(
                    f'A new government scheme "{scheme_title}" is now '
                    f"available from {ministry_name}."
                ),
                notification_type="NEW_SCHEME",
                priority=tax.PRIORITY_NEW_PUBLICATION.value,
                channel="IN_APP",
                action_url=f"/schemes/{scheme_id}",
                entity_type="SCHEME",
                entity_id=scheme_id,
                source_name=ministry_name,
                related_scheme_id=scheme_id,
            )
            for recipient in recipients
        ],
    )


def notify_scheme_updated(
    db: Session,
    scheme_id: int,
    scheme_title: str,
    ministry: str | None = None,
    action: str = "launched",
    change_summary: str | None = None,
) -> list[Notification]:
    """Tell subscribed public users that a live scheme changed."""
    scheme = db.query(Scheme).filter(Scheme.scheme_id == scheme_id).first()
    if (
        scheme is not None
        and (scheme.status or "").upper() not in _public_live_status()
    ):
        logger.info(
            "Skipping SCHEME_UPDATED for scheme %s: status=%s is not public",
            scheme_id,
            scheme.status,
        )
        return []

    recipients = public_audience(db, "SCHEME_UPDATED")
    if not recipients:
        return []

    launched = action == "launched"
    title = (
        f"New {ministry or 'Public'} Scheme Launched"
        if launched
        else "Scheme Updated"
    )
    message = (
        f'The {ministry or "Government"} has {action} "{scheme_title}". '
        f"Check eligibility criteria and application deadlines."
        if launched
        else f'The scheme "{scheme_title}" has been updated.'
        + (f" {change_summary}" if change_summary else "")
    )

    return dispatch_to_users(
        db,
        [
            NotificationCreate(
                user_id=recipient.user_id,
                title=title,
                message=message,
                notification_type="SCHEME_UPDATED",
                priority=tax.PRIORITY_UPDATE.value,
                channel="IN_APP",
                action_url=f"/schemes/{scheme_id}",
                entity_type="SCHEME",
                entity_id=scheme_id,
                source_name=ministry
                or (scheme.ministry if scheme else None)
                or "National Scheme Portal",
                related_scheme_id=scheme_id,
            )
            for recipient in recipients
        ],
    )


def _recipients_for(
    db: Session,
    notification_type: str,
    target_user_ids: list[int] | None,
) -> list[User]:
    """Public audience, optionally narrowed to an explicit user-id list.

    Preference filtering is applied either way, so an explicit list cannot be
    used to bypass a user's opt-out.
    """
    from app.services.notification_preference_rule_service import (
        resolve_channels_for_user,
    )

    if target_user_ids is None:
        return public_audience(db, notification_type)

    wanted = {int(uid) for uid in target_user_ids}
    if not wanted:
        return []
    candidates = db.query(User).filter(User.user_id.in_(wanted)).all()
    eligible: list[User] = []
    for user in candidates:
        if not user.is_active:
            continue
        if user.user_id not in wanted:
            continue
        channels = resolve_channels_for_user(
            db=db,
            user_id=user.user_id,
            notification_type=notification_type,
        )
        if any(channels.values()):
            eligible.append(user)
    return eligible


def notify_scheme_ending(
    db: Session,
    scheme_id: int,
    scheme_title: str,
    end_date: datetime,
    days_remaining: int,
    target_user_ids: list[int] | None = None,
) -> list[Notification]:
    """Warn the public that a scheme's application window is closing.

    ``target_user_ids`` lets a scheduled pass restrict the fan-out to users who
    have not already been told about this particular milestone.
    """
    recipients = _recipients_for(db, "SCHEME_ENDING", target_user_ids)
    if not recipients:
        return []

    when = end_date.strftime("%d %B %Y")
    return dispatch_to_users(
        db,
        [
            NotificationCreate(
                user_id=recipient.user_id,
                title="Scheme Ending Soon",
                message=(
                    f'The scheme "{scheme_title}" will end on {when} '
                    f"({days_remaining} day"
                    f"{'s' if days_remaining != 1 else ''} remaining)."
                ),
                notification_type="SCHEME_ENDING",
                priority=tax.PRIORITY_ENDING_SOON.value,
                channel="IN_APP",
                action_url=f"/schemes/{scheme_id}",
                entity_type="SCHEME",
                entity_id=scheme_id,
                source_name="National Scheme Portal",
                related_scheme_id=scheme_id,
            )
            for recipient in recipients
        ],
    )


def notify_scheme_ended(
    db: Session,
    scheme_id: int,
    scheme_title: str,
    end_date: datetime,
    target_user_ids: list[int] | None = None,
) -> list[Notification]:
    """Tell the public that a scheme's application window has closed.

    ``target_user_ids`` lets a scheduled pass restrict the fan-out to users who
    have not already been told, so the notice is emitted once per user.
    """
    recipients = _recipients_for(db, "SCHEME_ENDED", target_user_ids)
    if not recipients:
        return []

    when = end_date.strftime("%d %B %Y")
    return dispatch_to_users(
        db,
        [
            NotificationCreate(
                user_id=recipient.user_id,
                title="Scheme Ended",
                message=(
                    f'The scheme "{scheme_title}" closed on {when} and is no '
                    f"longer accepting applications."
                ),
                notification_type="SCHEME_ENDED",
                priority=tax.PRIORITY_UPDATE.value,
                channel="IN_APP",
                action_url=f"/schemes/{scheme_id}",
                entity_type="SCHEME",
                entity_id=scheme_id,
                source_name="National Scheme Portal",
                related_scheme_id=scheme_id,
            )
            for recipient in recipients
        ],
    )


def notify_application_submitted(
    db: Session,
    user_id: int,
    application_id: int,
    scheme_name: str,
) -> Notification | None:
    """Notify citizen/applicant when application is submitted."""
    return dispatch_notification(
        db,
        NotificationCreate(
            user_id=user_id,
            title="Application Submitted Successfully",
            message=(
                f'Your application for "{scheme_name}" has been received '
                f"and assigned ID #{application_id}."
            ),
            notification_type="APPLICATION_SUBMITTED",
            priority=tax.PRIORITY_UPDATE.value,
            channel="IN_APP",
            action_url=f"/dashboard/citizen",
            entity_type="APPLICATION",
            entity_id=application_id,
            source_name="Direct Benefit Transfer Directorate",
        ),
    )


def notify_application_updated(
    db: Session,
    user_id: int,
    application_id: int,
    scheme_name: str,
    status: str,
    remarks: str | None = None,
) -> Notification | None:
    """Notify applicant when scheme application status updates."""
    clean_status = status.replace("_", " ").title()
    title = f"Application Status: {clean_status}"
    msg = (
        f'Your application for "{scheme_name}" is now {clean_status.lower()}.'
    )
    if remarks:
        msg += f" Remarks: {remarks}"

    notif_type = "APPLICATION_UPDATE"
    if status.upper() in ("APPROVED", "SANCTIONED"):
        notif_type = "APPLICATION_APPROVED"
    elif status.upper() in ("REJECTED", "DECLINED"):
        notif_type = "APPLICATION_REJECTED"

    return dispatch_notification(
        db,
        NotificationCreate(
            user_id=user_id,
            title=title,
            message=msg,
            notification_type=notif_type,
            priority=tax.PRIORITY_APPROVAL_RESULT.value,
            channel="IN_APP",
            action_url=f"/dashboard/citizen",
            entity_type="APPLICATION",
            entity_id=application_id,
            source_name="Direct Benefit Transfer Directorate",
        ),
    )


def notify_application_approved(
    db: Session,
    user_id: int,
    application_id: int,
    scheme_name: str,
) -> Notification:
    return notify_application_updated(
        db, user_id, application_id, scheme_name, "APPROVED"
    )


def notify_application_rejected(
    db: Session,
    user_id: int,
    application_id: int,
    scheme_name: str,
    reason: str | None = None,
) -> Notification:
    return notify_application_updated(
        db, user_id, application_id, scheme_name, "REJECTED", remarks=reason
    )


def notify_deadline(
    db: Session,
    user_id: int,
    scheme_id: int,
    scheme_title: str,
    deadline_date: str,
    days_remaining: int,
) -> Notification | None:
    (
        "Notify Citizen / Researcher / Organization about upcoming "
        "scheme deadline."
    )
    return dispatch_notification(
        db,
        NotificationCreate(
            user_id=user_id,
            title="Application Deadline Reminder",
            message=(
                f'The application deadline for "{scheme_title}" is '
                f"{deadline_date} ({days_remaining} day"
                f"{'s' if days_remaining != 1 else ''} remaining)."
            ),
            notification_type="DEADLINE_REMINDER",
            priority="HIGH" if days_remaining <= 3 else "MEDIUM",
            channel="IN_APP",
            action_url=f"/schemes/{scheme_id}",
            entity_type="SCHEME",
            entity_id=scheme_id,
            source_name="National Scheme Portal",
            related_scheme_id=scheme_id,
        ),
    )


def notify_feedback_received(
    db: Session,
    feedback_id: int,
    subject: str,
    user_id: int | None = None,
) -> None:
    (
        "Notify ADMINISTRATORS ONLY when new feedback or grievance "
        "is submitted."
    )
    for admin in admin_audience(db, "NEW_FEEDBACK"):
        dispatch_notification(
            db,
            NotificationCreate(
                user_id=admin.user_id,
                title="Citizen Feedback Received",
                message=(
                    f'New citizen feedback submitted regarding "{subject}". '
                    "Please review and provide a response."
                ),
                notification_type="NEW_FEEDBACK",
                priority=tax.PRIORITY_UPDATE.value,
                channel="IN_APP",
                action_url="/dashboard/admin",
                entity_type="FEEDBACK",
                entity_id=feedback_id,
                source_name="Citizen Grievance Cell",
            ),
        )


def notify_feedback_updated(
    db: Session,
    feedback_id: int,
    subject: str,
    user_id: int,
    response_summary: str | None = None,
) -> Notification | None:
    (
        "Notify the citizen who submitted the feedback that an "
        "official response has been posted."
    )
    resp_text = f": {response_summary}" if response_summary else "."
    return dispatch_notification(
        db,
        NotificationCreate(
            user_id=user_id,
            title="Feedback Status Updated",
            message=(
                f'Your inquiry regarding "{subject}" has received an '
                f"official response{resp_text}"
            ),
            notification_type="FEEDBACK_UPDATE",
            priority=tax.PRIORITY_UPDATE.value,
            channel="IN_APP",
            action_url="/notifications",
            entity_type="FEEDBACK",
            entity_id=feedback_id,
            source_name="Public Grievance Redressal",
        ),
    )


def notify_report_completed(
    db: Session,
    user_id: int,
    report_id: int,
    report_title: str,
) -> Notification | None:
    """Notify researcher/analyst that a requested report or export is ready."""
    return dispatch_notification(
        db,
        NotificationCreate(
            user_id=user_id,
            title="Report Generation Completed",
            message=(
                f'Your requested policy intelligence report "{report_title}" '
                "is ready for download."
            ),
            notification_type="REPORT_COMPLETED",
            priority=tax.NotificationPriority.LOW.value,
            channel="IN_APP",
            action_url="/dashboard/researcher",
            entity_type="REPORT",
            entity_id=report_id,
            source_name="PolicyGPT Analytics Engine",
        ),
    )


def notify_new_user(db: Session, new_user: User) -> None:
    """
    When a new user registers:
    1. Notify ADMINISTRATORS of the new user registration.
    2. Send a welcoming SYSTEM_ALERT notification to the new user.
    """
    # 1. Notify Admins
    for admin in admin_audience(db, "NEW_FEEDBACK"):
        dispatch_notification(
            db,
            NotificationCreate(
                user_id=admin.user_id,
                title="New User Registration",
                message=(
                f'{new_user.full_name or "New user"} ({new_user.email}) '
                f"registered as {new_user.role}."
            ),
                notification_type="NEW_USER",
                priority=tax.NotificationPriority.LOW.value,
                channel="IN_APP",
                action_url="/dashboard/admin",
                entity_type="USER",
                entity_id=new_user.user_id,
                source_name="User Management",
            ),
        )

    # 2. Welcome in-app notification for the newly registered user
    dispatch_notification(
        db,
        NotificationCreate(
            user_id=new_user.user_id,
            title="Welcome to PolicyGPT",
            message=(
                f"Welcome, {new_user.full_name or 'Citizen'}! Your "
                f"{new_user.role} account is now active. Explore verified "
                f"policies, public welfare schemes, and receive live updates."
            ),
            notification_type="SYSTEM_ALERT",
            priority=tax.PRIORITY_UPDATE.value,
            channel="IN_APP",
            action_url="/notifications",
            entity_type="USER",
            entity_id=new_user.user_id,
            source_name="PolicyGPT National Portal",
        ),
    )


# ============================================================
# FACADE CLASS FOR SINGLE CONVENIENT IMPORT
# ============================================================


class NotificationService:
    create_notification = staticmethod(create_notification)
    create_bulk_notifications = staticmethod(create_bulk_notifications)
    get_user_notifications = staticmethod(get_user_notifications)
    get_notification_by_id = staticmethod(get_notification_by_id)
    get_unread_count = staticmethod(get_unread_count)
    get_notification_summary = staticmethod(get_notification_summary)
    mark_as_read = staticmethod(mark_notification_read)
    mark_as_unread = staticmethod(mark_notification_unread)
    mark_all_as_read = staticmethod(mark_all_notifications_read)
    delete_notification = staticmethod(delete_notification)

    # Event triggers
    notify_policy_created = staticmethod(notify_policy_created)
    notify_policy_submitted = staticmethod(notify_policy_submitted)
    notify_policy_approved = staticmethod(notify_policy_approved)
    notify_policy_rejected = staticmethod(notify_policy_rejected)
    notify_policy_delete_requested = staticmethod(
        notify_policy_delete_requested
    )
    notify_policy_archive_requested = staticmethod(
        notify_policy_archive_requested
    )
    notify_scheme_created = staticmethod(notify_scheme_created)
    notify_scheme_submitted = staticmethod(notify_scheme_submitted)
    notify_scheme_approved = staticmethod(notify_scheme_approved)
    notify_scheme_rejected = staticmethod(notify_scheme_rejected)
    notify_scheme_delete_requested = staticmethod(
        notify_scheme_delete_requested
    )
    notify_scheme_archive_requested = staticmethod(
        notify_scheme_archive_requested
    )
    notify_request_decision = staticmethod(notify_request_decision)
    notify_scheme_updated = staticmethod(notify_scheme_updated)
    notify_application_submitted = staticmethod(notify_application_submitted)
    notify_application_updated = staticmethod(notify_application_updated)
    notify_application_approved = staticmethod(notify_application_approved)
    notify_application_rejected = staticmethod(notify_application_rejected)
    notify_deadline = staticmethod(notify_deadline)
    notify_feedback_received = staticmethod(notify_feedback_received)
    notify_feedback_updated = staticmethod(notify_feedback_updated)
    notify_report_completed = staticmethod(notify_report_completed)
    notify_new_user = staticmethod(notify_new_user)

    # Public lifecycle events
    notify_policy_published = staticmethod(notify_policy_published)
    notify_policy_updated = staticmethod(notify_policy_updated)
    notify_scheme_published = staticmethod(notify_scheme_published)
    notify_scheme_ending = staticmethod(notify_scheme_ending)
    notify_scheme_ended = staticmethod(notify_scheme_ended)

    # Dispatch helpers
    dispatch_notification = staticmethod(dispatch_notification)
    dispatch_to_users = staticmethod(dispatch_to_users)
    public_audience = staticmethod(public_audience)
    admin_audience = staticmethod(admin_audience)
    notify_admin_action_on_request = staticmethod(
        notify_admin_action_on_request
    )

    # Admin diagnostics
    get_admin_notification_stats = staticmethod(get_admin_notification_stats)
    get_admin_deliveries = staticmethod(get_admin_deliveries)
