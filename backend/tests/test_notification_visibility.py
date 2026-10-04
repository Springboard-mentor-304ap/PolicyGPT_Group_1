"""Role-based notification enrichment tests (tasks 4-6).

Public roles must only ever see approved, public-facing entity data;
staff rules mirror the policy/scheme detail endpoints. Feedback
enrichment follows the feedback detail ownership rule. No live DB:
real (unsaved) model instances plus prefetch buckets, MagicMock session.
"""

from datetime import date, datetime
from unittest.mock import MagicMock

from app.models.feedback import Feedback
from app.models.notification import Notification
from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.user import User
from app.services import notification_service as ns


def _notif(**over):
    base = dict(
        notification_id=1,
        user_id=7,
        title="New Scheme Available",
        message="A new scheme is available.",
        notification_type="NEW_SCHEME",
        priority="MEDIUM",
        channel="IN_APP",
        action_url=None,
        entity_type=None,
        entity_id=None,
        source_name="Ministry",
        related_policy_id=None,
        related_scheme_id=None,
        is_read=False,
        read_at=None,
        created_at=datetime(2026, 9, 24, 12, 0, 0),
        updated_at=datetime(2026, 9, 24, 12, 0, 0),
        expires_at=None,
        category="SCHEME",
    )
    base.update(over)
    return Notification(**base)


def _policy(**over):
    base = dict(
        policy_id=5,
        title="National Water Policy 2012",
        description="Water for all.",
        category="Water",
        ministry="Ministry of Jal Shakti",
        department="Dept of Water",
        state="Karnataka",
        publication_date=date(2012, 1, 1),
        status="APPROVED",
        benefits=["Benefit A"],
        created_by=4,
        approved_by=1,
        rejection_reason=None,
        delete_reason=None,
        archive_reason=None,
    )
    base.update(over)
    return Policy(**base)


def _scheme(**over):
    base = dict(
        scheme_id=9,
        name="Janani-Shishu Suraksha Karyakram",
        description="Mother and child care.",
        category="Health",
        ministry="Ministry of Health",
        department="Dept of Health",
        state="Karnataka",
        status="APPROVED",
        benefits=["Free care"],
        application_url="https://example.gov.in/apply",
        created_by=4,
        approved_by=1,
        rejection_reason=None,
        delete_reason=None,
        archive_reason=None,
    )
    base.update(over)
    return Scheme(**base)


def _user(user_id, name="Some One"):
    return User(
        user_id=user_id,
        full_name=name,
        email=f"user{user_id}@example.com",
        role="ADMIN",
        is_active=True,
    )


def _chain(result):
    chain = MagicMock()
    chain.filter.return_value = chain
    chain.first.return_value = result
    return chain


# --------------------------------------------------
# Public roles: approved entities, public fields only
# --------------------------------------------------

def test_citizen_approved_policy_public_fields_only():
    policy = _policy()
    prefetch = {"policies": {5: policy},
                "users": {1: _user(1), 4: _user(4, "Creator")}}
    n = _notif(notification_type="NEW_POLICY", entity_type="POLICY",
               entity_id=5, related_policy_id=5)
    data = ns.enrich_notification(MagicMock(), n, prefetch, "CITIZEN", 7)
    assert data["entity_title"] == "National Water Policy 2012"
    assert data["entity_department"] == "Dept of Water"
    assert data["entity_state"] == "Karnataka"
    assert data["entity_published_date"] == "2012-01-01"
    assert data["entity_description"] == "Water for all."
    # Internal-only fields must never reach public roles.
    assert data["entity_status"] is None
    assert data["decision_by_name"] is None
    assert data["decision_date"] is None
    assert data["decision_reason"] is None
    assert data["submitted_by_name"] is None
    assert data["submitted_date"] is None
    # Navigation reference is preserved (detail route 404s if revoked).
    assert data["related_policy_id"] == 5


