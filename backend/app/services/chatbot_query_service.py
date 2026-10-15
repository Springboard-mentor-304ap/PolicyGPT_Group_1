"""RBAC-safe conversational queries for the PolicyGPT Assistant.

Every factual answer flows through the EXISTING services
(policy/scheme/eligibility/notification/analytics), so role visibility
rules (draft privacy, pending-approval privacy, guest scoping) apply
exactly as they do on the REST endpoints.

Conventions:
- Statistics use the service's SQL ``total`` (a real COUNT), never a
  frontend or LLM computation over a partial page.
- Date-range filtering that the list services cannot express in SQL is
  applied in Python over a bounded fetch (FULL_FETCH_LIMIT rows).
- ``find_record_by_name`` ranks by title relevance but always returns
  real database rows.
"""

from datetime import date, datetime

FULL_FETCH_LIMIT = 500
CHAT_PAGE_SIZE = 5


# ============================================================
# ROW BUILDERS (superset of the legacy chatbot row dicts)
# ============================================================

def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def policy_row(policy) -> dict:
    get = lambda name: getattr(policy, name, None)
    benefits = get("benefits")
    return {
        "id": get("policy_id"),
        "title": get("title"),
        "description": (str(get("description") or ""))[:600],
        "ministry": get("ministry"),
        "department": get("department"),
        "category": get("category"),
        "state": get("state"),
        "status": get("status"),
        "publication_date": _iso(get("publication_date")) or (
            str(get("publication_date") or "") or None
        ),
        "effective_date": _iso(get("effective_date")),
        "created_at": _iso(get("created_at")),
        "benefits": list(benefits) if isinstance(benefits, list) else [],
    }


def scheme_row(scheme) -> dict:
    get = lambda name: getattr(scheme, name, None)
    benefits = get("benefits")
    return {
        "id": get("scheme_id"),
        "title": get("name"),
        "description": (str(get("description") or ""))[:600],
        "ministry": get("ministry"),
        "department": get("department"),
        "category": get("category"),
        "state": get("state"),
        "status": get("status"),
        "benefits": list(benefits) if isinstance(benefits, list) else [],
        "documents_required": get("documents_required"),
        "application_process": get("application_process"),
        "application_url": get("application_url"),
        "application_end_date": _iso(get("application_end_date")),
        "created_at": _iso(get("created_at")),
    }


# ============================================================
# DATE FILTERING
# ============================================================

def _parse_row_date(row: dict):
    for key in ("publication_date", "created_at"):
        raw = row.get(key)
        if not raw:
            continue
        text = str(raw).strip()[:10]
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(str(raw)[:10]).date()
        except ValueError:
            continue
    return None


def _date_bounds(date_filter: dict):
    today = date.today()
    preset = (date_filter or {}).get("preset")
    if preset == "this_month":
        return date(today.year, today.month, 1), today
    if preset == "this_year":
        return date(today.year, 1, 1), today
    if preset == "month":
        month = date_filter.get("month") or today.month
        year = date_filter.get("year") or today.year
        start = date(year, month, 1)
        end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        return start, end
    if preset == "year" and date_filter.get("year"):
        year = int(date_filter["year"])
        return date(year, 1, 1), date(year, 12, 31)
    return None, None


def apply_date_filter(rows: list[dict], date_filter: dict) -> list[dict]:
    start, end = _date_bounds(date_filter or {})
    if start is None:
        return rows
    kept = []
    for row in rows:
        day = _parse_row_date(row)
        if day is not None and start <= day <= end:
            kept.append(row)
    return kept


def _needs_python_filtering(filters: dict | None) -> bool:
    return bool(filters and (filters.get("date") or {}).get("preset"))


# ============================================================
# FILTERED POLICY / SCHEME SEARCH + COUNT
# ============================================================

def _policy_kwargs(filters: dict | None) -> dict:
    filters = filters or {}
    kwargs: dict = {}
    if filters.get("status"):
        kwargs["policy_status"] = filters["status"]
    if filters.get("state"):
        kwargs["state"] = filters["state"]
    return kwargs


def _scheme_kwargs(filters: dict | None) -> dict:
    filters = filters or {}
    kwargs: dict = {}
    if filters.get("status"):
        kwargs["status"] = filters["status"]
    if filters.get("state"):
        kwargs["state"] = filters["state"]
    return kwargs


