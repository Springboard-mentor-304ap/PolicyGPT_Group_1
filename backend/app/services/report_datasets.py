"""
Each builder returns a renderer-friendly dict:

    {
        "title": str,
        "report_type": str,
        "generated_at": iso-string,
        "filters": dict,          # effective (scoped) filters
        "summary": [(label, value)],
        "sections": [{"heading": str, "headers": [...], "rows": [[...]]}],
        "empty": bool,
        "empty_message": str | None,
    }

Role visibility is applied here, before rendering. No hardcoded counts.
"""

from collections import Counter
from datetime import date, datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.feedback import Feedback
from app.models.notification import Notification
from app.models.policy import Policy
from app.models.scheme import Scheme
from app.models.search_history import SearchHistory
from app.models.user import User

UNSPECIFIED = "Unspecified"
EMPTY_MESSAGE = "No data available for the selected filters."
EMPTY_ACTIVITY_MESSAGE = "No activity data available for the selected period."


# ============================================================
# HELPERS
# ============================================================


def _parse_date(value: object, name: str) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        raise ValueError(f"Invalid {name}: expected YYYY-MM-DD")


def _date_range(filters: dict) -> tuple[date | None, date | None]:
    start = _parse_date(filters.get("date_from"), "date_from")
    end = _parse_date(filters.get("date_to"), "date_to")
    if start and end and start > end:
        raise ValueError("date_from must be on or before date_to")
    return start, end


def _is_admin(role: str | None) -> bool:
    from app.api.routes.auth import normalize_role

    return normalize_role(role) == "ADMIN"


def _is_staff(role: str | None) -> bool:
    """ADMIN + GOVERNMENT_OFFICIAL see full (non-public) rows."""
    from app.api.routes.auth import normalize_role

    return normalize_role(role) in ("ADMIN", "GOVERNMENT_OFFICIAL")


def _fmt(value: object) -> str:
    if value is None:
        return UNSPECIFIED
    if isinstance(value, (datetime, date)):
        return value.isoformat()[:10]
    return str(value)


