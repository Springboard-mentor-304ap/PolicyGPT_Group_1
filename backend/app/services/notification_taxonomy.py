"""Single source of truth for notification taxonomy.

Holds:
  * The canonical category set (spec section 4).
  * The canonical notification-type set, mapped to exactly one category each.
  * Priority normalisation so the legacy ``MEDIUM`` value maps onto ``NORMAL``.
  * Preference groups (the rows rendered by the preferences screen) and the
    role -> allowed-groups matrix used for *backend* enforcement.

Nothing else in the notification module is allowed to hard-code a type string
or invent a category; everything routes through this module.
"""

from __future__ import annotations

from enum import Enum
from typing import Iterable


class NotificationCategory(str, Enum):
    ADMIN_REQUEST = "ADMIN_REQUEST"
    APPROVAL = "APPROVAL"
    POLICY = "POLICY"
    SCHEME = "SCHEME"
    APPLICATION = "APPLICATION"
    DEADLINE = "DEADLINE"
    SYSTEM = "SYSTEM"
    SUPPORT = "SUPPORT"


class NotificationPriority(str, Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    URGENT = "URGENT"


# Priority defaults per the spec. Kept deliberately conservative so that
# HIGH/URGENT stay meaningful.
PRIORITY_ADMIN_APPROVAL_REQUEST = NotificationPriority.HIGH
PRIORITY_APPROVAL_RESULT = NotificationPriority.NORMAL
PRIORITY_NEW_PUBLICATION = NotificationPriority.NORMAL
PRIORITY_UPDATE = NotificationPriority.NORMAL
PRIORITY_ENDING_SOON = NotificationPriority.HIGH
PRIORITY_SYSTEM_CRITICAL = NotificationPriority.URGENT

# The pre-``NORMAL`` vocabulary. ``MEDIUM`` was the old default; it is still
# present in rows written before the rename, so it is normalised on read.
_LEGACY_PRIORITY_ALIASES = {
    "MEDIUM": NotificationPriority.NORMAL.value,
    "WARNING": NotificationPriority.HIGH.value,
    "CRITICAL": NotificationPriority.URGENT.value,
    "INFO": NotificationPriority.LOW.value,
}


def normalize_priority(value: str | None) -> str:
    """Map any historical priority spelling onto the canonical vocabulary."""
    if not value:
        return NotificationPriority.NORMAL.value
    clean = str(value).strip().upper()
    if clean in {p.value for p in NotificationPriority}:
        return clean
    return _LEGACY_PRIORITY_ALIASES.get(
        clean, NotificationPriority.NORMAL.value
    )


# ---------------------------------------------------------------------------
# Notification type -> category
# ---------------------------------------------------------------------------

TYPE_TO_CATEGORY: dict[str, NotificationCategory] = {
    # --- Internal admin requests (Government Official -> Administrator) ------
    "POLICY_APPROVAL_REQUEST": NotificationCategory.ADMIN_REQUEST,
    "POLICY_PENDING_REQUEST": NotificationCategory.ADMIN_REQUEST,
    "POLICY_SUBMITTED": NotificationCategory.ADMIN_REQUEST,
    "POLICY_ARCHIVE_REQUEST": NotificationCategory.ADMIN_REQUEST,
    "POLICY_ARCHIVE_REQUESTED": NotificationCategory.ADMIN_REQUEST,
    "POLICY_DELETE_REQUEST": NotificationCategory.ADMIN_REQUEST,
    "SCHEME_APPROVAL_REQUEST": NotificationCategory.ADMIN_REQUEST,
    "SCHEME_APPROVAL_REQUIRED": NotificationCategory.ADMIN_REQUEST,
    "SCHEME_PENDING_REQUEST": NotificationCategory.ADMIN_REQUEST,
    "SCHEME_SUBMITTED": NotificationCategory.ADMIN_REQUEST,
    "SCHEME_ARCHIVE_REQUEST": NotificationCategory.ADMIN_REQUEST,
    "SCHEME_DELETE_REQUEST": NotificationCategory.ADMIN_REQUEST,
    # Workflow updates broadcast to *other* administrators when one acts.
    "ADMIN_ACTION_UPDATE": NotificationCategory.ADMIN_REQUEST,
    "ADMIN_REQUEST_UPDATED": NotificationCategory.ADMIN_REQUEST,
    # --- Approval decisions (Administrator -> Government Official) -----------
    "POLICY_APPROVED": NotificationCategory.APPROVAL,
    "POLICY_REJECTED": NotificationCategory.APPROVAL,
    "SCHEME_APPROVED": NotificationCategory.APPROVAL,
    "SCHEME_REJECTED": NotificationCategory.APPROVAL,
    "REQUEST_APPROVED": NotificationCategory.APPROVAL,
    "REQUEST_REJECTED": NotificationCategory.APPROVAL,
    # --- Public policy lifecycle (Citizen / Researcher / Organization) ------
    "NEW_POLICY": NotificationCategory.POLICY,
    "POLICY_PUBLISHED": NotificationCategory.POLICY,
    "POLICY_UPDATED": NotificationCategory.POLICY,
    # --- Public scheme lifecycle --------------------------------------------
    "NEW_SCHEME": NotificationCategory.SCHEME,
    "SCHEME_PUBLISHED": NotificationCategory.SCHEME,
    "SCHEME_UPDATED": NotificationCategory.SCHEME,
    # --- Deadlines / expiry -------------------------------------------------
    "SCHEME_ENDING": NotificationCategory.DEADLINE,
    "SCHEME_ENDED": NotificationCategory.DEADLINE,
    "DEADLINE_REMINDER": NotificationCategory.DEADLINE,
    # --- Applications -------------------------------------------------------
    "APPLICATION_UPDATE": NotificationCategory.APPLICATION,
    "APPLICATION_SUBMITTED": NotificationCategory.APPLICATION,
    "APPLICATION_APPROVED": NotificationCategory.APPLICATION,
    "APPLICATION_REJECTED": NotificationCategory.APPLICATION,
    # --- Support ------------------------------------------------------------
    "NEW_FEEDBACK": NotificationCategory.SUPPORT,
    "ISSUE_REPORTED": NotificationCategory.SUPPORT,
    "FEEDBACK_ESCALATED": NotificationCategory.SUPPORT,
    "FEEDBACK_RESOLVED": NotificationCategory.SUPPORT,
    "CITIZEN_FEEDBACK": NotificationCategory.SUPPORT,
    "FEEDBACK_UPDATE": NotificationCategory.SUPPORT,
    "SUPPORT_UPDATE": NotificationCategory.SUPPORT,
    # --- System / platform --------------------------------------------------
    "SYSTEM_ALERT": NotificationCategory.SYSTEM,
    "BACKGROUND_JOB_FAILURE": NotificationCategory.SYSTEM,
    "API_FAILURE": NotificationCategory.SYSTEM,
    "DATABASE_ALERT": NotificationCategory.SYSTEM,
    "SECURITY_ALERT": NotificationCategory.SYSTEM,
    "EMAIL_DELIVERY_FAILURE": NotificationCategory.SYSTEM,
    "SMS_DELIVERY_FAILURE": NotificationCategory.SYSTEM,
    "EMAIL_BOUNCE": NotificationCategory.SYSTEM,
    "SMS_FAILURE": NotificationCategory.SYSTEM,
    "NOTIFICATION_DELIVERY_FAILURE": NotificationCategory.SYSTEM,
    "NEW_USER": NotificationCategory.SYSTEM,
    "USER_ROLE_CHANGE": NotificationCategory.SYSTEM,
    "USER_STATUS_CHANGE": NotificationCategory.SYSTEM,
    "GOVERNMENT_ANNOUNCEMENT": NotificationCategory.SYSTEM,
    "DEPARTMENT_ALERT": NotificationCategory.SYSTEM,
    "REGULATORY_UPDATE": NotificationCategory.SYSTEM,
    "RESEARCH_REPORT": NotificationCategory.SYSTEM,
    "SAVED_SEARCH_ALERT": NotificationCategory.SYSTEM,
    "REPORT_COMPLETED": NotificationCategory.SYSTEM,
}


def resolve_category(notification_type: str | None) -> str:
    """Return the canonical category for a notification type.

    Unknown types degrade to ``SYSTEM`` rather than raising, so that a new
    producer can never break notification delivery.
    """
    if not notification_type:
        return NotificationCategory.SYSTEM.value
    entry = TYPE_TO_CATEGORY.get(str(notification_type).strip().upper())
    return entry.value if entry else NotificationCategory.SYSTEM.value


def known_types() -> list[str]:
    return sorted(TYPE_TO_CATEGORY.keys())


# ---------------------------------------------------------------------------
# Role visibility
#
# These are written out explicitly rather than derived from categories: the
# pre-existing sets are a deliberate product decision
# (e.g. only FEEDBACK_UPDATE
# reaches public users, never the other feedback types) and deriving them would
# silently widen who sees what. Each set is the ORIGINAL membership plus the
# types added by this change, and nothing else.
# ---------------------------------------------------------------------------

PUBLIC_ROLES = ("CITIZEN", "RESEARCHER", "ORGANIZATION")

# Requests awaiting an administrator, plus platform/user administration.
ADMIN_NOTIFICATION_TYPES: frozenset[str] = frozenset(
    {
        # approval / archive / delete requests
        "POLICY_PENDING_REQUEST",
        "POLICY_APPROVAL_REQUEST",
        "POLICY_DELETE_REQUEST",
        "POLICY_ARCHIVE_REQUEST",
        "POLICY_SUBMITTED",
        "POLICY_ARCHIVE_REQUESTED",
        "SCHEME_PENDING_REQUEST",
        "SCHEME_APPROVAL_REQUEST",
        "SCHEME_DELETE_REQUEST",
        "SCHEME_ARCHIVE_REQUEST",
        "SCHEME_SUBMITTED",
        "SCHEME_APPROVAL_REQUIRED",
        # NEW: another administrator acted on a request
        "ADMIN_ACTION_UPDATE",
        "ADMIN_REQUEST_UPDATED",
        # user administration
        "NEW_USER",
        "USER_ROLE_CHANGE",
        "USER_STATUS_CHANGE",
        # support queue
        "NEW_FEEDBACK",
        "ISSUE_REPORTED",
        "FEEDBACK_ESCALATED",
        "FEEDBACK_RESOLVED",
        "CITIZEN_FEEDBACK",
        "FEEDBACK_UPDATE",
        "SUPPORT_UPDATE",
        # platform health
        "SYSTEM_ALERT",
        "BACKGROUND_JOB_FAILURE",
        "API_FAILURE",
        "DATABASE_ALERT",
        "SECURITY_ALERT",
        "EMAIL_DELIVERY_FAILURE",
        "SMS_DELIVERY_FAILURE",
        "EMAIL_BOUNCE",
        "SMS_FAILURE",
        "NOTIFICATION_DELIVERY_FAILURE",
    }
)

# Decisions made by an administrator on a government official's submission.
GOVT_NOTIFICATION_TYPES: frozenset[str] = frozenset(
    {
        "POLICY_APPROVED",
        "POLICY_REJECTED",
        "SCHEME_APPROVED",
        "SCHEME_REJECTED",
        "REQUEST_APPROVED",
        "REQUEST_REJECTED",
        "NEW_POLICY",
        "NEW_SCHEME",
        "POLICY_UPDATE",
        "SCHEME_UPDATE",
        "FEEDBACK_UPDATE",
        "SYSTEM_ALERT",
        "GOVERNMENT_ANNOUNCEMENT",
        "DEPARTMENT_ALERT",
        # NEW: public lifecycle events a government official may follow
        "POLICY_PUBLISHED",
        "POLICY_UPDATED",
        "SCHEME_PUBLISHED",
        "SCHEME_ENDING",
        "SCHEME_ENDED",
    }
)

# Public information for Citizen / Researcher / Organization. Deliberately
# excludes the other feedback types and the platform alert types.
PUBLIC_NOTIFICATION_TYPES: frozenset[str] = frozenset(
    {
        "NEW_POLICY",
        "POLICY_UPDATE",
        "NEW_SCHEME",
        "SCHEME_UPDATE",
        "DEADLINE_REMINDER",
        "APPLICATION_UPDATE",
        "APPLICATION_SUBMITTED",
        "APPLICATION_APPROVED",
        "APPLICATION_REJECTED",
        "RESEARCH_REPORT",
        "REPORT_COMPLETED",
        "SAVED_SEARCH_ALERT",
        "FEEDBACK_UPDATE",
        "SYSTEM_ALERT",
        "GOVERNMENT_ANNOUNCEMENT",
        "DEPARTMENT_ALERT",
        "NEW_USER",
        # NEW: public lifecycle events
        "POLICY_PUBLISHED",
        "POLICY_UPDATED",
        "SCHEME_PUBLISHED",
        "SCHEME_ENDING",
        "SCHEME_ENDED",
    }
)


# Internal workflow types that must never reach public roles (spec section 47).
INTERNAL_ONLY_TYPES: frozenset[str] = frozenset(
    t
    for t, c in TYPE_TO_CATEGORY.items()
    if c
    in (
        NotificationCategory.ADMIN_REQUEST,
        NotificationCategory.APPROVAL,
    )
)


def is_internal_only(notification_type: str | None) -> bool:
    return str(notification_type or "").strip().upper() in INTERNAL_ONLY_TYPES


# ---------------------------------------------------------------------------
# Preference groups
#
# A group is one row in the preferences screen. `types` is what the
# per-type matrix rows are generated from; `default_channels` is the
# role-agnostic starting point.
# ---------------------------------------------------------------------------


class PreferenceGroup:
    __slots__ = ("key", "label", "description",
                 "types", "section", "default_channels")

    def __init__(
        self,
        key: str,
        label: str,
        description: str,
        types: Iterable[str],
        section: str,
        default_channels: dict[str, bool] | None = None,
    ) -> None:
        self.key = key
        self.label = label
        self.description = description
        self.types = tuple(types)
        self.section = section
        self.default_channels = default_channels or {
            "in_app": True,
            "email": True,
            "sms": False,
        }

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "description": self.description,
            "section": self.section,
            "types": list(self.types),
            "default_channels": dict(self.default_channels),
        }


