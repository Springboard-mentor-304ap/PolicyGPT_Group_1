"""Effective channel resolution for notifications.

Resolution order, most specific first:

  1. Global master switches on ``notification_preferences``
     (``in_app_enabled`` / ``email_enabled`` / ``sms_enabled``). A channel
     that is globally off can never be used, whatever the per-type rule says.
  2. The pre-existing topical booleans (``policy_alerts``, ``scheme_updates``,
     ``deadline_reminders``, ...). These keep working exactly as before, so
     turning one off still silences its subject area.
  3. The per-type rule row in ``notification_preference_rules``, if present.
  4. Otherwise the group's default channels from the taxonomy.

A rule can only ever narrow the group default; it cannot re-enable a channel
that a master switch or topical flag has already turned off. This keeps the
old preferences meaningful while giving the preferences screen true per-type
granularity.
"""

from __future__ import annotations

from datetime import datetime
from typing import Iterable

from sqlalchemy.orm import Session

from app.models.notification_preference import NotificationPreference
from app.models.notification_preference_rule import NotificationPreferenceRule
from app.services import notification_taxonomy as tax


CHANNELS = ("in_app", "email", "sms")


def _now() -> datetime:
    return datetime.now()


# ---------------------------------------------------------------------------
# Topical flag -> preference group keys
# ---------------------------------------------------------------------------

_TOPICAL_FLAG_BY_GROUP: dict[str, tuple[str, ...]] = {
    "new_policy": ("policy_alerts", "regulatory_updates"),
    "policy_updates": ("policy_alerts", "regulatory_updates"),
    "new_scheme": ("scheme_updates",),
    "scheme_updates": ("scheme_updates",),
    "deadline_reminders": ("deadline_reminders",),
    "scheme_ended": ("deadline_reminders",),
    "policy_approval_results": (),
    "scheme_approval_results": (),
    "request_approval_results": (),
    "policy_requests": (),
    "scheme_requests": (),
    "archive_requests": (),
    "delete_requests": (),
    "admin_action_updates": (),
    "user_administration": (),
    "application_updates": ("application_updates",),
    "research_reports": ("regulatory_updates", "research_reports"),
    "system_alerts": ("system_alerts",),
    "support_updates": (),
    # Backwards compatibility keys
    "expiry": ("deadline_reminders",),
    "approval_results": (),
    "request_updates": (),
}


def _topical_flags_enabled(
    preference: NotificationPreference, group_key: str
) -> bool:
    """Any topical flag mapped to this group switched off suppresses
    the group."""
    for flag in _TOPICAL_FLAG_BY_GROUP.get(
        group_key, ()
    ):  # empty tuple -> always on
        if getattr(preference, flag, True) is False:
            return False
    return True


# ---------------------------------------------------------------------------
# Per-type rules
# ---------------------------------------------------------------------------


def get_rule_map(
    db: Session, user_id: int
) -> dict[str, NotificationPreferenceRule]:
    rows = (
        db.query(NotificationPreferenceRule)
        .filter(NotificationPreferenceRule.user_id == user_id)
        .all()
    )
    return {r.notification_type: r for r in rows}


def _find_rule(
    db: Session,
    user_id: int,
    notification_type: str,
) -> NotificationPreferenceRule | None:
    """Locate a rule in the database *or* among rows pending in this session.

    The session is configured with ``autoflush=False``
    (see app/db/database.py), so a plain query cannot see a row that an
    earlier ``upsert_rule`` added but has not flushed. Without this,
    calling ``upsert_rule`` twice for the same type inside one transaction
    - which is exactly what a preferences save with
    a repeated key does - would insert twice and trip
    ``uq_pref_rule_user_type``. Searching ``db.new`` as well makes the
    upsert genuinely idempotent regardless of flush state.
    """
    for candidate in db.new:
        if (
            isinstance(candidate, NotificationPreferenceRule)
            and candidate.user_id == user_id
            and candidate.notification_type == notification_type
        ):
            return candidate

    return (
        db.query(NotificationPreferenceRule)
        .filter(
            NotificationPreferenceRule.user_id == user_id,
            NotificationPreferenceRule.notification_type == notification_type,
        )
        .first()
    )


def upsert_rule(
    db: Session,
    user_id: int,
    notification_type: str,
    in_app_enabled: bool | None = None,
    email_enabled: bool | None = None,
    sms_enabled: bool | None = None,
) -> NotificationPreferenceRule:
    """Create or update a single per-type rule. ``None`` means
    "leave as-is"."""
    notification_type = str(notification_type).strip().upper()
    group_key = tax.group_key_for_type(notification_type)
    group = tax.GROUP_BY_KEY.get(group_key)

    rule = _find_rule(db, user_id, notification_type)
    if rule is None:
        defaults = group.default_channels if group else {
            "in_app": True, "email": True, "sms": False}
        rule = NotificationPreferenceRule(
            user_id=user_id,
            notification_type=notification_type,
            group_key=group_key,
            in_app_enabled=bool(defaults["in_app"]),
            email_enabled=bool(defaults["email"]),
            sms_enabled=bool(defaults["sms"]),
        )
        db.add(rule)
    else:
        rule.group_key = group_key

    if in_app_enabled is not None:
        rule.in_app_enabled = in_app_enabled
    if email_enabled is not None:
        rule.email_enabled = email_enabled
    if sms_enabled is not None:
        rule.sms_enabled = sms_enabled

    rule.updated_at = _now()
    return rule