def test_citizen_draft_policy_fully_withheld():
    policy = _policy(status="DRAFT")
    prefetch = {"policies": {5: policy}}
    n = _notif(notification_type="POLICY_UPDATE", entity_type="POLICY",
               entity_id=5, related_policy_id=5)
    for role in ("CITIZEN", "RESEARCHER", "ORGANIZATION", "GUEST"):
        data = ns.enrich_notification(MagicMock(), n, prefetch, role, 7)
        assert data["entity_title"] is None, role
        assert data["entity_description"] is None, role
        assert data["entity_status"] is None, role
        assert data["decision_reason"] is None, role
        assert data["related_policy_id"] == 5, role


def test_citizen_approved_scheme_public_fields_only():
    scheme = _scheme()
    prefetch = {"schemes": {9: scheme},
                "users": {1: _user(1), 4: _user(4, "Creator")}}
    n = _notif(entity_type="SCHEME", entity_id=9, related_scheme_id=9)
    data = ns.enrich_notification(MagicMock(), n, prefetch, "ORGANIZATION", 7)
    assert data["entity_title"] == "Janani-Shishu Suraksha Karyakram"
    assert data["entity_state"] == "Karnataka"
    assert data["application_url"] == "https://example.gov.in/apply"
    assert data["entity_status"] is None
    assert data["decision_by_name"] is None
    assert data["submitted_by_name"] is None
    assert data["related_scheme_id"] == 9


def test_rejected_scheme_hidden_from_public():
    scheme = _scheme(status="REJECTED", rejection_reason="Not funded")
    prefetch = {"schemes": {9: scheme}}
    n = _notif(notification_type="SCHEME_UPDATE", entity_type="SCHEME",
               entity_id=9, related_scheme_id=9)
    data = ns.enrich_notification(MagicMock(), n, prefetch, "CITIZEN", 7)
    assert data["entity_title"] is None
    assert data["decision_reason"] is None


# --------------------------------------------------
# Staff roles mirror the detail endpoints
# --------------------------------------------------

def test_admin_sees_draft_with_internal_fields():
    policy = _policy(status="DRAFT", rejection_reason="Needs rework")
    prefetch = {"policies": {5: policy},
                "users": {1: _user(1, "Approver"), 4: _user(4, "Creator")}}
    n = _notif(notification_type="POLICY_SUBMITTED", entity_type="POLICY",
               entity_id=5, related_policy_id=5)
    data = ns.enrich_notification(MagicMock(), n, prefetch, "ADMIN", 1)
    assert data["entity_title"] == "National Water Policy 2012"
    assert data["entity_status"] == "DRAFT"
    assert data["decision_reason"] == "Needs rework"
    assert data["decision_by_name"] == "Approver"
    assert data["submitted_by_name"] == "Creator"


def test_official_creator_sees_own_pending_record():
    scheme = _scheme(status="PENDING_APPROVAL")
    prefetch = {"schemes": {9: scheme}}
    n = _notif(notification_type="SCHEME_SUBMITTED", entity_type="SCHEME",
               entity_id=9, related_scheme_id=9)
    data = ns.enrich_notification(
        MagicMock(), n, prefetch, "GOVERNMENT_OFFICIAL", 4)
    assert data["entity_title"] == "Janani-Shishu Suraksha Karyakram"
    assert data["entity_status"] == "PENDING_APPROVAL"


def test_official_non_creator_cannot_see_pending_record():
    scheme = _scheme(status="PENDING_APPROVAL")
    prefetch = {"schemes": {9: scheme}}
    n = _notif(notification_type="SCHEME_SUBMITTED", entity_type="SCHEME",
               entity_id=9, related_scheme_id=9)
    data = ns.enrich_notification(
        MagicMock(), n, prefetch, "GOVERNMENT_OFFICIAL", 999)
    assert data["entity_title"] is None
    assert data["entity_status"] is None


