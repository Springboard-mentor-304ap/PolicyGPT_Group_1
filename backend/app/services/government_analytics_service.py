"""Government Official analytics aggregations.

Four platform-wide payloads back the Government Analytics pages:
overview, policy & scheme, departments, and user & notifications.

Everything is a live SQLAlchemy aggregation — no mock data. Where the
database cannot back a metric, the payload carries an explicit
``tracked: False`` marker with a reason instead of a fabricated value.

NOT tracked:
  - per-department user counts (users have no department column)
  - private notifications in listings (user-targeted rows are excluded;
    only broadcasts ``user_id IS NULL`` appear in recent lists, while
    type/channel statistics remain totals without content)

Authorization: endpoints resolve the caller server-side and require the
GOVERNMENT_OFFICIAL role (ADMIN bypasses via ``require_roles``). No user
or department identity is accepted from the client.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.api.routes.auth import normalize_role
from app.models.notification import Notification
from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.user import User

STATUSES = ("DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "ARCHIVED")
CANONICAL_ROLES = (
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
    "GOVERNMENT_OFFICIAL",
    "ADMIN",
)
MAX_MONTHS = 24
RECENT_LIMIT = 8


def resolve_gov_window(
    months: int = 12,
    date_from: str | None = None,
    date_to: str | None = None,
    today: date | None = None,
) -> tuple[datetime, datetime]:
    """Resolve (start, end) datetimes in UTC.

    Custom dates override ``months``. Raises ValueError (mapped to 400).
    """
    now = today or datetime.now(timezone.utc).date()
    if date_from or date_to:
        if not date_from or not date_to:
            raise ValueError("Custom range requires both date_from and date_to (YYYY-MM-DD).")
        try:
            start_day = date.fromisoformat(str(date_from).strip()[:10])
            end_day = date.fromisoformat(str(date_to).strip()[:10])
        except ValueError:
            raise ValueError("Invalid date; expected YYYY-MM-DD.")
        if start_day > end_day:
            raise ValueError("date_from must be on or before date_to.")
        if (end_day - start_day).days > 731:
            raise ValueError("Date window is limited to 24 months.")
    else:
        try:
            months = int(months)
        except (TypeError, ValueError):
            raise ValueError("Invalid months; expected an integer.")
        if months < 1 or months > MAX_MONTHS:
            raise ValueError(f"months must be between 1 and {MAX_MONTHS}.")
        end_day = now
        # Go back months-1 calendar months to the 1st.
        year, month = end_day.year, end_day.month - (months - 1)
        while month <= 0:
            month += 12
            year -= 1
        start_day = date(year, month, 1)
    start = datetime(start_day.year, start_day.month, start_day.day)
    end = datetime(end_day.year, end_day.month, end_day.day) + timedelta(days=1)
    return start, end


def _month_keys(start: datetime, end: datetime) -> list[dict]:
    keys: list[dict] = []
    cursor = date(start.year, start.month, 1)
    last = (end - timedelta(days=1)).date()
    while cursor <= last:
        keys.append({"key": cursor.strftime("%Y-%m"), "label": cursor.strftime("%b %Y")})
        cursor = (cursor + timedelta(days=32)).replace(day=1)
    return keys


def _trend_counts(db: Session, model, date_col, start, end, extra=()):
    key = func.to_char(date_col, "YYYY-MM")
    rows = (
        db.query(key.label("k"), func.count().label("c"))
        .filter(date_col >= start, date_col < end, *extra)
        .group_by(key)
        .all()
    )
    return {str(k): int(c) for k, c in rows}


def _status_counts(db: Session, model, id_col, start, end, extra=()) -> dict:
    rows = (
        db.query(getattr(model, "status"), func.count(id_col).label("c"))
        .filter(*extra)
        .group_by(getattr(model, "status"))
        .all()
    )
    counts = {s: 0 for s in STATUSES}
    for status, count in rows:
        if status in counts:
            counts[status] = int(count)
        elif status:
            counts[str(status)] = int(count)
    return counts


def _dept_expr(model):
    trimmed = func.trim(getattr(model, "department"))
    return func.coalesce(func.nullif(trimmed, ""), "Unassigned")


def _recent_policies(db: Session, start, end, extra=(), limit=RECENT_LIMIT):
    rows = (
        db.query(Policy)
        .filter(Policy.created_at >= start, Policy.created_at < end, *extra)
        .order_by(Policy.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "policy_id": p.policy_id,
            "title": (p.title or "Policy")[:160],
            "category": p.category,
            "department": p.department,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in rows
    ]


def _recent_schemes(db: Session, start, end, extra=(), limit=RECENT_LIMIT):
    rows = (
        db.query(Scheme)
        .filter(Scheme.created_at >= start, Scheme.created_at < end, *extra)
        .order_by(Scheme.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "scheme_id": s.scheme_id,
            "title": (s.name or "Scheme")[:160],
            "category": s.category,
            "department": s.department,
            "status": s.status,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in rows
    ]


def _recent_broadcasts(db: Session, start, end, limit=RECENT_LIMIT):
    rows = (
        db.query(Notification)
        .filter(
            Notification.user_id.is_(None),
            Notification.created_at >= start,
            Notification.created_at < end,
        )
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "notification_id": n.notification_id,
            "title": (n.title or "Notification")[:160],
            "notification_type": n.notification_type,
            "channel": n.channel,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in rows
    ]


def _window_payload(start: datetime, end: datetime) -> dict:
    return {
        "from": start.date().isoformat(),
        "to": (end - timedelta(days=1)).date().isoformat(),
    }


def _departments_list(db: Session, limit=100) -> list[str]:
    values: set[str] = set()
    for model in (Policy, Scheme):
        rows = (
            db.query(_dept_expr(model).label("d"))
            .group_by(_dept_expr(model))
            .limit(limit)
            .all()
        )
        for (d,) in rows:
            if d:
                values.add(str(d))
    return sorted(values)


# ============================================================
# 1. OVERVIEW
# ============================================================

def get_government_overview(
    db: Session,
    months: int = 12,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    start, end = resolve_gov_window(months, date_from, date_to)
    keys = _month_keys(start, end)

    total_policies = db.query(Policy).count()
    total_schemes = db.query(Scheme).count()
    draft_policies = (
        db.query(Policy).filter(Policy.status == "DRAFT").count()
    )
    departments = len(_departments_list(db, limit=1000))
    total_users = db.query(User).count()
    new_notifications = (
        db.query(Notification)
        .filter(
            Notification.user_id.is_(None),
            Notification.created_at >= start,
            Notification.created_at < end,
        )
        .count()
    )

    policy_trend = _trend_counts(db, Policy, Policy.created_at, start, end)
    scheme_trend = _trend_counts(db, Scheme, Scheme.created_at, start, end)

    policy_status = _status_counts(db, Policy, Policy.policy_id, start, end)
    scheme_status = _status_counts(db, Scheme, Scheme.scheme_id, start, end)

    dept_rows = (
        db.query(_dept_expr(Policy).label("d"), func.count(Policy.policy_id).label("c"))
        .group_by(_dept_expr(Policy))
        .order_by(func.count(Policy.policy_id).desc())
        .limit(8)
        .all()
    )

    role_rows = (
        db.query(User.role, func.count(User.user_id).label("c")).group_by(User.role).all()
    )
    users_by_role: dict[str, int] = {r: 0 for r in CANONICAL_ROLES}
    for raw_role, count in role_rows:
        canonical = normalize_role(raw_role) or "CITIZEN"
        users_by_role[canonical] = users_by_role.get(canonical, 0) + int(count)

    type_rows = (
        db.query(Notification.notification_type, func.count().label("c"))
        .filter(Notification.created_at >= start, Notification.created_at < end)
        .group_by(Notification.notification_type)
        .order_by(func.count().desc())
        .limit(10)
        .all()
    )

    return {
        "window": _window_payload(start, end),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "kpis": {
            "total_policies": {"value": total_policies},
            "draft_policies": {"value": draft_policies},
            "total_schemes": {"value": total_schemes},
            "departments": {"value": departments},
            "total_users": {"value": total_users},
            "new_notifications": {"value": new_notifications},
        },
        "trends": {
            "labels": [k["label"] for k in keys],
            "policies": [policy_trend.get(k["key"], 0) for k in keys],
            "schemes": [scheme_trend.get(k["key"], 0) for k in keys],
        },
        "status_distribution": {
            "policies": policy_status,
            "schemes": scheme_status,
        },
        "top_departments": [
            {"department": str(d), "count": int(c)} for d, c in dept_rows
        ],
        "users_by_role": [
            {"role": r, "count": users_by_role.get(r, 0)} for r in CANONICAL_ROLES
        ],
        "notifications_by_type": [
            {"type": str(t), "count": int(c)} for t, c in type_rows
        ],
        "recent_policies": _recent_policies(db, start, end),
        "recent_schemes": _recent_schemes(db, start, end),
        "recent_notifications": _recent_broadcasts(db, start, end),
        "limitations": [
            "Department names fall back to 'Unassigned' when neither department nor ministry is set.",
            "Recent notification lists show broadcasts only; user-targeted notifications are private.",
        ],
    }


# ============================================================
# 2. POLICY & SCHEME ANALYTICS
# ============================================================

def get_government_policy_scheme(
    db: Session,
    months: int = 12,
    date_from: str | None = None,
    date_to: str | None = None,
    policy_status: str | None = None,
    scheme_status: str | None = None,
    category: str | None = None,
) -> dict:
    start, end = resolve_gov_window(months, date_from, date_to)
    keys = _month_keys(start, end)

    for value, name in ((policy_status, "policy_status"), (scheme_status, "scheme_status")):
        if value and value not in STATUSES:
            raise ValueError(f"Invalid {name}; expected one of {', '.join(STATUSES)}.")

    policy_filters = []
    if policy_status:
        policy_filters.append(Policy.status == policy_status)
    if category:
        policy_filters.append(Policy.category == category)
    scheme_filters = []
    if scheme_status:
        scheme_filters.append(Scheme.status == scheme_status)
    if category:
        scheme_filters.append(Scheme.category == category)

    total_policies = db.query(Policy).count()
    total_schemes = db.query(Scheme).count()
    policy_status_all = _status_counts(db, Policy, Policy.policy_id, start, end)
    scheme_status_all = _status_counts(db, Scheme, Scheme.scheme_id, start, end)

    policy_trend = _trend_counts(db, Policy, Policy.created_at, start, end, policy_filters)
    scheme_trend = _trend_counts(db, Scheme, Scheme.created_at, start, end, scheme_filters)

    policy_cats = (
        db.query(Policy.category, func.count(Policy.policy_id).label("c"))
        .filter(Policy.category.isnot(None))
        .group_by(Policy.category)
        .order_by(func.count(Policy.policy_id).desc())
        .limit(10)
        .all()
    )
    scheme_cats = (
        db.query(Scheme.category, func.count(Scheme.scheme_id).label("c"))
        .filter(Scheme.category.isnot(None))
        .group_by(Scheme.category)
        .order_by(func.count(Scheme.scheme_id).desc())
        .limit(10)
        .all()
    )

    categories = sorted(
        {str(c) for c, _ in policy_cats} | {str(c) for c, _ in scheme_cats}
    )

    return {
        "window": _window_payload(start, end),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters": {
            "policy_status": policy_status,
            "scheme_status": scheme_status,
            "category": category,
        },
        "filter_options": {
            "statuses": list(STATUSES),
            "categories": categories,
        },
        "kpis": {
            "total_policies": {"value": total_policies},
            "draft_policies": {"value": policy_status_all.get("DRAFT", 0)},
            "approved_policies": {"value": policy_status_all.get("APPROVED", 0)},
            "total_schemes": {"value": total_schemes},
            "draft_schemes": {"value": scheme_status_all.get("DRAFT", 0)},
            "approved_schemes": {"value": scheme_status_all.get("APPROVED", 0)},
        },
        "trends": {
            "labels": [k["label"] for k in keys],
            "policies": [policy_trend.get(k["key"], 0) for k in keys],
            "schemes": [scheme_trend.get(k["key"], 0) for k in keys],
        },
        "policy_vs_scheme": [
            {"label": "Policies", "count": total_policies},
            {"label": "Schemes", "count": total_schemes},
        ],
        "policies_by_category": [
            {"category": str(c), "count": int(n)} for c, n in policy_cats
        ],
        "schemes_by_category": [
            {"category": str(c), "count": int(n)} for c, n in scheme_cats
        ],
        "policy_status": policy_status_all,
        "scheme_status": scheme_status_all,
        "recent_policies": _recent_policies(db, start, end, policy_filters),
        "recent_schemes": _recent_schemes(db, start, end, scheme_filters),
        "limitations": [
            "Schemes have no sector column; scheme distribution uses the scheme category.",
            "KPIs are platform totals; trends and recent tables respect the active filters.",
        ],
    }


# ============================================================
# 3. DEPARTMENT ANALYTICS
# ============================================================

def get_government_departments(
    db: Session,
    months: int = 12,
    date_from: str | None = None,
    date_to: str | None = None,
    department: str | None = None,
) -> dict:
    start, end = resolve_gov_window(months, date_from, date_to)
    keys = _month_keys(start, end)

    dept_rows = (
        db.query(
            _dept_expr(Policy).label("d"),
            func.count(Policy.policy_id).label("policies"),
        )
        .group_by(_dept_expr(Policy))
        .all()
    )
    scheme_rows = (
        db.query(
            _dept_expr(Scheme).label("d"),
            func.count(Scheme.scheme_id).label("schemes"),
        )
        .group_by(_dept_expr(Scheme))
        .all()
    )
    approved_rows = (
        db.query(
            _dept_expr(Policy).label("d"),
            func.count(Policy.policy_id).label("c"),
        )
        .filter(Policy.status == "APPROVED")
        .group_by(_dept_expr(Policy))
        .all()
    ) + [
        (str(d), int(c))
        for d, c in (
            db.query(
                _dept_expr(Scheme).label("d"),
                func.count(Scheme.scheme_id).label("c"),
            )
            .filter(Scheme.status == "APPROVED")
            .group_by(_dept_expr(Scheme))
            .all()
        )
    ]
    pending_rows = (
        db.query(
            _dept_expr(Policy).label("d"),
            func.count(Policy.policy_id).label("c"),
        )
        .filter(Policy.status == "PENDING_APPROVAL")
        .group_by(_dept_expr(Policy))
        .all()
    ) + [
        (str(d), int(c))
        for d, c in (
            db.query(
                _dept_expr(Scheme).label("d"),
                func.count(Scheme.scheme_id).label("c"),
            )
            .filter(Scheme.status == "PENDING_APPROVAL")
            .group_by(_dept_expr(Scheme))
            .all()
        )
    ]

    table: dict[str, dict] = {}
    for d, c in dept_rows:
        table.setdefault(str(d), {"department": str(d), "policies": 0, "schemes": 0, "approved": 0, "pending": 0})
        table[str(d)]["policies"] = int(c)
    for d, c in scheme_rows:
        table.setdefault(str(d), {"department": str(d), "policies": 0, "schemes": 0, "approved": 0, "pending": 0})
        table[str(d)]["schemes"] = int(c)
    for d, c in approved_rows:
        table.setdefault(str(d), {"department": str(d), "policies": 0, "schemes": 0, "approved": 0, "pending": 0})
        table[str(d)]["approved"] += int(c)
    for d, c in pending_rows:
        table.setdefault(str(d), {"department": str(d), "policies": 0, "schemes": 0, "approved": 0, "pending": 0})
        table[str(d)]["pending"] += int(c)

    rows = sorted(table.values(), key=lambda r: r["policies"] + r["schemes"], reverse=True)
    total_departments = len(rows)
    total_policies = sum(r["policies"] for r in rows)
    total_schemes = sum(r["schemes"] for r in rows)
    approved_requests = sum(r["approved"] for r in rows)
    pending_requests = sum(r["pending"] for r in rows)

    scope = [department] if department else []
    trend_extra_p = [Policy.created_at >= start, Policy.created_at < end]
    trend_extra_s = [Scheme.created_at >= start, Scheme.created_at < end]
    if department:
        trend_extra_p.append(_dept_expr(Policy) == department)
        trend_extra_s.append(_dept_expr(Scheme) == department)
    policy_trend = _trend_counts(db, Policy, Policy.created_at, start, end, trend_extra_p)
    scheme_trend = _trend_counts(db, Scheme, Scheme.created_at, start, end, trend_extra_s)

    top = rows[:8]
    policy_share = rows[:6]
    other_policies = sum(r["policies"] for r in rows[6:])

    recent_rows = sorted(
        [
            {
                "type": "Policy",
                "title": r["title"],
                "department": r["department"],
                "status": r["status"],
                "created_at": r["created_at"],
                "entity": "policies",
                "entity_id": r["policy_id"],
            }
            for r in _recent_policies(db, start, end, trend_extra_p[2:] if department else [], limit=10)
        ]
        + [
            {
                "type": "Scheme",
                "title": r["title"],
                "department": r["department"],
                "status": r["status"],
                "created_at": r["created_at"],
                "entity": "schemes",
                "entity_id": r["scheme_id"],
            }
            for r in _recent_schemes(db, start, end, trend_extra_s[2:] if department else [], limit=10)
        ],
        key=lambda r: r["created_at"] or "",
        reverse=True,
    )[:10]

    return {
        "window": _window_payload(start, end),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters": {"department": department},
        "filter_options": {"departments": [r["department"] for r in rows]},
        "kpis": {
            "total_departments": {"value": total_departments},
            "total_policies": {"value": total_policies},
            "total_schemes": {"value": total_schemes},
            "approved_requests": {"value": approved_requests},
            "pending_requests": {"value": pending_requests},
            "department_users": {
                "value": 0,
                "tracked": False,
                "reason": "User accounts carry no department column, so per-department user counts cannot be computed.",
            },
        },
        "grouped": {
            "departments": [r["department"] for r in top],
            "policies": [r["policies"] for r in top],
            "schemes": [r["schemes"] for r in top],
        },
        "distribution": (
            [{"department": r["department"], "count": r["policies"]} for r in policy_share]
            + ([{"department": "Other", "count": other_policies}] if other_policies else [])
        ),
        "top_policy_departments": [
            {"department": r["department"], "count": r["policies"]} for r in rows[:8]
        ],
        "top_scheme_departments": [
            {"department": r["department"], "count": r["schemes"]}
            for r in sorted(rows, key=lambda r: r["schemes"], reverse=True)[:8]
        ],
        "activity_trend": {
            "labels": [k["label"] for k in keys],
            "policies": [policy_trend.get(k["key"], 0) for k in keys],
            "schemes": [scheme_trend.get(k["key"], 0) for k in keys],
        },
        "recent_activities": recent_rows,
        "department_table": rows,
        "limitations": [
            "Departments fall back to 'Unassigned' when neither department nor ministry is set.",
            "Requests count APPROVED and PENDING_APPROVAL policy/scheme records.",
            "User accounts carry no department column, so department user counts are unavailable.",
        ],
    }


# ============================================================
# 4. USER & NOTIFICATION STATISTICS
# ============================================================

def get_government_user_notifications(
    db: Session,
    months: int = 12,
    date_from: str | None = None,
    date_to: str | None = None,
    role: str | None = None,
    channel: str | None = None,
) -> dict:
    start, end = resolve_gov_window(months, date_from, date_to)
    keys = _month_keys(start, end)
    month_index = {k["key"]: i for i, k in enumerate(keys)}

    if role:
        canonical_role = normalize_role(role)
        if canonical_role not in CANONICAL_ROLES:
            raise ValueError(f"Invalid role; expected one of {', '.join(CANONICAL_ROLES)}.")
    else:
        canonical_role = None

    role_rows = (
        db.query(User.role, func.count(User.user_id).label("c")).group_by(User.role).all()
    )
    users_by_role: dict[str, int] = {r: 0 for r in CANONICAL_ROLES}
    for raw_role, count in role_rows:
        canonical = normalize_role(raw_role) or "CITIZEN"
        users_by_role[canonical] = users_by_role.get(canonical, 0) + int(count)
    total_users = sum(users_by_role.values())

    reg_rows = (
        db.query(
            func.to_char(User.created_at, "YYYY-MM").label("k"),
            User.role,
            func.count(User.user_id).label("c"),
        )
        .filter(User.created_at >= start, User.created_at < end)
        .group_by(func.to_char(User.created_at, "YYYY-MM"), User.role)
        .all()
    )
    registrations: dict[str, list[int]] = {r: [0] * len(keys) for r in CANONICAL_ROLES}
    for key, raw_role, count in reg_rows:
        canonical = normalize_role(raw_role) or "CITIZEN"
        if canonical not in registrations:
            registrations[canonical] = [0] * len(keys)
        if str(key) in month_index:
            registrations[canonical][month_index[str(key)]] += int(count)

    active_rows = (
        db.query(User.role, func.count(User.user_id).label("c"))
        .filter(User.is_active.is_(True))
        .group_by(User.role)
        .all()
    )
    active_by_role: dict[str, int] = {r: 0 for r in CANONICAL_ROLES}
    for raw_role, count in active_rows:
        canonical = normalize_role(raw_role) or "CITIZEN"
        active_by_role[canonical] = active_by_role.get(canonical, 0) + int(count)

    state_rows = (
        db.query(User.state, func.count(User.user_id).label("c"))
        .filter(User.state.isnot(None))
        .group_by(User.state)
        .order_by(func.count(User.user_id).desc())
        .limit(12)
        .all()
    )

    notif_filters = [Notification.created_at >= start, Notification.created_at < end]
    if channel:
        notif_filters.append(Notification.channel == channel)
    type_rows = (
        db.query(Notification.notification_type, func.count().label("c"))
        .filter(*notif_filters)
        .group_by(Notification.notification_type)
        .order_by(func.count().desc())
        .limit(10)
        .all()
    )
    channel_rows = (
        db.query(
            Notification.channel,
            func.count().label("total"),
            func.sum(case((Notification.is_read.is_(True), 1), else_=0)).label("read"),
        )
        .filter(*notif_filters)
        .group_by(Notification.channel)
        .all()
    )
    channels = sorted({str(c) for c, _, _ in channel_rows})

    user_filters = []
    if canonical_role:
        all_roles = [canonical_role]
        # Include stored aliases mapping to the canonical role.
        alias_map = {
            "ADMIN": ["ADMIN", "ADMINISTRATOR"],
            "ORGANIZATION": ["ORGANIZATION", "ORGANISATION"],
            "GOVERNMENT_OFFICIAL": ["GOVERNMENT_OFFICIAL", "GOVERNMENT", "GOVT", "GOVERNMENT_OFFICER"],
        }
        all_roles = alias_map.get(canonical_role, [canonical_role])
        user_filters.append(User.role.in_(all_roles))
    recent_users_rows = (
        db.query(User)
        .filter(*user_filters)
        .order_by(User.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "window": _window_payload(start, end),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters": {"role": canonical_role, "channel": channel},
        "filter_options": {"roles": list(CANONICAL_ROLES), "channels": channels},
        "kpis": {
            "total_users": {"value": total_users},
            "citizens": {"value": users_by_role.get("CITIZEN", 0)},
            "researchers": {"value": users_by_role.get("RESEARCHER", 0)},
            "organizations": {"value": users_by_role.get("ORGANIZATION", 0)},
            "government_officials": {"value": users_by_role.get("GOVERNMENT_OFFICIAL", 0)},
            "administrators": {"value": users_by_role.get("ADMIN", 0)},
        },
        "growth_trend": {
            "labels": [k["label"] for k in keys],
            "total": [
                sum(registrations[r][i] for r in registrations) for i in range(len(keys))
            ],
            "by_role": [
                {"role": r, "values": registrations.get(r, [0] * len(keys))}
                for r in CANONICAL_ROLES
            ],
        },
        "users_by_role": [
            {"role": r, "count": users_by_role.get(r, 0)} for r in CANONICAL_ROLES
        ],
        "users_by_state": [
            {"state": str(s), "count": int(c)} for s, c in state_rows
        ],
        "active_by_role": [
            {"role": r, "count": active_by_role.get(r, 0)} for r in CANONICAL_ROLES
        ],
        "notifications_by_type": [
            {"type": str(t), "count": int(c)} for t, c in type_rows
        ],
        "notifications_by_channel": [
            {"channel": str(c), "total": int(t or 0), "read": int(r or 0)}
            for c, t, r in channel_rows
        ],
        "recent_users": [
            {
                "user_id": u.user_id,
                "full_name": u.full_name,
                "role": normalize_role(u.role) or u.role,
                "state": u.state,
                "is_active": bool(u.is_active),
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in recent_users_rows
        ],
        "recent_notifications": _recent_broadcasts(db, start, end),
        "limitations": [
            "Recent notification lists show broadcasts only; user-targeted notifications are private.",
            "Recent user rows expose name, role, state and status only — no contact details.",
        ],
    }
