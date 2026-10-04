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
POLICY_COUNT = "POLICY_COUNT"
SCHEME_COUNT = "SCHEME_COUNT"
POLICY_EXISTS = "POLICY_EXISTS"
SCHEME_EXISTS = "SCHEME_EXISTS"
BENEFITS_QUERY = "BENEFITS_QUERY"
USER_STATS = "USER_STATS"
USER_LIST = "USER_LIST"
ANALYTICS_QUERY = "ANALYTICS_QUERY"
MORE_RESULTS = "MORE_RESULTS"
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

    # Conversational data questions (count / existence / benefits /
    # user directory / analytics / pagination). These sit before the
    # generic search/explanation branches but after comparison and
    # navigation so explicit phrasing keeps priority.
    conversational = _classify_conversational(text, lowered)
    if conversational is not None:
        return conversational

    # Field-targeted follow-ups ("its benefits?", "who can apply for
    # this?", "what documents are needed?"). These beat the generic
    # branches so pronoun questions resolve against conversation context
    # instead of falling through to GENERAL_QUERY.
    field_followup = _classify_field_followup(text, lowered)
    if field_followup is not None:
        return field_followup

    # Eligibility / recommendation.
    if _has_any(
        lowered,
        ("eligib", "qualify", "am i eligible", "eligible for", "can i get",
         "can i apply", "do i qualify", "who can apply", "who is eligible",
         "eligibility criteria", "according to my profile", "for my profile",
         "based on my profile", "using my profile",
         "recommend", "suggest", "suitable",
         "for me", "my income", "family income"),
    ):
        entities["terms"] = extract_search_terms(text)
        entities["profile"] = extract_profile_details(text)
        entities["name_hint"] = extract_name_hint(text)
        entities["requested_field"] = FIELD_ELIGIBILITY
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
         "documents are needed", "what documents", "which documents",
         "how can i apply", "applying"),
    ):
        entities["terms"] = extract_search_terms(text)
        entities["name_hint"] = extract_name_hint(text)
        entities["requested_field"] = (
            FIELD_DOCUMENTS if "document" in lowered
            else FIELD_APPLICATION_PROCESS
        )
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
        entities["name_hint"] = extract_name_hint(text)
        entities["profile"] = extract_profile_details(text)
        entities["requested_field"] = (
            extract_requested_field(text) or FIELD_DESCRIPTION
        )
        if mentions_scheme and not mentions_policy:
            return {"intent": SCHEME_EXPLANATION, "entities": entities}
        if mentions_policy and not mentions_scheme:
            return {"intent": POLICY_EXPLANATION, "entities": entities}
        if mentions_policy:
            return {"intent": POLICY_EXPLANATION, "entities": entities}
        if mentions_scheme:
            return {"intent": SCHEME_EXPLANATION, "entities": entities}
        # Ordinal / pronoun follow-up ("tell me about the second one").
        if detect_ordinal(text) is not None or re.search(
            r"\b(this|that)\s+one\b|\btell\s+me\s+about\s+it\b|\babout\s+it\b",
            lowered,
        ):
            entities["name_hint"] = ""
            entities["use_context"] = True
            return {"intent": SCHEME_EXPLANATION, "entities": entities}
        # Bare-name detail request ("Tell me about PM Kisan", "What is
        # Ayushman Bharat?"): no policy/scheme keyword, but a plausible
        # record name is present. Try a grounded lookup instead of a
        # generic answer; the service replies "not found" when the
        # database has no match.
        if entities["name_hint"]:
            return {"intent": SCHEME_EXPLANATION, "entities": entities}
        return {"intent": GENERAL_QUERY, "entities": entities}

    # Plain searches (filters attached for structured querying).
    if mentions_scheme and not mentions_policy:
        entities["terms"] = extract_search_terms(text)
        entities["filters"] = extract_filters(text)
        entities["name_hint"] = extract_name_hint(text)
        return {"intent": SCHEME_SEARCH, "entities": entities}
    if mentions_policy and not mentions_scheme:
        entities["terms"] = extract_search_terms(text)
        entities["filters"] = extract_filters(text)
        entities["name_hint"] = extract_name_hint(text)
        return {"intent": POLICY_SEARCH, "entities": entities}
    if mentions_policy or mentions_scheme:
        entities["terms"] = extract_search_terms(text)
        entities["filters"] = extract_filters(text)
        entities["name_hint"] = extract_name_hint(text)
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
        # Short name queries ("PM-KISAN", "Ayushman Bharat"): try a
        # grounded lookup instead of giving up. The service replies
        # "not found" when the database has no match.
        hint = extract_name_hint(text) or extract_search_terms(text)
        if hint:
            return {"intent": SCHEME_EXPLANATION, "entities": {
                "terms": extract_search_terms(text),
                "name_hint": hint,
                "requested_field": FIELD_DESCRIPTION,
            }}
        return {"intent": UNKNOWN, "entities": entities}

    entities["terms"] = extract_search_terms(text)
    return {"intent": GENERAL_QUERY, "entities": entities}