def _union_token_rows(fetch_rows, search_text: str, page: int, limit: int):
    """OR-fallback over per-token fetches. Returns None when not applicable.

    Only significant tokens (length > 2, at most 8) are fanned out: short
    tokens match far too broadly to be useful and each token costs a full
    database scan, so looking up "me"/"to"/"of" only adds latency.
    """
    tokens = [t for t in (search_text or "").split() if len(t) > 2][:8]
    if len(tokens) <= 1 and len((search_text or "").split()) <= 1:
        return None
    if not tokens:
        return None
    # Identical tokens would repeat the same full scan: dedupe (order
    # preserved) — the unioned row set is exactly unchanged.
    tokens = list(dict.fromkeys(tokens))
    seen: dict = {}
    for token in tokens:
        try:
            rows = fetch_rows(token) or []
        except Exception:
            continue
        for row in rows:
            if row.get("id") not in seen:
                seen[row.get("id")] = row
    if not seen:
        return None
    rows = list(seen.values())
    start = max(0, (page - 1) * limit)
    return {"rows": rows[start:start + limit], "total": len(rows)}


def search_policies_filtered(
    db, user, terms: str = "", filters: dict | None = None,
    page: int = 1, limit: int = CHAT_PAGE_SIZE,
) -> dict:
    """RBAC-scoped policy search with status/state/date filters + paging."""
    from app.services import policy_service

    extra = (filters or {}).get("extra_terms", "")
    search = f"{terms or ''} {extra}".strip() or None
    if _needs_python_filtering(filters):
        result = policy_service.search_policies(
            db, search=search, page=1, limit=FULL_FETCH_LIMIT,
            current_user=user, **_policy_kwargs(filters),
        )
        rows = [policy_row(p) for p in (result.get("policies") or [])]
        rows = apply_date_filter(rows, (filters or {}).get("date", {}))
        total = len(rows)
        start = max(0, (page - 1) * limit)
        return {"rows": rows[start:start + limit], "total": total}
    result = policy_service.search_policies(
        db, search=search, page=page, limit=limit,
        current_user=user, **_policy_kwargs(filters),
    )
    total = int(result.get("total") or 0)
    if total == 0 and search:

        def _fetch(token: str):
            chunk = policy_service.search_policies(
                db, search=token, page=1, limit=FULL_FETCH_LIMIT,
                current_user=user, **_policy_kwargs(filters),
            )
            return [policy_row(p) for p in (chunk.get("policies") or [])]

        union = _union_token_rows(_fetch, search, page, limit)
        if union is not None:
            return union
    return {
        "rows": [policy_row(p) for p in (result.get("policies") or [])],
        "total": total,
    }


def count_policies(db, user, terms: str = "", filters: dict | None = None) -> int:
    """SQL COUNT via the existing service (RBAC-scoped)."""
    from app.services import policy_service

    extra = (filters or {}).get("extra_terms", "")
    search = f"{terms or ''} {extra}".strip() or None
    if _needs_python_filtering(filters):
        result = policy_service.search_policies(
            db, search=search, page=1, limit=FULL_FETCH_LIMIT,
            current_user=user, **_policy_kwargs(filters),
        )
        rows = [policy_row(p) for p in (result.get("policies") or [])]
        return len(apply_date_filter(rows, (filters or {}).get("date", {})))
    result = policy_service.search_policies(
        db, search=search, page=1, limit=1,
        current_user=user, **_policy_kwargs(filters),
    )
    return int(result.get("total") or 0)


def search_schemes_filtered(
    db, user, terms: str = "", filters: dict | None = None,
    page: int = 1, limit: int = CHAT_PAGE_SIZE,
) -> dict:
    from app.services import scheme_service

    extra = (filters or {}).get("extra_terms", "")
    keyword = f"{terms or ''} {extra}".strip() or None
    if _needs_python_filtering(filters):
        result = scheme_service.search_schemes(
            db, keyword=keyword, page=1, limit=FULL_FETCH_LIMIT,
            current_user=user, **_scheme_kwargs(filters),
        )
        rows = [scheme_row(s) for s in (result.get("schemes") or [])]
        rows = apply_date_filter(rows, (filters or {}).get("date", {}))
        total = len(rows)
        start = max(0, (page - 1) * limit)
        return {"rows": rows[start:start + limit], "total": total}
    result = scheme_service.search_schemes(
        db, keyword=keyword, page=page, limit=limit,
        current_user=user, **_scheme_kwargs(filters),
    )
    total = int(result.get("total") or 0)
    if total == 0 and keyword:

        def _fetch(token: str):
            chunk = scheme_service.search_schemes(
                db, keyword=token, page=1, limit=FULL_FETCH_LIMIT,
                current_user=user, **_scheme_kwargs(filters),
            )
            return [scheme_row(s) for s in (chunk.get("schemes") or [])]

        union = _union_token_rows(_fetch, keyword, page, limit)
        if union is not None:
            return union
    return {
        "rows": [scheme_row(s) for s in (result.get("schemes") or [])],
        "total": total,
    }