def _month_key(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    return f"{value.year:04d}-{value.month:02d}"


def _base_dataset(
    report_type: str,
    title: str | None,
    filters: dict,
    detail: str | None = None,
) -> dict:
    return {
        "title": title or report_type,
        "report_type": report_type,
        "detail": detail,
        "generated_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat(),
        "filters": dict(filters or {}),
        "summary": [],
        "sections": [],
        "empty": False,
        "empty_message": None,
    }


# ============================================================
# DETAIL SELECTION (CATEGORY + DETAIL architecture)
# ============================================================
# Maps (report_type, detail) -> (summary labels to keep [None = all],
# section headings to keep). Builders always produce the full
# category dataset; the detail selects the rendered subset.

_DETAIL_SELECTION: dict[str, dict[str, tuple[list[str] | None, list[str]]]] = {
    "POLICY_REPORT": {
        "overview": (None, ["Policies"]),
        "status": (
            [
                "Total policies",
                "Approved",
                "Pending approval",
                "Rejected",
                "Draft",
                "Archived",
            ],
            ["By status"],
        ),
        "ministry-wise": (["Total policies", "Ministries"], ["By ministry"]),
        "department-wise": (
            ["Total policies", "Departments"],
            ["By department"],
        ),
        "state-wise": (["Total policies", "States"], ["By state"]),
        "category-wise": (["Total policies", "Categories"], ["By category"]),
        "sector-wise": (["Total policies", "Sectors"], ["By sector"]),
    },
    "SCHEME_REPORT": {
        "overview": (None, ["Schemes"]),
        "status": (
            [
                "Total schemes",
                "Approved",
                "Pending approval",
                "Rejected",
                "Draft",
                "Archived",
            ],
            ["By status"],
        ),
        "ministry-wise": (["Total schemes", "Ministries"], ["By ministry"]),
        "department-wise": (
            ["Total schemes", "Departments"],
            ["By department"],
        ),
        "state-wise": (["Total schemes", "States"], ["By state"]),
        "category-wise": (["Total schemes", "Categories"], ["By category"]),
        "expiring": (
            ["Total schemes", "Expiring within 30 days"],
            ["Expiring soon (30 days)"],
        ),
    },
    "USER_REPORT": {
        "overview": (None, ["Users"]),
        "registration": (
            ["Total users", "New registrations"],
            ["Registration trend"],
        ),
        "role-wise": (["Total users", "Roles"], ["By role"]),
        "state-wise": (["Total users", "States"], ["By state"]),
        "district-wise": (["Total users", "Districts"], ["By district"]),
        "active-inactive": (
            ["Total users", "Active users", "Inactive users"],
            ["Active vs inactive"],
        ),
    },
    "MINISTRY_REPORT": {
        "overview": (None, ["Ministry aggregation"]),
        "policy": (None, ["Policy status by ministry"]),
        "scheme": (None, ["Scheme status by ministry"]),
        "policy-vs-scheme": (None, ["Ministry aggregation"]),
    },
    "STATE_REPORT": {
        "overview": (None, ["State aggregation"]),
        "policy": (None, ["Policy status by state"]),
        "scheme": (None, ["Scheme status by state"]),
    },
    "AUDIT_REPORT": {
        "activity": (None, ["Activity events", "By date"]),
        "action-wise": (None, ["By action"]),
        "entity-wise": (None, ["By entity type"]),
    },
}


def _apply_detail(dataset: dict, report_type: str, detail: str | None) -> dict:
    """Narrow a full category dataset to the requested detail variant."""
    if not detail:
        return dataset
    selection = _DETAIL_SELECTION.get(report_type, {}).get(detail)
    if selection is None:
        return dataset
    keep_summary, keep_sections = selection
    dataset["detail"] = detail
    if keep_summary is not None:
        wanted = set(keep_summary)
        dataset["summary"] = [
            (label, value)
            for label, value in dataset.get("summary") or []
            if label in wanted
        ]
    wanted_sections = set(keep_sections)
    dataset["sections"] = [
        section
        for section in dataset.get("sections") or []
        if section.get("heading") in wanted_sections
    ]
    return dataset


# ============================================================
# POLICY REPORT
# ============================================================

_POLICY_PUBLIC_COLUMNS = [
    "policy_id",
    "title",
    "category",
    "ministry",
    "department",
    "state",
    "sector",
    "status",
    "publication_date",
    "effective_date",
    "created_at",
]

_POLICY_STAFF_EXTRA_COLUMNS = [
    "created_by",
    "approved_by",
]


def build_policy_dataset(
    db: Session, user: User, filters: dict, title: str | None = None
) -> dict:
    staff = _is_staff(user.role)
    start, end = _date_range(filters)

    query = db.query(Policy).filter(Policy.is_deleted.is_(False))

    if not staff:
        # Non-staff see approved/public policies only.
        query = query.filter(Policy.status == "APPROVED")

    if filters.get("policy_id") is not None:
        query = query.filter(Policy.policy_id == filters["policy_id"])
    if filters.get("category"):
        query = query.filter(Policy.category == filters["category"])
    if filters.get("ministry"):
        query = query.filter(Policy.ministry == filters["ministry"])
    if filters.get("department"):
        query = query.filter(Policy.department == filters["department"])
    if filters.get("state"):
        query = query.filter(Policy.state == filters["state"])
    if filters.get("sector"):
        query = query.filter(Policy.sector == filters["sector"])
    if filters.get("status") and staff:
        query = query.filter(Policy.status == filters["status"])
    if start:
        query = query.filter(
            Policy.created_at >= datetime(start.year, start.month, start.day)
        )
    if end:
        query = query.filter(
            Policy.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )

    policies = query.order_by(Policy.policy_id).all()

    dataset = _base_dataset("POLICY_REPORT", title, filters)

    total = len(policies)
    by_status = Counter(p.status for p in policies)
    by_category = Counter(p.category or UNSPECIFIED for p in policies)
    by_state = Counter(p.state or UNSPECIFIED for p in policies)
    by_ministry = Counter(p.ministry or UNSPECIFIED for p in policies)
    by_department = Counter(p.department or UNSPECIFIED for p in policies)
    by_sector = Counter(p.sector or UNSPECIFIED for p in policies)

    dataset["summary"] = [
        ("Total policies", total),
        ("Approved", by_status.get("APPROVED", 0)),
        ("Pending approval", by_status.get("PENDING_APPROVAL", 0)),
        ("Rejected", by_status.get("REJECTED", 0)),
        ("Draft", by_status.get("DRAFT", 0)),
        ("Archived", by_status.get("ARCHIVED", 0)),
        ("Categories", len(by_category)),
        ("States", len(by_state)),
        ("Ministries", len(by_ministry)),
        ("Departments", len(by_department)),
        ("Sectors", len(by_sector)),
    ]

    if total == 0:
        dataset["empty"] = True
        dataset["empty_message"] = EMPTY_MESSAGE
        return dataset

    headers = list(_POLICY_PUBLIC_COLUMNS)
    if staff:
        headers += _POLICY_STAFF_EXTRA_COLUMNS

    rows = []
    for p in policies:
        row = [
            p.policy_id,
            (p.title or "")[:120],
            _fmt(p.category),
            _fmt(p.ministry),
            _fmt(p.department),
            _fmt(p.state),
            _fmt(p.sector),
            _fmt(p.status),
            _fmt(p.publication_date),
            _fmt(p.effective_date),
            _fmt(p.created_at),
        ]
        if staff:
            row += [_fmt(p.created_by), _fmt(p.approved_by)]
        rows.append(row)

    dataset["sections"].append(
        {"heading": "Policies", "headers": headers, "rows": rows}
    )

    # Monthly trend on created_at.
    months = Counter(_month_key(p.created_at) for p in policies)
    trend_rows = [
        [month, count]
        for month, count in sorted(
            (m, c) for m, c in months.items() if m is not None
        )
    ]
    if trend_rows:
        dataset["sections"].append(
            {
                "heading": "Monthly trend (created)",
                "headers": ["Month", "Policies"],
                "rows": trend_rows,
            }
        )

    for label, counter in (
        ("By category", by_category),
        ("By ministry", by_ministry),
        ("By department", by_department),
        ("By state", by_state),
        ("By sector", by_sector),
        ("By status", by_status),
    ):
        dataset["sections"].append(
            {
                "heading": label,
                "headers": ["Name", "Policies"],
                "rows": [[k, v] for k, v in counter.most_common()],
            }
        )

    # Effective-date trend (month of effective_date).
    effective_months = Counter(_month_key(p.effective_date) for p in policies)
    effective_rows = [
        [month, count]
        for month, count in sorted(
            (m, c) for m, c in effective_months.items() if m is not None
        )
    ]
    if effective_rows:
        dataset["sections"].append(
            {
                "heading": "Effective monthly trend",
                "headers": ["Month", "Policies"],
                "rows": effective_rows,
            }
        )

    return dataset


# ============================================================
# SCHEME REPORT
# ============================================================

_SCHEME_PUBLIC_COLUMNS = [
    "scheme_id",
    "name",
    "category",
    "ministry",
    "department",
    "state",
    "status",
    "application_end_date",
    "created_at",
]

_SCHEME_STAFF_EXTRA_COLUMNS = [
    "created_by",
    "approved_by",
]


def build_scheme_dataset(
    db: Session, user: User, filters: dict, title: str | None = None
) -> dict:
    from datetime import timedelta

    staff = _is_staff(user.role)
    start, end = _date_range(filters)

    query = db.query(Scheme).filter(Scheme.is_deleted.is_(False))

    if not staff:
        query = query.filter(Scheme.status == "APPROVED")

    if filters.get("scheme_id") is not None:
        query = query.filter(Scheme.scheme_id == filters["scheme_id"])
    if filters.get("category"):
        query = query.filter(Scheme.category == filters["category"])
    if filters.get("ministry"):
        query = query.filter(Scheme.ministry == filters["ministry"])
    if filters.get("department"):
        query = query.filter(Scheme.department == filters["department"])
    if filters.get("state"):
        query = query.filter(Scheme.state == filters["state"])
    if filters.get("status") and staff:
        query = query.filter(Scheme.status == filters["status"])
    if start:
        query = query.filter(
            Scheme.created_at >= datetime(start.year, start.month, start.day)
        )
    if end:
        query = query.filter(
            Scheme.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )

    schemes = query.order_by(Scheme.scheme_id).all()

    dataset = _base_dataset("SCHEME_REPORT", title, filters)

    total = len(schemes)
    by_status = Counter(s.status for s in schemes)
    by_category = Counter(s.category or UNSPECIFIED for s in schemes)
    by_state = Counter(s.state or UNSPECIFIED for s in schemes)
    by_ministry = Counter(s.ministry or UNSPECIFIED for s in schemes)
    by_department = Counter(s.department or UNSPECIFIED for s in schemes)

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expiring = [
        s
        for s in schemes
        if s.application_end_date is not None
        and s.status == "APPROVED"
        and now <= s.application_end_date <= now + timedelta(days=30)
    ]

    dataset["summary"] = [
        ("Total schemes", total),
        ("Approved", by_status.get("APPROVED", 0)),
        ("Pending approval", by_status.get("PENDING_APPROVAL", 0)),
        ("Rejected", by_status.get("REJECTED", 0)),
        ("Draft", by_status.get("DRAFT", 0)),
        ("Archived", by_status.get("ARCHIVED", 0)),
        ("Expiring within 30 days", len(expiring)),
        ("Categories", len(by_category)),
        ("States", len(by_state)),
        ("Ministries", len(by_ministry)),
        ("Departments", len(by_department)),
    ]

    if total == 0:
        dataset["empty"] = True
        dataset["empty_message"] = EMPTY_MESSAGE
        return dataset

    headers = list(_SCHEME_PUBLIC_COLUMNS)
    if staff:
        headers += _SCHEME_STAFF_EXTRA_COLUMNS

    rows = []
    for s in schemes:
        row = [
            s.scheme_id,
            (s.name or "")[:120],
            _fmt(s.category),
            _fmt(s.ministry),
            _fmt(s.department),
            _fmt(s.state),
            _fmt(s.status),
            _fmt(s.application_end_date),
            _fmt(s.created_at),
        ]
        if staff:
            row += [_fmt(s.created_by), _fmt(s.approved_by)]
        rows.append(row)

    dataset["sections"].append(
        {"heading": "Schemes", "headers": headers, "rows": rows}
    )

    if expiring:
        dataset["sections"].append(
            {
                "heading": "Expiring soon (30 days)",
                "headers": ["Scheme ID", "Name", "End date"],
                "rows": [
                    [
                        s.scheme_id,
                        (s.name or "")[:80],
                        _fmt(s.application_end_date),
                    ]
                    for s in sorted(
                        expiring, key=lambda x: x.application_end_date or now
                    )
                ],
            }
        )

    for label, counter in (
        ("By category", by_category),
        ("By ministry", by_ministry),
        ("By department", by_department),
        ("By state", by_state),
        ("By status", by_status),
    ):
        dataset["sections"].append(
            {
                "heading": label,
                "headers": ["Name", "Schemes"],
                "rows": [[k, v] for k, v in counter.most_common()],
            }
        )

    return dataset


# ============================================================
# USER ACTIVITY REPORT (audit_logs + search_history only)
# ============================================================


def build_user_activity_dataset(
    db: Session, user: User, filters: dict, title: str | None = None
) -> dict:
    from app.api.routes.auth import normalize_role

    role = normalize_role(user.role)
    start, end = _date_range(filters)

    if role == "ADMIN":
        # Optional cross-user scope; default is all users.
        target_user_id = filters.get("user_id")
    elif role == "GOVERNMENT_OFFICIAL":
        target_user_id = user.user_id
    else:
        raise PermissionError(
            f"Role {role or 'UNKNOWN'} cannot access USER_ACTIVITY_REPORT"
        )

    audit_query = db.query(AuditLog)
    search_query = db.query(SearchHistory)
    if target_user_id is not None:
        audit_query = audit_query.filter(AuditLog.user_id == target_user_id)
        search_query = search_query.filter(
            SearchHistory.user_id == target_user_id
        )
    if filters.get("action"):
        audit_query = audit_query.filter(AuditLog.action == filters["action"])
    if filters.get("entity_type"):
        audit_query = audit_query.filter(
            AuditLog.entity_type == filters["entity_type"]
        )
    if start:
        audit_query = audit_query.filter(
            AuditLog.created_at >= datetime(start.year, start.month, start.day)
        )
        search_query = search_query.filter(
            SearchHistory.searched_at
            >= datetime(start.year, start.month, start.day)
        )
    if end:
        audit_query = audit_query.filter(
            AuditLog.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )
        search_query = search_query.filter(
            SearchHistory.searched_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )

    audits = audit_query.order_by(AuditLog.created_at.desc()).limit(2000).all()
    searches = (
        search_query.order_by(SearchHistory.searched_at.desc())
        .limit(2000)
        .all()
    )

    dataset = _base_dataset("USER_ACTIVITY_REPORT", title, filters)

    by_action = Counter(a.action or UNSPECIFIED for a in audits)
    by_entity = Counter(a.entity_type or UNSPECIFIED for a in audits)
    by_day = Counter(
        a.created_at.date().isoformat() for a in audits if a.created_at
    )
    by_search_type = Counter(s.search_type or UNSPECIFIED for s in searches)

    dataset["summary"] = [
        ("Audit events", len(audits)),
        ("Searches", len(searches)),
        ("Distinct actions", len(by_action)),
        ("Distinct entity types", len(by_entity)),
        ("Active days", len(by_day)),
        ("Search types", len(by_search_type)),
    ]

    if not audits and not searches:
        dataset["empty"] = True
        dataset["empty_message"] = EMPTY_ACTIVITY_MESSAGE
        return dataset

    if audits:
        rows = [
            [
                _fmt(a.created_at),
                _fmt(a.action),
                _fmt(a.entity_type),
                _fmt(a.entity_id),
            ]
            for a in audits[:500]
        ]
        if role == "ADMIN":
            headers = ["Date", "Action", "Entity type", "Entity ID", "User ID"]
            rows = [r + [_fmt(a.user_id)] for r, a in zip(rows, audits[:500])]
        else:
            headers = ["Date", "Action", "Entity type", "Entity ID"]
        dataset["sections"].append(
            {"heading": "Activity events", "headers": headers, "rows": rows}
        )
        dataset["sections"].append(
            {
                "heading": "Activity by action",
                "headers": ["Action", "Events"],
                "rows": [[k, v] for k, v in by_action.most_common()],
            }
        )
        dataset["sections"].append(
            {
                "heading": "Activity by date",
                "headers": ["Date", "Events"],
                "rows": [[k, v] for k, v in sorted(by_day.items())],
            }
        )

    if searches:
        dataset["sections"].append(
            {
                "heading": "Searches",
                "headers": ["Date", "Query", "Search type"],
                "rows": [
                    [
                        _fmt(s.searched_at),
                        (s.search_query or "")[:80],
                        _fmt(s.search_type),
                    ]
                    for s in searches[:500]
                ],
            }
        )
        dataset["sections"].append(
            {
                "heading": "Searches by type",
                "headers": ["Search type", "Searches"],
                "rows": [[k, v] for k, v in by_search_type.most_common()],
            }
        )

    return dataset


# ============================================================
# DEPARTMENT / MINISTRY REPORT (string aggregation only)
# ============================================================


def build_department_dataset(
    db: Session, user: User, filters: dict, title: str | None = None
) -> dict:
    start, end = _date_range(filters)

    policy_query = db.query(Policy).filter(Policy.is_deleted.is_(False))
    scheme_query = db.query(Scheme).filter(Scheme.is_deleted.is_(False))
    if not _is_staff(user.role):
        policy_query = policy_query.filter(Policy.status == "APPROVED")
        scheme_query = scheme_query.filter(Scheme.status == "APPROVED")
    for key, column_p, column_s in (
        ("ministry", Policy.ministry, Scheme.ministry),
        ("department", Policy.department, Scheme.department),
        ("state", Policy.state, Scheme.state),
        ("category", Policy.category, Scheme.category),
    ):
        if filters.get(key):
            policy_query = policy_query.filter(column_p == filters[key])
            scheme_query = scheme_query.filter(column_s == filters[key])
    if start:
        policy_query = policy_query.filter(
            Policy.created_at >= datetime(start.year, start.month, start.day)
        )
        scheme_query = scheme_query.filter(
            Scheme.created_at >= datetime(start.year, start.month, start.day)
        )
    if end:
        policy_query = policy_query.filter(
            Policy.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )
        scheme_query = scheme_query.filter(
            Scheme.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )

    policies = policy_query.all()
    schemes = scheme_query.all()

    dataset = _base_dataset("DEPARTMENT_REPORT", title, filters)

    ministry_policies = Counter(p.ministry or UNSPECIFIED for p in policies)
    ministry_schemes = Counter(s.ministry or UNSPECIFIED for s in schemes)
    dept_policies = Counter(p.department or UNSPECIFIED for p in policies)
    dept_schemes = Counter(s.department or UNSPECIFIED for s in schemes)

    dataset["summary"] = [
        ("Policies", len(policies)),
        ("Schemes", len(schemes)),
        ("Ministries (policies)", len(ministry_policies)),
        ("Ministries (schemes)", len(ministry_schemes)),
        ("Departments (policies)", len(dept_policies)),
        ("Departments (schemes)", len(dept_schemes)),
    ]

    if not policies and not schemes:
        dataset["empty"] = True
        dataset["empty_message"] = EMPTY_MESSAGE
        return dataset

    # Ministry aggregation: policy counts + scheme counts side by side.
    ministries = sorted(set(ministry_policies) | set(ministry_schemes))
    dataset["sections"].append(
        {
            "heading": "Ministry aggregation",
            "headers": ["Ministry", "Policies", "Schemes"],
            "rows": [
                [m, ministry_policies.get(m, 0), ministry_schemes.get(m, 0)]
                for m in ministries
            ],
        }
    )

    # Department field aggregation: kept explicitly separate.
    departments = sorted(set(dept_policies) | set(dept_schemes))
    dataset["sections"].append(
        {
            "heading": "Department field aggregation",
            "headers": ["Department", "Policies", "Schemes"],
            "rows": [
                [d, dept_policies.get(d, 0), dept_schemes.get(d, 0)]
                for d in departments
            ],
        }
    )

    return dataset


# ============================================================
# ANALYTICS REPORT (reuse analytics_service)
# ============================================================


def build_analytics_dataset(
    db: Session, user: User, filters: dict, title: str | None = None
) -> dict:
    from app.api.routes.auth import normalize_role
    from app.services import analytics_service as analytics

    role = normalize_role(user.role)
    dataset = _base_dataset("ANALYTICS_REPORT", title, filters)

    dashboard = analytics.get_dashboard_analytics(
        db=db, user_id=user.user_id, user_role=user.role
    )
    policies = analytics.get_policy_analytics(db)
    schemes = analytics.get_scheme_analytics(db)
    usage = analytics.get_usage_statistics(
        db=db, user_id=user.user_id, user_role=user.role
    )

    # Notification + feedback counts, scoped like the rest.
    if role == "ADMIN":
        notif_total = (
            db.query(func.count(Notification.notification_id)).scalar() or 0
        )
        notif_unread = (
            db.query(func.count(Notification.notification_id))
            .filter(Notification.is_read.is_(False))
            .scalar()
            or 0
        )
        feedback_rows = (
            db.query(Feedback.status, func.count(Feedback.feedback_id))
            .group_by(Feedback.status)
            .all()
        )
    else:
        notif_total = (
            db.query(func.count(Notification.notification_id))
            .filter(Notification.user_id == user.user_id)
            .scalar()
            or 0
        )
        notif_unread = (
            db.query(func.count(Notification.notification_id))
            .filter(
                Notification.user_id == user.user_id,
                Notification.is_read.is_(False),
            )
            .scalar()
            or 0
        )
        feedback_rows = (
            db.query(Feedback.status, func.count(Feedback.feedback_id))
            .filter(Feedback.user_id == user.user_id)
            .group_by(Feedback.status)
            .all()
        )

    pol = dashboard.get("policies", {})
    sch = dashboard.get("schemes", {})
    usr = dashboard.get("users", {})

    dataset["summary"] = [
        ("Total policies", pol.get("total", 0)),
        ("Approved policies", pol.get("approved", 0)),
        ("Pending policies", pol.get("pending", 0)),
        ("Total schemes", sch.get("total", 0)),
        ("Approved schemes", sch.get("approved", 0)),
        ("Total users (scoped)", usr.get("total", 0)),
        ("Notifications (scoped)", notif_total),
        ("Unread notifications (scoped)", notif_unread),
        ("Feedback entries (scoped)", sum(c for _, c in feedback_rows)),
    ]

    dataset["sections"].append(
        {
            "heading": "Policy overview",
            "headers": ["Metric", "Value"],
            "rows": [
                ["Total", policies.get("total", 0)],
                ["Approved", policies.get("approved", 0)],
                ["Pending", policies.get("pending", 0)],
                ["Rejected", policies.get("rejected", 0)],
                ["Archived", policies.get("archived", 0)],
            ],
        }
    )
    dataset["sections"].append(
        {
            "heading": "Scheme overview",
            "headers": ["Metric", "Value"],
            "rows": [
                ["Total", schemes.get("total", 0)],
                ["Approved", schemes.get("approved", 0)],
                ["Pending", schemes.get("pending", 0)],
                ["Rejected", schemes.get("rejected", 0)],
                ["Archived", schemes.get("archived", 0)],
            ],
        }
    )

    trends = policies.get("monthly_trend") or []
    if trends:
        rows = [
            (
                [t.get("month", _fmt(t.get("date"))), t.get("count", 0)]
                if isinstance(t, dict)
                else [
                    _fmt(v)
                    for v in (t if isinstance(t, (list, tuple)) else [t])
                ]
            )
            for t in trends[:24]
        ]
        dataset["sections"].append(
            {
                "heading": "Policy monthly trend",
                "headers": ["Month", "Policies"],
                "rows": rows,
            }
        )

    dataset["sections"].append(
        {
            "heading": "Feedback by status (scoped)",
            "headers": ["Status", "Count"],
            "rows": [[_fmt(s), c] for s, c in feedback_rows]
            or [[UNSPECIFIED, 0]],
        }
    )

    dataset["sections"].append(
        {
            "heading": "Usage (scoped)",
            "headers": ["Metric", "Value"],
            "rows": _flatten_for_table(usage),
        }
    )

    return dataset


def _flatten_for_table(value: object, prefix: str = "") -> list[list]:
    """Flatten nested usage dicts into [metric, value] rows (depth 1)."""
    rows: list[list] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, dict):
                for sub, sub_value in item.items():
                    if not isinstance(sub_value, (dict, list)):
                        rows.append([f"{key}.{sub}", sub_value])
            elif not isinstance(item, (dict, list)):
                rows.append([str(key), item])
    if not rows:
        rows.append([UNSPECIFIED, 0])
    return rows[:50]