# ============================================================
# CONVERSATIONAL DATA INTENTS (count / existence / benefits /
# user directory / analytics / pagination)
# ============================================================

_USER_WORDS = (
    "user",
    "users",
    "citizen",
    "citizens",
    "official",
    "officials",
    "government official",
    "government officials",
    "administrator",
    "administrators",
    "researcher",
    "researchers",
    "organization",
    "organizations",
    "organisation",
    "organisations",
    "member",
    "members",
)

_USER_ROLE_MAP = (
    (("government official", "government officials", "official", "officials"), "GOVERNMENT_OFFICIAL"),
    (("citizen", "citizens"), "CITIZEN"),
    (("administrator", "administrators", "admin", "admins"), "ADMIN"),
    (("researcher", "researchers"), "RESEARCHER"),
    (("organization", "organizations", "organisation", "organisations"), "ORGANIZATION"),
)

_STATUS_WORDS = (
    ("pending approval", "PENDING_APPROVAL"),
    ("awaiting approval", "PENDING_APPROVAL"),
    ("pending", "PENDING_APPROVAL"),
    ("draft", "DRAFT"),
    ("approved", "APPROVED"),
    ("rejected", "REJECTED"),
    ("archived", "ARCHIVED"),
)

_INDIAN_STATES = (
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
    "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
    "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
    "Ladakh", "Lakshadweep", "Puducherry",
)

_CATEGORY_HINTS = (
    "education", "health", "healthcare", "agriculture", "water", "energy",
    "finance", "housing", "employment", "scholarship", "women", "child",
    "children", "farmer", "farmers", "student", "students", "skill",
    "rural", "urban", "senior", "youth", "disability", "business",
)

_MONTHS = (
    "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
)

_MORE_PATTERNS = (
    r"^(show|see|load)\s+(more|remaining|rest)\b",
    r"^more(\s+results?)?[!.?…\s]*$",
    r"^next(\s+page|\s+results?)?[!.?…\s]*$",
    r"^show\s+all\s*$",
    r"^(continue|next batch|load next)\b",
)

_ORDINAL_WORDS = {
    "first": 1, "1st": 1,
    "second": 2, "2nd": 2,
    "third": 3, "3rd": 3,
    "fourth": 4, "4th": 4,
    "fifth": 5, "5th": 5,
    "last": -1,
}


def _mentions_user(lowered: str) -> bool:
    return any(
        re.search(r"\b" + re.escape(word) + r"\b", lowered)
        for word in _USER_WORDS
    )


def _user_role_filter(lowered: str) -> str | None:
    for words, role in _USER_ROLE_MAP:
        if any(w in lowered for w in words):
            return role
    return None


def extract_status_filter(text: str) -> str | None:
    lowered = text.lower()
    for phrase, status in _STATUS_WORDS:
        if phrase in lowered:
            return status
    return None


def extract_state_filter(text: str) -> str | None:
    lowered = text.lower()
    for state in _INDIAN_STATES:
        if re.search(r"\b" + re.escape(state.lower()) + r"\b", lowered):
            return state
    return None