POLICY_AND_SCHEME_SECTION = "policy_scheme"
APPROVAL_SECTION = "approval"
APPLICATION_SECTION = "application"
ADMIN_SECTION = "admin"
SYSTEM_SECTION = "system"
SUPPORT_SECTION = "support"


PREFERENCE_GROUPS: list[PreferenceGroup] = [
    # --- Public policy lifecycle (Citizen / Researcher / Organization) ------
    PreferenceGroup(
        key="new_policy",
        label="New Policy Alerts",
        description=(
            "Receive notifications when new government policies "
            "are published.",
        ),
        types=("NEW_POLICY", "POLICY_PUBLISHED"),
        section=POLICY_AND_SCHEME_SECTION,
    ),
    PreferenceGroup(
        key="policy_updates",
        label="Policy Updates",
        description=(
            "Receive notifications when published policies "
            "are updated.",
        ),
        types=("POLICY_UPDATED",),
        section=POLICY_AND_SCHEME_SECTION,
    ),
    # --- Public scheme lifecycle --------------------------------------------
    PreferenceGroup(
        key="new_scheme",
        label="New Scheme Alerts",
        description=(
            "Receive notifications when new government schemes "
            "are launched.",
        ),
        types=("NEW_SCHEME", "SCHEME_PUBLISHED"),
        section=POLICY_AND_SCHEME_SECTION,
    ),
    PreferenceGroup(
        key="scheme_updates",
        label="Scheme Updates",
        description=(
            "Receive notifications when published schemes "
            "are updated.",
        ),
        types=("SCHEME_UPDATED",),
        section=POLICY_AND_SCHEME_SECTION,
    ),
    # --- Deadlines / Expiry -------------------------------------------------
    PreferenceGroup(
        key="deadline_reminders",
        label="Scheme Deadline Alerts",
        description=(
            "Receive reminders when relevant scheme deadlines "
            "are approaching.",
        ),
        types=("DEADLINE_REMINDER", "SCHEME_ENDING"),
        section=POLICY_AND_SCHEME_SECTION,
        default_channels={"in_app": True, "email": True, "sms": False},
    ),
    PreferenceGroup(
        key="scheme_ended",
        label="Scheme Ended Notices",
        description=(
            "Receive notifications when schemes have reached their "
            "application deadline.",
        ),
        types=("SCHEME_ENDED",),
        section=POLICY_AND_SCHEME_SECTION,
        default_channels={"in_app": True, "email": True, "sms": False},
    ),
    # --- Government Official Approval Results -------------------------------
    PreferenceGroup(
        key="policy_approval_results",
        label="Policy Approval Results",
        description=(
            "Notifications when your submitted policies are "
            "approved or rejected.",
        ),
        types=("POLICY_APPROVED", "POLICY_REJECTED"),
        section=APPROVAL_SECTION,
    ),
    PreferenceGroup(
        key="scheme_approval_results",
        label="Scheme Approval Results",
        description=(
            "Notifications when your submitted schemes are "
            "approved or rejected.",
        ),
        types=("SCHEME_APPROVED", "SCHEME_REJECTED"),
        section=APPROVAL_SECTION,
    ),
    PreferenceGroup(
        key="request_approval_results",
        label="Archive & Delete Request Results",
        description=(
            "Notifications when your archive or deletion requests "
            "are approved or rejected.",
        ),
        types=("REQUEST_APPROVED", "REQUEST_REJECTED"),
        section=APPROVAL_SECTION,
    ),
    # --- Administrator Requests --------------------------------------------
    PreferenceGroup(
        key="policy_requests",
        label="Policy Requests",
        description=(
            "Submissions and approval requests for government "
            "policies.",
        ),
        types=("POLICY_APPROVAL_REQUEST",
               "POLICY_PENDING_REQUEST", "POLICY_SUBMITTED"),
        section=ADMIN_SECTION,
    ),
    PreferenceGroup(
        key="scheme_requests",
        label="Scheme Requests",
        description=(
            "Submissions and approval requests for government "
            "schemes.",
        ),
        types=("SCHEME_APPROVAL_REQUEST", "SCHEME_APPROVAL_REQUIRED",
               "SCHEME_PENDING_REQUEST", "SCHEME_SUBMITTED"),
        section=ADMIN_SECTION,
    ),
    PreferenceGroup(
        key="archive_requests",
        label="Archive Requests",
        description="Requests to archive published policies or schemes.",
        types=("POLICY_ARCHIVE_REQUEST", "POLICY_ARCHIVE_REQUESTED",
               "SCHEME_ARCHIVE_REQUEST"),
        section=ADMIN_SECTION,
    ),
    PreferenceGroup(
        key="delete_requests",
        label="Delete Requests",
        description=(
            "Requests to delete policies or schemes from "
            "the repository.",
        ),
        types=("POLICY_DELETE_REQUEST", "SCHEME_DELETE_REQUEST"),
        section=ADMIN_SECTION,
    ),
    PreferenceGroup(
        key="admin_action_updates",
        label="Other Administrator Updates",
        description=(
            "Workflow updates when another administrator reviews, "
            "approves, or rejects requests.",
        ),
        types=("ADMIN_ACTION_UPDATE", "ADMIN_REQUEST_UPDATED"),
        section=ADMIN_SECTION,
    ),
    PreferenceGroup(
        key="user_administration",
        label="User Administration",
        description=(
            "New user registrations, role modifications, and "
            "account status updates.",
        ),
        types=("NEW_USER", "USER_ROLE_CHANGE", "USER_STATUS_CHANGE"),
        section=ADMIN_SECTION,
    ),
    # --- Applications --------------------------------------------------------
    PreferenceGroup(
        key="application_updates",
        label="Application Updates",
        description=(
            "Status changes and updates for scheme applications "
            "you have submitted.",
        ),
        types=(
            "APPLICATION_UPDATE",
            "APPLICATION_SUBMITTED",
            "APPLICATION_APPROVED",
            "APPLICATION_REJECTED",
        ),
        section=APPLICATION_SECTION,
    ),
    # --- Research / Regulatory Reports -------------------------------------
    PreferenceGroup(
        key="research_reports",
        label="Research & Regulatory Updates",
        description=(
            "Regulatory frameworks, analytical reports, and saved "
            "search intelligence alerts.",
        ),
        types=("REGULATORY_UPDATE", "RESEARCH_REPORT",
               "REPORT_COMPLETED", "SAVED_SEARCH_ALERT"),
        section=POLICY_AND_SCHEME_SECTION,
    ),
    # --- System Alerts -----------------------------------------------------
    PreferenceGroup(
        key="system_alerts",
        label="System Alerts",
        description=(
            "Platform health events, maintenance notices, and "
            "delivery service monitoring.",
        ),
        types=(
            "SYSTEM_ALERT",
            "BACKGROUND_JOB_FAILURE",
            "API_FAILURE",
            "DATABASE_ALERT",
            "SECURITY_ALERT",
            "EMAIL_DELIVERY_FAILURE",
            "SMS_DELIVERY_FAILURE",
            "EMAIL_BOUNCE",
            "SMS_FAILURE",
            "NOTIFICATION_DELIVERY_FAILURE",
            "GOVERNMENT_ANNOUNCEMENT",
            "DEPARTMENT_ALERT",
        ),
        section=SYSTEM_SECTION,
        default_channels={"in_app": True, "email": True, "sms": False},
    ),
    # --- Support / Feedback ------------------------------------------------
    PreferenceGroup(
        key="support_updates",
        label="Support & Feedback",
        description=(
            "Feedback reports, user inquiries, ticket escalations, "
            "and resolution updates.",
        ),
        types=(
            "NEW_FEEDBACK",
            "ISSUE_REPORTED",
            "FEEDBACK_ESCALATED",
            "FEEDBACK_RESOLVED",
            "CITIZEN_FEEDBACK",
            "FEEDBACK_UPDATE",
            "SUPPORT_UPDATE",
        ),
        section=SUPPORT_SECTION,
    ),
]

