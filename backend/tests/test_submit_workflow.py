import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from app.models.user import User
from app.models.scheme import Scheme
from app.models.policy import Policy
from app.services.scheme_service import submit_scheme, approve_scheme
from app.services.policy_service import submit_policy, approve_policy


@pytest.fixture
def mock_db():
    db = MagicMock()
    return db


@pytest.fixture
def admin_user():
    return User(
        user_id=1,
        full_name="Admin User",
        email="admin@example.com",
        role="ADMIN",
        is_active=True,
    )


@pytest.fixture
def gov_user_creator():
    return User(
        user_id=2,
        full_name="Gov Official Creator",
        email="gov2@example.com",
        role="GOVERNMENT_OFFICIAL",
        is_active=True,
    )


@pytest.fixture
def gov_user_other():
    return User(
        user_id=3,
        full_name="Gov Official Other",
        email="gov3@example.com",
        role="GOVERNMENT_OFFICIAL",
        is_active=True,
    )


# ============================================================
# SCHEME SUBMISSION & APPROVAL WORKFLOW TESTS
# ============================================================


def test_submit_scheme_by_admin(mock_db, admin_user):
    """Admin submitting a DRAFT scheme transitions it to PENDING_APPROVAL."""
    scheme = Scheme(
        scheme_id=10,
        name="Scheme for Health",
        status="DRAFT",
        created_by=2,
        ministry="Ministry of Health",
    )

    with patch("app.services.notification_service.notify_scheme_submitted"):
        result = submit_scheme(mock_db, scheme, current_user=admin_user)

    assert result.status == "PENDING_APPROVAL"
    assert result.rejection_reason is None
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once_with(scheme)


def test_submit_scheme_by_creator(mock_db, gov_user_creator):
    """Creator submitting their own DRAFT scheme transitions it to PENDING_APPROVAL."""
    scheme = Scheme(
        scheme_id=11,
        name="Scheme for Education",
        status="DRAFT",
        created_by=2,
        ministry="Ministry of Education",
    )

    with patch("app.services.notification_service.notify_scheme_submitted"):
        result = submit_scheme(mock_db, scheme, current_user=gov_user_creator)

    assert result.status == "PENDING_APPROVAL"
    assert result.rejection_reason is None
    mock_db.commit.assert_called_once()


def test_submit_scheme_by_non_creator_forbidden(mock_db, gov_user_other):
    """Non-creator non-admin cannot submit someone else's scheme."""
    scheme = Scheme(
        scheme_id=12,
        name="Scheme by User 2",
        status="DRAFT",
        created_by=2,
    )

    with pytest.raises(HTTPException) as exc_info:
        submit_scheme(mock_db, scheme, current_user=gov_user_other)

    assert exc_info.value.status_code == 403
    assert "not authorized to submit" in exc_info.value.detail


def test_submit_scheme_already_pending_fails(mock_db, admin_user):
    """Submitting a scheme that is already PENDING_APPROVAL raises ValueError."""
    scheme = Scheme(
        scheme_id=13,
        name="Scheme In Review",
        status="PENDING_APPROVAL",
        created_by=2,
    )

    with pytest.raises(ValueError) as exc_info:
        submit_scheme(mock_db, scheme, current_user=admin_user)

    assert "Only DRAFT or REJECTED schemes" in str(exc_info.value)


def test_submit_scheme_approved_fails(mock_db, admin_user):
    """Submitting an already APPROVED scheme raises ValueError."""
    scheme = Scheme(
        scheme_id=14,
        name="Scheme Approved",
        status="APPROVED",
        created_by=2,
    )

    with pytest.raises(ValueError) as exc_info:
        submit_scheme(mock_db, scheme, current_user=admin_user)

    assert "Only DRAFT or REJECTED schemes" in str(exc_info.value)