def extract_ministry_terms(text: str) -> str:
    lowered = text.lower()
    match = re.search(
        r"ministry\s+of\s+([a-zA-Z][a-zA-Z& ]+?)(?:\s+polic|\s+scheme|\?|$|\s+in\s+|\s+from\s+|\s+for\s+)",
        lowered,
    )
    if match:
        return match.group(1).strip()
    match = re.search(r"([a-zA-Z][a-zA-Z& ]+?)\s+ministry\b", lowered)
    if match:
        return match.group(1).strip()
    match = re.search(r"department\s+of\s+([a-zA-Z][a-zA-Z& ]+?)(?:\s+polic|\s+scheme|\?|$)", lowered)
    if match:
        return match.group(1).strip()
    return ""


def extract_date_filter(text: str) -> dict:
    lowered = text.lower()
    if re.search(r"\bthis\s+month\b", lowered):
        return {"preset": "this_month"}
    if re.search(r"\bthis\s+year\b", lowered):
        return {"preset": "this_year"}
    month_match = re.search(
        r"published\s+in\s+(january|february|march|april|may|june|july|"
        r"august|september|october|november|december)(?:\s+(20\d{2}))?",
        lowered,
    )
    if month_match:
        return {
            "preset": "month",
            "month": _MONTHS.index(month_match.group(1)) + 1,
            "year": int(month_match.group(2)) if month_match.group(2) else None,
        }
    if re.search(r"\b(19|20)\d{2}\b", lowered):
        year = int(re.search(r"\b((?:19|20)\d{2})\b", lowered).group(1))  # type: ignore[union-attr]
        if "publish" in lowered or "polic" in lowered or "scheme" in lowered:
            return {"preset": "year", "year": year}
    if re.search(r"\b(recent|latest|lately|newest|this\s+week)\b", lowered):
        return {"preset": "recent"}
    return {"preset": None}


def extract_category_terms(text: str) -> str:
    lowered = text.lower()
    found = [hint for hint in _CATEGORY_HINTS if re.search(r"\b" + hint + r"\b", lowered)]
    return " ".join(found)


def extract_filters(text: str) -> dict:
    """Structured filters for policy/scheme queries. Pure function."""
    ministry = extract_ministry_terms(text)
    category = extract_category_terms(text)
    seen: list[str] = []
    for token in f"{ministry} {category}".split():
        if token not in seen:
            seen.append(token)
    return {
        "status": extract_status_filter(text),
        "state": extract_state_filter(text),
        "date": extract_date_filter(text),
        "extra_terms": " ".join(seen),
    }


def extract_name_hint(text: str) -> str:
    """Best-guess record name for existence/detail/benefit lookups."""
    quoted = re.search(r"[\"“”']([^\"“”']{3,80})[\"“”']", text)
    if quoted:
        return quoted.group(1).strip()
    # Capitalized phrases (e.g. "National Water Policy 2012", "PM-KISAN").
    candidates = re.findall(
        r"\b([A-Z][A-Za-z0-9.\-]*(?:\s+[A-Z0-9][A-Za-z0-9.\-]*)+)\b", text
    )
    stop_prefix = {
        "tell", "show", "what", "how", "does", "is", "do", "are",
        "find", "give", "list", "search", "explain", "about", "central",
        "am", "i", "was", "were", "be", "been", "my", "me", "you",
        "your", "we", "our", "they", "their", "it", "its", "this",
        "that", "these", "those",
    }
    for candidate in candidates:
        words = candidate.split()
        while words and words[0].lower().strip("?.,") in stop_prefix:
            words.pop(0)
        cleaned = " ".join(words).strip("?., ")
        if len(cleaned) >= 4:
            return cleaned
    acronym = re.search(r"\b([A-Z][A-Z0-9.\-]{2,}(?:\s+[A-Z][A-Z0-9.\-]+)*)\b", text)
    if acronym:
        return acronym.group(1).strip()
    return ""


def detect_ordinal(text: str) -> int | None:
    lowered = text.lower()
    match = re.search(
        r"\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|last)\b(?:\s+(?:one|result|option|scheme|polic(?:y|ies)))?",
        lowered,
    )
    if match:
        return _ORDINAL_WORDS[match.group(1)]
    return None


