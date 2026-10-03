"""PolicyGPT Assistant orchestration.

Chat flow: authenticate (JWT) -> role from backend user -> rate/guest
limits -> conversation ownership -> rule-based intent -> role gate ->
retrieve via EXISTING services (policy/scheme/eligibility/notification/
faq) -> grounded template provider -> persist -> structured response.

No business logic is duplicated here: every record shown comes from the
same service functions the REST endpoints use, with the same visibility
rules (e.g. draft/pending privacy, role-scoped notifications).
"""

import logging
import re
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from app.api.routes.auth import normalize_role
from app.core.config import settings
from app.models.chatbot import (
    ChatbotConversation,
    ChatbotMessage,
    ChatbotUsage,
)
from app.models.user import User
from app.schemas import chatbot as schemas
from app.services import chatbot_intent_service as intent
from app.services import chatbot_context_service as context
from app.services import chatbot_query_service as queries
from app.services.chatbot_provider import (
    OpenAIChatbotProvider,
    ProviderError,
    TemplateChatbotProvider,
)

logger = logging.getLogger("uvicorn.error")


# ============================================================
# ERRORS (mapped to HTTP status by the route layer)
# ============================================================

class ChatbotError(Exception):
    status_code = 400

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class MessageTooLong(ChatbotError):
    status_code = 413


class RateLimited(ChatbotError):
    status_code = 429


class GuestLimited(ChatbotError):
    status_code = 403


class ConversationNotFound(ChatbotError):
    status_code = 404


class ChatbotDisabled(ChatbotError):
    status_code = 503


# ============================================================
# ROLE HELPERS
# ============================================================

ROLE_HOME_PREFIX = {
    "ADMIN": "admin",
    "GOVERNMENT_OFFICIAL": "government",
    "CITIZEN": "citizen",
    "RESEARCHER": "researcher",
    "ORGANIZATION": "organization",
    "GUEST": "guest",
}

# Intents that need a signed-in account (guests get a login prompt).
PERSONAL_INTENTS = frozenset({
    intent.NOTIFICATION_QUERY,
    intent.SAVED_ITEMS,
    intent.SEARCH_HISTORY,
    intent.APPLICATION_STATUS,
})

# Verbs that would mutate or reveal admin-only data. The assistant never
# performs these — it explains and redirects to the management pages.
_DESTRUCTIVE_PATTERNS = (
    r"\bdelete\b.*\b(user|polic|scheme)",
    r"\bremove\b.*\b(user|polic|scheme)",
    r"\bapprove\b.*\b(polic|scheme)",
    r"\breject\b.*\b(polic|scheme)",
    r"\bchange\b.*\brole\b",
    r"\bmake\b.*\badmin\b",
    r"\bmodify\b.*\bpermission",
    r"\bdrop\b.*\btable\b",
    r"\bshutdown\b",
)

_ADMIN_ONLY_TOPICS = (
    "user management",
    "all users",
    "list users",
    "audit log",
    "audit trail",
    "system setting",
)

# ============================================================
# RATE LIMITING (in-memory, per user, rolling window)
# ============================================================

_RATE_BUCKETS: dict[int, deque] = defaultdict(deque)


def check_rate_limit(user_id: int) -> None:
    now = time.monotonic()
    window = max(1, settings.CHATBOT_RATE_LIMIT_WINDOW_SECONDS)
    limit = max(1, settings.CHATBOT_RATE_LIMIT)
    bucket = _RATE_BUCKETS[user_id]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= limit:
        raise RateLimited(
            "You're sending messages too quickly. Please wait a moment."
        )
    bucket.append(now)


def reset_rate_limits() -> None:
    _RATE_BUCKETS.clear()


# ============================================================
# PERSISTENCE HELPERS (plain Session calls only)
# ============================================================

def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_usage(db, user_id: int) -> ChatbotUsage | None:
    return (
        db.query(ChatbotUsage)
        .filter(ChatbotUsage.user_id == user_id)
        .first()
    )


def get_conversation(db, conversation_id: int, user_id: int):
    conversation = (
        db.query(ChatbotConversation)
        .filter(ChatbotConversation.conversation_id == conversation_id)
        .first()
    )
    if conversation is None or conversation.user_id != user_id:
        raise ConversationNotFound("Conversation not found.")
    return conversation


def get_or_create_conversation(db, user, role: str):
    conversation = (
        db.query(ChatbotConversation)
        .filter(ChatbotConversation.user_id == user.user_id)
        .order_by(ChatbotConversation.updated_at.desc())
        .first()
    )
    if conversation is not None:
        return conversation
    conversation = ChatbotConversation(
        user_id=user.user_id,
        session_id=None,
        role=role,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def save_message(db, conversation_id: int, sender: str, message: str,
                 intent_name: str | None) -> None:
    db.add(
        ChatbotMessage(
            conversation_id=conversation_id,
            sender=sender,
            message=message,
            intent=intent_name,
            created_at=_now(),
        )
    )
    db.commit()


def load_history(db, conversation_id: int, limit: int) -> list:
    return (
        db.query(ChatbotMessage)
        .filter(ChatbotMessage.conversation_id == conversation_id)
        .order_by(ChatbotMessage.created_at.asc())
        .limit(limit)
        .all()
    )


def clear_user_history(db, user_id: int) -> int:
    # Bulk deletes instead of N+M per-row deletes: messages first (FK),
    # then conversations. Subquery avoids loading any rows.
    conversation_ids = (
        db.query(ChatbotConversation.conversation_id)
        .filter(ChatbotConversation.user_id == user_id)
        .subquery()
    )
    removed = (
        db.query(ChatbotMessage)
        .filter(ChatbotMessage.conversation_id.in_(conversation_ids))
        .delete(synchronize_session=False)
    )
    db.query(ChatbotConversation).filter(
        ChatbotConversation.user_id == user_id
    ).delete(synchronize_session=False)
    db.commit()
    return removed


# ============================================================
# RETRIEVAL (existing services only)
# ============================================================

def _policy_to_dict(policy) -> dict:
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
        "publication_date": str(get("publication_date") or "") or None,
        "effective_date": str(get("effective_date") or "") or None,
        "created_at": str(get("created_at") or "") or None,
        "benefits": list(benefits) if isinstance(benefits, list) else [],
    }


def _scheme_to_dict(scheme) -> dict:
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
        "application_url": getattr(scheme, "application_url", None),
        "application_end_date": str(get("application_end_date") or "") or None,
        "created_at": str(get("created_at") or "") or None,
    }