def test_submit_scheme_rejected_succeeds(mock_db, admin_user):
    """Re-submitting a REJECTED scheme transitions to PENDING_APPROVAL."""
    scheme = Scheme(
        scheme_id=15,
        name="Scheme Rejected Earlier",
        status="REJECTED",
        rejection_reason="Incomplete documentation",
        created_by=2,
    )

    with patch("app.services.notification_service.notify_scheme_submitted"):
        result = submit_scheme(mock_db, scheme, current_user=admin_user)

    assert result.status == "PENDING_APPROVAL"
    assert result.rejection_reason is None
    mock_db.commit.assert_called_once()


def test_approve_scheme_by_admin(mock_db):
    """Admin can approve a PENDING_APPROVAL scheme to APPROVED."""
    scheme = Scheme(
        scheme_id=16,
        name="Scheme Pending Approval",
        status="PENDING_APPROVAL",
        created_by=2,
    )

    with patch("app.services.notification_service.notify_scheme_approved"):
        result = approve_scheme(mock_db, scheme, admin_user_id=1)

    assert result.status == "APPROVED"
    assert result.approved_by == 1
    assert result.rejection_reason is None
    mock_db.commit.assert_called_once()


def test_approve_scheme_not_pending_fails(mock_db):
    """Approving a scheme that is not PENDING_APPROVAL raises ValueError."""
    scheme = Scheme(
        scheme_id=17,
        name="Scheme Draft",
        status="DRAFT",
        created_by=2,
    )

    with pytest.raises(ValueError) as exc_info:
        approve_scheme(mock_db, scheme, admin_user_id=1)

    assert "Only PENDING_APPROVAL schemes" in str(exc_info.value)


# ============================================================
# POLICY SUBMISSION & APPROVAL WORKFLOW TESTS
# ============================================================


def test_submit_policy_by_admin(mock_db, admin_user):
    """Admin submitting a DRAFT policy transitions it to PENDING_APPROVAL."""
    policy = Policy(
        policy_id=101,
        title="National AI Policy",
        status="DRAFT",
        created_by=2,
        department="MeitY",
    )

    def mock_query(model):
        query_mock = MagicMock()
        if model == Policy:
            query_mock.filter.return_value.first.return_value = policy
        elif model == User:
            query_mock.filter.return_value.first.return_value = admin_user
        return query_mock

    mock_db.query.side_effect = mock_query

    with patch("app.services.notification_service.notify_policy_submitted"):
        result = submit_policy(mock_db, policy_id=101, current_user=admin_user)

    assert result.status == "PENDING_APPROVAL"
    assert result.rejection_reason is None
    mock_db.commit.assert_called_once()


def test_submit_policy_by_creator(mock_db, gov_user_creator):
    """Creator submitting their own DRAFT policy transitions it to PENDING_APPROVAL."""
    policy = Policy(
        policy_id=102,
        title="Clean Energy Initiative",
        status="DRAFT",
        created_by=2,
        department="Ministry of Power",
    )

    def mock_query(model):
        query_mock = MagicMock()
        if model == Policy:
            query_mock.filter.return_value.first.return_value = policy
        elif model == User:
            query_mock.filter.return_value.first.return_value = gov_user_creator
        return query_mock

    mock_db.query.side_effect = mock_query

    with patch("app.services.notification_service.notify_policy_submitted"):
        result = submit_policy(
            mock_db, policy_id=102, current_user=gov_user_creator
        )

    assert result.status == "PENDING_APPROVAL"
    assert result.rejection_reason is None
    mock_db.commit.assert_called_once()


def test_submit_policy_by_non_creator_forbidden(mock_db, gov_user_other):
    """Non-creator non-admin cannot submit someone else's policy."""
    policy = Policy(
        policy_id=103,
        title="Policy of User 2",
        status="DRAFT",
        created_by=2,
    )

    def mock_query(model):
        query_mock = MagicMock()
        if model == Policy:
            query_mock.filter.return_value.first.return_value = policy
        elif model == User:
            query_mock.filter.return_value.first.return_value = gov_user_other
        return query_mock

    mock_db.query.side_effect = mock_query

    with pytest.raises(HTTPException) as exc_info:
        submit_policy(mock_db, policy_id=103, current_user=gov_user_other)

    assert exc_info.value.status_code == 403
    assert "not authorized to submit" in exc_info.value.detail