def extract_profile_details(text: str) -> dict:
    """Conversational profile facts (age, income, education, ...). Pure."""
    details: dict = {}
    lowered = text.lower()

    age_match = re.search(
        r"(\d{1,3})\s*(?:years?\s*old|yrs?\s*old|y\.o\b)|\bi\s*(?:'?m|am)\s+(\d{1,2})\b", lowered
    )
    if age_match:
        age = int(age_match.group(1) or age_match.group(2))
        if 5 <= age <= 100:
            details["age"] = age

    income_match = re.search(
        r"(?:family|annual|yearly)?\s*income[^\d₹]{0,12}(?:₹|rs\.?|inr)?\s*([\d,.]+)\s*(lakh|lakhs|lacs?|crore|crores?|thousand|k)?",
        lowered,
    )
    if not income_match:
        income_match = re.search(
            r"₹\s*([\d,.]+)\s*(lakh|lakhs|lacs?|crore|crores?|thousand|k)?", lowered
        )
    if income_match:
        try:
            amount = float(income_match.group(1).replace(",", ""))
            unit = (income_match.group(2) or "").lower()
            if unit.startswith("crore"):
                amount *= 10_000_000
            elif unit.startswith("lakh") or unit.startswith("lac"):
                amount *= 100_000
            elif unit in ("thousand", "k"):
                amount *= 1_000
            details["income"] = amount
        except ValueError:
            pass

    for pattern, value in (
        (r"\bb\.?\s*tech\b", "B.Tech"),
        (r"\bm\.?\s*tech\b", "M.Tech"),
        (r"\bmba\b", "MBA"),
        (r"\bmbbs\b", "MBBS"),
        (r"\b12th\b|\bhigher secondary\b|\bintermediate\b", "12th"),
        (r"\b10th\b|\bmatric", "10th"),
        (r"\bph\.?d\b", "PhD"),
        (r"\bpost\s*graduat|\bmaster'?s\b", "Postgraduate"),
        (r"\bgraduat|\bbachelor", "Graduate"),
        (r"\bdiploma\b", "Diploma"),
        (r"\biti\b", "ITI"),
    ):
        if re.search(pattern, lowered):
            details["education"] = value
            break
    if "education" not in details and re.search(
        r"\bcollege\s+student\b|\buniversity\s+student\b", lowered
    ):
        details["education"] = "College"

    for pattern, value in (
        (r"\bstudent\b", "Student"),
        (r"\bfarmer\b", "Farmer"),
        (r"\bteacher\b|\bprofessor\b", "Teacher"),
        (r"\bdoctor\b|\bnurse\b", "Healthcare"),
        (r"\bengineer\b", "Engineer"),
        (r"\bbusiness\b|\bentrepreneur\b|\bshop\b", "Business"),
        (r"\bunemployed\b", "Unemployed"),
        (r"\bretired\b|\bpensioner\b", "Retired"),
        (r"\bgovernment\s+employ", "Government Employee"),
        (r"\bself[\s-]?employed\b", "Self-Employed"),
    ):
        if re.search(pattern, lowered):
            details["occupation"] = value
            break

    state = extract_state_filter(text)
    if state:
        details["state"] = state

    if re.search(r"\bfemale\b|\bwoman\b|\bgirl\b|\bher\b", lowered):
        details["gender"] = "Female"
    elif re.search(r"\bmale\b|\bman\b|\bboy\b|\bhis\b", lowered):
        details["gender"] = "Male"

    if re.search(r"\b(st|scheduled\s+tribe)\b", lowered):
        details["category"] = "ST"
    elif re.search(r"\b(sc|scheduled\s+caste)\b", lowered):
        details["category"] = "SC"
    elif re.search(r"\bobc\b", lowered):
        details["category"] = "OBC"
    elif re.search(r"\bews\b", lowered):
        details["category"] = "EWS"

    if re.search(r"\bdisab|pwd\b|physically\s+challenged|differently\s+abled", lowered):
        details["disability"] = True

    return details


def _dominant_kind(lowered: str) -> str:
    mentions_policy = "polic" in lowered
    mentions_scheme = any(
        word in lowered
        for word in ("scheme", "yojana", "scholarship", "subsidy", "pension")
    )
    if mentions_policy and not mentions_scheme:
        return "policy"
    return "scheme"


# Requested-field values attached to entities["requested_field"] so the
# retrieval layer can answer with only the relevant database fields.
FIELD_BENEFITS = "benefits"
FIELD_ELIGIBILITY = "eligibility"
FIELD_DOCUMENTS = "documents"
FIELD_APPLICATION_PROCESS = "application_process"
FIELD_MINISTRY = "ministry"
FIELD_DEPARTMENT = "department"
FIELD_STATUS = "status"
FIELD_DEADLINE = "deadline"
FIELD_DESCRIPTION = "description"