def retrieve_policies(db, user, terms: str, limit: int = 5) -> dict:
    from app.services import policy_service

    result = policy_service.search_policies(
        db, search=terms or None, page=1, limit=limit, current_user=user
    )
    rows = [_policy_to_dict(p) for p in (result.get("policies") or [])]
    return {"rows": rows, "total": int(result.get("total") or 0)}


def retrieve_schemes(db, user, terms: str, limit: int = 5) -> dict:
    from app.services import scheme_service

    result = scheme_service.search_schemes(
        db, keyword=terms or None, page=1, limit=limit, current_user=user
    )
    rows = [_scheme_to_dict(s) for s in (result.get("schemes") or [])]
    return {"rows": rows, "total": int(result.get("total") or 0)}


def retrieve_notifications(db, user, role: str) -> dict:
    from app.services import notification_service

    result = notification_service.get_user_notifications(
        db,
        user_id=user.user_id,
        user_role=user.role,
        page=1,
        page_size=5,
        sort_by="latest",
    )
    items = result.get("items") or []
    recent = [
        {
            "title": (n.get("title") if isinstance(n, dict) else getattr(n, "title", "")),
            "notification_type": (
                n.get("notification_type")
                if isinstance(n, dict)
                else getattr(n, "notification_type", "")
            ),
        }
        for n in items[:5]
    ]
    return {
        "total": int(result.get("total") or 0),
        "unread": int(result.get("unread_count") or 0),
        "recent": recent,
    }


def retrieve_faqs(db, terms: str) -> list[dict]:
    from app.services import faq_service

    faqs = faq_service.get_all_faqs(db) or []
    scored: list[tuple[int, dict]] = []
    needle = set(terms.lower().split())
    for faq in faqs:
        question = str(getattr(faq, "question", ""))
        answer = str(getattr(faq, "answer", ""))
        if str(getattr(faq, "status", "ACTIVE")).upper() not in ("ACTIVE", "PUBLISHED", ""):
            continue
        haystack = f"{question} {answer}".lower()
        score = sum(1 for word in needle if len(word) > 2 and word in haystack)
        if score > 0:
            scored.append((score, {
                "question": question,
                "answer": answer,
                "category": getattr(faq, "category", None),
            }))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored[:3]]


# ============================================================
# ROLE GATING
# ============================================================

def _is_destructive_request(text: str) -> bool:
    lowered = text.lower()
    return any(re.search(p, lowered) for p in _DESTRUCTIVE_PATTERNS)


def _is_admin_only_topic(text: str) -> bool:
    lowered = text.lower()
    return any(topic in lowered for topic in _ADMIN_ONLY_TOPICS)


def home_prefix(role: str) -> str:
    return ROLE_HOME_PREFIX.get(role, "citizen")


def role_gate(intent_name: str, text: str, role: str) -> dict | None:
    """Return a refusal/redirect payload dict, or None when allowed."""
    if _is_destructive_request(text):
        if role == "ADMIN":
            return {
                "message": (
                    "I can't perform that action directly from chat. "
                    "Please use the management pages where every change is "
                    "reviewed and confirmed."
                ),
                "actions": [
                    {"label": "Manage Users", "type": "NAVIGATE",
                     "route": "/dashboard/admin/users"},
                    {"label": "Manage Policies", "type": "NAVIGATE",
                     "route": "/dashboard/admin/policies/manage"},
                    {"label": "Manage Schemes", "type": "NAVIGATE",
                     "route": "/dashboard/admin/schemes/manage"},
                ],
            }
        return {
            "message": (
                "I can only provide information available to your account "
                "and role. Administrative actions aren't available to you."
            ),
            "actions": [],
        }
    if role != "ADMIN" and _is_admin_only_topic(text):
        return {
            "message": (
                "I can only provide information available to your account "
                "and role. User management and audit data are restricted to "
                "administrators."
            ),
            "actions": [],
        }
    if role == "GUEST" and intent_name in PERSONAL_INTENTS:
        return {
            "message": (
                "That needs a signed-in account. Sign in to unlock "
                "personalized features such as eligibility assistance, saved "
                "items, notifications and application-related help."
            ),
            "actions": [
                {"label": "Login", "type": "OPEN_LOGIN", "route": "/auth/login"},
                {"label": "Register", "type": "OPEN_REGISTER",
                 "route": "/auth/register"},
            ],
        }
    if intent_name in (intent.USER_STATS, intent.USER_LIST):
        if role != "ADMIN":
            return {
                "message": (
                    "I can only provide user-management information to "
                    "administrators. Ask me about policies, schemes, "
                    "eligibility or navigating the parts of PolicyGPT you "
                    "can access."
                ),
                "actions": [],
            }
    if intent_name == intent.ANALYTICS_QUERY:
        if role not in ("ADMIN", "GOVERNMENT_OFFICIAL"):
            return {
                "message": (
                    "Department statistics and analytics aren't available for "
                    "your role. Ask me about policies, schemes, eligibility "
                    "or navigating the parts of PolicyGPT you can access."
                ),
                "actions": [],
            }
    if intent.detect_sensitive_request(text):
        return {
            "message": (
                "I can't share passwords, tokens, secrets or other users' "
                "private information. If you're locked out, use the Support "
                "page to get help."
            ),
            "actions": [],
        }
    return None


# ============================================================
# ACTION BUILDERS (role-aware frontend routes)
# ============================================================

def _route(prefix: str, *parts: str) -> str:
    return "/dashboard/" + "/".join([prefix, *parts])


def policy_actions(prefix: str, rows: list[dict]) -> list[dict]:
    actions = []
    for row in rows[:3]:
        if row.get("id") is not None:
            actions.append({
                "label": f"View: {str(row.get('title') or 'Policy')[:40]}",
                "type": "VIEW_POLICY",
                "route": _route(prefix, "policies", str(row["id"])),
                "entity_type": "POLICY",
                "entity_id": row["id"],
            })
    return actions


def scheme_actions(prefix: str, rows: list[dict]) -> list[dict]:
    actions = []
    for row in rows[:3]:
        if row.get("id") is not None:
            actions.append({
                "label": f"View: {str(row.get('title') or 'Scheme')[:40]}",
                "type": "VIEW_SCHEME",
                "route": _route(prefix, "schemes", str(row["id"])),
                "entity_type": "SCHEME",
                "entity_id": row["id"],
            })
    return actions


def support_route(prefix: str) -> str:
    if prefix == "admin":
        return "/dashboard/admin/faqs"
    return f"/dashboard/{prefix}/support"


# ============================================================
# CONVERSATIONAL QUERY WRAPPERS (patch seams; delegate to the
# RBAC-safe query service so tests can stub them easily)
# ============================================================