def test_submit_policy_already_pending_fails(mock_db, admin_user):
    """Submitting a policy that is already PENDING_APPROVAL raises HTTPException 400."""
    policy = Policy(
        policy_id=104,
        title="Policy In Review",
        status="PENDING_APPROVAL",
        created_by=2,
    )

    def mock_query(model):
        query_mock = MagicMock()
        if model == Policy:
            query_mock.filter.return_value.first.return_value = policy
        return query_mock

    mock_db.query.side_effect = mock_query

    with pytest.raises(HTTPException) as exc_info:
        submit_policy(mock_db, policy_id=104, current_user=admin_user)

    assert exc_info.value.status_code == 400
    assert "Only DRAFT or REJECTED policies" in exc_info.value.detail


def test_submit_policy_approved_fails(mock_db, admin_user):
    """Submitting an already APPROVED policy raises HTTPException 400."""
    policy = Policy(
        policy_id=105,
        title="Policy Approved",
        status="APPROVED",
        created_by=2,
    )

    def mock_query(model):
        query_mock = MagicMock()
        if model == Policy:
            query_mock.filter.return_value.first.return_value = policy
        return query_mock

    mock_db.query.side_effect = mock_query

    with pytest.raises(HTTPException) as exc_info:
        submit_policy(mock_db, policy_id=105, current_user=admin_user)

    assert exc_info.value.status_code == 400
    assert "Only DRAFT or REJECTED policies" in exc_info.value.detail


def test_submit_policy_rejected_succeeds(mock_db, admin_user):
    """Re-submitting a REJECTED policy transitions to PENDING_APPROVAL."""
    policy = Policy(
        policy_id=106,
        title="Policy Rejected Earlier",
        status="REJECTED",
        rejection_reason="Needs revision",
        created_by=2,
    )

    def mock_query(model):
        query_mock = MagicMock()
        if model == Policy:
            query_mock.filter.return_value.first.return_value = policy
        elif model == User:
            query_mock.filter.return_value.first.return_value = admin_user
        return query_mock

    mock_db.query.side_effect = mock_query

    with patch("app.services.notification_service.notify_policy_submitted"):
        result = submit_policy(mock_db, policy_id=106, current_user=admin_user)

    assert result.status == "PENDING_APPROVAL"
    assert result.rejection_reason is None
    mock_db.commit.assert_called_once()


def test_approve_policy_by_admin(mock_db, admin_user):
    """Admin can approve a PENDING_APPROVAL policy to APPROVED."""
    policy = Policy(
        policy_id=107,
        title="Policy Awaiting Approval",
        status="PENDING_APPROVAL",
        created_by=2,
    )

    def mock_query(model):
        query_mock = MagicMock()
        if model == Policy:
            query_mock.filter.return_value.first.return_value = policy
        return query_mock

    mock_db.query.side_effect = mock_query

    with patch("app.services.notification_service.notify_policy_approved"):
        result = approve_policy(
            mock_db, policy_id=107, current_user=admin_user
        )

    assert result.status == "APPROVED"
    assert result.approved_by == admin_user.user_id
    assert result.rejection_reason is None
    mock_db.commit.assert_called_once()


def test_approve_policy_not_pending_fails(mock_db, admin_user):
    """Approving a policy that is not PENDING_APPROVAL raises HTTPException 400."""
    policy = Policy(
        policy_id=108,
        title="Policy in Draft",
        status="DRAFT",
        created_by=2,
    )

    def mock_query(model):
        query_mock = MagicMock()
        if model == Policy:
            query_mock.filter.return_value.first.return_value = policy
        return query_mock

    mock_db.query.side_effect = mock_query

    with pytest.raises(HTTPException) as exc_info:
        approve_policy(mock_db, policy_id=108, current_user=admin_user)

    assert exc_info.value.status_code == 400
    assert "Only policies pending approval" in exc_info.value.detail
