"""Personal (role-scoped) analytics aggregations.

Serves the Citizen / Researcher / Organization Analytics pages with real
database aggregations only. No mock data, no fabricated percentage changes.

Tracked today:
  - saved policies / saved schemes (saved_policies / saved_schemes)
  - searches (extensions.search_history)
  - notifications (extensions.notifications, incl. broadcasts user_id IS NULL)

NOT tracked (returned as explicit zeros with ``tracked: False``):
  - policy views / scheme views (no view table exists)
  - eligibility checks (eligibility endpoints are stateless)
  - comparisons (compare endpoints are stateless reads)
  - organization team activity (users.organization is free text, no membership)

Authorization: every query is scoped to the authenticated user's own
``user_id`` resolved server-side from the token. No user_id / organization_id
is accepted from the client.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.policy import Policy
from app.models.saved_policy import SavedPolicy
from app.models.saved_scheme import SavedScheme
from app.models.scheme import Scheme
from app.models.search_history import SearchHistory
from app.models.user import User

ALLOWED_RANGES = ("7d", "30d", "6m", "12m", "custom")
MAX_WINDOW_DAYS = 730

# Metrics the database cannot back yet. Frontend renders these as honest
# zero/empty states with a "not tracked yet" explanation.
UNTRACKED = {
    "policy_views": "Policy detail views are not recorded yet.",
    "scheme_views": "Scheme detail views are not recorded yet.",
    "eligibility_checks": "Eligibility checks are evaluated in memory and are not stored.",
    "comparisons": "Comparisons are stateless reads; no comparison history is stored.",
}

LIMITATIONS = [
    "Policy views, scheme views, eligibility checks and comparisons are not "
    "tracked by the backend yet, so they are reported as zero / empty.",
    "Scheme records have no sector column, so scheme distribution uses the "
    "scheme category.",
    "Platform-wide distributions cover approved platform records and are "
    "labelled as platform-wide, not personal activity.",
    "Organization analytics are scoped to the authenticated user's own "
    "activity; team size counts accounts sharing the same organization name.",
]


def _parse_day(value: str | None, name: str) -> date | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        raise ValueError(f"Invalid {name}; expected YYYY-MM-DD.")


def resolve_window(
    range: str = "30d",
    date_from: str | None = None,
    date_to: str | None = None,
    today: date | None = None,
) -> tuple[datetime, datetime, str]:
    """Resolve (start, end, bucket) datetimes in UTC from range params.

    ``bucket`` is "day" for windows up to 62 days, else "month".
    Raises ValueError on invalid input (callers map to HTTP 400).
    """
    if range not in ALLOWED_RANGES:
        raise ValueError(f"Invalid range; expected one of {', '.join(ALLOWED_RANGES)}.")
    now = today or datetime.now(timezone.utc).date()
    if range == "custom":
        start_day = _parse_day(date_from, "date_from")
        end_day = _parse_day(date_to, "date_to")
        if start_day is None or end_day is None:
            raise ValueError("Custom range requires date_from and date_to (YYYY-MM-DD).")
        if start_day > end_day:
            raise ValueError("date_from must be on or before date_to.")
        if (end_day - start_day).days > MAX_WINDOW_DAYS:
            raise ValueError(f"Date window is limited to {MAX_WINDOW_DAYS} days.")
    else:
        days = {"7d": 7, "30d": 30, "6m": 182, "12m": 365}[range]
        end_day = now
        start_day = end_day - timedelta(days=days - 1)
    start = datetime(start_day.year, start_day.month, start_day.day)
    # End is exclusive upper bound (start of the day after end_day).
    end = datetime(end_day.year, end_day.month, end_day.day) + timedelta(days=1)
    span = (end_day - start_day).days + 1
    return start, end, ("day" if span <= 62 else "month")


def _pct_change(current: int, previous: int) -> float | None:
    """Percentage change vs the previous equivalent period.

    Returns None when the comparison is undefined (previous == 0) instead of
    fabricating a value.
    """
    if previous <= 0:
        return None
    return round((current - previous) * 100.0 / previous, 1)


def _notification_scope(user_id: int):
    return or_(
        Notification.user_id == user_id,
        Notification.user_id.is_(None),
    )


def _bucket_labels(start: datetime, end: datetime, bucket: str) -> list[dict]:
    labels: list[dict] = []
    if bucket == "day":
        cursor = start
        while cursor < end:
            labels.append(
                {"key": cursor.strftime("%Y-%m-%d"), "label": cursor.strftime("%d %b")}
            )
            cursor += timedelta(days=1)
    else:
        cursor = date(start.year, start.month, 1)
        end_day = (end - timedelta(days=1)).date()
        while cursor <= end_day:
            labels.append(
                {"key": cursor.strftime("%Y-%m"), "label": cursor.strftime("%b %Y")}
            )
            cursor = (cursor + timedelta(days=32)).replace(day=1)
    return labels


def get_personal_analytics(
    db: Session,
    user: User,
    role: str,
    range: str = "30d",
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Aggregate one user's analytics for the resolved date window."""
    start, end, bucket = resolve_window(range, date_from, date_to)
    span_days = (end - start).days
    prev_start = start - timedelta(days=span_days)
    uid = user.user_id

    # --------------------------------------------------
    # Base queries (all server-side scoped to the user)
    # --------------------------------------------------
    searches_q = db.query(SearchHistory).filter(
        SearchHistory.user_id == uid,
        SearchHistory.searched_at >= start,
        SearchHistory.searched_at < end,
    )
    saved_policies_q = db.query(SavedPolicy).filter(
        SavedPolicy.user_id == uid,
        SavedPolicy.saved_at >= start,
        SavedPolicy.saved_at < end,
    )
    saved_schemes_q = db.query(SavedScheme).filter(
        SavedScheme.user_id == uid,
        SavedScheme.saved_at >= start,
        SavedScheme.saved_at < end,
    )
    notifications_q = db.query(Notification).filter(
        _notification_scope(uid),
        Notification.created_at >= start,
        Notification.created_at < end,
    )

    total_searches = searches_q.count()
    saved_policies_count = saved_policies_q.count()
    saved_schemes_count = saved_schemes_q.count()
    notifications_total = notifications_q.count()
    notifications_unread = (
        db.query(Notification)
        .filter(
            _notification_scope(uid),
            Notification.created_at >= start,
            Notification.created_at < end,
            Notification.is_read.is_(False),
        )
        .count()
    )

    # --------------------------------------------------
    # Previous-period comparison (same window length)
    # --------------------------------------------------
    prev_searches = (
        db.query(SearchHistory)
        .filter(
            SearchHistory.user_id == uid,
            SearchHistory.searched_at >= prev_start,
            SearchHistory.searched_at < start,
        )
        .count()
    )
    prev_saved_policies = (
        db.query(SavedPolicy)
        .filter(
            SavedPolicy.user_id == uid,
            SavedPolicy.saved_at >= prev_start,
            SavedPolicy.saved_at < start,
        )
        .count()
    )
    prev_saved_schemes = (
        db.query(SavedScheme)
        .filter(
            SavedScheme.user_id == uid,
            SavedScheme.saved_at >= prev_start,
            SavedScheme.saved_at < start,
        )
        .count()
    )
    prev_saved = prev_saved_policies + prev_saved_schemes
    prev_notifications = (
        db.query(Notification)
        .filter(
            _notification_scope(uid),
            Notification.created_at >= prev_start,
            Notification.created_at < start,
        )
        .count()
    )

    # --------------------------------------------------
    # Trend buckets (one grouped query per tracked table)
    # --------------------------------------------------
    def _grouped(model, column: str):
        col = getattr(model, column)
        if bucket == "day":
            key = func.to_char(col, "YYYY-MM-DD")
        else:
            key = func.to_char(col, "YYYY-MM")
        rows = (
            db.query(key.label("k"), func.count().label("c"))
            .filter(getattr(model, "user_id") == uid, col >= start, col < end)
            .group_by(key)
            .all()
        )
        return {str(k): int(c) for k, c in rows}

    search_buckets = _grouped(SearchHistory, "searched_at")
    saved_pol_buckets = _grouped(SavedPolicy, "saved_at")
    saved_sch_buckets = _grouped(SavedScheme, "saved_at")

    notif_col = Notification.created_at
    notif_key = (
        func.to_char(notif_col, "YYYY-MM-DD")
        if bucket == "day"
        else func.to_char(notif_col, "YYYY-MM")
    )
    notif_buckets = {
        str(k): int(c)
        for k, c in (
            db.query(notif_key.label("k"), func.count().label("c"))
            .filter(_notification_scope(uid), notif_col >= start, notif_col < end)
            .group_by(notif_key)
            .all()
        )
    }

    trend = [
        {
            "key": b["key"],
            "label": b["label"],
            "searches": search_buckets.get(b["key"], 0),
            "saved_policies": saved_pol_buckets.get(b["key"], 0),
            "saved_schemes": saved_sch_buckets.get(b["key"], 0),
            "notifications": notif_buckets.get(b["key"], 0),
            "policy_views": 0,
            "scheme_views": 0,
            "eligibility_checks": 0,
            "comparisons": 0,
        }
        for b in _bucket_labels(start, end, bucket)
    ]

    # --------------------------------------------------
    # Breakdown + top searches
    # --------------------------------------------------
    breakdown = [
        {
            "key": "searches",
            "label": "Searches",
            "count": total_searches,
            "description": "Policy and scheme searches you ran.",
        },
        {
            "key": "saved_policies",
            "label": "Saved Policies",
            "count": saved_policies_count,
            "description": "Policies you bookmarked for later.",
        },
        {
            "key": "saved_schemes",
            "label": "Saved Schemes",
            "count": saved_schemes_count,
            "description": "Schemes you bookmarked for later.",
        },
        {
            "key": "notifications",
            "label": "Notifications",
            "count": notifications_total,
            "description": "Alerts delivered to you (incl. broadcast).",
        },
    ]
    total_activities = sum(b["count"] for b in breakdown)

    top_rows = (
        db.query(
            func.trim(SearchHistory.search_query).label("q"),
            func.count().label("c"),
        )
        .filter(
            SearchHistory.user_id == uid,
            SearchHistory.searched_at >= start,
            SearchHistory.searched_at < end,
        )
        .group_by(func.trim(SearchHistory.search_query))
        .order_by(func.count().desc())
        .limit(10)
        .all()
    )
    top_searches = [
        {
            "keyword": (q or "")[:120] or "—",
            "count": int(c),
            "pct": round(int(c) * 100.0 / total_searches, 1) if total_searches else 0.0,
        }
        for q, c in top_rows
        if (q or "").strip()
    ]

    # --------------------------------------------------
    # Saved items (window-scoped, newest first, capped).
    # Fetched once and reused for both the recent-activity feed
    # and the saved-item tables — no duplicate join queries.
    # --------------------------------------------------
    saved_policy_rows = (
        db.query(SavedPolicy, Policy)
        .join(Policy, Policy.policy_id == SavedPolicy.policy_id)
        .filter(
            SavedPolicy.user_id == uid,
            SavedPolicy.saved_at >= start,
            SavedPolicy.saved_at < end,
        )
        .order_by(SavedPolicy.saved_at.desc())
        .limit(50)
        .all()
    )
    saved_scheme_rows = (
        db.query(SavedScheme, Scheme)
        .join(Scheme, Scheme.scheme_id == SavedScheme.scheme_id)
        .filter(
            SavedScheme.user_id == uid,
            SavedScheme.saved_at >= start,
            SavedScheme.saved_at < end,
        )
        .order_by(SavedScheme.saved_at.desc())
        .limit(50)
        .all()
    )

    # --------------------------------------------------
    # Recent activity (merged, newest first)
    # --------------------------------------------------
    recent_searches = (
        searches_q.order_by(SearchHistory.searched_at.desc()).limit(5).all()
    )
    recent_notifications = (
        notifications_q.order_by(Notification.created_at.desc()).limit(6).all()
    )

    activity: list[dict] = []
    for s in recent_searches:
        activity.append(
            {
                "type": "search",
                "title": (s.search_query or "Search")[:120],
                "subtitle": f"{(s.search_type or 'SEARCH').title()} search",
                "timestamp": s.searched_at.isoformat() if s.searched_at else None,
            }
        )
    for sp, p in saved_policy_rows[:5]:
        activity.append(
            {
                "type": "saved_policy",
                "title": (p.title or "Policy")[:120],
                "subtitle": f"Saved policy · {(p.category or '—')}",
                "timestamp": sp.saved_at.isoformat() if sp.saved_at else None,
                "entity_id": p.policy_id,
            }
        )
    for ss, sch in saved_scheme_rows[:5]:
        activity.append(
            {
                "type": "saved_scheme",
                "title": (sch.name or "Scheme")[:120],
                "subtitle": f"Saved scheme · {(sch.category or '—')}",
                "timestamp": ss.saved_at.isoformat() if ss.saved_at else None,
                "entity_id": sch.scheme_id,
            }
        )
    for n in recent_notifications:
        activity.append(
            {
                "type": "notification",
                "title": (n.title or "Notification")[:120],
                "subtitle": f"{(n.notification_type or 'Alert').replace('_', ' ').title()}",
                "timestamp": n.created_at.isoformat() if n.created_at else None,
                "is_read": bool(n.is_read),
            }
        )
    activity.sort(key=lambda a: a.get("timestamp") or "", reverse=True)
    activity = activity[:12]

    # --------------------------------------------------
    # Saved item tables (projected from the same rows)
    # --------------------------------------------------
    saved_policies = [
        {
            "policy_id": p.policy_id,
            "title": (p.title or "Policy")[:160],
            "category": p.category,
            "state": getattr(p, "state", None),
            "status": p.status,
            "saved_on": sp.saved_at.isoformat() if sp.saved_at else None,
        }
        for sp, p in saved_policy_rows
    ]
    saved_schemes = [
        {
            "scheme_id": sch.scheme_id,
            "title": (sch.name or "Scheme")[:160],
            "category": sch.category,
            "state": getattr(sch, "state", None),
            "status": sch.status,
            "saved_on": ss.saved_at.isoformat() if ss.saved_at else None,
        }
        for ss, sch in saved_scheme_rows
    ]

    # --------------------------------------------------
    # Platform-wide distributions (approved records only,
    # labelled platform-wide — not the user's activity)
    # --------------------------------------------------
    policy_cats = (
        db.query(Policy.category, func.count(Policy.policy_id).label("c"))
        .filter(Policy.status == "APPROVED", Policy.category.isnot(None))
        .group_by(Policy.category)
        .order_by(func.count(Policy.policy_id).desc())
        .limit(8)
        .all()
    )
    scheme_cats = (
        db.query(Scheme.category, func.count(Scheme.scheme_id).label("c"))
        .filter(Scheme.status == "APPROVED", Scheme.category.isnot(None))
        .group_by(Scheme.category)
        .order_by(func.count(Scheme.scheme_id).desc())
        .limit(8)
        .all()
    )

    # --------------------------------------------------
    # Organization team size (same free-text organization name)
    # --------------------------------------------------
    team_members: int | None = None
    if role == "ORGANIZATION":
        org_name = (user.organization or "").strip()
        if org_name:
            team_members = (
                db.query(User)
                .filter(func.lower(func.trim(User.organization)) == org_name.lower())
                .count()
            )
        else:
            team_members = 1

    saved_total = saved_policies_count + saved_schemes_count

    kpis = {
        "saved_policies": {
            "value": saved_policies_count,
            "delta_pct": _pct_change(saved_policies_count, prev_saved_policies),
        },
        "saved_schemes": {
            "value": saved_schemes_count,
            "delta_pct": _pct_change(saved_schemes_count, prev_saved_schemes),
        },
        "saved_items": {"value": saved_total, "delta_pct": _pct_change(saved_total, prev_saved)},
        "total_searches": {"value": total_searches, "delta_pct": _pct_change(total_searches, prev_searches)},
        "notifications": {
            "value": notifications_total,
            "unread": notifications_unread,
            "delta_pct": _pct_change(notifications_total, prev_notifications),
        },
        "team_members": {"value": team_members, "delta_pct": None},
    }
    for key, reason in UNTRACKED.items():
        kpis[key] = {"value": 0, "delta_pct": None, "tracked": False, "reason": reason}

    # Aggregated in the database — never fetch full history rows
    # just to count them by type.
    search_type_rows = (
        db.query(SearchHistory.search_type, func.count().label("c"))
        .filter(
            SearchHistory.user_id == uid,
            SearchHistory.searched_at >= start,
            SearchHistory.searched_at < end,
        )
        .group_by(SearchHistory.search_type)
        .all()
    )

    return {
        "role": role,
        "window": {
            "range": range,
            "from": start.date().isoformat(),
            "to": (end - timedelta(days=1)).date().isoformat(),
            "bucket": bucket,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "kpis": kpis,
        "trend": trend,
        "breakdown": breakdown,
        "total_activities": total_activities,
        "recent_activity": activity,
        "top_searches": top_searches,
        "search_types": [
            {"type": t or "UNKNOWN", "count": int(c)}
            for t, c in sorted(search_type_rows, key=lambda r: int(r[1]), reverse=True)
        ],
        "recent_notifications": [
            {
                "notification_id": n.notification_id,
                "title": (n.title or "Notification")[:160],
                "notification_type": n.notification_type,
                "category": n.category,
                "created_at": n.created_at.isoformat() if n.created_at else None,
                "is_read": bool(n.is_read),
            }
            for n in recent_notifications
        ],
        "saved_policies": saved_policies,
        "saved_schemes": saved_schemes,
        "policies_by_category": [
            {"category": c, "count": int(n)} for c, n in policy_cats
        ],
        "schemes_by_category": [
            {"category": c, "count": int(n)} for c, n in scheme_cats
        ],
        "comparisons": [],
        "comparisons_tracked": False,
        "most_viewed_policies": [],
        "most_viewed_schemes": [],
        "popularity_tracked": False,
        "limitations": LIMITATIONS,
    }