def _filters_active(filters) -> bool:
    """True when status/state/date filters need the structured query path."""
    if not filters:
        return False
    if filters.get("status") or filters.get("state"):
        return True
    return bool((filters.get("date") or {}).get("preset"))


# Filler words that never help a database substring search.
_CONVERSATIONAL_NOISE = frozenset({
    "how", "many", "much", "all", "total", "number", "numbers", "count",
    "ministry", "ministries", "department", "departments", "available",
})
_STATUS_TOKENS = frozenset({
    "draft", "pending", "approval", "approved", "rejected", "archived",
})
# Words already expressed as an exact date filter.
_DATE_TOKENS = frozenset({
    "published", "publication", "publish", "year", "years", "month",
    "months", "week", "weeks", "day", "days", "recent", "recently",
    "latest", "newest", "lately", "last",
    "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
})


def _combined_terms(terms: str = "", filters=None) -> str:
    """Search text for the structured path.

    Strips filler words, status words (already an exact SQL filter) and
    state words (already an exact filter), then dedupes — so multi-word
    questions collapse to matchable terms instead of one impossible
    contiguous substring.
    """
    filters = filters or {}
    drop = set(_CONVERSATIONAL_NOISE)
    if filters.get("status"):
        drop |= _STATUS_TOKENS
    if (filters.get("date") or {}).get("preset"):
        drop |= _DATE_TOKENS
    state = (filters.get("state") or "").lower()
    drop |= set(state.split())
    out: list[str] = []
    seen: set[str] = set()
    for token in f"{terms or ''} {(filters.get('extra_terms') or '')}".split():
        low = token.lower()
        if low in drop or low in seen:
            continue
        seen.add(low)
        out.append(token)
    return " ".join(out)


def _union_token_search(fetch, tokens: list[str], limit: int) -> dict:
    """OR-fallback: union per-token result sets when the combined query
    matches nothing. Bounded and RBAC-safe (same fetch each time)."""
    seen: dict = {}
    for token in tokens:
        try:
            data = fetch(token, limit)
        except Exception:
            continue
        for row in data.get("rows", []):
            key = row.get("id")
            if key not in seen:
                seen[key] = row
    rows = list(seen.values())
    return {"rows": rows, "total": len(rows)}


def _serializable_filters(filters) -> dict:
    filters = filters or {}
    return {
        "status": filters.get("status"),
        "state": filters.get("state"),
        "date": (filters.get("date") or {}).get("preset"),
        "extra_terms": filters.get("extra_terms", ""),
    }


def search_policies_filtered(db, user, terms="", filters=None, page=1, limit=5):
    if not _filters_active(filters) and page == 1:
        combined = _combined_terms(terms, filters)
        data = retrieve_policies(db, user, combined or None, limit)
        if data.get("total") == 0 and len(combined.split()) > 1:
            union = _union_token_search(
                lambda tok, lim: retrieve_policies(db, user, tok, lim),
                combined.split(), queries.FULL_FETCH_LIMIT,
            )
            return {"rows": union["rows"][:limit], "total": union["total"]}
        return {"rows": data["rows"], "total": data["total"]}
    return queries.search_policies_filtered(
        db, user, _combined_terms(terms, filters), filters, page, limit
    )


def search_schemes_filtered(db, user, terms="", filters=None, page=1, limit=5):
    if not _filters_active(filters) and page == 1:
        combined = _combined_terms(terms, filters)
        data = retrieve_schemes(db, user, combined or None, limit)
        if data.get("total") == 0 and len(combined.split()) > 1:
            union = _union_token_search(
                lambda tok, lim: retrieve_schemes(db, user, tok, lim),
                combined.split(), queries.FULL_FETCH_LIMIT,
            )
            return {"rows": union["rows"][:limit], "total": union["total"]}
        return {"rows": data["rows"], "total": data["total"]}
    return queries.search_schemes_filtered(
        db, user, _combined_terms(terms, filters), filters, page, limit
    )


def count_policies(db, user, terms="", filters=None) -> int:
    if not _filters_active(filters):
        combined = _combined_terms(terms, filters)
        data = retrieve_policies(db, user, combined or None, 1)
        if int(data.get("total") or 0) == 0 and len(combined.split()) > 1:
            union = _union_token_search(
                lambda tok, lim: retrieve_policies(db, user, tok, lim),
                combined.split(), queries.FULL_FETCH_LIMIT,
            )
            return union["total"]
        return int(data.get("total") or 0)
    return queries.count_policies(db, user, _combined_terms(terms, filters), filters)


def count_schemes(db, user, terms="", filters=None) -> int:
    if not _filters_active(filters):
        combined = _combined_terms(terms, filters)
        data = retrieve_schemes(db, user, combined or None, 1)
        if int(data.get("total") or 0) == 0 and len(combined.split()) > 1:
            union = _union_token_search(
                lambda tok, lim: retrieve_schemes(db, user, tok, lim),
                combined.split(), queries.FULL_FETCH_LIMIT,
            )
            return union["total"]
        return int(data.get("total") or 0)
    return queries.count_schemes(db, user, _combined_terms(terms, filters), filters)


def find_record_by_name(db, user, kind, name, limit=20) -> dict:
    return queries.find_record_by_name(db, user, kind, name, limit)


def _serializable_profile(profile) -> dict:
    profile = profile or {}
    return {
        key: profile.get(key)
        for key in ("age", "gender", "income", "occupation", "education",
                    "state", "category", "disability")
        if profile.get(key) is not None
    }


# ============================================================
# STRUCTURED RESULT BUILDERS
# ============================================================

def policy_result(prefix: str, row: dict):
    route = _route(prefix, "policies", str(row["id"])) if row.get("id") is not None else None
    return schemas.ChatResultItem(
        type="policy",
        id=row.get("id"),
        title=str(row.get("title") or "Untitled Policy"),
        subtitle=row.get("description"),
        status=row.get("status"),
        ministry=row.get("ministry"),
        category=row.get("category"),
        state=row.get("state"),
        route=route,
        extra={
            "department": row.get("department"),
            "publication_date": row.get("publication_date"),
        },
    )


def scheme_result(prefix: str, row: dict):
    route = _route(prefix, "schemes", str(row["id"])) if row.get("id") is not None else None
    return schemas.ChatResultItem(
        type="scheme",
        id=row.get("id"),
        title=str(row.get("title") or "Untitled Scheme"),
        subtitle=row.get("description"),
        status=row.get("status"),
        ministry=row.get("ministry"),
        category=row.get("category"),
        state=row.get("state"),
        route=route,
        extra={
            "department": row.get("department"),
            "application_end_date": row.get("application_end_date"),
        },
    )