# ============================================================
# USER REPORT (ADMIN only — users table, safe columns only)
# ============================================================
# Safe: user_id, full_name, email, role, phone, date_of_birth,
# state, district, occupation, organization, is_active, created_at.
# NEVER selected: password_hash, token_version.

_USER_COLUMNS = [
    "user_id",
    "full_name",
    "email",
    "role",
    "phone",
    "state",
    "district",
    "organization",
    "occupation",
    "status",
    "created_at",
]


def build_user_dataset(
    db: Session, user: User, filters: dict, title: str | None = None
) -> dict:
    if not _is_admin(user.role):
        raise PermissionError("Only administrators can access USER_REPORT")

    start, end = _date_range(filters)

    query = db.query(User)

    if filters.get("role"):
        query = query.filter(User.role == str(filters["role"]).strip().upper())
    if filters.get("state"):
        query = query.filter(User.state == filters["state"])
    if filters.get("district"):
        query = query.filter(User.district == filters["district"])
    if filters.get("organization"):
        query = query.filter(User.organization == filters["organization"])
    if filters.get("status"):
        wanted = str(filters["status"]).strip().lower()
        if wanted == "active":
            query = query.filter(User.is_active.is_(True))
        elif wanted == "inactive":
            query = query.filter(User.is_active.is_(False))
    if start:
        query = query.filter(
            User.created_at >= datetime(start.year, start.month, start.day)
        )
    if end:
        query = query.filter(
            User.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )

    users = query.order_by(User.user_id).all()

    dataset = _base_dataset("USER_REPORT", title, filters)

    total = len(users)
    active = sum(1 for u in users if u.is_active)
    by_role = Counter(u.role or UNSPECIFIED for u in users)
    by_state = Counter(u.state or UNSPECIFIED for u in users)
    by_district = Counter(u.district or UNSPECIFIED for u in users)
    by_org = Counter(u.organization or UNSPECIFIED for u in users)
    by_occupation = Counter(u.occupation or UNSPECIFIED for u in users)

    if start or end:
        new_in_period = total
    else:
        new_in_period = total

    dataset["summary"] = [
        ("Total users", total),
        ("Active users", active),
        ("Inactive users", total - active),
        ("New registrations", new_in_period),
        ("Roles", len(by_role)),
        ("States", len(by_state)),
        ("Districts", len(by_district)),
        ("Organizations", len(by_org)),
    ]

    if total == 0:
        dataset["empty"] = True
        dataset["empty_message"] = EMPTY_MESSAGE
        return dataset

    dataset["sections"].append(
        {
            "heading": "Users",
            "headers": _USER_COLUMNS,
            "rows": [
                [
                    u.user_id,
                    (u.full_name or "")[:80],
                    (u.email or "")[:80],
                    _fmt(u.role),
                    _fmt(u.phone),
                    _fmt(u.state),
                    _fmt(u.district),
                    _fmt(u.organization),
                    _fmt(u.occupation),
                    "Active" if u.is_active else "Inactive",
                    _fmt(u.created_at),
                ]
                for u in users
            ],
        }
    )

    months = Counter(_month_key(u.created_at) for u in users)
    trend_rows = [
        [month, count]
        for month, count in sorted(
            (m, c) for m, c in months.items() if m is not None
        )
    ]
    if trend_rows:
        dataset["sections"].append(
            {
                "heading": "Registration trend",
                "headers": ["Month", "Registrations"],
                "rows": trend_rows,
            }
        )

    dataset["sections"].append(
        {
            "heading": "Active vs inactive",
            "headers": ["Status", "Users"],
            "rows": [["Active", active], ["Inactive", total - active]],
        }
    )

    for label, counter in (
        ("By role", by_role),
        ("By state", by_state),
        ("By district", by_district),
        ("By organization", by_org),
        ("By occupation", by_occupation),
    ):
        dataset["sections"].append(
            {
                "heading": label,
                "headers": ["Name", "Users"],
                "rows": [[k, v] for k, v in counter.most_common()],
            }
        )

    return dataset