GROUP_BY_KEY: dict[str, PreferenceGroup] = {
    g.key: g for g in PREFERENCE_GROUPS}

# A notification type with no explicit group still needs a channel decision.
# Grouping by category keeps behaviour predictable for future types.
_TYPE_TO_GROUP: dict[str, str] = {}
for _group in PREFERENCE_GROUPS:
    for _t in _group.types:
        _TYPE_TO_GROUP.setdefault(_t, _group.key)


def group_key_for_type(notification_type: str | None) -> str:
    key = _TYPE_TO_GROUP.get(str(notification_type or "").strip().upper())
    if key:
        return key
    category = resolve_category(notification_type)
    fallback = {
        NotificationCategory.ADMIN_REQUEST.value: "policy_requests",
        NotificationCategory.APPROVAL.value: "policy_approval_results",
        NotificationCategory.POLICY.value: "new_policy",
        NotificationCategory.SCHEME.value: "new_scheme",
        NotificationCategory.DEADLINE.value: "deadline_reminders",
        NotificationCategory.APPLICATION.value: "application_updates",
        NotificationCategory.SUPPORT.value: "support_updates",
        NotificationCategory.SYSTEM.value: "system_alerts",
    }
    return fallback[category]


# ---------------------------------------------------------------------------
# Role -> visible preference groups. Enforced on the backend; the frontend
# merely mirrors it.
# ---------------------------------------------------------------------------