def statistic_result(label: str, count: int, route: str | None = None):
    return schemas.ChatResultItem(
        type="statistic",
        title=label,
        subtitle=f"{count}",
        route=route,
        extra={"count": count},
    )


_STATUS_LABELS = {
    "DRAFT": "Draft",
    "PENDING_APPROVAL": "Pending approval",
    "APPROVED": "Approved",
    "REJECTED": "Rejected",
    "ARCHIVED": "Archived",
}


def describe_filters(filters: dict | None, kind: str) -> str:
    """Human label for a filtered query, e.g. 'Draft Policies'."""
    filters = filters or {}
    status = (filters.get("status") or "").upper()
    base = "Policies" if kind == "policy" else "Schemes"
    label = f"{_STATUS_LABELS.get(status, '')} {base}".strip()
    qualifiers = []
    if filters.get("state"):
        qualifiers.append(f"in {filters['state']}")
    date_preset = (filters.get("date") or {}).get("preset")
    if date_preset == "this_month":
        qualifiers.append("published this month")
    elif date_preset == "this_year":
        qualifiers.append("published this year")
    elif date_preset in ("month", "year"):
        qualifiers.append("by publication date")
    elif date_preset == "recent":
        qualifiers.append("latest")
    if qualifiers:
        label = f"{label} {' '.join(qualifiers)}".strip()
    return label or base


# ============================================================
# MAIN ENTRYPOINT
# ============================================================

def _provider():
    if (
        settings.CHATBOT_PROVIDER.lower() == "openai"
        and settings.CHATBOT_OPENAI_API_KEY
    ):
        return OpenAIChatbotProvider(
            api_key=settings.CHATBOT_OPENAI_API_KEY,
            model=settings.CHATBOT_OPENAI_MODEL,
        )
    from app.services.chatbot_provider import TemplateChatbotProvider

    return TemplateChatbotProvider()


def process_message(db, user: User, message: str,
                    conversation_id: int | None,
                    context_page: str | None = None) -> schemas.ChatMessageResponse:
    role = normalize_role(getattr(user, "role", None))
    prefix = home_prefix(role)
    cleaned = (message or "").strip()

    if len(cleaned) > settings.CHATBOT_MAX_MESSAGE_LENGTH:
        raise MessageTooLong(
            f"Messages are limited to {settings.CHATBOT_MAX_MESSAGE_LENGTH} "
            "characters. Please shorten your question."
        )

    check_rate_limit(user.user_id)

    guest_remaining: int | None = None
    if role == "GUEST":
        usage = get_usage(db, user.user_id)
        used = int(usage.message_count) if usage else 0
        if used >= settings.CHATBOT_GUEST_MESSAGE_LIMIT:
            logger.info("chatbot guest limit reached user_id=%s", user.user_id)
            raise GuestLimited(
                "You've reached the guest chatbot limit. Sign in to continue "
                "using PolicyGPT Assistant and unlock personalized features "
                "such as eligibility assistance, saved items, notifications "
                "and application-related help."
            )
        guest_remaining = settings.CHATBOT_GUEST_MESSAGE_LIMIT - used - 1

    if conversation_id is not None:
        conversation = get_conversation(db, conversation_id, user.user_id)
    else:
        conversation = get_or_create_conversation(db, user, role)

    classified = intent.classify_intent(cleaned)
    intent_name: str = classified["intent"]
    entities: dict = classified.get("entities", {})

    gated = role_gate(intent_name, cleaned, role)
    if gated is not None:
        reply_text = gated["message"]
        actions = [
            schemas.ChatAction(**action) for action in gated["actions"]
        ]
        sources: list[schemas.ChatSource] = []
        data: dict | None = {"response_type": "UNAUTHORIZED_RESPONSE"}
        results: list[schemas.ChatResultItem] = []
    else:
        reply_text, actions, sources, data, results = _handle_intent(
            db, user, role, prefix, intent_name, entities, cleaned,
            conversation.conversation_id,
        )

    save_message(db, conversation.conversation_id, "user", cleaned, intent_name)
    save_message(
        db, conversation.conversation_id, "assistant", reply_text, intent_name
    )

    # Touch conversation + usage counters (best effort, same commit style
    # as the rest of the codebase).
    conversation.updated_at = _now()
    usage = get_usage(db, user.user_id)
    if usage is None:
        usage = ChatbotUsage(
            user_id=user.user_id, session_id=None,
            message_count=0, updated_at=_now(),
        )
        db.add(usage)
    usage.message_count = int(usage.message_count or 0) + 1
    usage.updated_at = _now()
    db.commit()

    logger.info(
        "chatbot reply role=%s intent=%s conversation=%s",
        role, intent_name, conversation.conversation_id,
    )

    return schemas.ChatMessageResponse(
        success=True,
        conversation_id=conversation.conversation_id,
        message=reply_text,
        intent=intent_name,
        sources=sources,
        actions=actions,
        guest_remaining=guest_remaining,
        data=data,
        results=results,
    )


# ============================================================
# INTENT HANDLERS
# ============================================================