# ============================================================
# MINISTRY REPORT (string aggregation only — no master table)
# ============================================================

_STATUS_ORDER = [
    "APPROVED",
    "PENDING_APPROVAL",
    "DRAFT",
    "REJECTED",
    "ARCHIVED",
]


def _ministry_state_rows(policies, schemes):
    ministry_policies: dict[str, Counter] = {}
    ministry_schemes: dict[str, Counter] = {}
    for p in policies:
        ministry_policies.setdefault(p.ministry or UNSPECIFIED, Counter())[
            p.status
        ] += 1
    for s in schemes:
        ministry_schemes.setdefault(s.ministry or UNSPECIFIED, Counter())[
            s.status
        ] += 1
    return ministry_policies, ministry_schemes


def build_ministry_dataset(
    db: Session, user: User, filters: dict, title: str | None = None
) -> dict:
    start, end = _date_range(filters)

    policy_query = db.query(Policy).filter(Policy.is_deleted.is_(False))
    scheme_query = db.query(Scheme).filter(Scheme.is_deleted.is_(False))
    if not _is_staff(user.role):
        # Public/aggregate scope: approved rows only.
        policy_query = policy_query.filter(Policy.status == "APPROVED")
        scheme_query = scheme_query.filter(Scheme.status == "APPROVED")
    if filters.get("ministry"):
        policy_query = policy_query.filter(
            Policy.ministry == filters["ministry"]
        )
        scheme_query = scheme_query.filter(
            Scheme.ministry == filters["ministry"]
        )
    if filters.get("department"):
        policy_query = policy_query.filter(
            Policy.department == filters["department"]
        )
        scheme_query = scheme_query.filter(
            Scheme.department == filters["department"]
        )
    if filters.get("state"):
        policy_query = policy_query.filter(Policy.state == filters["state"])
        scheme_query = scheme_query.filter(Scheme.state == filters["state"])
    if start:
        policy_query = policy_query.filter(
            Policy.created_at >= datetime(start.year, start.month, start.day)
        )
        scheme_query = scheme_query.filter(
            Scheme.created_at >= datetime(start.year, start.month, start.day)
        )
    if end:
        policy_query = policy_query.filter(
            Policy.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )
        scheme_query = scheme_query.filter(
            Scheme.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )

    policies = policy_query.all()
    schemes = scheme_query.all()

    dataset = _base_dataset("MINISTRY_REPORT", title, filters)

    ministry_policies, ministry_schemes = _ministry_state_rows(
        policies, schemes
    )
    ministries = sorted(set(ministry_policies) | set(ministry_schemes))

    dataset["summary"] = [
        ("Policies", len(policies)),
        ("Schemes", len(schemes)),
        ("Ministries", len(ministries)),
        (
            "Approved policies",
            sum(1 for p in policies if p.status == "APPROVED"),
        ),
        ("Active schemes", sum(1 for s in schemes if s.status == "APPROVED")),
    ]

    if not policies and not schemes:
        dataset["empty"] = True
        dataset["empty_message"] = EMPTY_MESSAGE
        return dataset

    dataset["sections"].append(
        {
            "heading": "Ministry aggregation",
            "headers": ["Ministry", "Policies", "Schemes", "Total"],
            "rows": [
                [
                    m,
                    sum(ministry_policies.get(m, Counter()).values()),
                    sum(ministry_schemes.get(m, Counter()).values()),
                    sum(ministry_policies.get(m, Counter()).values())
                    + sum(ministry_schemes.get(m, Counter()).values()),
                ]
                for m in ministries
            ],
        }
    )
    dataset["sections"].append(
        {
            "heading": "Policy status by ministry",
            "headers": ["Ministry"] + _STATUS_ORDER,
            "rows": [
                [m]
                + [
                    ministry_policies.get(m, Counter()).get(s, 0)
                    for s in _STATUS_ORDER
                ]
                for m in ministries
            ],
        }
    )
    dataset["sections"].append(
        {
            "heading": "Scheme status by ministry",
            "headers": ["Ministry"] + _STATUS_ORDER,
            "rows": [
                [m]
                + [
                    ministry_schemes.get(m, Counter()).get(s, 0)
                    for s in _STATUS_ORDER
                ]
                for m in ministries
            ],
        }
    )

    return dataset


