"""Rule-based intent classification for the PolicyGPT Assistant.

Deterministic keyword scoring over a fixed intent set — no ML model, no
network calls, safe to unit test. Entity extraction is intentionally
lightweight: the retrieval layer always re-validates against the database,
so extracted terms can never invent records.
"""

import re

# Intents the router/service layer understands.
POLICY_SEARCH = "POLICY_SEARCH"
SCHEME_SEARCH = "SCHEME_SEARCH"
POLICY_EXPLANATION = "POLICY_EXPLANATION"
SCHEME_EXPLANATION = "SCHEME_EXPLANATION"
ELIGIBILITY_CHECK = "ELIGIBILITY_CHECK"
SCHEME_RECOMMENDATION = "SCHEME_RECOMMENDATION"
POLICY_COMPARISON = "POLICY_COMPARISON"
SCHEME_COMPARISON = "SCHEME_COMPARISON"
APPLICATION_GUIDANCE = "APPLICATION_GUIDANCE"
NOTIFICATION_QUERY = "NOTIFICATION_QUERY"
APPLICATION_STATUS = "APPLICATION_STATUS"
SAVED_ITEMS = "SAVED_ITEMS"
SEARCH_HISTORY = "SEARCH_HISTORY"
SUPPORT = "SUPPORT"
FAQ = "FAQ"
NAVIGATION = "NAVIGATION"
GENERAL_QUERY = "GENERAL_QUERY"
UNKNOWN = "UNKNOWN"
GREETING = "GREETING"
THANKS = "THANKS"
REFUSAL = "REFUSAL"

_INJECTION_PATTERNS = (
    r"ignore\s+(all\s+|your\s+|previous\s+|above\s+)*(instructions|prompts?|rules?|orders?)",
    r"disregard\s+(all\s+|your\s+|previous\s+)*(instructions|prompts?|rules?)",
    r"system\s*prompt",
    r"reveal\s+(your\s+)?(instructions|prompt|config|secret)",
    r"show\s+me\s+all\s+users?",
    r"list\s+all\s+users?",
    r"\bbypass\b",
    r"\bjailbreak\b",
    r"developer\s+mode",
    r"do\s+anything\s+now",
    r"pretend\s+(you are|you're)\s+(not|no longer)",
)

_SENSITIVE_PATTERNS = (
    r"password",
    r"\bjwt\b",
    r"api\s*key",
    r"secret",
    r"all\s+users?",
    r"user\s+emails?",
)

_COMPARE_SPLIT = re.compile(
    r"\bvs\.?\b|\bversus\b|\bcompared?\s+(?:to|with)\b|\bcompare\b", re.IGNORECASE
)

_STOPWORDS = frozenset(
    """
    a an the and or for of to in on is are was were be been what which who
    whom whose what s please tell explain describe show find search look
    give list some any my me i you your we our they their it its this that
    these those there here how do does did can could should would will shall
    may might must about over under between into through during before after
    policy policies scheme schemes government scheme-related
    """.split()
)


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def detect_injection(text: str) -> bool:
    lowered = text.lower()
    if any(re.search(p, lowered) for p in _INJECTION_PATTERNS):
        return True
    # "show/list all users" style data-exfiltration probes.
    if re.search(r"show\s+me\s+all\s+users?", lowered):
        return True
    if re.search(r"list\s+all\s+users?", lowered):
        return True
    return False


def detect_sensitive_request(text: str) -> bool:
    lowered = text.lower()
    return any(re.search(p, lowered) for p in _SENSITIVE_PATTERNS)


def _has_any(lowered: str, phrases: tuple[str, ...]) -> bool:
    return any(p in lowered for p in phrases)


def extract_search_terms(text: str, max_terms: int = 8) -> str:
    tokens = [t for t in _words(text) if t not in _STOPWORDS and len(t) > 1]
    seen: list[str] = []
    for token in tokens:
        if token not in seen:
            seen.append(token)
        if len(seen) >= max_terms:
            break
    return " ".join(seen)


def extract_compare_terms(text: str) -> tuple[str, str] | None:
    # "A vs B" / "A versus B" / "compare A and B"
    match = re.search(
        r"compare\s+(.+?)\s+and\s+(.+)", text, re.IGNORECASE
    )
    if match:
        left = extract_search_terms(match.group(1))
        right = extract_search_terms(match.group(2))
        if left and right:
            return left, right
    parts = [p.strip() for p in _COMPARE_SPLIT.split(text) if p.strip()]
    if len(parts) >= 2:
        left = extract_search_terms(parts[0])
        right = extract_search_terms(parts[-1])
        if left and right:
            return left, right
    return None


