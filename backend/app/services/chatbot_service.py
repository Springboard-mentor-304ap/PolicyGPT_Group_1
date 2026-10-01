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
    conversations = (
        db.query(ChatbotConversation)
        .filter(ChatbotConversation.user_id == user_id)
        .all()
    )
    removed = 0
    for conversation in conversations:
        messages = (
            db.query(ChatbotMessage)
            .filter(
                ChatbotMessage.conversation_id
                == conversation.conversation_id
            )
            .all()
        )
        for message in messages:
            db.delete(message)
            removed += 1
        db.delete(conversation)
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
        "application_end_date": str(get("application_end_date") or "") or None,
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
    else:
        reply_text, actions, sources = _handle_intent(
            db, user, role, prefix, intent_name, entities, cleaned
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
    )


# ============================================================
# INTENT HANDLERS
# ============================================================

def _handle_intent(db, user, role: str, prefix: str, intent_name: str,
                   entities: dict, text: str):
    provider = _provider()
    ctx: dict = {"question": text}
    actions: list[schemas.ChatAction] = []
    sources: list[schemas.ChatSource] = []

    try:
        if intent_name == intent.POLICY_SEARCH:
            data = retrieve_policies(db, user, entities.get("terms", ""))
            ctx.update({"rows": data["rows"], "total": data["total"]})
            actions = [
                schemas.ChatAction(**a)
                for a in policy_actions(prefix, data["rows"])
            ]
            sources = [
                schemas.ChatSource(kind="POLICY", id=r["id"], title=r["title"])
                for r in data["rows"] if r.get("id") is not None
            ]

        elif intent_name == intent.SCHEME_SEARCH:
            data = retrieve_schemes(db, user, entities.get("terms", ""))
            ctx.update({"rows": data["rows"], "total": data["total"]})
            actions = [
                schemas.ChatAction(**a)
                for a in scheme_actions(prefix, data["rows"])
            ]
            sources = [
                schemas.ChatSource(kind="SCHEME", id=r["id"], title=r["title"])
                for r in data["rows"] if r.get("id") is not None
            ]

        elif intent_name == intent.POLICY_EXPLANATION:
            data = retrieve_policies(db, user, entities.get("terms", ""), limit=1)
            row = data["rows"][0] if data["rows"] else None
            ctx.update({"row": row})
            if row and row.get("id") is not None:
                actions = [schemas.ChatAction(
                    label="View Policy", type="VIEW_POLICY",
                    route=_route(prefix, "policies", str(row["id"])),
                    entity_type="POLICY", entity_id=row["id"],
                )]
                sources = [schemas.ChatSource(
                    kind="POLICY", id=row["id"], title=row["title"])]

        elif intent_name == intent.SCHEME_EXPLANATION:
            data = retrieve_schemes(db, user, entities.get("terms", ""), limit=1)
            row = data["rows"][0] if data["rows"] else None
            ctx.update({"row": row})
            if row and row.get("id") is not None:
                actions = [schemas.ChatAction(
                    label="View Scheme", type="VIEW_SCHEME",
                    route=_route(prefix, "schemes", str(row["id"])),
                    entity_type="SCHEME", entity_id=row["id"],
                )]
                sources = [schemas.ChatSource(
                    kind="SCHEME", id=row["id"], title=row["title"])]

        elif intent_name in (intent.ELIGIBILITY_CHECK, intent.SCHEME_RECOMMENDATION):
            data = retrieve_schemes(db, user, entities.get("terms", ""))
            ctx.update({"rows": data["rows"], "total": data["total"]})
            actions = [
                schemas.ChatAction(**a)
                for a in scheme_actions(prefix, data["rows"])
            ]
            actions.append(schemas.ChatAction(
                label="Open Eligibility Checker", type="CHECK_ELIGIBILITY",
                route=_route(prefix, "eligibility"),
            ))

        elif intent_name in (intent.POLICY_COMPARISON, intent.SCHEME_COMPARISON):
            kind = entities.get("kind", "scheme")
            left_terms = entities.get("left", "")
            right_terms = entities.get("right", "")
            if kind == "policy" or intent_name == intent.POLICY_COMPARISON:
                left = retrieve_policies(db, user, left_terms, limit=1)
                right = retrieve_policies(db, user, right_terms, limit=1)
                ctx.update({
                    "left": left["rows"][0] if left["rows"] else None,
                    "right": right["rows"][0] if right["rows"] else None,
                })
            else:
                left = retrieve_schemes(db, user, left_terms, limit=1)
                right = retrieve_schemes(db, user, right_terms, limit=1)
                ctx.update({
                    "left": left["rows"][0] if left["rows"] else None,
                    "right": right["rows"][0] if right["rows"] else None,
                })
            actions = [schemas.ChatAction(
                label="Open Comparison", type="COMPARE",
                route=_route(prefix, "compare"),
            )]

        elif intent_name == intent.APPLICATION_GUIDANCE:
            data = retrieve_schemes(db, user, entities.get("terms", ""), limit=1)
            row = data["rows"][0] if data["rows"] else None
            ctx.update({"row": row})
            if row and row.get("id") is not None:
                actions = [schemas.ChatAction(
                    label="View Scheme", type="VIEW_SCHEME",
                    route=_route(prefix, "schemes", str(row["id"])),
                    entity_type="SCHEME", entity_id=row["id"],
                )]

        elif intent_name == intent.NOTIFICATION_QUERY:
            data = retrieve_notifications(db, user, role)
            ctx.update(data)
            actions = [schemas.ChatAction(
                label="Open Notifications", type="OPEN_NOTIFICATIONS",
                route=_route(prefix, "notifications"),
            )]

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
                )
            ctx.update({"target_label": target["label"]})
            actions = [schemas.ChatAction(
                label=f"Open {target['label']}", type="NAVIGATE",
                route=target["route"],
            )]

        elif intent_name in (intent.GREETING, intent.THANKS):
            ctx.update({"greeting": _greeting_for_role(role)})

        elif intent_name == intent.REFUSAL:
            ctx.update({"message": (
                "I can't help with that. I follow PolicyGPT authorization "
                "rules, so I only share information available to your account "
                "and role. Ask me about policies, schemes, eligibility or "
                "navigating PolicyGPT."
            )})

        # UNKNOWN / GENERAL_QUERY fall through to the generic template.
    except Exception as exc:
        logger.warning("chatbot retrieval failed intent=%s: %s", intent_name, exc)
        return (
            "I couldn't retrieve the requested PolicyGPT information right "
            "now. Please try again.",
            [],
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
    return reply_text, actions, sources


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