# ============================================================
# STATE REPORT (string aggregation only)
# ============================================================


def build_state_dataset(
    db: Session, user: User, filters: dict, title: str | None = None
) -> dict:
    start, end = _date_range(filters)

    policy_query = db.query(Policy).filter(Policy.is_deleted.is_(False))
    scheme_query = db.query(Scheme).filter(Scheme.is_deleted.is_(False))
    if not _is_staff(user.role):
        # Public/aggregate scope: approved rows only.
        policy_query = policy_query.filter(Policy.status == "APPROVED")
        scheme_query = scheme_query.filter(Scheme.status == "APPROVED")
    for key, column_p, column_s in (
        ("state", Policy.state, Scheme.state),
        ("ministry", Policy.ministry, Scheme.ministry),
        ("department", Policy.department, Scheme.department),
    ):
        if filters.get(key):
            policy_query = policy_query.filter(column_p == filters[key])
            scheme_query = scheme_query.filter(column_s == filters[key])
    if start:
        policy_query = policy_query.filter(
            Policy.created_at >= datetime(start.year, start.month, start.day)
        )
        scheme_query = scheme_query.filter(
            Scheme.created_at >= datetime(start.year, start.month, start.day)
        )
    if end:
        policy_query = policy_query.filter(
            Policy.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )
        scheme_query = scheme_query.filter(
            Scheme.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )

    policies = policy_query.all()
    schemes = scheme_query.all()

    dataset = _base_dataset("STATE_REPORT", title, filters)

    state_policies: dict[str, Counter] = {}
    state_schemes: dict[str, Counter] = {}
    for p in policies:
        state_policies.setdefault(p.state or UNSPECIFIED, Counter())[
            p.status
        ] += 1
    for s in schemes:
        state_schemes.setdefault(s.state or UNSPECIFIED, Counter())[
            s.status
        ] += 1
    states = sorted(set(state_policies) | set(state_schemes))

    dataset["summary"] = [
        ("Policies", len(policies)),
        ("Schemes", len(schemes)),
        ("States", len(states)),
    ]

    if not policies and not schemes:
        dataset["empty"] = True
        dataset["empty_message"] = EMPTY_MESSAGE
        return dataset

    dataset["sections"].append(
        {
            "heading": "State aggregation",
            "headers": ["State", "Policies", "Schemes", "Total"],
            "rows": [
                [
                    st,
                    sum(state_policies.get(st, Counter()).values()),
                    sum(state_schemes.get(st, Counter()).values()),
                    sum(state_policies.get(st, Counter()).values())
                    + sum(state_schemes.get(st, Counter()).values()),
                ]
                for st in states
            ],
        }
    )
    dataset["sections"].append(
        {
            "heading": "Policy status by state",
            "headers": ["State"] + _STATUS_ORDER,
            "rows": [
                [st]
                + [
                    state_policies.get(st, Counter()).get(s, 0)
                    for s in _STATUS_ORDER
                ]
                for st in states
            ],
        }
    )
    dataset["sections"].append(
        {
            "heading": "Scheme status by state",
            "headers": ["State"] + _STATUS_ORDER,
            "rows": [
                [st]
                + [
                    state_schemes.get(st, Counter()).get(s, 0)
                    for s in _STATUS_ORDER
                ]
                for st in states
            ],
        }
    )

    return dataset


