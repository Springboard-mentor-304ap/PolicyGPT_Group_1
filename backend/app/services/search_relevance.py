"""Shared relevance helpers for policy/scheme free-text search.

Single source of truth for query normalization, tokenization, matching,
and ranking so ``policy_service`` and ``scheme_service`` stay consistent.

Matching rules (per task spec):
- Case-insensitive, trimmed, hyphen/punctuation normalized so
  ``pm kisan``, ``PM-KISAN`` and ``PM KISAN`` match the same record.
- Partial title matches and multi-word queries supported.
- Title / official-name matches rank above description / metadata.
- Short tokens (<=3 chars, e.g. ``pm``) require word-prefix matches;
  arbitrary ``%pm%`` substrings inside words like ``development`` do NOT
  count. Longer tokens (>=4 chars) keep substring matching for recall.
- No invented aliases: only text actually present in the record counts.
- Original official titles are never mutated; normalization is for
  matching/scoring only.
"""

import re

#: Tokens of this length or shorter require a word-prefix match.
#: This is what stops ``pm`` matching ``development``/``employment``.
SHORT_TOKEN_MAX_LEN = 3

_PUNCT_RE = re.compile(r"[()\[\]{}:;,\"'“”‘’`´+=\/\\|&@!?$%^*~<>.…–—-]+")
_WS_RE = re.compile(r"\s+")


def normalize_query(value: str | None) -> str:
    """Collapse whitespace and trim; empty string when meaningless."""
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def normalize_text_for_match(value: object) -> str:
    """Lowercased, hyphen/punctuation-insensitive form for matching.

    ``Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)`` -> 
    ``pradhan mantri kisan samman nidhi pm kisan``.
    """
    if value is None:
        return ""
    text = str(value).lower()
    # Hyphens/underscores/dashes separate words (PM-KISAN -> pm kisan).
    text = re.sub(r"[-_–—]+", " ", text)
    # Remaining punctuation becomes spaces so "(pm-kisan)" and "pm kisan."
    # normalize identically.
    text = _PUNCT_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text).strip()
    return text


def tokenize_query(normalized_query: str) -> list[str]:
    """Split a (whitespace-collapsed, trimmed) query into match tokens.

    Mirrors the legacy ``_search_tokens`` contract:
    - Single-token queries keep the token as-is.
    - Multi-token queries drop tokens shorter than 2 chars (``of``/``a``).
    Additionally splits on hyphens/underscores and strips surrounding
    punctuation so ``PM-KISAN`` -> ``[pm, kisan]``.
    """
    if not normalized_query:
        return []
    # Split hyphens/underscores into separate words before whitespace split.
    tmp = re.sub(r"[-_]+", " ", normalized_query)
    raw_parts = [p for p in tmp.split(" ") if p]
    # Strip surrounding punctuation (e.g. trailing "." in "pm kisan.")
    # and lowercase for case-insensitive matching.
    parts: list[str] = []
    for part in raw_parts:
        cleaned = re.sub(r"^[^a-z0-9]+|[^a-z0-9]+$", "", part, flags=re.IGNORECASE)
        cleaned = cleaned.lower().strip()
        if cleaned:
            parts.append(cleaned)
    if not parts:
        return []
    if len(parts) <= 1:
        return parts
    meaningful = [p for p in parts if len(p) >= 2]
    return meaningful or parts


def escape_regex(token: str) -> str:
    """Escape a token for use inside a PostgreSQL ``~*`` pattern."""
    return re.escape(token)


def word_prefix_regex(token: str) -> str:
    """Postgres case-insensitive regex requiring a word starting with token.

    ``\\m`` is Postgres start-of-word, so ``\\mpm`` matches ``pm``,
    ``pm-kisan`` (after ``(``), ``pmksy`` and ``pm-usp`` but NOT the
    ``pm`` inside ``development``.
    """
    return r"\m" + escape_regex(token)


def token_matches_text(token: str, normalized_text: str) -> bool:
    """True when a normalized token matches normalized field text.

    - Always true on word-prefix (any word starts with token).
    - Additionally true on substring for tokens >= 4 chars (recall for
      normal-length queries like ``health``/``education``).
    Short tokens (``pm``) therefore never match inside ``development``.
    """
    if not token or not normalized_text:
        return False
    token = token.lower()
    words = normalized_text.split(" ")
    for word in words:
        if word and word.startswith(token):
            return True
    if len(token) >= SHORT_TOKEN_MAX_LEN + 1 and token in normalized_text:
        return True
    return False


def values_to_text(values: object) -> str:
    """Join ARRAY/JSONB-ish values into matchable text."""
    if values is None:
        return ""
    if isinstance(values, (list, tuple)):
        return " ".join(str(v or "") for v in values)
    return str(values)


def record_matches(tokens: list[str], normalized_fields: list[str]) -> bool:
    """AND across tokens: every token must match at least one field."""
    if not tokens:
        return True
    for token in tokens:
        if not any(token_matches_text(token, field) for field in normalized_fields):
            return False
    return True


def _title_token_hits(tokens: list[str], title_words: list[str]) -> int:
    hits = 0
    for token in tokens:
        if any(word.startswith(token) for word in title_words if word):
            hits += 1
    return hits


def relevance_score(
    tokens: list[str],
    phrase_norm: str,
    title_norm: str,
    other_norm: str,
) -> int:
    """Rank title/alias matches above description matches.

    Tiers (higher first):
    100 exact title == query phrase (``pm kisan`` == ``pm kisan.``)
     90 title starts with phrase (``pm kisan ...``, ``pm surya ...``)
     80 title contains phrase (``... (pm-kisan)`` -> ``... pm kisan``)
     70 every query token is a word-prefix in the title
     50+ some (but not all) tokens are word-prefixes in the title
     30 every token matches somewhere (title + other fields)
     10 fallback (should not occur after filtering)
    Exact whole-word hits earn a small bonus so ``pm`` as a standalone
    word outranks ``pm`` as a mere prefix (``pmksy``).
    """
    if not tokens:
        return 0
    title_words = title_norm.split(" ") if title_norm else []
    title_hits = _title_token_hits(tokens, title_words)

    if phrase_norm and title_norm == phrase_norm:
        base = 100
    elif phrase_norm and title_norm.startswith(phrase_norm):
        base = 90
    elif phrase_norm and phrase_norm in title_norm:
        base = 80
    elif title_hits == len(tokens) and len(tokens) > 0:
        base = 70
    elif title_hits > 0:
        base = 50 + title_hits
    else:
        # All tokens matched outside the title (description/metadata).
        base = 30

    # Bonus: query token(s) appear as whole words in the title.
    title_word_set = set(title_words)
    for token in tokens:
        if token in title_word_set:
            base += 5
            break
    return base
