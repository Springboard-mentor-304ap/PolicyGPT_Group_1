"""Conversation context for the PolicyGPT Assistant.

Resolves follow-up references ("its benefits", "the second one",
"can I apply?") against the persisted conversation history and merges
conversationally supplied profile facts (age, income, education, ...)
across turns.

The history text is only ever used to derive *search terms* — every
candidate is re-validated with a real database lookup, so context can
never invent records.
"""

import re
from datetime import date

from app.services import chatbot_intent_service as intent

_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_NUMBERED_RE = re.compile(r"^\s*\d+[.)]\s+(.+?)\s*$")


def _clean_title(text: str) -> str | None:
    title = (text or "").strip().strip("\"“”'?:., ")
    if len(title) >= 3:
        return title
    return None

_SEARCH_INTENTS = frozenset({
    intent.POLICY_SEARCH,
    intent.SCHEME_SEARCH,
    intent.POLICY_COUNT,
    intent.SCHEME_COUNT,
    intent.POLICY_EXISTS,
    intent.SCHEME_EXISTS,
    intent.POLICY_EXPLANATION,
    intent.SCHEME_EXPLANATION,
    intent.ELIGIBILITY_CHECK,
    intent.SCHEME_RECOMMENDATION,
    intent.APPLICATION_GUIDANCE,
    intent.BENEFITS_QUERY,
    intent.POLICY_COMPARISON,
    intent.SCHEME_COMPARISON,
})

_PRONOUN_HINTS = (
    "its", "it", "this scheme", "that scheme", "the scheme",
    "this policy", "that policy", "the policy", "benefits",
    "eligib", "apply", "document", "deadline", "ministry",
    "department", "status", "available", "this", "that",
)


def merge_profiles(base: dict, override: dict) -> dict:
    """Later-turn facts win; never mutates the inputs."""
    merged = dict(base or {})
    for key, value in (override or {}).items():
        if value is not None and value != "":
            merged[key] = value
    return merged


def user_basics_as_profile(user) -> dict:
    """Profile facts derivable from the authenticated user row.

    Only uses fields that actually exist on the user model. Never
    exposes private data beyond what the reply needs.
    """
    profile: dict = {}
    dob = getattr(user, "date_of_birth", None)
    if isinstance(dob, date):
        today = date.today()
        age = today.year - dob.year - (
            (today.month, today.day) < (dob.month, dob.day)
        )
        if 5 <= age <= 100:
            profile["age"] = age
    for attr in ("state", "occupation"):
        value = getattr(user, attr, None)
        if value and str(value).strip():
            profile[attr] = str(value).strip()
    return profile


def _load_messages(db, conversation_id: int, limit: int = 30) -> list:
    from app.services import chatbot_service

    try:
        return chatbot_service.load_history(db, conversation_id, limit)
    except Exception:
        return []


def get_conversation_profile(db, conversation_id: int | None) -> dict:
    """Merge profile facts from recent user messages + current turn."""
    profile: dict = {}
    if conversation_id is None:
        return profile
    for message in _load_messages(db, conversation_id):
        if getattr(message, "sender", "") == "user":
            profile = merge_profiles(
                profile, intent.extract_profile_details(message.message or "")
            )
    return profile


def get_conversation_profile_with_current(
    db, conversation_id: int | None, current_text: str
) -> dict:
    profile = get_conversation_profile(db, conversation_id)
    return merge_profiles(profile, intent.extract_profile_details(current_text or ""))


def recent_assistant_titles(db, conversation_id: int | None, limit: int = 10) -> list[str]:
    """Candidate record titles from recent assistant replies.

    Numbered result lines first (most specific), then bolded headings.
    Titles are search terms only — always re-validated against the DB.
    """
    titles: list[str] = []
    if conversation_id is None:
        return titles
    for message in reversed(_load_messages(db, conversation_id)):
        if getattr(message, "sender", "") != "assistant":
            continue
        for line in (message.message or "").split("\n"):
            match = _NUMBERED_RE.match(line)
            if match:
                title = _clean_title(match.group(1))
                if title and title not in titles:
                    titles.append(title)
        for match in _BOLD_RE.finditer(message.message or ""):
            title = _clean_title(match.group(1))
            if title and title not in titles:
                titles.append(title)
        if len(titles) >= limit:
            break
    return titles[:limit]


def _try_lookup(db, user, kind: str, term: str):
    from app.services import chatbot_service

    term = (term or "").strip()
    if len(term) < 3:
        return None
    try:
        # fuzzy=False: context titles are re-validated with substring
        # ranking only — no bounded full-fetch scan per candidate, so
        # follow-up resolution stays at a handful of indexed queries.
        found = chatbot_service.find_record_by_name(
            db, user, kind, term, fuzzy=False)
    except Exception:
        return None
    if found and found.get("best"):
        return found["best"]
    return None