# ============================================================
# AUDIT REPORT (ADMIN only — audit_logs, safe columns only)
# ============================================================
# Exposed: action, actor user_id, actor role, entity type/ID,
# timestamp, safe description. NEVER: ip_address, passwords,
# tokens, secrets.

_AUDIT_COLUMNS = [
    "date",
    "action",
    "actor_id",
    "actor_role",
    "entity_type",
    "entity_id",
    "description",
]


def build_audit_dataset(
    db: Session, user: User, filters: dict, title: str | None = None
) -> dict:
    if not _is_admin(user.role):
        raise PermissionError("Only administrators can access AUDIT_REPORT")

    start, end = _date_range(filters)

    query = db.query(AuditLog, User.role).outerjoin(
        User, AuditLog.user_id == User.user_id
    )

    if filters.get("action"):
        query = query.filter(AuditLog.action == filters["action"])
    if filters.get("entity_type"):
        query = query.filter(AuditLog.entity_type == filters["entity_type"])
    if filters.get("user_id") is not None:
        query = query.filter(AuditLog.user_id == filters["user_id"])
    if filters.get("role"):
        query = query.filter(User.role == str(filters["role"]).strip().upper())
    if start:
        query = query.filter(
            AuditLog.created_at >= datetime(start.year, start.month, start.day)
        )
    if end:
        query = query.filter(
            AuditLog.created_at
            <= datetime(end.year, end.month, end.day, 23, 59, 59)
        )

    rows_all = query.order_by(AuditLog.created_at.desc()).limit(2000).all()

    dataset = _base_dataset("AUDIT_REPORT", title, filters)

    by_action = Counter(a.action or UNSPECIFIED for a, _ in rows_all)
    by_entity = Counter(a.entity_type or UNSPECIFIED for a, _ in rows_all)
    by_day = Counter(
        a.created_at.date().isoformat() for a, _ in rows_all if a.created_at
    )

    dataset["summary"] = [
        ("Audit events", len(rows_all)),
        ("Distinct actions", len(by_action)),
        ("Distinct entity types", len(by_entity)),
        ("Active days", len(by_day)),
    ]

    if not rows_all:
        dataset["empty"] = True
        dataset["empty_message"] = EMPTY_ACTIVITY_MESSAGE
        return dataset

    dataset["sections"].append(
        {
            "heading": "Activity events",
            "headers": _AUDIT_COLUMNS,
            "rows": [
                [
                    _fmt(a.created_at),
                    _fmt(a.action),
                    _fmt(a.user_id),
                    _fmt(role),
                    _fmt(a.entity_type),
                    _fmt(a.entity_id),
                    (a.description or "")[:120],
                ]
                for a, role in rows_all[:500]
            ],
        }
    )
    dataset["sections"].append(
        {
            "heading": "By action",
            "headers": ["Action", "Events"],
            "rows": [[k, v] for k, v in by_action.most_common()],
        }
    )
    dataset["sections"].append(
        {
            "heading": "By entity type",
            "headers": ["Entity type", "Events"],
            "rows": [[k, v] for k, v in by_entity.most_common()],
        }
    )
    dataset["sections"].append(
        {
            "heading": "By date",
            "headers": ["Date", "Events"],
            "rows": [[k, v] for k, v in sorted(by_day.items())],
        }
    )
    by_user = Counter(
        (a.user_id if a.user_id is not None else "System", role or UNSPECIFIED)
        for a, role in rows_all
    )
    dataset["sections"].append(
        {
            "heading": "By user",
            "headers": ["Actor ID", "Role", "Events"],
            "rows": [[uid, r, c] for (uid, r), c in by_user.most_common(100)],
        }
    )

    return dataset