def count_schemes(db, user, terms: str = "", filters: dict | None = None) -> int:
    from app.services import scheme_service

    extra = (filters or {}).get("extra_terms", "")
    keyword = f"{terms or ''} {extra}".strip() or None
    if _needs_python_filtering(filters):
        result = scheme_service.search_schemes(
            db, keyword=keyword, page=1, limit=FULL_FETCH_LIMIT,
            current_user=user, **_scheme_kwargs(filters),
        )
        rows = [scheme_row(s) for s in (result.get("schemes") or [])]
        return len(apply_date_filter(rows, (filters or {}).get("date", {})))
    result = scheme_service.search_schemes(
        db, keyword=keyword, page=1, limit=1,
        current_user=user, **_scheme_kwargs(filters),
    )
    return int(result.get("total") or 0)


# ============================================================
# NAME LOOKUP + RANKING
# ============================================================

def _relevance(title: str, hint: str) -> tuple[int, int]:
    import re as _re

    def _norm(text: str) -> str:
        return _re.sub(r"[^a-z0-9]+", " ", (text or "").casefold()).strip()

    title_norm = _norm(title)
    hint_norm = _norm(hint)
    if not title_norm or not hint_norm:
        return (99, 0)
    if title_norm == hint_norm:
        return (0, 0)
    if title_norm.startswith(hint_norm):
        return (1, len(title_norm))
    if hint_norm in title_norm:
        return (2, title_norm.index(hint_norm))
    hint_tokens = {t for t in hint_norm.split() if len(t) > 2}
    title_tokens = set(title_norm.split())
    overlap = len(hint_tokens & title_tokens)
    if overlap:
        return (3, -overlap)
    return (99, 0)


def rank_rows(rows: list[dict], hint: str) -> list[dict]:
    return sorted(rows, key=lambda r: _relevance(str(r.get("title") or ""), hint))


def find_record_by_name(db, user, kind: str, name: str, limit: int = 20,
                         fuzzy: bool = True) -> dict:
    """Look a policy/scheme up by (partial) name. Real DB rows only.

    Exact matches rank first. When substring search finds nothing useful,
    a bounded spelling-tolerant pass surfaces close title matches as
    explicitly labelled alternatives — never as a silent substitution.
    ``fuzzy=False`` skips the bounded full-fetch fallback (used by
    conversation-context resolution loops to avoid repeated scans).
    """
    if kind == "policy":
        data = search_policies_filtered(
            db, user, terms=name, filters=None, page=1, limit=limit
        )
    else:
        data = search_schemes_filtered(
            db, user, terms=name, filters=None, page=1, limit=limit
        )
    rows = rank_rows(data["rows"], name)
    for row in rows:
        row["_kind"] = kind
    best = None
    if rows and _relevance(str(rows[0].get("title") or ""), name)[0] <= 2:
        best = rows[0]
    alternatives = [r for r in rows if r is not best][:4]
    if fuzzy and best is None and not alternatives:
        alternatives = _close_title_matches(db, user, kind, name)
    return {"best": best, "alternatives": alternatives, "total": data["total"]}


def _close_title_matches(db, user, kind: str, name: str, limit: int = 4) -> list[dict]:
    """Spelling-tolerant fallback over a bounded candidate set.

    Compares the requested name against titles from a bounded full fetch
    (RBAC-scoped, same services) using difflib similarity. Only genuinely
    similar titles (>= 0.6) are returned, as alternatives for the caller
    to label as possible matches.
    """
    import difflib

    hint = (name or "").strip().casefold()
    if len(hint) < 3:
        return []
    try:
        if kind == "policy":
            data = search_policies_filtered(
                db, user, terms="", filters=None, page=1, limit=FULL_FETCH_LIMIT
            )
        else:
            data = search_schemes_filtered(
                db, user, terms="", filters=None, page=1, limit=FULL_FETCH_LIMIT
            )
    except Exception:
        return []
    scored: list[tuple[float, dict]] = []
    for row in data.get("rows", []) or []:
        title = str(row.get("title") or "").casefold()
        if not title:
            continue
        ratio = difflib.SequenceMatcher(None, hint, title).ratio()
        if ratio >= 0.6:
            scored.append((ratio, row))
    scored.sort(key=lambda item: item[0], reverse=True)
    matches = []
    for _, row in scored[:limit]:
        row["_kind"] = kind
        matches.append(row)
    return matches


# ============================================================
# USER DIRECTORY (admin-gated by the caller)
# ============================================================

_PUBLIC_USER_FIELDS = (
    "user_id", "full_name", "email", "role", "state",
    "district", "is_active",
)