def _kind_order(kind_hint: str) -> tuple[str, ...]:
    """Deduplicated lookup order: hinted kind first, then the other table."""
    ordered = [kind_hint]
    for kind in ("scheme", "policy"):
        if kind not in ordered:
            ordered.append(kind)
    return tuple(ordered)


def resolve_referenced_entity(
    db, user, conversation_id: int | None, text: str, kind_hint: str = "scheme"
):
    """Resolve "it / second one / <name>" to a real DB row dict or None."""
    lowered = (text or "").lower()
    kinds = _kind_order(kind_hint)

    # 1. Explicit name in this turn.
    hint = intent.extract_name_hint(text or "")
    if hint:
        for kind in ({kind_hint} | {"policy", "scheme"}):
            row = _try_lookup(db, user, kind, hint)
            if row:
                return row

    if conversation_id is None:
        return None

    titles = recent_assistant_titles(db, conversation_id)

    # 2. Ordinal reference ("the second one").
    ordinal = intent.detect_ordinal(text or "")
    if ordinal is not None and titles:
        index = ordinal - 1 if ordinal > 0 else len(titles) - 1
        if 0 <= index < len(titles):
            for kind in kinds:
                row = _try_lookup(db, user, kind, titles[index])
                if row:
                    return row

    # 3. Pronoun / bare follow-up ("its benefits?", "can I apply?").
    # Only the most recent titles are tried: the active subject is at the
    # top of the list, and each candidate costs database round-trips.
    if any(hint_word in lowered for hint_word in _PRONOUN_HINTS):
        for title in titles[:3]:
            for kind in kinds:
                row = _try_lookup(db, user, kind, title)
                if row:
                    return row

    # 4. Most recent explicitly named entity from earlier user turns
    # (bounded: older turns are progressively less likely to be meant).
    seen = 0
    for message in reversed(_load_messages(db, conversation_id)):
        if getattr(message, "sender", "") != "user":
            continue
        older_hint = intent.extract_name_hint(message.message or "")
        if not older_hint:
            continue
        seen += 1
        if seen > 3:
            break
        for kind in kinds:
            row = _try_lookup(db, user, kind, older_hint)
            if row:
                return row
    return None


def get_last_search_with_page(db, conversation_id: int | None):
    """Last search turn plus next page number for 'show more' follow-ups.

    Page = 1 + the number of MORE_RESULTS requests already made since
    that search, so repeated 'show more' pages forward correctly.
    """
    if conversation_id is None:
        return None
    messages = [
        m for m in _load_messages(db, conversation_id)
        if getattr(m, "sender", "") == "user"
    ]
    last_index = None
    last_search = None
    for index, message in enumerate(messages):
        classified = intent.classify_intent(message.message or "")
        if classified["intent"] in _SEARCH_INTENTS:
            last_index = index
            last_search = {
                "intent": classified["intent"],
                "entities": classified.get("entities", {}),
                "text": message.message,
            }
    if last_search is None or last_index is None:
        return None
    more_count = sum(
        1 for message in messages[last_index + 1:]
        if intent.classify_intent(message.message or "")["intent"]
        == intent.MORE_RESULTS
    )
    # First "show more" after page 1 shows page 2, then 3, ...
    page = more_count + 2
    return last_search["intent"], last_search["entities"], page


def get_last_search(db, conversation_id: int | None):
    """Most recent search-type user turn, re-classified (pure function)."""
    if conversation_id is None:
        return None
    for message in reversed(_load_messages(db, conversation_id)):
        if getattr(message, "sender", "") != "user":
            continue
        classified = intent.classify_intent(message.message or "")
        if classified["intent"] in _SEARCH_INTENTS:
            return {
                "intent": classified["intent"],
                "entities": classified.get("entities", {}),
                "text": message.message,
            }
    return None


def profile_summary_lines(profile: dict) -> list[str]:
    """Human-readable echoed facts for recommendation replies."""
    lines: list[str] = []
    if profile.get("age") is not None:
        lines.append(f"Age: **{profile['age']}**")
    if profile.get("education"):
        lines.append(f"Education: **{profile['education']}**")
    if profile.get("occupation"):
        lines.append(f"Occupation: **{profile['occupation']}**")
    if profile.get("state"):
        lines.append(f"State: **{profile['state']}**")
    if profile.get("income") is not None:
        try:
            lines.append(f"Family Income: **\u20b9{float(profile['income']):,.0f}**")
        except (TypeError, ValueError):
            pass
    return lines