def _handle_intent(db, user, role: str, prefix: str, intent_name: str,
                   entities: dict, text: str, conversation_id=None):
    provider = _provider()
    ctx: dict = {"question": text}
    actions: list[schemas.ChatAction] = []
    sources: list[schemas.ChatSource] = []
    data: dict | None = None
    results: list[schemas.ChatResultItem] = []

    def _finish(reply_text):
        return reply_text, actions, sources, data, results

    try:
        if intent_name in (intent.POLICY_COUNT, intent.SCHEME_COUNT):
            kind = "policy" if intent_name == intent.POLICY_COUNT else "scheme"
            filters = entities.get("filters") or {}
            terms = entities.get("terms", "")
            total = (
                count_policies(db, user, terms, filters)
                if kind == "policy"
                else count_schemes(db, user, terms, filters)
            )
            label = describe_filters(filters, kind)
            ctx.update({"label": label, "count": total, "kind": kind})
            data = {
                "response_type": "STATISTIC_RESPONSE",
                "count": total,
                "filters": _serializable_filters(filters),
            }
            listing = _route(prefix, "policies" if kind == "policy" else "schemes")
            results = [statistic_result(label, total, listing)]
            actions = [schemas.ChatAction(
                label=f"View All {label}", type="NAVIGATE", route=listing,
            )]
            return _finish(provider.render(intent_name, ctx, role))

        if intent_name in (intent.POLICY_SEARCH, intent.SCHEME_SEARCH):
            kind = "policy" if intent_name == intent.POLICY_SEARCH else "scheme"
            filters = entities.get("filters") or {}
            terms = entities.get("terms", "")
            page = max(1, int(entities.get("page") or 1))
            fetched = (
                search_policies_filtered(db, user, terms, filters, page, queries.CHAT_PAGE_SIZE)
                if kind == "policy"
                else search_schemes_filtered(db, user, terms, filters, page, queries.CHAT_PAGE_SIZE)
            )
            rows, total = fetched["rows"], fetched["total"]
            label = describe_filters(filters, kind)
            ctx.update({
                "rows": rows, "total": total, "label": label,
                "kind": kind,
                "filters": _serializable_filters(filters),
                "page": page, "page_size": queries.CHAT_PAGE_SIZE,
            })
            builder = policy_result if kind == "policy" else scheme_result
            results = [builder(prefix, row) for row in rows]
            view_type = "VIEW_POLICY" if kind == "policy" else "VIEW_SCHEME"
            actions = [
                schemas.ChatAction(**a)
                for a in (policy_actions(prefix, rows) if kind == "policy"
                          else scheme_actions(prefix, rows))
            ]
            sources = [
                schemas.ChatSource(
                    kind=kind.upper(), id=r["id"], title=str(r.get("title") or ""),
                )
                for r in rows if r.get("id") is not None
            ]
            if total > len(rows):
                actions.append(schemas.ChatAction(
                    label="View All", type=view_type,
                    route=_route(prefix, "policies" if kind == "policy" else "schemes"),
                ))
            data = {
                "response_type": "LIST_RESPONSE" if filters else "SEARCH_RESPONSE",
                "total": total, "page": page,
                "page_size": queries.CHAT_PAGE_SIZE,
                "filters": _serializable_filters(filters),
            }
            return _finish(provider.render(intent_name, ctx, role))

        elif intent_name in (intent.POLICY_EXISTS, intent.SCHEME_EXISTS):
            kind = "policy" if intent_name == intent.POLICY_EXISTS else "scheme"
            name = (entities.get("name_hint") or "").strip() or entities.get("terms", "")
            found = find_record_by_name(db, user, kind, name)
            best = found.get("best")
            alternatives = found.get("alternatives", [])
            view_type = "VIEW_POLICY" if kind == "policy" else "VIEW_SCHEME"
            if best is not None:
                builder = policy_result if kind == "policy" else scheme_result
                results = [builder(prefix, best)]
                ctx.update({"row": best, "found": True, "kind": kind})
                actions = [schemas.ChatAction(
                    label=f"View {'Policy' if kind == 'policy' else 'Scheme'}",
                    type=view_type,
                    route=_route(prefix, "policies" if kind == "policy" else "schemes",
                                 str(best["id"])),
                    entity_type=kind.upper(), entity_id=best["id"],
                )]
                sources = [schemas.ChatSource(
                    kind=kind.upper(), id=best["id"],
                    title=str(best.get("title") or ""))]
                data = {"response_type": "ENTITY_EXISTS_RESPONSE",
                        "id": best.get("id"), "title": best.get("title")}
            elif alternatives:
                builder = policy_result if kind == "policy" else scheme_result
                results = [builder(prefix, row) for row in alternatives]
                ctx.update({"found": False, "ambiguous": True, "kind": kind,
                            "name": name, "rows": alternatives,
                            "total": found.get("total", len(alternatives))})
                actions = [
                    schemas.ChatAction(**a)
                    for a in (policy_actions(prefix, alternatives) if kind == "policy"
                              else scheme_actions(prefix, alternatives))
                ]
                data = {"response_type": "AMBIGUOUS_RESPONSE", "name": name,
                        "total": found.get("total", len(alternatives))}
            else:
                ctx.update({"found": False, "ambiguous": False, "kind": kind, "name": name})
                data = {"response_type": "ENTITY_NOT_FOUND_RESPONSE", "name": name}
            return _finish(provider.render(intent_name, ctx, role))

        elif intent_name in (intent.POLICY_EXPLANATION, intent.SCHEME_EXPLANATION):
            kind = "policy" if intent_name == intent.POLICY_EXPLANATION else "scheme"
            name = (entities.get("name_hint") or "").strip()
            best = None
            alternatives: list = []
            total = 0
            if entities.get("use_context") or not name:
                resolved = context.resolve_referenced_entity(
                    db, user, conversation_id, text, kind_hint=kind
                )
                if resolved is not None:
                    best = resolved
                    kind = resolved.get("_kind") or kind
            if best is None:
                found = find_record_by_name(db, user, kind, name or entities.get("terms", ""))
                best = found.get("best")
                alternatives = found.get("alternatives", [])
                total = found.get("total", 0)
            view_type = "VIEW_POLICY" if kind == "policy" else "VIEW_SCHEME"
            if best is not None:
                builder = policy_result if kind == "policy" else scheme_result
                results = [builder(prefix, best)]
                ctx.update({"row": best})
                actions = [schemas.ChatAction(
                    label=f"View {'Policy' if kind == 'policy' else 'Scheme'}",
                    type=view_type,
                    route=_route(prefix, "policies" if kind == "policy" else "schemes",
                                 str(best["id"])),
                    entity_type=kind.upper(), entity_id=best["id"],
                )]
                sources = [schemas.ChatSource(
                    kind=kind.upper(), id=best["id"],
                    title=str(best.get("title") or ""))]
                data = {"response_type": "DETAIL_RESPONSE",
                        "id": best.get("id"), "title": best.get("title")}
                if kind == "scheme":
                    actions.append(schemas.ChatAction(
                        label="Check Eligibility", type="CHECK_ELIGIBILITY",
                        route=_route(prefix, "eligibility"),
                    ))
            elif alternatives:
                builder = policy_result if kind == "policy" else scheme_result
                results = [builder(prefix, row) for row in alternatives]
                ctx.update({"row": None, "ambiguous": True, "kind": kind,
                            "rows": alternatives, "total": total})
                actions = [
                    schemas.ChatAction(**a)
                    for a in (policy_actions(prefix, alternatives) if kind == "policy"
                              else scheme_actions(prefix, alternatives))
                ]
                data = {"response_type": "AMBIGUOUS_RESPONSE", "total": total}
            else:
                ctx.update({"row": None})
                data = {"response_type": "NO_DATA_RESPONSE"}
            return _finish(provider.render(intent_name, ctx, role))

        elif intent_name in (intent.ELIGIBILITY_CHECK, intent.SCHEME_RECOMMENDATION):
            current_profile = entities.get("profile") or {}
            history_profile = context.get_conversation_profile(db, conversation_id)
            user_basics = {} if role == "GUEST" else context.user_basics_as_profile(user)
            full_profile = context.merge_profiles(
                context.merge_profiles(user_basics, history_profile), current_profile
            )
            name_hint = (entities.get("name_hint") or "").strip()
            target = None
            if name_hint:
                found = find_record_by_name(db, user, "scheme", name_hint)
                target = found.get("best")
            if target is None and intent_name == intent.ELIGIBILITY_CHECK:
                target = context.resolve_referenced_entity(
                    db, user, conversation_id, text, kind_hint="scheme"
                )
            profile_lines = context.profile_summary_lines(full_profile)
            if target is not None:
                check = queries.check_scheme_for_profile(db, target.get("id"), full_profile)
                if check is not None:
                    ctx.update({
                        "row": target, "check": check,
                        "profile_lines": profile_lines,
                        "single": True,
                    })
                    results = [scheme_result(prefix, target)]
                    actions = [
                        schemas.ChatAction(
                            label="View Scheme", type="VIEW_SCHEME",
                            route=_route(prefix, "schemes", str(target["id"])),
                            entity_type="SCHEME", entity_id=target["id"],
                        ),
                        schemas.ChatAction(
                            label="Check Full Eligibility", type="CHECK_ELIGIBILITY",
                            route=_route(prefix, "eligibility"),
                        ),
                    ]
                    sources = [schemas.ChatSource(
                        kind="SCHEME", id=target["id"],
                        title=str(target.get("title") or ""))]
                    data = {
                        "response_type": "ELIGIBILITY_RESPONSE",
                        "eligible": bool(check.get("eligible")),
                        "matched": check.get("matched_rules") or [],
                        "failed": check.get("failed_rules") or [],
                        "profile": _serializable_profile(full_profile),
                    }
                    return _finish(provider.render(intent_name, ctx, role))
            matched = queries.match_profile_schemes(db, full_profile)
            if matched is not None and matched["rows"]:
                rows = matched["rows"]
                ctx.update({
                    "rows": rows, "total": matched["total"],
                    "profile_lines": profile_lines,
                    "rule_matched": True,
                })
                results = [scheme_result(prefix, row) for row in rows]
                actions = [
                    schemas.ChatAction(**a) for a in scheme_actions(prefix, rows)
                ]
                actions.append(schemas.ChatAction(
                    label="Open Eligibility Checker", type="CHECK_ELIGIBILITY",
                    route=_route(prefix, "eligibility"),
                ))
                sources = [
                    schemas.ChatSource(kind="SCHEME", id=r["id"],
                                       title=str(r.get("title") or ""))
                    for r in rows if r.get("id") is not None
                ]
                data = {
                    "response_type": "ELIGIBILITY_RESPONSE",
                    "total": matched["total"],
                    "profile": _serializable_profile(full_profile),
                }
                return _finish(provider.render(intent_name, ctx, role))
            # Fallback: keyword search + ask for the details the engine needs.
            terms = entities.get("terms", "")
            fetched = search_schemes_filtered(db, user, terms, None, 1, queries.CHAT_PAGE_SIZE)
            rows, total = fetched["rows"], fetched["total"]
            ctx.update({
                "rows": rows, "total": total,
                "profile_lines": profile_lines,
                "rule_matched": False,
                "needs_details": queries.build_eligibility_profile_data(full_profile) is None,
            })
            results = [scheme_result(prefix, row) for row in rows]
            actions = [
                schemas.ChatAction(**a) for a in scheme_actions(prefix, rows)
            ]
            actions.append(schemas.ChatAction(
                label="Open Eligibility Checker", type="CHECK_ELIGIBILITY",
                route=_route(prefix, "eligibility"),
            ))
            data = {
                "response_type": "ELIGIBILITY_RESPONSE",
                "total": total,
                "profile": _serializable_profile(full_profile),
            }
            return _finish(provider.render(intent_name, ctx, role))

        elif intent_name in (intent.POLICY_COMPARISON, intent.SCHEME_COMPARISON):
            kind = entities.get("kind", "scheme")
            if kind == "policy" or intent_name == intent.POLICY_COMPARISON:
                kind = "policy"
            else:
                kind = "scheme"
            left_terms = entities.get("left", "")
            right_terms = entities.get("right", "")
            if not left_terms or not right_terms:
                titles = context.recent_assistant_titles(db, conversation_id, limit=5)
                lookups = []
                for title in titles:
                    row = find_record_by_name(db, user, kind, title).get("best")
                    if row and all(r["id"] != row["id"] for r in lookups):
                        lookups.append(row)
                    if len(lookups) >= 2:
                        break
                if len(lookups) >= 2:
                    left_terms = str(lookups[0].get("title") or "")
                    right_terms = str(lookups[1].get("title") or "")
            if kind == "policy":
                left = find_record_by_name(db, user, kind, left_terms).get("best") \
                    if left_terms else None
                right = find_record_by_name(db, user, kind, right_terms).get("best") \
                    if right_terms else None
            else:
                left = find_record_by_name(db, user, kind, left_terms).get("best") \
                    if left_terms else None
                right = find_record_by_name(db, user, kind, right_terms).get("best") \
                    if right_terms else None
            ctx.update({"left": left, "right": right, "kind": kind})
            builder = policy_result if kind == "policy" else scheme_result
            results = [builder(prefix, row) for row in (left, right) if row]
            sources = [
                schemas.ChatSource(kind=kind.upper(), id=r["id"],
                                   title=str(r.get("title") or ""))
                for r in (left, right) if r and r.get("id") is not None
            ]
            actions = [schemas.ChatAction(
                label="Open Comparison", type="COMPARE",
                route=_route(prefix, "compare"),
            )]
            data = {"response_type": "COMPARISON_RESPONSE", "kind": kind,
                    "left": (left or {}).get("title"),
                    "right": (right or {}).get("title")}
            return _finish(provider.render(intent_name, ctx, role))

        elif intent_name == intent.APPLICATION_GUIDANCE:
            name_hint = (entities.get("name_hint") or "").strip()
            row = None
            if name_hint:
                row = find_record_by_name(db, user, "scheme", name_hint).get("best")
            if row is None:
                row = context.resolve_referenced_entity(
                    db, user, conversation_id, text, kind_hint="scheme"
                )
            if row is None:
                fetched = search_schemes_filtered(
                    db, user, entities.get("terms", ""), None, 1, 1)
                rows = fetched["rows"]
                row = rows[0] if rows else None
            ctx.update({"row": row})
            if row and row.get("id") is not None:
                results = [scheme_result(prefix, row)]
                actions = [schemas.ChatAction(
                    label="View Scheme", type="VIEW_SCHEME",
                    route=_route(prefix, "schemes", str(row["id"])),
                    entity_type="SCHEME", entity_id=row["id"],
                )]
                sources = [schemas.ChatSource(
                    kind="SCHEME", id=row["id"],
                    title=str(row.get("title") or ""))]
                data = {"response_type": "APPLICATION_GUIDANCE_RESPONSE",
                        "id": row.get("id"), "title": row.get("title")}
            else:
                data = {"response_type": "NO_DATA_RESPONSE"}
            return _finish(provider.render(intent_name, ctx, role))

        elif intent_name == intent.BENEFITS_QUERY:
            kind = entities.get("kind") or "scheme"
            name_hint = (entities.get("name_hint") or "").strip()
            row = None
            if name_hint:
                row = find_record_by_name(db, user, kind, name_hint).get("best")
            if row is None:
                row = context.resolve_referenced_entity(
                    db, user, conversation_id, text, kind_hint=kind
                )
            if row is not None:
                is_policy = row.get("_kind") == "policy"
                builder = policy_result if is_policy else scheme_result
                results = [builder(prefix, row)]
                view_type = "VIEW_POLICY" if is_policy else "VIEW_SCHEME"
                segment = "policies" if is_policy else "schemes"
                actions = [schemas.ChatAction(
                    label=f"View {'Policy' if is_policy else 'Scheme'}",
                    type=view_type,
                    route=_route(prefix, segment, str(row["id"])),
                    entity_type="POLICY" if is_policy else "SCHEME",
                    entity_id=row["id"],
                )]
                if not is_policy:
                    actions.append(schemas.ChatAction(
                        label="Check Eligibility", type="CHECK_ELIGIBILITY",
                        route=_route(prefix, "eligibility"),
                    ))
                sources = [schemas.ChatSource(
                    kind="POLICY" if is_policy else "SCHEME", id=row["id"],
                    title=str(row.get("title") or ""))]
                ctx.update({"row": row, "found": True})
                data = {"response_type": "BENEFITS_RESPONSE",
                        "id": row.get("id"), "title": row.get("title")}
            else:
                ctx.update({"row": None, "found": False})
                data = {"response_type": "NO_DATA_RESPONSE"}
            return _finish(provider.render(intent_name, ctx, role))

        elif intent_name == intent.NOTIFICATION_QUERY:
            info = retrieve_notifications(db, user, role)
            ctx.update(info)
            actions = [schemas.ChatAction(
                label="Open Notifications", type="OPEN_NOTIFICATIONS",
                route=_route(prefix, "notifications"),
            )]
            data = {"response_type": "GENERAL_INFORMATION_RESPONSE",
                    "total": info.get("total", 0)}

        elif intent_name == intent.SAVED_ITEMS:
            actions = [schemas.ChatAction(
                label="Open Saved Items", type="OPEN_SAVED",
                route=_route(prefix, "saved"),
            )]

        elif intent_name == intent.SEARCH_HISTORY:
            actions = [schemas.ChatAction(
                label="Open Search History", type="OPEN_HISTORY",
                route=_route(prefix, "history"),
            )]

        elif intent_name == intent.APPLICATION_STATUS:
            actions = []
            data = {"response_type": "GENERAL_INFORMATION_RESPONSE"}

        elif intent_name in (intent.USER_STATS, intent.USER_LIST):
            requested_role = (entities.get("user_role") or "").upper() or None
            stats = queries.get_user_stats(db)
            if intent_name == intent.USER_STATS:
                count = stats["by_role"].get(requested_role, stats["total"]) \
                    if requested_role else stats["total"]
                label = f"{requested_role.title().replace('_', ' ')}s" \
                    if requested_role else "Registered Users"
                ctx.update({"label": label, "count": count,
                            "stats": stats, "kind": "user"})
                results = [statistic_result(label, count, "/dashboard/admin/users")]
                actions = [schemas.ChatAction(
                    label="Manage Users", type="NAVIGATE",
                    route="/dashboard/admin/users",
                )]
                data = {"response_type": "STATISTIC_RESPONSE", "count": count,
                        "by_role": stats["by_role"]}
            else:
                listed = queries.list_users_by_role(
                    db, requested_role, limit=queries.CHAT_PAGE_SIZE)
                users = listed["users"]
                label = f"{requested_role.title().replace('_', ' ')}s" \
                    if requested_role else "Users"
                ctx.update({"label": label, "users": users,
                            "total": listed["total"]})
                results = [
                    schemas.ChatResultItem(
                        type="user",
                        id=u.get("user_id"),
                        title=str(u.get("full_name") or "Unnamed User"),
                        subtitle=u.get("email"),
                        status="ACTIVE" if u.get("is_active") else "INACTIVE",
                        route="/dashboard/admin/users",
                        extra={"role": u.get("role"), "state": u.get("state")},
                    )
                    for u in users
                ]
                actions = [schemas.ChatAction(
                    label="Manage Users", type="NAVIGATE",
                    route="/dashboard/admin/users",
                )]
                data = {"response_type": "LIST_RESPONSE", "total": listed["total"]}
            return _finish(provider.render(intent_name, ctx, role))

        elif intent_name == intent.ANALYTICS_QUERY:
            terms = (entities.get("terms") or "").lower()
            if "notification" in terms:
                info = retrieve_notifications(db, user, role)
                ctx.update({**info, "subtype": "notifications"})
                actions = [schemas.ChatAction(
                    label="Open Notifications", type="OPEN_NOTIFICATIONS",
                    route=_route(prefix, "notifications"),
                )]
                data = {"response_type": "AGGREGATION_RESPONSE",
                        "subtype": "notifications",
                        "total": info.get("total", 0)}
            elif "report" in terms:
                from app.services import report_service

                reports = report_service.list_reports_for_user(
                    db, user, limit=5, offset=0) or []
                items = [
                    {"title": getattr(r, "title", "Report"),
                     "type": getattr(r, "report_type", ""),
                     "created_at": str(getattr(r, "created_at", "") or "")}
                    for r in reports
                ]
                ctx.update({"subtype": "reports", "reports": items,
                            "total": len(items)})
                actions = [schemas.ChatAction(
                    label="Open Reports", type="OPEN_REPORTS",
                    route=_route(prefix, "reports"),
                )]
                data = {"response_type": "AGGREGATION_RESPONSE",
                        "subtype": "reports", "total": len(items)}
            else:
                departments = queries.get_department_overview(db)
                ctx.update({"subtype": "departments", "departments": departments})
                actions = [schemas.ChatAction(
                    label="Open Analytics", type="OPEN_ANALYTICS",
                    route=_route(prefix, "analytics"),
                )]
                data = {"response_type": "AGGREGATION_RESPONSE",
                        "subtype": "departments",
                        "total": len(departments)}
            return _finish(provider.render(intent_name, ctx, role))

        elif intent_name == intent.MORE_RESULTS:
            last = context.get_last_search_with_page(db, conversation_id)
            if last is None:
                ctx.update({"no_prior_search": True})
                data = {"response_type": "NO_DATA_RESPONSE"}
                return _finish(provider.render(intent_name, ctx, role))
            search_intent, search_entities, page = last
            search_entities = dict(search_entities)
            search_entities["page"] = page
            kind = "policy" if search_intent in (
                intent.POLICY_SEARCH, intent.POLICY_COUNT,
                intent.POLICY_EXISTS, intent.POLICY_EXPLANATION,
            ) else "scheme"
            filters = search_entities.get("filters") or {}
            terms = search_entities.get("terms", "")
            fetched = (
                search_policies_filtered(
                    db, user, terms, filters, page, queries.CHAT_PAGE_SIZE)
                if kind == "policy"
                else search_schemes_filtered(
                    db, user, terms, filters, page, queries.CHAT_PAGE_SIZE)
            )
            rows, total = fetched["rows"], fetched["total"]
            label = describe_filters(filters, kind)
            ctx.update({
                "rows": rows, "total": total, "label": label,
                "kind": kind,
                "page": page, "page_size": queries.CHAT_PAGE_SIZE,
                "continued": True,
            })
            builder = policy_result if kind == "policy" else scheme_result
            results = [builder(prefix, row) for row in rows]
            sources = [
                schemas.ChatSource(kind=kind.upper(), id=r["id"],
                                   title=str(r.get("title") or ""))
                for r in rows if r.get("id") is not None
            ]
            data = {"response_type": "LIST_RESPONSE", "total": total,
                    "page": page, "page_size": queries.CHAT_PAGE_SIZE}
            list_intent = intent.POLICY_SEARCH if kind == "policy" else intent.SCHEME_SEARCH
            return _finish(provider.render(list_intent, ctx, role))

        elif intent_name in (intent.SUPPORT, intent.FAQ):
            faqs = retrieve_faqs(db, entities.get("terms", ""))
            ctx.update({"faqs": faqs})
            actions = [schemas.ChatAction(
                label="Open Support", type="OPEN_SUPPORT",
                route=support_route(prefix),
            )]

        elif intent_name == intent.NAVIGATION:
            target = _navigation_target(entities.get("terms", ""), prefix, role)
            if target.get("unavailable"):
                return (
                    f"{target['label']} aren't available for your role. Ask "
                    f"me about policies, schemes, eligibility or navigating "
                    f"the parts of PolicyGPT you can access.",
                    [],
                    [],
                    {"response_type": "UNAUTHORIZED_RESPONSE"},
                    [],
                )
            ctx.update({"target_label": target["label"]})
            actions = [schemas.ChatAction(
                label=f"Open {target['label']}", type="NAVIGATE",
                route=target["route"],
            )]
            data = {"response_type": "NAVIGATION_RESPONSE"}

        elif intent_name in (intent.GREETING, intent.THANKS):
            ctx.update({"greeting": _greeting_for_role(role)})
            data = {"response_type": "GENERAL_INFORMATION_RESPONSE"}

        elif intent_name == intent.REFUSAL:
            ctx.update({"message": (
                "I can't help with that. I follow PolicyGPT authorization "
                "rules, so I only share information available to your account "
                "and role. Ask me about policies, schemes, eligibility or "
                "navigating PolicyGPT."
            )})
            data = {"response_type": "UNAUTHORIZED_RESPONSE"}

        # UNKNOWN / GENERAL_QUERY fall through to the generic template.
        if data is None:
            data = {"response_type": "GENERAL_INFORMATION_RESPONSE"}
    except Exception as exc:
        logger.warning("chatbot retrieval failed intent=%s: %s", intent_name, exc)
        return (
            "I couldn't retrieve the requested PolicyGPT information right "
            "now. Please try again.",
            [],
            [],
            {"response_type": "NO_DATA_RESPONSE"},
            [],
        )

    try:
        reply_text = provider.render(intent_name, ctx, role)
    except Exception as exc:
        logger.warning("chatbot provider failed: %s", exc)
        reply_text = (
            "Sorry, I couldn't process your request right now. "
            "Please try again."
        )
    return reply_text, actions, sources, data, results