def get_user_stats(db) -> dict:
    from app.services import analytics_service

    data = analytics_service.get_user_analytics(db, None, "ADMIN")
    raw_roles = data.get("by_role") or data.get("role_counts") or {}
    if isinstance(raw_roles, list):
        by_role = {item.get("role"): int(item.get("count") or 0)
                   for item in raw_roles if item.get("role")}
    else:
        by_role = {role: int(count) for role, count in dict(raw_roles).items()}
    raw_states = data.get("by_state") or []
    if isinstance(raw_states, list):
        by_state = {item.get("state"): int(item.get("count") or 0)
                    for item in raw_states if item.get("state")}
    else:
        by_state = dict(raw_states)
    return {
        "total": int(data.get("total_users") or 0),
        "active": int(data.get("active_users") or 0),
        "inactive": int(data.get("inactive_users") or 0),
        "by_role": by_role,
        "by_state": by_state,
    }


def list_users_by_role(db, role: str | None, limit: int = 10) -> dict:
    from app.models.user import User

    query = db.query(User)
    if role:
        query = query.filter(User.role.ilike(role))
    total = query.count()
    rows = query.order_by(User.created_at.desc()).limit(limit).all()
    users = [
        {field: getattr(u, field, None) for field in _PUBLIC_USER_FIELDS}
        for u in rows
    ]
    return {"users": users, "total": total}


# ============================================================
# ANALYTICS (admin / government-gated by the caller)
# ============================================================

def get_department_overview(db, limit: int = 8) -> list[dict]:
    from app.services import analytics_service

    rows = analytics_service.get_department_analytics(db) or []
    ranked = sorted(
        rows,
        key=lambda r: int(r.get("policy_count") or 0)
        + int(r.get("scheme_count") or 0),
        reverse=True,
    )
    return ranked[:limit]


# ============================================================
# ELIGIBILITY MATCHING AGAINST THE REAL RULE ENGINE
# ============================================================

def build_eligibility_profile_data(profile: dict) -> dict | None:
    """Conversational facts -> eligibility-service input. None if unusable."""
    age = profile.get("age")
    if age is None:
        return None
    try:
        age = int(age)
    except (TypeError, ValueError):
        return None
    income = profile.get("income")
    try:
        income = float(income) if income is not None else None
    except (TypeError, ValueError):
        income = None
    return {
        "age": age,
        "gender": str(profile.get("gender") or "Any"),
        "annual_income": income,
        "occupation": profile.get("occupation"),
        "education": profile.get("education"),
        "state": profile.get("state"),
        "social_category": profile.get("category"),
        "disability_status": profile.get("disability"),
    }


def match_profile_schemes(db, profile: dict, limit: int = 5) -> dict | None:
    """Rule-engine matching over APPROVED schemes. None when not possible."""
    from app.schemas import eligibility as eligibility_schemas
    from app.services import eligibility_service, scheme_service

    data = build_eligibility_profile_data(profile)
    if data is None:
        return None
    request = eligibility_schemas.EligibilityMatchRequest(
        entity_type="scheme", **data
    )
    result = eligibility_service.match_entities(db, request)
    if hasattr(result, "model_dump"):
        result = result.model_dump()
    eligible = result.get("eligible_entities") or []
    # One batched lookup instead of N sequential get_scheme() round-trips:
    # same rows (non-deleted), same order, same match messages.
    wanted = [item.get("entity_id") for item in eligible[:limit]]
    wanted = [i for i in wanted if i is not None]
    by_id: dict = {}
    if wanted:
        from app.models.scheme import Scheme

        for scheme in (
            db.query(Scheme)
            .filter(Scheme.scheme_id.in_(wanted))
            .filter(Scheme.is_deleted.is_(False))
            .all()
        ):
            by_id[getattr(scheme, "scheme_id", None)] = scheme
    rows = []
    for item in eligible[:limit]:
        scheme = by_id.get(item.get("entity_id"))
        if scheme is not None:
            row = scheme_row(scheme)
            row["match_message"] = item.get("message")
            rows.append(row)
    return {"rows": rows, "total": len(eligible)}


def check_scheme_for_profile(db, scheme_id, profile: dict) -> dict | None:
    from app.schemas import eligibility as eligibility_schemas
    from app.services import eligibility_service

    data = build_eligibility_profile_data(profile)
    if data is None:
        return None
    request = eligibility_schemas.EligibilityCheckRequest(
        entity_type="scheme", entity_id=scheme_id, **data
    )
    result = eligibility_service.check_eligibility(db, request)
    if hasattr(result, "model_dump"):
        return result.model_dump()
    if isinstance(result, dict):
        return result
    return None