ROLE_PREFERENCE_GROUPS: dict[str, tuple[str, ...]] = {
    "ADMIN": (
        "policy_requests",
        "scheme_requests",
        "archive_requests",
        "delete_requests",
        "admin_action_updates",
        "user_administration",
        "system_alerts",
        "support_updates",
    ),
    "GOVERNMENT_OFFICIAL": (
        "policy_approval_results",
        "scheme_approval_results",
        "request_approval_results",
        "policy_updates",
        "scheme_updates",
        "system_alerts",
    ),
    "CITIZEN": (
        "new_policy",
        "policy_updates",
        "new_scheme",
        "scheme_updates",
        "deadline_reminders",
        "scheme_ended",
        "application_updates",
        "system_alerts",
    ),
    "RESEARCHER": (
        "new_policy",
        "policy_updates",
        "new_scheme",
        "scheme_updates",
        "deadline_reminders",
        "scheme_ended",
        "research_reports",
        "system_alerts",
    ),
    "ORGANIZATION": (
        "new_policy",
        "policy_updates",
        "new_scheme",
        "scheme_updates",
        "deadline_reminders",
        "scheme_ended",
        "application_updates",
        "system_alerts",
    ),
}


def allowed_group_keys(canonical_role: str) -> tuple[str, ...]:
    return ROLE_PREFERENCE_GROUPS.get(canonical_role, ())


def groups_for_role(canonical_role: str) -> list[PreferenceGroup]:
    allowed = set(allowed_group_keys(canonical_role))
    return [g for g in PREFERENCE_GROUPS if g.key in allowed]


def role_can_configure_type(
    canonical_role: str, notification_type: str
) -> bool:
    """Backend guard: may this role write a per-type rule for this type?"""
    group_key = group_key_for_type(notification_type)
    if group_key in set(allowed_group_keys(canonical_role)):
        return True
    if canonical_role == "ADMIN" and is_internal_only(notification_type):
        return True
    return False