# ============================================================
# REPORTS OVERVIEW (dashboard KPI cards, role-scoped)
# ============================================================


def get_reports_overview(db: Session, user: User) -> dict:
    """Cheap role-scoped counts for the Reports dashboard overview.

    Direct conditional counts + COUNT(DISTINCT ...) over a UNION (~7 light
    queries) instead of the 13-query dashboard fan-out plus two full UNION
    fetches whose rows were only counted in Python.
    """
    staff = _is_staff(user.role)
    admin = _is_admin(user.role)

    pol_q = db.query(func.count(Policy.policy_id))
    sch_q = db.query(func.count(Scheme.scheme_id))
    if not staff:
        # Public scope: overview counts reflect approved rows only.
        pol_q = pol_q.filter(Policy.status == "APPROVED")
        sch_q = sch_q.filter(Scheme.status == "APPROVED")
    policies = pol_q.scalar() or 0
    schemes = sch_q.scalar() or 0

    def _distinct_count(col_p, col_s) -> int:
        pq = db.query(col_p.label("v")).filter(
            col_p.isnot(None), col_p != ""
        )
        sq = db.query(col_s.label("v")).filter(
            col_s.isnot(None), col_s != ""
        )
        if not staff:
            pq = pq.filter(Policy.status == "APPROVED")
            sq = sq.filter(Scheme.status == "APPROVED")
        union = pq.union(sq).subquery()
        return (
            db.query(func.count(func.distinct(union.c.v))).scalar() or 0
        )

    overview: dict = {
        "policies": policies,
        "schemes": schemes,
        "ministries": _distinct_count(Policy.ministry, Scheme.ministry),
        "departments": _distinct_count(
            Policy.department, Scheme.department
        ),
    }

    if admin:
        overview["users"] = (
            db.query(func.count(User.user_id)).scalar() or 0
        )
        overview["activity"] = (
            db.query(func.count(AuditLog.audit_id)).scalar() or 0
        )
    else:
        overview["activity"] = (
            db.query(func.count(AuditLog.audit_id))
            .filter(AuditLog.user_id == user.user_id)
            .scalar()
            or 0
        )

    return overview