def classify_intent(text: str) -> dict:
    """Return {'intent': str, 'entities': {...}}. Pure function."""
    lowered = text.lower().strip()
    entities: dict = {}

    if detect_injection(text):
        return {"intent": REFUSAL, "entities": {"reason": "injection"}}

    if re.match(
        r"^(hi|hii+|hello|hey|namaste|good\s*(morning|afternoon|evening|day)|yo)\b[!.?…\s\w,-]{0,24}$",
        lowered,
    ) and len(lowered) <= 32:
        return {"intent": GREETING, "entities": entities}

    if re.match(
        r"^(thanks?|thank\s*you|thx|dhanyavaad|shukriya)\b", lowered
    ):
        return {"intent": THANKS, "entities": entities}

    mentions_policy = _has_any(
        lowered, ("polic", "regulation", "act ", "bill", "ministry")
    )
    mentions_scheme = _has_any(
        lowered,
        ("scheme", "yojana", "scholarship", "subsidy", "benefit", "pension"),
    )

    # Comparison beats plain search.
    if _has_any(
        lowered,
        ("compar", " vs ", " vs.", "versus", "which is better", "difference between",
         "differences between", "better scheme", "best scheme"),
    ):
        terms = extract_compare_terms(text)
        if terms:
            entities["left"] = terms[0]
            entities["right"] = terms[1]
        if mentions_scheme and not mentions_policy:
            return {"intent": SCHEME_COMPARISON, "entities": entities}
        if mentions_policy and not mentions_scheme:
            return {"intent": POLICY_COMPARISON, "entities": entities}
        # Default ambiguous comparison to schemes (most common), unless the
        # user explicitly said policies.
        entities["kind"] = "scheme" if not mentions_policy else "policy"
        return {
            "intent": SCHEME_COMPARISON if entities["kind"] == "scheme" else POLICY_COMPARISON,
            "entities": entities,
        }

    # Navigation assistance (explicit UI-navigation phrasing wins over
    # topic keywords like "eligibility").
    if _has_any(
        lowered,
        ("where is", "where can i find", "how do i find", "take me to",
         "open the", "go to", "navigate", "where do i"),
    ):
        entities["terms"] = extract_search_terms(text)
        return {"intent": NAVIGATION, "entities": entities}

    # Eligibility / recommendation.
    if _has_any(
        lowered,
        ("eligib", "qualify", "am i eligible", "eligible for", "can i get",
         "can i apply", "do i qualify", "recommend", "suggest", "suitable",
         "for me", "my income", "family income"),
    ):
        entities["terms"] = extract_search_terms(text)
        if _has_any(lowered, ("recommend", "suggest", "suitable", "for me",
                              "family income", "my income", "i am a",
                              "i'm a", "may be available")):
            return {"intent": SCHEME_RECOMMENDATION, "entities": entities}
        return {"intent": ELIGIBILITY_CHECK, "entities": entities}

    # Application process guidance.
    if _has_any(
        lowered,
        ("how to apply", "how do i apply", "apply for", "application process",
         "application procedure", "documents required", "documents needed",
         "how can i apply", "applying"),
    ):
        entities["terms"] = extract_search_terms(text)
        return {"intent": APPLICATION_GUIDANCE, "entities": entities}

    # Notifications.
    if _has_any(
        lowered, ("notification", "alerts", "unread", "bell", "notify me")
    ):
        entities["terms"] = extract_search_terms(text)
        return {"intent": NOTIFICATION_QUERY, "entities": entities}

    # Application status.
    if _has_any(
        lowered,
        ("application status", "status of my application", "my application",
         "track application", "application tracking"),
    ):
        return {"intent": APPLICATION_STATUS, "entities": entities}

    # Saved items.
    if _has_any(
        lowered, ("saved", "bookmark", "my list", "my collection", "shortlist")
    ):
        return {"intent": SAVED_ITEMS, "entities": entities}

    # Search history.
    if _has_any(lowered, ("search history", "my searches", "what did i search",
                           "recent searches", "past searches")):
        return {"intent": SEARCH_HISTORY, "entities": entities}

    # Support / FAQ.
    if _has_any(
        lowered,
        ("support", "help desk", "contact", "complaint", "grievance", "ticket",
         "login problem", "can't log in", "cannot log in", "password reset",
         "forgot password", "report a problem", "facing issue", "error"),
    ):
        entities["terms"] = extract_search_terms(text)
        return {"intent": SUPPORT, "entities": entities}
    if _has_any(lowered, ("faq", "frequently asked", "common question")):
        entities["terms"] = extract_search_terms(text)
        return {"intent": FAQ, "entities": entities}

    # Explanations: "explain X / what is X / tell me about X".
    if _has_any(
        lowered, ("explain", "what is", "what are", "tell me about", "meaning of",
                  "describe", "summar", "simplif", "elaborate"),
    ):
        entities["terms"] = extract_search_terms(text)
        if mentions_scheme and not mentions_policy:
            return {"intent": SCHEME_EXPLANATION, "entities": entities}
        if mentions_policy and not mentions_scheme:
            return {"intent": POLICY_EXPLANATION, "entities": entities}
        if mentions_policy:
            return {"intent": POLICY_EXPLANATION, "entities": entities}
        if mentions_scheme:
            return {"intent": SCHEME_EXPLANATION, "entities": entities}
        return {"intent": GENERAL_QUERY, "entities": entities}

    # Plain searches.
    if mentions_scheme and not mentions_policy:
        entities["terms"] = extract_search_terms(text)
        return {"intent": SCHEME_SEARCH, "entities": entities}
    if mentions_policy and not mentions_scheme:
        entities["terms"] = extract_search_terms(text)
        return {"intent": POLICY_SEARCH, "entities": entities}
    if mentions_policy or mentions_scheme:
        entities["terms"] = extract_search_terms(text)
        # Both mentioned: let the dominant noun win by frequency.
        policy_hits = sum(lowered.count(w) for w in ("polic",))
        scheme_hits = sum(
            lowered.count(w)
            for w in ("scheme", "yojana", "scholarship", "subsidy")
        )
        if scheme_hits >= policy_hits:
            return {"intent": SCHEME_SEARCH, "entities": entities}
        return {"intent": POLICY_SEARCH, "entities": entities}

    # Bare help.
    if _has_any(lowered, ("help", "what can you do", "how does this work",
                           "how to use", "assist")):
        return {"intent": SUPPORT, "entities": entities}

    if len(lowered.split()) <= 2 and not entities:
        return {"intent": UNKNOWN, "entities": entities}

    entities["terms"] = extract_search_terms(text)
    return {"intent": GENERAL_QUERY, "entities": entities}
