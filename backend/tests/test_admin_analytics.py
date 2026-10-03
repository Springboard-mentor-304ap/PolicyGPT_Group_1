"""Unit and integration tests for Admin Analytics service and endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.database import SessionLocal
from app.models.user import User
from app.services.admin_analytics_service import (
    get_admin_overview_analytics,
    get_admin_policy_analytics,
    get_admin_scheme_analytics,
    get_admin_user_analytics,
    get_admin_department_analytics,
    get_admin_usage_statistics,
)


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="module")
def test_client():
    return TestClient(app)


def test_admin_overview_service(db_session):
    overview = get_admin_overview_analytics(db_session)
    assert "metrics" in overview
    assert len(overview["metrics"]) == 8
    assert "policyStatusTrend" in overview
    assert "schemesByCategory" in overview
    assert "userDistribution" in overview
    assert "recentActivities" in overview
    assert "notifications" in overview


def test_admin_policy_analytics_service(db_session):
    policy_data = get_admin_policy_analytics(db_session)
    assert "stats" in policy_data
    assert len(policy_data["stats"]) == 5
    assert "by_category" in policy_data
    assert "trend" in policy_data
    assert "by_state" in policy_data
    assert "by_ministry" in policy_data
    assert "latest_policies" in policy_data


def test_admin_scheme_analytics_service(db_session):
    scheme_data = get_admin_scheme_analytics(db_session)
    assert "stats" in scheme_data
    assert len(scheme_data["stats"]) == 5
    assert "by_category" in scheme_data
    assert "trend" in scheme_data
    assert "by_state" in scheme_data
    assert "top_schemes" in scheme_data
    assert "recent_updates" in scheme_data


def test_admin_user_analytics_service(db_session):
    user_data = get_admin_user_analytics(db_session)
    assert "kpis" in user_data
    assert len(user_data["kpis"]) == 6
    assert "growth_trend" in user_data
    assert "role_distribution" in user_data
    assert "registration_trend" in user_data
    assert "users_by_state" in user_data
    assert "engagement_metrics" in user_data
    assert "heatmap" in user_data
    assert "recent_registered_users" in user_data
    assert "top_active_users" in user_data


def test_admin_department_analytics_service(db_session):
    dept_data = get_admin_department_analytics(db_session)
    assert "departments_list" in dept_data
    assert "all_departments_list" in dept_data
    assert "selected_overview" in dept_data
    assert "month_labels" in dept_data
    assert "trend_datasets" in dept_data
    assert "top_by_policies" in dept_data
    assert "top_by_schemes" in dept_data
    assert "performance_table" in dept_data


def test_admin_usage_statistics_service(db_session):
    usage_data = get_admin_usage_statistics(db_session)
    assert "kpis" in usage_data
    assert len(usage_data["kpis"]) == 6
    assert "activity_trend" in usage_data
    assert "daily_usage" in usage_data
    assert "role_distribution" in usage_data
    assert "top_policies" in usage_data
    assert "top_schemes" in usage_data
    assert "most_active_users" in usage_data
    assert "recent_searches" in usage_data


def test_admin_endpoints_require_auth(test_client):
    endpoints = [
        "/analytics/admin/overview",
        "/analytics/admin/policies",
        "/analytics/admin/schemes",
        "/analytics/admin/users",
        "/analytics/admin/departments",
        "/analytics/admin/usage",
    ]
    for ep in endpoints:
        resp = test_client.get(ep)
        # Without auth headers, must be 401 Unauthorized or 403 Forbidden
        assert resp.status_code in [401, 403]
