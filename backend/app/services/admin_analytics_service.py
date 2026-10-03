"""Admin Analytics Service.

Provides dynamically aggregated statistics, trends, distributions, and
breakdowns directly from PostgreSQL for all 6 Admin Analytics views:
1. Admin Overview
2. Policy Analytics
3. Scheme Analytics
4. User Analytics
5. Department Analytics
6. Usage Statistics
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import Integer, case, func, or_, and_, desc
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.models.search_history import SearchHistory
from app.models.report import Report


def _calc_change(current: int, previous: int) -> tuple[str, bool]:
    """Calculate percentage change between current and previous values.

    Returns an empty change string when there is no previous-period baseline
    (previous == 0): the frontend hides the comparison indicator instead of
    showing a misleading default such as +100%.
    """
    if previous == 0:
        return "", True
    pct = round(((current - previous) / previous) * 100)
    if pct >= 0:
        return f"+{pct}%", True
    return f"{pct}%", False


def _month_abbr(dt: datetime) -> str:
    return dt.strftime("%b")


def _get_month_series(num_months: int):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # List of (year, month, label)
    months = []
    for i in range(num_months - 1, -1, -1):
        # Approximate 30 days per step
        target = now - timedelta(days=i * 30.5)
        months.append((target.year, target.month, target.strftime("%b")))
    # Deduplicate keeping order
    seen = set()
    deduped = []
    for y, m, l in months:
        if (y, m) not in seen:
            seen.add((y, m))
            deduped.append((y, m, l))
    return deduped


def _is_all_filter_value(value: Optional[str]) -> bool:
    """True when a frontend filter means 'no filtering'.

    The shared FiltersBar emits 'All States', 'All Categories',
    'All Ministries', 'All Departments' and 'All Status'. Treat any
    'All ...' / 'ALL' variant (case-insensitive) as absent so a default
    Apply never filters everything to zero rows.
    """
    if value is None:
        return True
    text = str(value).strip()
    if not text:
        return True
    upper = text.upper()
    return upper == "ALL" or upper.startswith("ALL ")


def _normalize_status_value(raw: Optional[str]) -> Optional[str]:
    """Normalize a status filter string; None means no filtering."""
    if _is_all_filter_value(raw):
        return None
    return str(raw).strip().upper()


def _month_bounds(num_months: int):
    """Exact calendar-month buckets: [(year, month, label, start, end)].

    Unlike the legacy 30.5-day approximation, every bucket covers exactly
    one calendar month as [start, end), so range filters are correct and
    can use btree indexes on created_at (extract() cannot).
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    first_of_current = now.replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    buckets = []
    for i in range(num_months - 1, -1, -1):
        idx = first_of_current.month - 1 - i
        year = first_of_current.year + idx // 12
        month = idx % 12 + 1
        start = datetime(year, month, 1)
        end = datetime(year + month // 12, month % 12 + 1, 1)
        buckets.append((year, month, start.strftime("%b"), start, end))
    return buckets


def _parse_months_count(value: str, default: int) -> int:
    """Extract 3/6/12-month window from a 'Last N ...' label."""
    if "3" in value:
        return 3
    if "6" in value:
        return 6
    if "12" in value:
        return 12
    return default


# =========================================================================
# 1. ADMIN OVERVIEW ANALYTICS
# =========================================================================


def get_admin_overview_analytics(
    db: Session, timeframe: str = "Last 9 Months"
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    thirty_days_ago = now - timedelta(days=30)
    sixty_days_ago = now - timedelta(days=60)

    # 1. KPI Cards Aggregates — 4 grouped queries instead of 16 COUNTs.
    # Each returns current + prev-period in one roundtrip via conditional SUM.
    # Prev-period columns mirror the legacy logic: totals/notifs on
    # created_at, per-status buckets on updated_at.
    users_row = db.query(
        func.count(User.user_id),
        func.sum(case((User.created_at < thirty_days_ago, 1), else_=0)),
    ).first()
    total_users = users_row[0] or 0
    users_prev = int(users_row[1] or 0)
    users_chg, users_pos = _calc_change(total_users, users_prev)

    pol_rows = (
        db.query(
            Policy.status,
            func.count(Policy.policy_id),
            func.sum(case((Policy.updated_at < thirty_days_ago, 1), else_=0)),
        )
        .group_by(Policy.status)
        .all()
    )
    pol_by_status = {s: (c, int(p or 0)) for s, c, p in pol_rows}
    total_policies = sum(c for c, _ in pol_by_status.values())
    policies_prev = (
        db.query(Policy).filter(Policy.created_at < thirty_days_ago).count()
    )
    policies_chg, policies_pos = _calc_change(total_policies, policies_prev)

    def _pol(statuses):
        cur = sum(pol_by_status.get(s, (0, 0))[0] for s in statuses)
        prev = sum(pol_by_status.get(s, (0, 0))[1] for s in statuses)
        return cur, prev

    approved_policies, app_prev = _pol(["APPROVED"])
    app_chg, app_pos = _calc_change(approved_policies, app_prev)

    pending_policies, pend_prev = _pol(["PENDING", "PENDING_APPROVAL"])
    pend_chg, pend_pos = _calc_change(pending_policies, pend_prev)

    rejected_policies, rej_prev = _pol(["REJECTED"])
    rej_chg, rej_pos = _calc_change(rejected_policies, rej_prev)

    sch_rows = (
        db.query(
            Scheme.status,
            func.count(Scheme.scheme_id),
            func.sum(case((Scheme.updated_at < thirty_days_ago, 1), else_=0)),
        )
        .group_by(Scheme.status)
        .all()
    )
    sch_by_status = {s: (c, int(p or 0)) for s, c, p in sch_rows}
    total_schemes = sum(c for c, _ in sch_by_status.values())
    schemes_prev = (
        db.query(Scheme).filter(Scheme.created_at < thirty_days_ago).count()
    )
    schemes_chg, schemes_pos = _calc_change(total_schemes, schemes_prev)

    active_schemes, act_prev = sch_by_status.get("APPROVED", (0, 0))
    act_prev = int(act_prev)
    act_chg, act_pos = _calc_change(active_schemes, act_prev)

    notifs_row = db.query(
        func.count(Notification.notification_id),
        func.sum(
            case((Notification.created_at < thirty_days_ago, 1), else_=0)
        ),
    ).first()
    total_notifs = notifs_row[0] or 0
    notifs_prev = int(notifs_row[1] or 0)
    notifs_chg, notifs_pos = _calc_change(total_notifs, notifs_prev)

    metrics = [
        {
            "label": "Total Users",
            "value": str(total_users),
            "change": users_chg,
            "isPositive": users_pos,
        },
        {
            "label": "Total Policies",
            "value": str(total_policies),
            "change": policies_chg,
            "isPositive": policies_pos,
        },
        {
            "label": "Total Schemes",
            "value": str(total_schemes),
            "change": schemes_chg,
            "isPositive": schemes_pos,
        },
        {
            "label": "Approved Policies",
            "value": str(approved_policies),
            "change": app_chg,
            "isPositive": app_pos,
        },
        {
            "label": "Pending Policies",
            "value": str(pending_policies),
            "change": pend_chg,
            "isPositive": pend_pos,
        },
        {
            "label": "Rejected Policies",
            "value": str(rejected_policies),
            "change": rej_chg,
            "isPositive": rej_pos,
            "goodWhenDown": True,
        },
        {
            "label": "Active Schemes",
            "value": str(active_schemes),
            "change": act_chg,
            "isPositive": act_pos,
        },
        {
            "label": "Total Notifications",
            "value": str(total_notifs),
            "change": notifs_chg,
            "isPositive": notifs_pos,
        },
    ]

    # 2. Policy Status Trend — 1 grouped query instead of 3×N COUNTs.
    months_count = _parse_months_count(timeframe, 9)

    month_buckets = _month_bounds(months_count)
    labels = [b[2] for b in month_buckets]
    window_start = month_buckets[0][3]

    trend_rows = (
        db.query(
            func.extract("year", Policy.created_at),
            func.extract("month", Policy.created_at),
            Policy.status,
            func.count(Policy.policy_id),
        )
        .filter(Policy.created_at >= window_start)
        .group_by(
            func.extract("year", Policy.created_at),
            func.extract("month", Policy.created_at),
            Policy.status,
        )
        .all()
    )
    trend_map = {(int(y), int(m), s): c for y, m, s, c in trend_rows}

    approved_series = []
    pending_series = []
    rejected_series = []

    for y, m, _, _, _ in month_buckets:
        approved_series.append(trend_map.get((y, m, "APPROVED"), 0))
        pending_series.append(
            trend_map.get((y, m, "PENDING"), 0)
            + trend_map.get((y, m, "PENDING_APPROVAL"), 0)
        )
        rejected_series.append(trend_map.get((y, m, "REJECTED"), 0))

    policy_status_trend = {
        "labels": labels,
        "series": [
            {"label": "Approved", "data": approved_series, "color": "#3cb371"},
            {"label": "Pending", "data": pending_series, "color": "#f5a524"},
            {"label": "Rejected", "data": rejected_series, "color": "#e5484d"},
        ],
    }

    # 3. Schemes by Category
    category_counts = (
        db.query(Scheme.category, func.count(Scheme.scheme_id))
        .filter(Scheme.category.isnot(None))
        .group_by(Scheme.category)
        .all()
    )
    total_cat_schemes = sum(c[1] for c in category_counts) or 1
    schemes_by_category = [
        {
            "label": cat or "General",
            "count": count,
            "percentage": round((count / total_cat_schemes) * 100),
        }
        for cat, count in category_counts
    ]

    # 4. User Distribution by Role
    role_counts = (
        db.query(User.role, func.count(User.user_id)).group_by(User.role).all()
    )
    role_labels = []
    role_data = []
    role_colors_map = {
        "CITIZEN": "#2f6fed",
        "GOVERNMENT_OFFICIAL": "#3cb371",
        "RESEARCHER": "#8b5cf6",
        "ORGANIZATION": "#f5a524",
        "ADMIN": "#e5484d",
        "GUEST": "#94a3b8",
    }
    role_colors = []
    for r, count in role_counts:
        pct = round((count / total_users) * 100) if total_users > 0 else 0
        role_labels.append(f"{r.replace('_', ' ').title()} ({pct}%)")
        role_data.append(count)
        role_colors.append(role_colors_map.get(r, "#64748b"))

    user_distribution = {
        "labels": role_labels,
        "data": role_data,
        "colors": role_colors,
        "total": str(total_users),
    }

    # 5. Recent User Activity from AuditLog
    recent_logs = (
        db.query(AuditLog, User.email)
        .outerjoin(User, AuditLog.user_id == User.user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(5)
        .all()
    )
    recent_activities = []
    for log, email in recent_logs:
        elapsed = now - log.created_at
        if elapsed.total_seconds() < 3600:
            time_str = (
                f"{max(1, int(elapsed.total_seconds() // 60))} minutes ago"
            )
        elif elapsed.total_seconds() < 86400:
            time_str = f"{int(elapsed.total_seconds() // 3600)} hours ago"
        else:
            time_str = f"{int(elapsed.total_seconds() // 86400)} days ago"

        action_display = (log.action or "Activity").replace("_", " ").title()
        recent_activities.append(
            {
                "user": email or "System / User",
                "action": action_display,
                "time": time_str,
                "status": "Success",
            }
        )

    # 6. Latest Notifications
    latest_notifs = (
        db.query(Notification)
        .order_by(Notification.created_at.desc())
        .limit(5)
        .all()
    )
    type_class_map = {
        "SCHEME": "blue",
        "POLICY": "purple",
        "DEADLINE": "orange",
        "SYSTEM": "red",
    }
    notifications_list = []
    for n in latest_notifs:
        elapsed = now - n.created_at
        if elapsed.total_seconds() < 3600:
            d_str = f"{max(1, int(elapsed.total_seconds() // 60))} minutes ago"
        elif elapsed.total_seconds() < 86400:
            d_str = f"{int(elapsed.total_seconds() // 3600)} hours ago"
        else:
            d_str = f"{int(elapsed.total_seconds() // 86400)} days ago"

        type_class = type_class_map.get(n.category, "blue")
        notifications_list.append(
            {
                "title": n.title,
                "type": n.notification_type or "Update",
                "typeClass": type_class,
                "date": d_str,
                "status": "Sent",
            }
        )

    return {
        "metrics": metrics,
        "policyStatusTrend": policy_status_trend,
        "schemesByCategory": schemes_by_category,
        "userDistribution": user_distribution,
        "recentActivities": recent_activities,
        "notifications": notifications_list,
    }


# =========================================================================
# 2. POLICY ANALYTICS
# =========================================================================


def get_admin_policy_analytics(
    db: Session, filters: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    filters = filters or {}
    q = db.query(Policy)

    if filters.get("state") and not _is_all_filter_value(filters["state"]):
        q = q.filter(Policy.state == filters["state"])
    if filters.get("category") and not _is_all_filter_value(
        filters["category"]
    ):
        q = q.filter(Policy.category == filters["category"])
    if filters.get("ministry") and not _is_all_filter_value(
        filters["ministry"]
    ):
        q = q.filter(Policy.ministry == filters["ministry"])
    if filters.get("department") and not _is_all_filter_value(
        filters["department"]
    ):
        q = q.filter(Policy.department == filters["department"])
    status_norm = _normalize_status_value(filters.get("status"))
    if status_norm:
        if status_norm == "PENDING":
            q = q.filter(Policy.status.in_(["PENDING", "PENDING_APPROVAL"]))
        elif status_norm == "ACTIVE":
            # No ACTIVE status on policies; active == approved.
            q = q.filter(Policy.status == "APPROVED")
        else:
            q = q.filter(Policy.status == status_norm)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    thirty_days_ago = now - timedelta(days=30)
    sixty_days_ago = now - timedelta(days=60)

    # Stats — 1 grouped query (current + prev via conditional SUM)
    # instead of 10 COUNTs on the filtered base.
    status_rows = (
        q.with_entities(
            Policy.status,
            func.count(Policy.policy_id),
            func.sum(case((Policy.created_at < thirty_days_ago, 1), else_=0)),
        )
        .group_by(Policy.status)
        .all()
    )
    by_status = {s: (c, int(p or 0)) for s, c, p in status_rows}

    def _st(statuses):
        cur = sum(by_status.get(s, (0, 0))[0] for s in statuses)
        prev = sum(by_status.get(s, (0, 0))[1] for s in statuses)
        return cur, prev

    total_policies = sum(c for c, _ in by_status.values())
    total_prev = sum(p for _, p in by_status.values())
    approved, approved_prev = _st(["APPROVED"])
    pending, pending_prev = _st(["PENDING", "PENDING_APPROVAL"])
    rejected, rejected_prev = _st(["REJECTED"])
    archived, archived_prev = _st(["ARCHIVED"])
    total_chg, total_pos = _calc_change(total_policies, total_prev)
    approved_chg, approved_pos = _calc_change(approved, approved_prev)
    pending_chg, pending_pos = _calc_change(pending, pending_prev)
    rejected_chg, rejected_pos = _calc_change(rejected, rejected_prev)
    archived_chg, archived_pos = _calc_change(archived, archived_prev)

    stats = [
        {
            "label": "Total Policies",
            "value": str(total_policies),
            "change": total_chg,
            "isPositive": total_pos,
        },
        {
            "label": "Approved Policies",
            "value": str(approved),
            "change": approved_chg,
            "isPositive": approved_pos,
        },
        {
            "label": "Pending Policies",
            "value": str(pending),
            "change": pending_chg,
            "isPositive": pending_pos,
        },
        {
            "label": "Rejected Policies",
            "value": str(rejected),
            "change": rejected_chg,
            "isPositive": rejected_pos,
            "goodWhenDown": True,
        },
        {
            "label": "Archived Policies",
            "value": str(archived),
            "change": archived_chg,
            "isPositive": archived_pos,
        },
    ]

    # Category breakdown
    cat_counts = (
        q.with_entities(Policy.category, func.count(Policy.policy_id))
        .filter(Policy.category.isnot(None))
        .group_by(Policy.category)
        .all()
    )
    denom = total_policies or 1
    by_category = [
        {"label": c[0] or "General", "percentage": round((c[1] / denom) * 100)}
        for c in cat_counts
    ]

    # Trend — 1 grouped query instead of 6 COUNTs.
    month_buckets = _month_bounds(6)
    trend_labels = [b[2] for b in month_buckets]
    trend_start = month_buckets[0][3]
    month_rows = (
        q.with_entities(
            func.extract("year", Policy.created_at),
            func.extract("month", Policy.created_at),
            func.count(Policy.policy_id),
        )
        .filter(Policy.created_at >= trend_start)
        .group_by(
            func.extract("year", Policy.created_at),
            func.extract("month", Policy.created_at),
        )
        .all()
    )
    month_map = {(int(y), int(m)): c for y, m, c in month_rows}
    trend_data = [month_map.get((y, m), 0) for y, m, _, _, _ in month_buckets]

    trend = {
        "labels": trend_labels,
        "series": [
            {"label": "Policies", "data": trend_data, "color": "#2f6fed"}
        ],
    }

    # By State
    state_counts = (
        q.with_entities(Policy.state, func.count(Policy.policy_id))
        .filter(Policy.state.isnot(None))
        .group_by(Policy.state)
        .order_by(desc(func.count(Policy.policy_id)))
        .limit(10)
        .all()
    )
    by_state = [
        {"label": s[0] or "Unknown", "value": s[1]} for s in state_counts
    ]

    # By Ministry
    min_counts = (
        q.with_entities(Policy.ministry, func.count(Policy.policy_id))
        .filter(Policy.ministry.isnot(None))
        .group_by(Policy.ministry)
        .order_by(desc(func.count(Policy.policy_id)))
        .limit(10)
        .all()
    )
    by_ministry = [
        {"label": m[0] or "Unknown", "value": m[1]} for m in min_counts
    ]

    # Latest policies
    recent_pols = q.order_by(Policy.created_at.desc()).limit(10).all()
    latest_policies = [
        {
            "title": p.title,
            "ministry": p.ministry or "Unspecified",
            "state": p.state or "All India",
            "category": p.category or "General",
            "status": (
                "Approved"
                if p.status == "APPROVED"
                else ("Pending" if "PENDING" in p.status else p.status.title())
            ),
            "date": (
                p.created_at.strftime("%b %d, %Y")
                if p.created_at
                else "Recently"
            ),
        }
        for p in recent_pols
    ]

    return {
        "stats": stats,
        "by_category": by_category,
        "trend": trend,
        "by_state": by_state,
        "by_ministry": by_ministry,
        "latest_policies": latest_policies,
    }


# =========================================================================
# 3. SCHEME ANALYTICS
# =========================================================================


def get_admin_scheme_analytics(
    db: Session, filters: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    filters = filters or {}
    q = db.query(Scheme)

    if filters.get("state") and not _is_all_filter_value(filters["state"]):
        q = q.filter(Scheme.state == filters["state"])
    if filters.get("category") and not _is_all_filter_value(
        filters["category"]
    ):
        q = q.filter(Scheme.category == filters["category"])
    if filters.get("ministry") and not _is_all_filter_value(
        filters["ministry"]
    ):
        q = q.filter(Scheme.ministry == filters["ministry"])
    status_norm = _normalize_status_value(filters.get("status"))
    if status_norm:
        s_filter = status_norm
        if s_filter == "ACTIVE":
            q = q.filter(Scheme.status == "APPROVED")
        elif s_filter == "PENDING":
            q = q.filter(
                Scheme.status.in_(["PENDING", "PENDING_APPROVAL", "DRAFT"])
            )
        else:
            q = q.filter(Scheme.status == s_filter)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    thirty_days_ago = now - timedelta(days=30)

    # Stats — 1 grouped query instead of 10 COUNTs.
    status_rows = (
        q.with_entities(
            Scheme.status,
            func.count(Scheme.scheme_id),
            func.sum(case((Scheme.created_at < thirty_days_ago, 1), else_=0)),
        )
        .group_by(Scheme.status)
        .all()
    )
    by_status = {s: (c, int(p or 0)) for s, c, p in status_rows}

    def _st(statuses):
        cur = sum(by_status.get(s, (0, 0))[0] for s in statuses)
        prev = sum(by_status.get(s, (0, 0))[1] for s in statuses)
        return cur, prev

    total_schemes = sum(c for c, _ in by_status.values())
    total_prev = sum(p for _, p in by_status.values())
    active, active_prev = _st(["APPROVED"])
    pending, pending_prev = _st(["PENDING", "PENDING_APPROVAL", "DRAFT"])
    rejected, rejected_prev = _st(["REJECTED"])
    archived, archived_prev = _st(["ARCHIVED"])
    total_chg, total_pos = _calc_change(total_schemes, total_prev)
    active_chg, active_pos = _calc_change(active, active_prev)
    pending_chg, pending_pos = _calc_change(pending, pending_prev)
    rejected_chg, rejected_pos = _calc_change(rejected, rejected_prev)
    archived_chg, archived_pos = _calc_change(archived, archived_prev)

    stats = [
        {
            "label": "Total Schemes",
            "value": str(total_schemes),
            "change": total_chg,
            "isPositive": total_pos,
        },
        {
            "label": "Active Schemes",
            "value": str(active),
            "change": active_chg,
            "isPositive": active_pos,
        },
        {
            "label": "Pending Schemes",
            "value": str(pending),
            "change": pending_chg,
            "isPositive": pending_pos,
        },
        {
            "label": "Rejected Schemes",
            "value": str(rejected),
            "change": rejected_chg,
            "isPositive": rejected_pos,
            "goodWhenDown": True,
        },
        {
            "label": "Archived Schemes",
            "value": str(archived),
            "change": archived_chg,
            "isPositive": archived_pos,
        },
    ]

    # Category breakdown
    cat_counts = (
        q.with_entities(Scheme.category, func.count(Scheme.scheme_id))
        .filter(Scheme.category.isnot(None))
        .group_by(Scheme.category)
        .all()
    )
    denom = total_schemes or 1
    by_category = [
        {"label": c[0] or "General", "percentage": round((c[1] / denom) * 100)}
        for c in cat_counts
    ]

    # Trend — 1 grouped query instead of 6 COUNTs.
    month_buckets = _month_bounds(6)
    trend_labels = [b[2] for b in month_buckets]
    trend_start = month_buckets[0][3]
    month_rows = (
        q.with_entities(
            func.extract("year", Scheme.created_at),
            func.extract("month", Scheme.created_at),
            func.count(Scheme.scheme_id),
        )
        .filter(Scheme.created_at >= trend_start)
        .group_by(
            func.extract("year", Scheme.created_at),
            func.extract("month", Scheme.created_at),
        )
        .all()
    )
    month_map = {(int(y), int(m)): c for y, m, c in month_rows}
    trend_data = [month_map.get((y, m), 0) for y, m, _, _, _ in month_buckets]

    trend = {
        "labels": trend_labels,
        "series": [
            {"label": "Schemes", "data": trend_data, "color": "#3cb371"}
        ],
    }

    # By State
    state_counts = (
        q.with_entities(Scheme.state, func.count(Scheme.scheme_id))
        .filter(Scheme.state.isnot(None))
        .group_by(Scheme.state)
        .order_by(desc(func.count(Scheme.scheme_id)))
        .limit(10)
        .all()
    )
    by_state = [
        {"label": s[0] or "Unknown", "value": s[1]} for s in state_counts
    ]

    # Top schemes: newest 10. No views/applications table exists in the
    # schema (Policy/Scheme have no view counters; SearchHistory has no
    # scheme FK), so views/applications are honestly 0 until tracked.
    schemes_list = q.order_by(Scheme.created_at.desc()).limit(10).all()
    top_schemes = [
        {
            "rank": idx + 1,
            "name": s.name,
            "ministry": s.ministry or "Unspecified",
            "views": 0,
            "applications": 0,
        }
        for idx, s in enumerate(schemes_list)
    ]

    recent_updates = [
        {
            "title": s.name,
            "ministry": s.ministry or "Unspecified",
            "type": "New Scheme" if s.created_at == s.updated_at else "Update",
            "date": (
                s.updated_at.strftime("%b %d, %Y")
                if s.updated_at
                else "Recently"
            ),
            "status": "Active" if s.status == "APPROVED" else s.status.title(),
        }
        for s in schemes_list[:5]
    ]

    return {
        "stats": stats,
        "by_category": by_category,
        "trend": trend,
        "by_state": by_state,
        "top_schemes": top_schemes,
        "recent_updates": recent_updates,
    }


# =========================================================================
# 4. USER ANALYTICS
# =========================================================================


def get_admin_user_analytics(
    db: Session,
    growth_period: str = "Last 12 Months",
    reg_period: str = "Last 6 Months",
    state_limit: int = 10,
    heatmap_period: str = "Last 4 Weeks",
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    thirty_days_ago = now - timedelta(days=30)
    sixty_days_ago = now - timedelta(days=60)

    # KPI base — 2 grouped queries instead of 12 COUNTs.
    user_row = db.query(
        func.count(User.user_id),
        func.sum(case((User.is_active == True, 1), else_=0)),
        func.sum(case((User.created_at >= thirty_days_ago, 1), else_=0)),
        func.sum(
            case(
                (
                    and_(
                        User.created_at >= sixty_days_ago,
                        User.created_at < thirty_days_ago,
                    ),
                    1,
                ),
                else_=0,
            )
        ),
        func.sum(
            case(
                (
                    and_(
                        User.is_active == True,
                        User.created_at < thirty_days_ago,
                    ),
                    1,
                ),
                else_=0,
            )
        ),
    ).first()
    total_users = user_row[0] or 0
    active_users = int(user_row[1] or 0)
    new_users = int(user_row[2] or 0)
    new_prev = int(user_row[3] or 0)
    active_prev = int(user_row[4] or 0)

    role_prev_rows = (
        db.query(
            User.role,
            func.count(User.user_id),
            func.sum(case((User.created_at < thirty_days_ago, 1), else_=0)),
        )
        .group_by(User.role)
        .all()
    )
    role_totals = {r: (c, int(p or 0)) for r, c, p in role_prev_rows}
    total_prev = sum(p for _, p in role_totals.values())
    officials, officials_prev = role_totals.get("GOVERNMENT_OFFICIAL", (0, 0))
    orgs, orgs_prev = role_totals.get("ORGANIZATION", (0, 0))
    researchers, researchers_prev = role_totals.get("RESEARCHER", (0, 0))
    total_chg, total_pos = _calc_change(total_users, total_prev)
    active_chg, active_pos = _calc_change(active_users, active_prev)
    new_chg, new_pos = _calc_change(new_users, new_prev)
    off_chg, off_pos = _calc_change(officials, officials_prev)
    org_chg, org_pos = _calc_change(orgs, orgs_prev)
    res_chg, res_pos = _calc_change(researchers, researchers_prev)

    kpis = [
        {
            "label": "Total Users",
            "value": f"{total_users:,}",
            "change": total_chg,
            "isPositive": total_pos,
            "icon": "people",
            "iconClass": "blue",
        },
        {
            "label": "Active Users",
            "value": f"{active_users:,}",
            "change": active_chg,
            "isPositive": active_pos,
            "icon": "person",
            "iconClass": "green",
        },
        {
            "label": "New Users",
            "value": f"{new_users:,}",
            "change": new_chg,
            "isPositive": new_pos,
            "icon": "person_add",
            "iconClass": "orange",
        },
        {
            "label": "Govt. Officials",
            "value": f"{officials:,}",
            "change": off_chg,
            "isPositive": off_pos,
            "icon": "badge",
            "iconClass": "purple",
        },
        {
            "label": "Organizations",
            "value": f"{orgs:,}",
            "change": org_chg,
            "isPositive": org_pos,
            "icon": "business",
            "iconClass": "teal",
        },
        {
            "label": "Researchers",
            "value": f"{researchers:,}",
            "change": res_chg,
            "isPositive": res_pos,
            "icon": "science",
            "iconClass": "pink",
        },
    ]

    # Growth trend — 1 grouped query instead of 3×N COUNTs.
    growth_months = _parse_months_count(growth_period, 3)
    buckets = _month_bounds(growth_months)
    growth_labels = [b[2] for b in buckets]
    growth_start = buckets[0][3]

    growth_rows = (
        db.query(
            func.extract("year", User.created_at),
            func.extract("month", User.created_at),
            User.role,
            func.count(User.user_id),
        )
        .filter(User.created_at >= growth_start)
        .group_by(
            func.extract("year", User.created_at),
            func.extract("month", User.created_at),
            User.role,
        )
        .all()
    )
    growth_map = {(int(y), int(m), r): c for y, m, r, c in growth_rows}

    citizen_series = []
    officials_series = []
    researchers_series = []
    for y, m, _, _, _ in buckets:
        citizen_series.append(growth_map.get((y, m, "CITIZEN"), 0))
        officials_series.append(
            growth_map.get((y, m, "GOVERNMENT_OFFICIAL"), 0)
        )
        researchers_series.append(growth_map.get((y, m, "RESEARCHER"), 0))

    growth_trend = {
        "labels": growth_labels,
        "series": [
            {"label": "Citizens", "data": citizen_series, "color": "#2f6fed"},
            {
                "label": "Govt. Officials",
                "data": officials_series,
                "color": "#3cb371",
            },
            {
                "label": "Researchers",
                "data": researchers_series,
                "color": "#8b5cf6",
            },
        ],
    }

    # Role distribution
    role_counts = (
        db.query(User.role, func.count(User.user_id)).group_by(User.role).all()
    )
    role_labels = []
    role_data = []
    role_colors = []
    role_colors_map = {
        "CITIZEN": "#2f6fed",
        "GOVERNMENT_OFFICIAL": "#3cb371",
        "RESEARCHER": "#8b5cf6",
        "ORGANIZATION": "#f5a524",
        "ADMIN": "#e5484d",
        "GUEST": "#94a3b8",
    }
    for r, count in role_counts:
        role_labels.append(r.replace("_", " ").title())
        role_data.append(count)
        role_colors.append(role_colors_map.get(r, "#64748b"))

    role_distribution = {
        "labels": role_labels,
        "data": role_data,
        "colors": role_colors,
        "total": f"{total_users:,}",
    }

    # Registration trend — 1 grouped query instead of N COUNTs.
    reg_months = 6 if "6" in reg_period else 3
    reg_buckets = _month_bounds(reg_months)
    reg_trend_labels = [b[2] for b in reg_buckets]
    reg_start = reg_buckets[0][3]
    reg_rows = (
        db.query(
            func.extract("year", User.created_at),
            func.extract("month", User.created_at),
            func.count(User.user_id),
        )
        .filter(User.created_at >= reg_start)
        .group_by(
            func.extract("year", User.created_at),
            func.extract("month", User.created_at),
        )
        .all()
    )
    reg_map = {(int(y), int(m)): c for y, m, c in reg_rows}
    reg_trend_values = [
        reg_map.get((y, m), 0) for y, m, _, _, _ in reg_buckets
    ]

    registration_trend = {
        "labels": reg_trend_labels,
        "values": reg_trend_values,
    }

    # Users by state
    state_counts = (
        db.query(User.state, func.count(User.user_id))
        .filter(User.state.isnot(None))
        .group_by(User.state)
        .order_by(desc(func.count(User.user_id)))
        .limit(state_limit)
        .all()
    )
    users_by_state = {
        "labels": [s[0] for s in state_counts],
        "values": [s[1] for s in state_counts],
    }

    # Engagement metrics — 4 single-row conditional queries instead of 8.
    login_cond = or_(
        AuditLog.action.ilike("%login%"), AuditLog.action.ilike("%auth%")
    )
    logins_row = (
        db.query(
            func.count(AuditLog.audit_id),
            func.sum(
                case(
                    (
                        and_(
                            login_cond, AuditLog.created_at < thirty_days_ago
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
        )
        .filter(login_cond)
        .first()
    )
    total_logins = logins_row[0] or 0
    logins_prev = int(logins_row[1] or 0)
    searches_row = db.query(
        func.count(SearchHistory.history_id),
        func.sum(
            case((SearchHistory.searched_at < thirty_days_ago, 1), else_=0)
        ),
    ).first()
    search_queries = searches_row[0] or 0
    searches_prev = int(searches_row[1] or 0)
    reports_row = db.query(
        func.count(Report.report_id),
        func.sum(case((Report.generated_at < thirty_days_ago, 1), else_=0)),
    ).first()
    reports_gen = reports_row[0] or 0
    reports_prev = int(reports_row[1] or 0)
    notifs_row = db.query(
        func.count(Notification.notification_id),
        func.sum(
            case((Notification.created_at < thirty_days_ago, 1), else_=0)
        ),
    ).first()
    notifs_sent = notifs_row[0] or 0
    notifs_prev = int(notifs_row[1] or 0)
    logins_chg, logins_pos = _calc_change(total_logins, logins_prev)
    searches_chg, searches_pos = _calc_change(search_queries, searches_prev)
    reports_chg, reports_pos = _calc_change(reports_gen, reports_prev)
    notifs_chg, notifs_pos = _calc_change(notifs_sent, notifs_prev)

    engagement_metrics = [
        {
            "label": "Total Logins",
            "value": f"{total_logins:,}",
            "change": logins_chg,
            "isPositive": logins_pos,
            "icon": "login",
            "iconClass": "blue",
        },
        {
            "label": "Search Queries",
            "value": f"{search_queries:,}",
            "change": searches_chg,
            "isPositive": searches_pos,
            "icon": "search",
            "iconClass": "purple",
        },
        {
            "label": "Reports Generated",
            "value": f"{reports_gen:,}",
            "change": reports_chg,
            "isPositive": reports_pos,
            "icon": "description",
            "iconClass": "orange",
        },
        {
            "label": "Notifications Sent",
            "value": f"{notifs_sent:,}",
            "change": notifs_chg,
            "isPositive": notifs_pos,
            "icon": "notifications",
            "iconClass": "green",
        },
    ]

    # Heatmap — 1 grouped query instead of 56 COUNTs.
    # PostgreSQL: isodow 1=Mon..7=Sun; 3-hour buckets via hour/3.
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    times = ["12 AM", "3 AM", "6 AM", "9 AM", "12 PM", "3 PM", "6 PM", "9 PM"]
    heat_rows = (
        db.query(
            func.extract("isodow", AuditLog.created_at),
            (func.extract("hour", AuditLog.created_at) / 3).cast(Integer),
            func.count(AuditLog.audit_id),
        )
        .group_by(
            func.extract("isodow", AuditLog.created_at),
            (func.extract("hour", AuditLog.created_at) / 3).cast(Integer),
        )
        .all()
    )
    heat_map = {(int(d), int(b)): c for d, b, c in heat_rows}
    cells = []
    for d_idx, day_name in enumerate(days):
        for t_idx, time_name in enumerate(times):
            hour_start = t_idx * 3
            val = heat_map.get((d_idx + 1, t_idx), 0)
            level = min(4, val // 10) if val > 0 else 0
            cells.append(
                {
                    "day": day_name,
                    "time": time_name,
                    "hour": hour_start,
                    "dayIndex": d_idx,
                    "value": val,
                    "level": level,
                }
            )

    heatmap = {
        "days": days,
        "times": times,
        "cells": cells,
    }

    # Recent registered users
    recent_users_db = (
        db.query(User).order_by(User.created_at.desc()).limit(10).all()
    )
    recent_registered_users = [
        {
            "rank": idx + 1,
            "name": u.full_name,
            "email": u.email,
            "role": u.role.replace("_", " ").title(),
            "state": u.state or "All India",
            "joinDate": (
                u.created_at.strftime("%b %d, %Y")
                if u.created_at
                else "Recently"
            ),
        }
        for idx, u in enumerate(recent_users_db)
    ]

    # Top active users from AuditLog — batch User + SearchHistory lookups
    # (2 queries) instead of N+1 per-user queries.
    active_user_counts = (
        db.query(AuditLog.user_id, func.count(AuditLog.audit_id))
        .filter(AuditLog.user_id.isnot(None))
        .group_by(AuditLog.user_id)
        .order_by(desc(func.count(AuditLog.audit_id)))
        .limit(10)
        .all()
    )
    top_uids = [uid for uid, _ in active_user_counts]
    users_by_id = (
        {
            u.user_id: u
            for u in db.query(User).filter(User.user_id.in_(top_uids)).all()
        }
        if top_uids
        else {}
    )
    search_rows = (
        db.query(SearchHistory.user_id, func.count(SearchHistory.history_id))
        .filter(SearchHistory.user_id.in_(top_uids))
        .group_by(SearchHistory.user_id)
        .all()
        if top_uids
        else []
    )
    searches_by_user = {uid: c for uid, c in search_rows}
    top_active_users = []
    for idx, (uid, act_cnt) in enumerate(active_user_counts):
        u = users_by_id.get(uid)
        if u:
            top_active_users.append(
                {
                    "rank": idx + 1,
                    "name": u.full_name,
                    "email": u.email,
                    "role": u.role.replace("_", " ").title(),
                    "logins": act_cnt,
                    "searches": searches_by_user.get(uid, 0),
                    "lastActive": "Recently",
                }
            )

    return {
        "kpis": kpis,
        "growth_trend": growth_trend,
        "role_distribution": role_distribution,
        "registration_trend": registration_trend,
        "users_by_state": users_by_state,
        "engagement_metrics": engagement_metrics,
        "heatmap": heatmap,
        "recent_registered_users": recent_registered_users,
        "top_active_users": top_active_users,
    }


# =========================================================================
# 5. DEPARTMENT ANALYTICS
# =========================================================================


def get_admin_department_analytics(
    db: Session,
    search: Optional[str] = None,
    selected_department: str = "all",
) -> Dict[str, Any]:
    # Distinct department names come from the grouped aggregate queries
    # below (no separate DISTINCT roundtrips).

    # Department styling palettes
    palette = [
        ("#e6f4ea", "#3cb371", "eco"),
        ("#e8f0fe", "#2f6fed", "school"),
        ("#fef3e6", "#f5a524", "health_and_safety"),
        ("#f3e8fd", "#8b5cf6", "business"),
        ("#fce8e6", "#e5484d", "account_balance"),
        ("#e0f7fa", "#00838f", "biotech"),
    ]

    # Per-department aggregates — 2 grouped queries with conditional SUMs
    # instead of 8 COUNTs per department (N+1).
    pol_dept_rows = (
        db.query(
            Policy.department,
            func.count(Policy.policy_id),
            func.sum(case((Policy.status == "APPROVED", 1), else_=0)),
            func.sum(
                case(
                    (Policy.status.in_(["PENDING", "PENDING_APPROVAL"]), 1),
                    else_=0,
                )
            ),
            func.sum(case((Policy.status == "REJECTED", 1), else_=0)),
        )
        .filter(Policy.department.isnot(None))
        .group_by(Policy.department)
        .all()
    )
    pol_by_dept = {
        d: (t, int(a or 0), int(p or 0), int(r or 0))
        for d, t, a, p, r in pol_dept_rows
    }
    sch_dept_rows = (
        db.query(
            Scheme.department,
            func.count(Scheme.scheme_id),
            func.sum(case((Scheme.status == "APPROVED", 1), else_=0)),
            func.sum(
                case(
                    (
                        Scheme.status.in_(
                            ["PENDING", "PENDING_APPROVAL", "DRAFT"]
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(case((Scheme.status == "REJECTED", 1), else_=0)),
        )
        .filter(Scheme.department.isnot(None))
        .group_by(Scheme.department)
        .all()
    )
    sch_by_dept = {
        d: (t, int(a or 0), int(p or 0), int(r or 0))
        for d, t, a, p, r in sch_dept_rows
    }

    all_dept_names = sorted(
        {d for d in list(pol_by_dept) + list(sch_by_dept) if d and d.strip()}
    )

    def _pol_totals():
        t = sum(v[0] for v in pol_by_dept.values())
        a = sum(v[1] for v in pol_by_dept.values())
        p = sum(v[2] for v in pol_by_dept.values())
        r = sum(v[3] for v in pol_by_dept.values())
        # Include rows with NULL department in the "All" totals.
        null_pols = (
            db.query(func.count(Policy.policy_id))
            .filter(Policy.department.is_(None))
            .scalar()
            or 0
        )
        return t + null_pols, a, p, r

    def _sch_totals():
        t = sum(v[0] for v in sch_by_dept.values())
        a = sum(v[1] for v in sch_by_dept.values())
        p = sum(v[2] for v in sch_by_dept.values())
        r = sum(v[3] for v in sch_by_dept.values())
        null_schs = (
            db.query(func.count(Scheme.scheme_id))
            .filter(Scheme.department.is_(None))
            .scalar()
            or 0
        )
        return t + null_schs, a, p, r

    total_all_pols, act_all_pols, pend_all_pols, rej_all_pols = _pol_totals()
    total_all_schs, act_all_schs, pend_all_schs, rej_all_schs = _sch_totals()

    all_item = {
        "id": "all",
        "name": "All Departments",
        "count": len(all_dept_names),
        "icon": "account_balance",
        "iconBg": "#e8f0fe",
        "iconColor": "#2f6fed",
        "overview": {
            "title": "All Departments",
            "totalPolicies": total_all_pols,
            "activePolicies": act_all_pols,
            "pendingPolicies": pend_all_pols,
            "rejectedPolicies": rej_all_pols,
            "totalSchemes": total_all_schs,
            "activeSchemes": act_all_schs,
            "pendingSchemes": pend_all_schs,
            "rejectedSchemes": rej_all_schs,
        },
    }

    all_dept_items = [all_item]

    for idx, d_name in enumerate(all_dept_names):
        p_tot, p_act, p_pend, p_rej = pol_by_dept.get(d_name, (0, 0, 0, 0))
        s_tot, s_act, s_pend, s_rej = sch_by_dept.get(d_name, (0, 0, 0, 0))

        bg, col, icon = palette[idx % len(palette)]
        slug = (
            d_name.lower().replace(" ", "-").replace("&", "").replace(",", "")
        )

        all_dept_items.append(
            {
                "id": slug,
                "name": d_name,
                "count": p_tot + s_tot,
                "icon": icon,
                "iconBg": bg,
                "iconColor": col,
                "overview": {
                    "title": d_name,
                    "totalPolicies": p_tot,
                    "activePolicies": p_act,
                    "pendingPolicies": p_pend,
                    "rejectedPolicies": p_rej,
                    "totalSchemes": s_tot,
                    "activeSchemes": s_act,
                    "pendingSchemes": s_pend,
                    "rejectedSchemes": s_rej,
                },
            }
        )

    # Search filter
    filtered_items = all_dept_items
    if search and search.strip():
        q_term = search.lower().strip()
        filtered_items = [
            d
            for d in all_dept_items
            if q_term in d["name"].lower() or d["id"] == "all"
        ]

    # Selected Department Overview
    selected_overview = all_item["overview"]
    matched = next(
        (d for d in all_dept_items if d["id"] == selected_department), None
    )
    if matched:
        selected_overview = matched["overview"]

    # Trend datasets — 2 grouped queries instead of 2×N COUNTs.
    month_buckets = _month_bounds(6)
    month_labels = [b[2] for b in month_buckets]
    trend_start = month_buckets[0][3]

    def _trend_rows(model, created_col):
        filt = [created_col >= trend_start]
        if matched and matched["id"] != "all":
            filt.append(model.department == matched["name"])
        rows = (
            db.query(
                func.extract("year", created_col),
                func.extract("month", created_col),
                func.count(),
            )
            .filter(*filt)
            .group_by(
                func.extract("year", created_col),
                func.extract("month", created_col),
            )
            .all()
        )
        m = {(int(y), int(mo)): c for y, mo, c in rows}
        return [m.get((y, mo), 0) for y, mo, _, _, _ in month_buckets]

    pol_trend = _trend_rows(Policy, Policy.created_at)
    sch_trend = _trend_rows(Scheme, Scheme.created_at)

    trend_datasets = [
        {
            "label": "Policies",
            "data": pol_trend,
            "borderColor": "#2f6fed",
            "backgroundColor": "transparent",
            "tension": 0.3,
            "fill": False,
        },
        {
            "label": "Schemes",
            "data": sch_trend,
            "borderColor": "#3cb371",
            "backgroundColor": "transparent",
            "tension": 0.3,
            "fill": False,
        },
    ]

    # Top by policies & schemes
    top_pols = (
        db.query(Policy.department, func.count(Policy.policy_id))
        .filter(Policy.department.isnot(None))
        .group_by(Policy.department)
        .order_by(desc(func.count(Policy.policy_id)))
        .limit(5)
        .all()
    )
    top_by_policies = [
        {"label": p[0], "value": p[1]} for p in top_pols if p[0]
    ]

    top_schs = (
        db.query(Scheme.department, func.count(Scheme.scheme_id))
        .filter(Scheme.department.isnot(None))
        .group_by(Scheme.department)
        .order_by(desc(func.count(Scheme.scheme_id)))
        .limit(5)
        .all()
    )
    top_by_schemes = [{"label": s[0], "value": s[1]} for s in top_schs if s[0]]

    # Performance table: views/downloads have no source table
    # (no policy/scheme view counters in schema), so they are honestly
    # unavailable ("—"). lastUpdated is the real max(updated_at) per dept —
    # 2 grouped queries instead of 2×N MAX lookups.
    pol_max_rows = (
        db.query(Policy.department, func.max(Policy.updated_at))
        .filter(Policy.department.isnot(None))
        .group_by(Policy.department)
        .all()
    )
    sch_max_rows = (
        db.query(Scheme.department, func.max(Scheme.updated_at))
        .filter(Scheme.department.isnot(None))
        .group_by(Scheme.department)
        .all()
    )
    last_by_dept = {d: dt for d, dt in pol_max_rows}
    for d, dt in sch_max_rows:
        if dt and (
            d not in last_by_dept
            or not last_by_dept[d]
            or dt > last_by_dept[d]
        ):
            last_by_dept[d] = dt
    performance_table = []
    for idx, d_item in enumerate(all_dept_items[1:], 1):
        ov = d_item["overview"]
        last_dt = last_by_dept.get(d_item["name"])
        last_updated = last_dt.strftime("%b %d, %Y") if last_dt else "—"
        performance_table.append(
            {
                "rank": idx,
                "name": d_item["name"],
                "totalPolicies": ov["totalPolicies"],
                "activePolicies": ov["activePolicies"],
                "totalSchemes": ov["totalSchemes"],
                "activeSchemes": ov["activeSchemes"],
                "totalViews": "—",
                "downloads": "—",
                "lastUpdated": last_updated,
            }
        )

    return {
        "departments_list": filtered_items,
        "all_departments_list": all_dept_items,
        "selected_overview": selected_overview,
        "month_labels": month_labels,
        "trend_datasets": trend_datasets,
        "top_by_policies": top_by_policies,
        "top_by_schemes": top_by_schemes,
        "performance_table": performance_table,
    }


# =========================================================================
# 6. USAGE STATISTICS
# =========================================================================


def get_admin_usage_statistics(
    db: Session,
    activity_period: str = "Last 12 Months",
    daily_period: str = "Last 30 Days",
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    thirty_days_ago = now - timedelta(days=30)
    login_cond = or_(
        AuditLog.action.ilike("%login%"), AuditLog.action.ilike("%auth%")
    )
    # KPIs — 3 single-row conditional queries instead of 7 COUNTs.
    searches_row = db.query(
        func.count(SearchHistory.history_id),
        func.sum(
            case((SearchHistory.searched_at < thirty_days_ago, 1), else_=0)
        ),
    ).first()
    total_searches = searches_row[0] or 0
    searches_prev = int(searches_row[1] or 0)
    logins_row = (
        db.query(
            func.count(AuditLog.audit_id),
            func.sum(
                case(
                    (
                        and_(
                            login_cond, AuditLog.created_at < thirty_days_ago
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
        )
        .filter(login_cond)
        .first()
    )
    total_logins = logins_row[0] or 0
    logins_prev = int(logins_row[1] or 0)
    reports_row = db.query(
        func.count(Report.report_id),
        func.sum(case((Report.generated_at < thirty_days_ago, 1), else_=0)),
    ).first()
    reports_count = reports_row[0] or 0
    reports_prev = int(reports_row[1] or 0)
    visits_chg, visits_pos = _calc_change(total_logins, logins_prev)
    searches_chg, searches_pos = _calc_change(total_searches, searches_prev)
    docs_chg, docs_pos = _calc_change(reports_count, reports_prev)

    kpis = [
        {
            "label": "Total Visits",
            "value": f"{total_logins:,}",
            "change": visits_chg,
            "isPositive": visits_pos,
            "icon": "visibility",
            "iconClass": "blue",
        },
        {
            "label": "Total Searches",
            "value": f"{total_searches:,}",
            "change": searches_chg,
            "isPositive": searches_pos,
            "icon": "search",
            "iconClass": "purple",
        },
        {
            "label": "Policy Views",
            "value": "—",
            "change": "—",
            "isPositive": True,
            "subtext": "Not tracked yet",
            "icon": "description",
            "iconClass": "green",
        },
        {
            "label": "Scheme Views",
            "value": "—",
            "change": "—",
            "isPositive": True,
            "subtext": "Not tracked yet",
            "icon": "folder",
            "iconClass": "teal",
        },
        {
            "label": "Eligibility Checks",
            "value": "—",
            "change": "—",
            "isPositive": True,
            "subtext": "Not tracked yet",
            "icon": "rule",
            "iconClass": "orange",
        },
        {
            "label": "Document Downloads",
            "value": f"{reports_count:,}",
            "change": docs_chg,
            "isPositive": docs_pos,
            "icon": "download",
            "iconClass": "red",
        },
    ]

    # Activity trend — 2 grouped queries instead of 2×N COUNTs.
    act_months = _parse_months_count(activity_period, 3)
    buckets = _month_bounds(act_months)
    act_labels = [b[2] for b in buckets]
    act_start = buckets[0][3]

    s_rows = (
        db.query(
            func.extract("year", SearchHistory.searched_at),
            func.extract("month", SearchHistory.searched_at),
            func.count(SearchHistory.history_id),
        )
        .filter(SearchHistory.searched_at >= act_start)
        .group_by(
            func.extract("year", SearchHistory.searched_at),
            func.extract("month", SearchHistory.searched_at),
        )
        .all()
    )
    a_rows = (
        db.query(
            func.extract("year", AuditLog.created_at),
            func.extract("month", AuditLog.created_at),
            func.count(AuditLog.audit_id),
        )
        .filter(AuditLog.created_at >= act_start)
        .group_by(
            func.extract("year", AuditLog.created_at),
            func.extract("month", AuditLog.created_at),
        )
        .all()
    )
    s_map = {(int(y), int(m)): c for y, m, c in s_rows}
    a_map = {(int(y), int(m)): c for y, m, c in a_rows}
    search_series = [s_map.get((y, m), 0) for y, m, _, _, _ in buckets]
    actions_series = [a_map.get((y, m), 0) for y, m, _, _, _ in buckets]

    activity_trend = {
        "labels": act_labels,
        "series": [
            {"label": "Searches", "data": search_series, "color": "#2f6fed"},
            {
                "label": "System Actions",
                "data": actions_series,
                "color": "#3cb371",
            },
        ],
    }

    # Daily usage — 1 grouped query instead of N per-day COUNTs.
    days_count = (
        30 if "30" in daily_period else (14 if "14" in daily_period else 7)
    )
    day_starts = []
    daily_labels = []
    for i in range(days_count - 1, -1, -1):
        target_day = now - timedelta(days=i)
        lbl = (
            target_day.strftime("%d %b")
            if days_count <= 14
            else target_day.strftime("%d")
        )
        daily_labels.append(lbl)
        day_starts.append(target_day.date())
    range_start = datetime.combine(day_starts[0], datetime.min.time())
    day_rows = (
        db.query(
            func.date(AuditLog.created_at),
            func.count(AuditLog.audit_id),
        )
        .filter(AuditLog.created_at >= range_start)
        .group_by(func.date(AuditLog.created_at))
        .all()
    )
    day_map = {d: c for d, c in day_rows}
    daily_values = [day_map.get(d, 0) for d in day_starts]

    daily_usage = {
        "labels": daily_labels,
        "values": daily_values,
    }

    # Role distribution
    total_users = db.query(User).count()
    role_counts = (
        db.query(User.role, func.count(User.user_id)).group_by(User.role).all()
    )
    role_labels = []
    role_data = []
    role_colors = []
    role_colors_map = {
        "CITIZEN": "#2f6fed",
        "GOVERNMENT_OFFICIAL": "#3cb371",
        "RESEARCHER": "#8b5cf6",
        "ORGANIZATION": "#f5a524",
        "ADMIN": "#e5484d",
        "GUEST": "#94a3b8",
    }
    for r, count in role_counts:
        role_labels.append(r.replace("_", " ").title())
        role_data.append(count)
        role_colors.append(role_colors_map.get(r, "#64748b"))

    role_distribution = {
        "labels": role_labels,
        "data": role_data,
        "colors": role_colors,
        "total": f"{total_users:,}",
    }

    # Top policies/schemes: SearchHistory has search_query free text with
    # no policy/scheme FK, so per-item search counts cannot be attributed.
    # Return newest 10 with honestly unavailable counters ("—").
    # Top policies
    top_pols = (
        db.query(Policy).order_by(Policy.created_at.desc()).limit(10).all()
    )
    top_policies = [
        {
            "rank": idx + 1,
            "title": p.title,
            "searches": "—",
            "trend": "—",
            "isPositive": True,
        }
        for idx, p in enumerate(top_pols)
    ]

    # Top schemes
    top_schs = (
        db.query(Scheme).order_by(Scheme.created_at.desc()).limit(10).all()
    )
    top_schemes = [
        {
            "rank": idx + 1,
            "title": s.name,
            "searches": "—",
            "trend": "—",
            "isPositive": True,
        }
        for idx, s in enumerate(top_schs)
    ]

    # Most active users — batch User lookup (2 queries) instead of N+1.
    active_user_counts = (
        db.query(AuditLog.user_id, func.count(AuditLog.audit_id))
        .filter(AuditLog.user_id.isnot(None))
        .group_by(AuditLog.user_id)
        .order_by(desc(func.count(AuditLog.audit_id)))
        .limit(10)
        .all()
    )
    active_uids = [uid for uid, _ in active_user_counts]
    active_users_by_id = (
        {
            u.user_id: u
            for u in db.query(User).filter(User.user_id.in_(active_uids)).all()
        }
        if active_uids
        else {}
    )
    most_active_users = []
    for idx, (uid, act_cnt) in enumerate(active_user_counts):
        u = active_users_by_id.get(uid)
        if u:
            most_active_users.append(
                {
                    "rank": idx + 1,
                    "user": u.full_name,
                    "role": u.role.replace("_", " ").title(),
                    "activities": f"{act_cnt:,}",
                }
            )

    # Recent search activities
    recent_searches_db = (
        db.query(SearchHistory, User.full_name)
        .outerjoin(User, SearchHistory.user_id == User.user_id)
        .order_by(SearchHistory.searched_at.desc())
        .limit(10)
        .all()
    )
    recent_searches = [
        {
            "rank": idx + 1,
            "user": u_name or "Citizen",
            "query": sh.search_query,
            "type": (
                sh.search_type.capitalize() if sh.search_type else "Scheme"
            ),
            "dateTime": (
                sh.searched_at.strftime("%b %d, %Y %I:%M %p")
                if sh.searched_at
                else "Recently"
            ),
        }
        for idx, (sh, u_name) in enumerate(recent_searches_db)
    ]

    return {
        "kpis": kpis,
        "activity_trend": activity_trend,
        "daily_usage": daily_usage,
        "role_distribution": role_distribution,
        "top_policies": top_policies,
        "top_schemes": top_schemes,
        "most_active_users": most_active_users,
        "recent_searches": recent_searches,
    }