def test_official_sees_approved_record():
    scheme = _scheme(status="APPROVED")
    prefetch = {"schemes": {9: scheme}}
    n = _notif(entity_type="SCHEME", entity_id=9, related_scheme_id=9)
    data = ns.enrich_notification(
        MagicMock(), n, prefetch, "GOVERNMENT_OFFICIAL", 999)
    assert data["entity_title"] == "Janani-Shishu Suraksha Karyakram"


# --------------------------------------------------
# Feedback enrichment follows ownership
# --------------------------------------------------

def _feedback(owner_id=7):
    return Feedback(
        feedback_id=31,
        user_id=owner_id,
        policy_id=None,
        scheme_id=None,
        feedback_type="GRIEVANCE",
        subject="Delay in disbursement",
        message="My application is pending.",
        status="OPEN",
        admin_response="We are reviewing.",
        created_at=datetime(2026, 9, 20, 10, 0, 0),
        updated_at=datetime(2026, 9, 21, 10, 0, 0),
    )


def test_feedback_owner_gets_enriched_record():
    db = MagicMock()
    db.query.return_value = _chain(_feedback(owner_id=7))
    n = _notif(notification_type="FEEDBACK_UPDATE", entity_type="FEEDBACK",
               entity_id=31)
    data = ns.enrich_notification(db, n, None, "CITIZEN", 7)
    assert data["feedback_status"] == "OPEN"
    assert data["feedback_subject"] == "Delay in disbursement"
    assert data["feedback_message"] == "My application is pending."
    assert data["feedback_response"] == "We are reviewing."
    assert data["feedback_created_at"] is not None


def test_feedback_stranger_gets_nothing():
    db = MagicMock()
    db.query.return_value = _chain(_feedback(owner_id=7))
    n = _notif(notification_type="FEEDBACK_UPDATE", entity_type="FEEDBACK",
               entity_id=31)
    data = ns.enrich_notification(db, n, None, "CITIZEN", 12345)
    assert data["feedback_status"] is None
    assert data["feedback_message"] is None
    assert data["feedback_response"] is None


def test_feedback_admin_gets_enriched_record():
    db = MagicMock()
    db.query.return_value = _chain(_feedback(owner_id=7))
    n = _notif(notification_type="NEW_FEEDBACK", entity_type="FEEDBACK",
               entity_id=31)
    data = ns.enrich_notification(db, n, None, "ADMIN", 1)
    assert data["feedback_status"] == "OPEN"
    assert data["feedback_message"] == "My application is pending."


# --------------------------------------------------
# Legacy / edge cases
# --------------------------------------------------

def test_user_entity_withheld_from_public_roles():
    target = _user(9, "Other Person")
    prefetch = {"users": {9: target}}
    n = _notif(notification_type="NEW_USER", entity_type="USER", entity_id=9)
    data = ns.enrich_notification(MagicMock(), n, prefetch, "CITIZEN", 7)
    assert data["entity_title"] is None
    assert data["entity_status"] is None


def test_user_entity_visible_to_admin():
    target = _user(9, "Other Person")
    prefetch = {"users": {9: target}}
    n = _notif(notification_type="NEW_USER", entity_type="USER", entity_id=9)
    data = ns.enrich_notification(MagicMock(), n, prefetch, "ADMIN", 1)
    assert data["entity_title"] == "Other Person"


def test_legacy_notification_without_refs_never_breaks():
    n = _notif(entity_type=None, entity_id=None,
               notification_type="SYSTEM_ALERT")
    data = ns.enrich_notification(MagicMock(), n, None, "CITIZEN", 7)
    assert data["title"] == "New Scheme Available"
    assert data["entity_title"] is None
    assert data["feedback_status"] is None


def test_missing_entity_row_leaves_base_intact():
    db = MagicMock()
    db.query.return_value = _chain(None)
    n = _notif(notification_type="NEW_POLICY", entity_type="POLICY",
               entity_id=424242, related_policy_id=424242)
    data = ns.enrich_notification(db, n, None, "ADMIN", 1)
    assert data["entity_title"] is None
    assert data["related_policy_id"] == 424242