def replace_rules(
    db: Session,
    user_id: int,
    rules: Iterable[dict],
) -> list[NotificationPreferenceRule]:
    """Bulk upsert used by the preferences screen's save action."""
    saved: list[NotificationPreferenceRule] = []
    for payload in rules:
        notification_type = payload.get("notification_type")
        if not notification_type:
            continue
        saved.append(
            upsert_rule(
                db=db,
                user_id=user_id,
                notification_type=notification_type,
                in_app_enabled=payload.get("in_app_enabled"),
                email_enabled=payload.get("email_enabled"),
                sms_enabled=payload.get("sms_enabled"),
            )
        )
    return saved


def delete_rules(
    db: Session, user_id: int, notification_types: Iterable[str]
) -> int:
    types = [str(t).strip().upper() for t in notification_types if t]
    if not types:
        return 0
    deleted = (
        db.query(NotificationPreferenceRule)
        .filter(
            NotificationPreferenceRule.user_id == user_id,
            NotificationPreferenceRule.notification_type.in_(types),
        )
        .delete(synchronize_session=False)
    )
    return deleted


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------


def resolve_channels(
    notification_type: str,
    preference: NotificationPreference | None,
    rule: NotificationPreferenceRule | None = None,
) -> dict[str, bool]:
    """Final channel decision for one notification type and one user.

    SMS is retired application-wide: SMS is OTP-only (Twilio Verify for
    Forgot Password). The sms channel always resolves to False no matter
    what any stored rule, group default, or preference says, so no
    notification path can ever attempt an SMS send.
    """
    notification_type = str(notification_type or "").strip().upper()
    group_key = tax.group_key_for_type(notification_type)
    group = tax.GROUP_BY_KEY.get(group_key)

    if rule is not None:
        channels = {
            "in_app": bool(rule.in_app_enabled),
            "email": bool(rule.email_enabled),
            "sms": False,
        }
    elif group is not None:
        channels = dict(group.default_channels)
        channels["sms"] = False
    else:
        channels = {"in_app": True, "email": True, "sms": False}

    if preference is None:
        # No stored preference at all: fall back to the global defaults that
        # get_or_create_preferences would have written.
        return channels

    # 2. Topical flags.
    if not _topical_flags_enabled(preference, group_key):
        return {"in_app": False, "email": False, "sms": False}

    # 1. Global master switches gate everything.
    if not preference.in_app_enabled:
        channels["in_app"] = False
    if not preference.email_enabled:
        channels["email"] = False
    if not preference.sms_enabled:
        channels["sms"] = False

    return channels


def resolve_channels_for_user(
    db: Session,
    user_id: int,
    notification_type: str,
    preference: NotificationPreference | None = None,
    rule_map: dict[str, NotificationPreferenceRule] | None = None,
) -> dict[str, bool]:
    if preference is None:
        preference = (
            db.query(NotificationPreference)
            .filter(NotificationPreference.user_id == user_id)
            .first()
        )
    if rule_map is None:
        rule_map = get_rule_map(db, user_id)
    key = str(notification_type or "").strip().upper()
    return resolve_channels(key, preference, rule_map.get(key))


def resolve_in_app_suppressed_types(
    db: Session,
    user_id: int,
    user_role: str,
) -> set[str]:
    """Notification types this user has switched off in-app.

    The notification centre and the unread badge both filter on this set, so a
    notification the user muted never appears in one but not the other.
    """
    preference = (
        db.query(NotificationPreference)
        .filter(NotificationPreference.user_id == user_id)
        .first()
    )
    rule_map = get_rule_map(db, user_id)

    suppressed: set[str] = set()
    for notification_type in tax.known_types():
        channels = resolve_channels(
            notification_type, preference, rule_map.get(notification_type))
        if not channels["in_app"]:
            suppressed.add(notification_type)
    return suppressed


def effective_matrix(
    db: Session,
    user_id: int,
    canonical_role: str,
    preference: NotificationPreference | None = None,
) -> list[dict]:
    """The full per-type matrix for the preferences screen, role-scoped.

    Backend is the authority on which groups a role may see and edit; the
    frontend renders whatever this returns.
    """
    if preference is None:
        from app.services.notification_preference_service import (
            get_or_create_preferences,
        )
        preference = get_or_create_preferences(db, user_id, canonical_role)
    rule_map = get_rule_map(db, user_id)
    allowed = set(tax.allowed_group_keys(canonical_role))

    matrix: list[dict] = []
    for group in tax.PREFERENCE_GROUPS:
        if group.key not in allowed:
            continue
        types_payload = []
        for notification_type in group.types:
            channels = resolve_channels(
                notification_type, preference, rule_map.get(notification_type))
            types_payload.append(
                {
                    "notification_type": notification_type,
                    "in_app_enabled": channels["in_app"],
                    "email_enabled": channels["email"],
                    "sms_enabled": channels["sms"],
                    "explicit": notification_type in rule_map,
                }
            )
        matrix.append(
            {
                **group.as_dict(),
                "types": group.types,
                "type_preferences": types_payload,
            }
        )
    return matrix