# Pronoun / follow-up markers: the record comes from conversation context.
_FOLLOWUP_HINTS = (
    "its", "it", "this", "that", "these", "those",
    "this scheme", "that scheme", "the scheme",
    "this policy", "that policy", "the policy",
)


def extract_requested_field(text: str) -> str | None:
    """Which database field the user is asking for (if any). Pure."""
    lowered = (text or "").lower()
    if _has_any(lowered, ("benefit", "advantage", "what do i get", "what does it offer")):
        return FIELD_BENEFITS
    if _has_any(lowered, ("document", "paperwork", "proof required", "required proof")):
        return FIELD_DOCUMENTS
    # Eligibility before application-process: "who can apply" asks WHO
    # qualifies, while "how can I apply" asks HOW to apply.
    if _has_any(
        lowered,
        ("eligib", "qualif", "who can apply", "who is eligible",
         "eligibility criteria", "am i eligible", "do i qualify"),
    ):
        return FIELD_ELIGIBILITY
    if _has_any(
        lowered,
        ("how to apply", "how do i apply", "how can i apply", "applying",
         "application process", "application procedure", "apply for",
         "registration process", "how to register"),
    ):
        return FIELD_APPLICATION_PROCESS
    if "ministry" in lowered or "ministries" in lowered:
        return FIELD_MINISTRY
    if "department" in lowered:
        return FIELD_DEPARTMENT
    if _has_any(
        lowered,
        ("deadline", "last date", "apply by", "closing date", "expiry", "valid till"),
    ):
        return FIELD_DEADLINE
    if _has_any(
        lowered,
        ("is it available", "is this available", "is that available",
         "still active", "still valid", "status of", "scheme status",
         "policy status", "currently available"),
    ):
        return FIELD_STATUS
    return None


def _has_followup_hint(lowered: str) -> bool:
    if detect_ordinal(lowered) is not None:
        return True
    return any(hint in lowered for hint in _FOLLOWUP_HINTS)


def _classify_field_followup(text: str, lowered: str) -> dict | None:
    """Pronoun / short follow-ups ("its benefits?", "who can apply for
    this?", "what documents are needed?") routed to the supported
    PolicyGPT workflow with the record resolved from context.

    Returns None when the turn names no usable hint and carries no
    follow-up marker, so unrelated questions are never forced into a
    database workflow.
    """
    field = extract_requested_field(text)
    if field is None:
        return None
    # Discovery phrasing ("which schemes can I apply for?", "find schemes
    # for my profile") asks for MANY records, not one context record —
    # leave it for the eligibility/recommendation branch. Singular
    # "this scheme" follow-ups still resolve against context.
    if re.search(
        r"\b(which|what|list|find|show|recommend|suggest)\b.{0,30}\bschemes\b",
        lowered,
    ):
        return None
    entities: dict = {
        "terms": extract_search_terms(text),
        "name_hint": extract_name_hint(text),
        "requested_field": field,
    }
    if field == FIELD_BENEFITS:
        if not _has_followup_hint(lowered) and not entities["name_hint"]:
            return None
        entities["kind"] = _dominant_kind(lowered)
        entities["use_context"] = True
        return {"intent": BENEFITS_QUERY, "entities": entities}
    if field in (FIELD_DOCUMENTS, FIELD_APPLICATION_PROCESS):
        if not _has_followup_hint(lowered) and not entities["name_hint"]:
            # Bare "how do I apply?" with no record: still guidance, the
            # service asks which scheme is meant.
            if field != FIELD_APPLICATION_PROCESS:
                return None
        entities["use_context"] = True
        return {"intent": APPLICATION_GUIDANCE, "entities": entities}
    if field == FIELD_ELIGIBILITY:
        entities["profile"] = extract_profile_details(text)
        entities["use_context"] = True
        return {"intent": ELIGIBILITY_CHECK, "entities": entities}
    if field in (FIELD_MINISTRY, FIELD_DEPARTMENT, FIELD_DEADLINE,
                 FIELD_STATUS, FIELD_DESCRIPTION):
        if not _has_followup_hint(lowered) and not entities["name_hint"]:
            return None
        entities["use_context"] = True
        kind = _dominant_kind(lowered)
        entities["kind"] = kind
        # Respect the record kind so the single-record lookup tries the
        # right table first instead of missing repeatedly on the other.
        if kind == "policy":
            return {"intent": POLICY_EXPLANATION, "entities": entities}
        return {"intent": SCHEME_EXPLANATION, "entities": entities}
    return None


