"""Tests for role-scoped personal analytics (no database required)."""

from datetime import date, timedelta

import pytest

from app.api.routes.analytics import router
from app.services.personal_analytics_service import (
    _pct_change,
    resolve_window,
)


def test_resolve_window_presets():
    start, end, bucket = resolve_window("7d", today=date(2026, 10, 1))
    assert (end - start).days == 7
    assert bucket == "day"
    assert start.date().isoformat() == "2026-09-25"

    start, end, bucket = resolve_window("30d", today=date(2026, 10, 1))
    assert (end - start).days == 30
    assert bucket == "day"

    start, end, bucket = resolve_window("6m", today=date(2026, 10, 1))
    assert (end - start).days == 182
    assert bucket == "month"

    start, end, bucket = resolve_window("12m", today=date(2026, 10, 1))
    assert (end - start).days == 365
    assert bucket == "month"


def test_resolve_window_custom():
    start, end, bucket = resolve_window(
        "custom", date_from="2026-09-01", date_to="2026-09-10"
    )
    assert start.date().isoformat() == "2026-09-01"
    assert (end - start).days == 10
    assert bucket == "day"


def test_resolve_window_rejects_bad_input():
    with pytest.raises(ValueError):
        resolve_window("9d")
    with pytest.raises(ValueError):
        resolve_window("custom", date_from="2026-09-01", date_to=None)
    with pytest.raises(ValueError):
        resolve_window("custom", date_from="2026-09-10", date_to="2026-09-01")
    with pytest.raises(ValueError):
        resolve_window("custom", date_from="not-a-date", date_to="2026-09-01")


def test_pct_change_never_fabricates():
    assert _pct_change(10, 5) == 100.0
    assert _pct_change(0, 5) == -100.0
    # Undefined comparisons return None instead of a made-up number.
    assert _pct_change(5, 0) is None
    assert _pct_change(0, 0) is None


def test_role_overview_routes_registered():
    paths = {r.path for r in router.routes}
    assert "/analytics/citizen/overview" in paths
    assert "/analytics/researcher/overview" in paths
    assert "/analytics/organization/overview" in paths


def _index_names(model) -> set:
    return {idx.name for idx in model.__table__.indexes}


def test_analytics_hot_path_indexes_declared():
    """Composite (user_id, timestamp) indexes back every per-user
    analytics aggregation. Verified at metadata level (no DB needed)."""
    from app.models.saved_policy import SavedPolicy
    from app.models.saved_scheme import SavedScheme
    from app.models.search_history import SearchHistory

    assert "ix_saved_policies_user_saved" in _index_names(SavedPolicy)
    assert "ix_saved_schemes_user_saved" in _index_names(SavedScheme)
    assert "ix_search_history_user_searched" in _index_names(SearchHistory)


def test_gov_window_resolution():
    from app.services.government_analytics_service import resolve_gov_window

    start, end = resolve_gov_window(12, today=date(2026, 10, 1))
    assert start.date().isoformat() == "2025-11-01"
    assert (end - timedelta(days=1)).date().isoformat() == "2026-10-01"

    start, end = resolve_gov_window(6, today=date(2026, 10, 1))
    assert start.date().isoformat() == "2026-05-01"

    start, end = resolve_gov_window(
        12, date_from="2026-01-01", date_to="2026-06-30"
    )
    assert start.date().isoformat() == "2026-01-01"
    assert (end - timedelta(days=1)).date().isoformat() == "2026-06-30"

    with pytest.raises(ValueError):
        resolve_gov_window(0)
    with pytest.raises(ValueError):
        resolve_gov_window(25)
    with pytest.raises(ValueError):
        resolve_gov_window(12, date_from="2026-02-01", date_to="2026-01-01")
    with pytest.raises(ValueError):
        resolve_gov_window(12, date_from="2026-01-01", date_to=None)


def test_gov_invalid_filters_rejected():
    from app.services.government_analytics_service import (
        get_government_policy_scheme,
        get_government_user_notifications,
    )

    # Filter validation happens before any DB touch: pass a dummy session
    # that raises if queried.
    class _NoQuery:
        def __getattr__(self, _):
            raise AssertionError("DB must not be touched on invalid filters")

    with pytest.raises(ValueError):
        get_government_policy_scheme(
            _NoQuery(), policy_status="BOGUS"  # type: ignore[arg-type]
        )
    with pytest.raises(ValueError):
        get_government_user_notifications(
            _NoQuery(), role="BOGUS"  # type: ignore[arg-type]
        )


def test_government_routes_registered():
    paths = {r.path for r in router.routes}
    assert "/analytics/government/overview" in paths
    assert "/analytics/government/policy-scheme" in paths
    assert "/analytics/government/departments" in paths
    assert "/analytics/government/user-notifications" in paths
