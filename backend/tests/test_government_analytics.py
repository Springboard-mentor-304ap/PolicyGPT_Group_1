"""Regression tests for Government analytics endpoints (no database required).

Covers the two production 500s:
  1. policy-scheme crashed building its filter lists (bool() of a
     SQLAlchemy clause raises TypeError).
  2. user-notifications crashed building the read-count aggregate
     (func.case does not accept else_; sqlalchemy.case must be used).

A stub session returns empty result sets, which additionally proves the
empty-dataset path returns the expected response structure.
"""

import pytest
from sqlalchemy.dialects import postgresql

from app.api.routes.analytics import router
from app.models.notification import Notification
from app.services.government_analytics_service import (
    get_government_departments,
    get_government_overview,
    get_government_policy_scheme,
    get_government_user_notifications,
    resolve_gov_window,
)


class _StubQuery:
    def filter(self, *args):
        return self

    def group_by(self, *args):
        return self

    def order_by(self, *args):
        return self

    def limit(self, n):
        return self

    def count(self):
        return 0

    def all(self):
        return []


class _StubSession:
    def query(self, *entities):
        return _StubQuery()


def test_policy_scheme_empty_dataset_structure():
    out = get_government_policy_scheme(_StubSession(), months=12)  # type: ignore[arg-type]
    assert out["window"]["from"] <= out["window"]["to"]
    assert out["kpis"]["total_policies"]["value"] == 0
    assert out["kpis"]["approved_schemes"]["value"] == 0
    assert len(out["trends"]["labels"]) == 12
    assert out["trends"]["policies"] == [0] * 12
    assert out["recent_policies"] == []
    assert out["recent_schemes"] == []
    assert out["policies_by_category"] == []


def test_policy_scheme_with_filters_builds_without_type_error():
    # Previously raised: TypeError: Boolean value of this clause is not defined
    out = get_government_policy_scheme(
        _StubSession(),  # type: ignore[arg-type]
        months=6,
        policy_status="APPROVED",
        scheme_status="DRAFT",
        category="Education",
    )
    assert out["filters"] == {
        "policy_status": "APPROVED",
        "scheme_status": "DRAFT",
        "category": "Education",
    }


def test_user_notifications_empty_dataset_structure():
    out = get_government_user_notifications(_StubSession(), months=12)  # type: ignore[arg-type]
    assert out["kpis"]["total_users"]["value"] == 0
    assert len(out["growth_trend"]["labels"]) == 12
    assert out["growth_trend"]["total"] == [0] * 12
    assert out["recent_users"] == []
    assert out["recent_notifications"] == []
    assert out["notifications_by_channel"] == []


def test_user_notifications_channel_aggregate_compiles():
    # Previously raised: Function.__init__() got an unexpected keyword
    # argument 'else_'. Compile the read-count aggregate to real SQL.
    from sqlalchemy import func, select
    from sqlalchemy import case

    stmt = select(
        Notification.channel,
        func.count().label("total"),
        func.sum(case((Notification.is_read.is_(True), 1), else_=0)).label("read"),
    ).group_by(Notification.channel)
    compiled = str(stmt.compile(dialect=postgresql.dialect()))
    assert "CASE" in compiled
    assert "notifications" in compiled


def test_overview_and_departments_empty_datasets():
    overview = get_government_overview(_StubSession(), months=12)  # type: ignore[arg-type]
    assert overview["kpis"]["total_policies"]["value"] == 0
    assert overview["recent_notifications"] == []

    depts = get_government_departments(_StubSession(), months=9)  # type: ignore[arg-type]
    assert depts["kpis"]["total_departments"]["value"] == 0
    assert depts["department_table"] == []
    assert depts["kpis"]["department_users"]["tracked"] is False


def test_invalid_gov_params_rejected():
    with pytest.raises(ValueError):
        get_government_policy_scheme(_StubSession(), months=0)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        get_government_policy_scheme(
            _StubSession(), policy_status="BOGUS"  # type: ignore[arg-type]
        )
    with pytest.raises(ValueError):
        get_government_user_notifications(
            _StubSession(), role="BOGUS"  # type: ignore[arg-type]
        )


def test_gov_window_months_12_shape():
    from datetime import date

    start, end = resolve_gov_window(12, today=date(2026, 10, 1))
    assert (start.year, start.month) == (2025, 11)
    from datetime import timedelta

    assert (end - timedelta(days=1)).date() == date(2026, 10, 1)


def test_government_routes_registered():
    paths = {r.path for r in router.routes}
    assert "/analytics/government/overview" in paths
    assert "/analytics/government/policy-scheme" in paths
    assert "/analytics/government/departments" in paths
    assert "/analytics/government/user-notifications" in paths