def _classify_conversational(text: str, lowered: str) -> dict | None:
    """Count / existence / benefits / user-directory / analytics intents."""
    entities: dict = {}

    # Let eligibility phrasing keep its dedicated branch.
    if _has_any(
        lowered,
        ("eligib", "qualify", "for me", "recommend", "suggest", "suitable",
         "my income", "family income", "may be available"),
    ):
        return None

    mentions_policy = "polic" in lowered
    mentions_scheme = any(
        word in lowered
        for word in ("scheme", "yojana", "scholarship", "subsidy", "benefit", "pension")
    )
    mentions_record = mentions_policy or mentions_scheme
    has_user = _mentions_user(lowered)

    # ---- User directory (admin analytics surface; gated in service). ----
    if has_user and _has_any(
        lowered,
        ("how many", "count", "total", "number of", "show", "list",
         "display", "view", "find", "give me"),
    ):
        entities["user_role"] = _user_role_filter(lowered)
        entities["terms"] = extract_search_terms(text)
        if _has_any(lowered, ("how many", "count", "total", "number of")):
            return {"intent": USER_STATS, "entities": entities}
        return {"intent": USER_LIST, "entities": entities}

    # ---- Statistic counts over the policy/scheme database. ----
    if mentions_record and _has_any(
        lowered, ("how many", "count", "total", "number of")
    ):
        filters = extract_filters(text)
        entities["filters"] = filters
        entities["terms"] = " ".join(
            part for part in (
                extract_search_terms(text),
                filters["extra_terms"],
            )
            if part
        ).strip()
        kind = _dominant_kind(lowered)
        return {
            "intent": POLICY_COUNT if kind == "policy" else SCHEME_COUNT,
            "entities": entities,
        }

    # ---- Existence checks ("is X available?", "do we have X?"). ----
    if mentions_record and (
        re.search(r"^(is|are)\s+there\b", lowered)
        or re.search(r"\bdo\s+we\s+have\b", lowered)
        or re.search(r"\bdoes\b.{0,24}\bcontain\b", lowered)
        or re.search(r"^is\b.*\bavailable\??$", lowered)
    ):
        entities["name_hint"] = extract_name_hint(text)
        entities["filters"] = extract_filters(text)
        entities["terms"] = extract_search_terms(text)
        entities["requested_field"] = FIELD_STATUS
        kind = _dominant_kind(lowered)
        return {
            "intent": POLICY_EXISTS if kind == "policy" else SCHEME_EXISTS,
            "entities": entities,
        }

    # ---- Benefits of a specific record. ----
    if "benefit" in lowered and (
        mentions_record
        or _has_any(lowered, ("its", "this", "that", "the scheme", "the policy"))
    ):
        entities["name_hint"] = extract_name_hint(text)
        entities["terms"] = extract_search_terms(text)
        entities["requested_field"] = FIELD_BENEFITS
        kind = _dominant_kind(lowered) if mentions_record else "scheme"
        entities["kind"] = kind
        return {"intent": BENEFITS_QUERY, "entities": entities}

    # ---- Pagination follow-ups ("show more", "next"). ----
    stripped = lowered.strip().rstrip(".!?… ")
    if any(re.search(pattern, stripped) for pattern in _MORE_PATTERNS):
        return {"intent": MORE_RESULTS, "entities": entities}

    # ---- Analytics / department statistics / trends / reports. ----
    if _has_any(
        lowered,
        ("statistic", "analytics", "trend", "department has",
         "departments with", "most policies", "most schemes", "report summary",
         "notification statistics", "scheme statistics", "policy statistics"),
    ):
        entities["terms"] = extract_search_terms(text)
        return {"intent": ANALYTICS_QUERY, "entities": entities}

    return None