_NAVIGATION_KEYWORDS: tuple = (
    (("polic",), "Policies", "policies"),
    (("scheme",), "Schemes", "schemes"),
    (("eligib",), "Eligibility Checker", "eligibility"),
    (("compar",), "Compare", "compare"),
    (("notific", "alert"), "Notifications", "notifications"),
    (("saved", "bookmark"), "Saved Items", "saved"),
    (("search history", "history"), "Search History", "history"),
    (("support", "help", "faq"), "Support", "support"),
    (("report",), "Reports", "reports"),
    (("analytic", "dashboard"), "Analytics", "analytics"),
    (("profile", "account"), "Profile", "profile"),
    (("setting",), "Settings", "settings"),
)


def _navigation_target(terms: str, prefix: str, role: str) -> dict:
    lowered = (terms or "").lower()
    for keywords, label, segment in _NAVIGATION_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            if segment in ("reports", "analytics") and prefix not in (
                "admin",
                "government",
            ):
                return {"label": label, "route": "", "unavailable": True}
            route = _route(prefix, segment)
            if segment == "support":
                route = support_route(prefix)
            return {"label": label, "route": route}
    return {"label": "your dashboard", "route": f"/dashboard/{prefix}"}


def _greeting_for_role(role: str) -> str:
    greetings = {
        "CITIZEN": (
            "Hello! I'm your PolicyGPT Assistant. I can help you find "
            "government schemes, check eligibility, understand policies, "
            "compare schemes, and answer questions about government services."
        ),
        "GOVERNMENT_OFFICIAL": (
            "Hello! I can help you find policies and schemes, understand "
            "government programmes, access department information, and "
            "navigate PolicyGPT."
        ),
        "RESEARCHER": (
            "Hello! I can help you explore policies, schemes, eligibility "
            "rules, comparisons and available government information."
        ),
        "ORGANIZATION": (
            "Hello! I can help you find government schemes, policies, "
            "benefits and eligibility information relevant to organizations."
        ),
        "ADMIN": (
            "Hello! I can help you navigate PolicyGPT and retrieve "
            "information available to administrators."
        ),
        "GUEST": (
            "Hello! I can help you explore publicly available government "
            "policies and schemes."
        ),
    }
    return greetings.get(
        role,
        "Hello! I'm your PolicyGPT Assistant. How can I help you today?",
    )