# ============================================================
# FILTER OPTIONS (distinct live values, scoped)
# ============================================================

_OPTION_SOURCES: dict[str, dict[str, tuple]] = {
    "POLICY_REPORT": {
        "ministry": (Policy, Policy.ministry),
        "department": (Policy, Policy.department),
        "state": (Policy, Policy.state),
        "category": (Policy, Policy.category),
        "sector": (Policy, Policy.sector),
        "status": (Policy, Policy.status),
    },
    "SCHEME_REPORT": {
        "ministry": (Scheme, Scheme.ministry),
        "department": (Scheme, Scheme.department),
        "state": (Scheme, Scheme.state),
        "category": (Scheme, Scheme.category),
        "status": (Scheme, Scheme.status),
    },
    "USER_REPORT": {
        "role": (User, User.role),
        "state": (User, User.state),
        "district": (User, User.district),
        "organization": (User, User.organization),
    },
    "MINISTRY_REPORT": {
        "ministry": (Policy, Policy.ministry),
        "department": (Policy, Policy.department),
        "state": (Policy, Policy.state),
    },
    "STATE_REPORT": {
        "state": (Policy, Policy.state),
        "ministry": (Policy, Policy.ministry),
        "department": (Policy, Policy.department),
    },
    "AUDIT_REPORT": {
        "action": (AuditLog, AuditLog.action),
        "entity_type": (AuditLog, AuditLog.entity_type),
    },
    "USER_ACTIVITY_REPORT": {
        "action": (AuditLog, AuditLog.action),
        "entity_type": (AuditLog, AuditLog.entity_type),
    },
}


def get_filter_options(
    db: Session, user: User, field: str, report_type: str
) -> list:
    """Return distinct live values for a filter field (max 500)."""
    from app.services import report_permissions as permissions

    normalized_type = str(report_type or "").strip().upper()
    if normalized_type not in permissions.REPORT_TYPES:
        raise ValueError(f"Unsupported report type: {report_type}")
    if normalized_type not in permissions.get_allowed_report_types(user.role):
        raise PermissionError(
            f"Role {user.role} cannot access report type {normalized_type}"
        )

    sources = _OPTION_SOURCES.get(normalized_type, {})
    source = sources.get(str(field or "").strip().lower())
    if source is None:
        raise ValueError(
            f"Unsupported options field '{field}' for {normalized_type}"
        )

    _, column = source
    # Non-staff roles only see values that occur on approved rows,
    # so option lists cannot leak draft/internal-only dimensions.
    if not _is_staff(user.role):
        model = source[0]
        if model in (Policy, Scheme):
            values = (
                db.query(column)
                .filter(model.status == "APPROVED")
                .distinct()
                .order_by(column)
                .limit(500)
                .all()
            )
            return sorted({v for (v,) in values if v})
    values = db.query(column).distinct().order_by(column).limit(500).all()
    return sorted({v for (v,) in values if v})


# ============================================================
# DISPATCH
# ============================================================

_BUILDERS = {
    "POLICY_REPORT": build_policy_dataset,
    "SCHEME_REPORT": build_scheme_dataset,
    "USER_REPORT": build_user_dataset,
    "USER_ACTIVITY_REPORT": build_user_activity_dataset,
    "DEPARTMENT_REPORT": build_department_dataset,
    "MINISTRY_REPORT": build_ministry_dataset,
    "STATE_REPORT": build_state_dataset,
    "ANALYTICS_REPORT": build_analytics_dataset,
    "AUDIT_REPORT": build_audit_dataset,
}


def build_dataset(
    db: Session,
    report_type: str,
    user: User,
    filters: dict,
    title: str | None = None,
    detail: str | None = None,
) -> dict:
    from app.services import report_permissions as permissions

    normalized = str(report_type or "").strip().upper()
    builder = _BUILDERS.get(normalized)
    if builder is None:
        raise ValueError(f"Unsupported report type: {report_type}")
    effective_detail = permissions.validate_report_detail(
        user.role,
        normalized,
        detail if detail else (filters or {}).get("detail"),
    )
    # Builders ignore the stored "detail" key; selection happens below.
    dataset = builder(db, user, filters or {}, title)
    return _apply_detail(dataset, normalized, effective_detail)
