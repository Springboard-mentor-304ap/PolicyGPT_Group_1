"""Conversational data-assistant tests: count / existence / filtered
search / detail / benefits / follow-ups / profile matching / roles.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import patch

from app.services import chatbot_context_service as context
from app.services import chatbot_intent_service as intent
from app.services import chatbot_service as service
from tests.fakes import FakeSession, make_user


def _user(user_id=11, role="CITIZEN"):
    service.reset_rate_limits()
    return make_user(user_id=user_id, role=role)


def _policy_row(id=1, title="National Water Policy 2012", status="APPROVED"):
    return {
        "id": id, "title": title, "ministry": "Ministry of Jal Shakti",
        "category": "Water", "state": None, "status": status,
        "publication_date": "2026-09-23", "created_at": "2026-09-23",
        "description": "Water policy.", "benefits": ["Safe water"],
    }


def _scheme_row(id=7, title="Test Scholarship", status="APPROVED"):
    return {
        "id": id, "title": title, "ministry": "Education",
        "category": "Education", "state": "West Bengal", "status": status,
        "description": "Scholarship support.",
        "benefits": ["Tuition support", "Book grant"],
        "documents_required": "ID proof",
        "application_process": "Apply online",
        "application_end_date": "2026-12-31",
        "created_at": "2026-09-01",
    }


# ============================================================
# INTENT
# ============================================================

def test_count_intents():
    assert intent.classify_intent("How many draft policies are there?")["intent"] \
        == intent.POLICY_COUNT
    assert intent.classify_intent("How many approved schemes are there?")["intent"] \
        == intent.SCHEME_COUNT
    assert intent.classify_intent("How many policies are pending approval?")["entities"] \
        ["filters"]["status"] == "PENDING_APPROVAL"


def test_exists_intents():
    result = intent.classify_intent("Is National Water Policy 2012 available?")
    assert result["intent"] == intent.POLICY_EXISTS
    assert result["entities"]["name_hint"] == "National Water Policy 2012"
    result = intent.classify_intent("Do we have a scheme called PM Kisan?")
    assert result["intent"] == intent.SCHEME_EXISTS


def test_benefits_user_analytics_more_intents():
    assert intent.classify_intent("What are the benefits of this scheme?")["intent"] \
        == intent.BENEFITS_QUERY
    assert intent.classify_intent("How many users are registered?")["intent"] \
        == intent.USER_STATS
    assert intent.classify_intent("Show me government officials?")["intent"] \
        == intent.USER_LIST
    assert intent.classify_intent("Which department has the most policies?")["intent"] \
        == intent.ANALYTICS_QUERY
    assert intent.classify_intent("Show more")["intent"] == intent.MORE_RESULTS


def test_search_carries_filters():
    result = intent.classify_intent("Show draft education policies from the Ministry of Education.")
    assert result["intent"] == intent.POLICY_SEARCH
    assert result["entities"]["filters"]["status"] == "DRAFT"


def test_profile_extraction():
    details = intent.extract_profile_details(
        "I am 21, from West Bengal, a B.Tech student and my family income is 2 lakh."
    )
    assert details["age"] == 21
    assert details["state"] == "West Bengal"
    assert details["income"] == 200000.0
    assert details["occupation"] == "Student"


# ============================================================
# COUNT (SQL total, structured statistic)
# ============================================================

def test_policy_count_clean():
    db = FakeSession()
    user = _user(12, "GOVERNMENT_OFFICIAL")
    with patch.object(
        service.queries, "count_policies", return_value=12,
    ):
        response = service.process_message(
            db, user, "How many draft policies are there?", None, None
        )
    assert response.intent == "POLICY_COUNT"
    assert "**12**" in response.message
    assert response.data["response_type"] == "STATISTIC_RESPONSE"
    assert response.data["count"] == 12
    assert response.results and response.results[0].type == "statistic"
    assert any("View All" in (a.label or "") for a in response.actions)


def test_scheme_count_filtered_path():
    db = FakeSession()
    user = _user(13, "ADMIN")
    with patch.object(
        service.queries, "count_schemes", return_value=8
    ):
        response = service.process_message(
            db, user, "How many approved schemes are there?", None, None
        )
    assert response.intent == "SCHEME_COUNT"
    assert response.data["count"] == 8
    assert "**8**" in response.message


# ============================================================
# EXISTENCE (found / not found / ambiguous)
# ============================================================

def test_policy_exists_found():
    db = FakeSession()
    user = _user(14, "CITIZEN")
    with patch.object(
        service, "find_record_by_name",
        return_value={"best": _policy_row(), "alternatives": [], "total": 1},
    ):
        response = service.process_message(
            db, user, "Is National Water Policy 2012 available?", None, None
        )
    assert response.intent == "POLICY_EXISTS"
    assert "available" in response.message
    assert "National Water Policy 2012" in response.message
    assert response.data["response_type"] == "ENTITY_EXISTS_RESPONSE"
    assert response.results[0].type == "policy"
    assert any(a.type == "VIEW_POLICY" for a in response.actions)


def test_scheme_exists_not_found_never_hallucinates():
    db = FakeSession()
    user = _user(15, "CITIZEN")
    with patch.object(
        service, "find_record_by_name",
        return_value={"best": None, "alternatives": [], "total": 0},
    ):
        response = service.process_message(
            db, user, "Do we have a scheme called XYZ Fantasy Scheme?", None, None
        )
    assert response.data["response_type"] == "ENTITY_NOT_FOUND_RESPONSE"
    assert "No matching scheme was found" in response.message
    assert "XYZ Fantasy Scheme" in response.message
    assert response.results == []
    assert response.actions == []


def test_exists_ambiguous_lists_alternatives():
    db = FakeSession()
    user = _user(16, "CITIZEN")
    rows = [_policy_row(1, "National Health Policy 2017"),
            _policy_row(2, "National Health Policy Draft", "DRAFT")]
    with patch.object(
        service, "find_record_by_name",
        return_value={"best": None, "alternatives": rows, "total": 2},
    ):
        response = service.process_message(
            db, user, "Tell me about the National Health Policy.", None, None
        )
    assert response.data["response_type"] == "AMBIGUOUS_RESPONSE"
    assert len(response.results) == 2
    assert "National Health Policy 2017" in response.message


# ============================================================
# FILTERED SEARCH + PAGINATION DATA
# ============================================================

def test_filtered_search_returns_cards_and_page_data():
    db = FakeSession()
    user = _user(17, "GOVERNMENT_OFFICIAL")
    rows = [_policy_row(1, "Education Policy Draft", "DRAFT"),
            _policy_row(2, "Health Policy Draft", "DRAFT")]
    with patch.object(
        service, "search_policies_filtered",
        return_value={"rows": rows, "total": 12},
    ):
        response = service.process_message(
            db, user, "Show me all draft policies.", None, None
        )
    assert response.intent == "POLICY_SEARCH"
    assert response.data["response_type"] == "LIST_RESPONSE"
    assert response.data["total"] == 12
    assert response.data["page"] == 1
    assert len(response.results) == 2
    assert all(r.type == "policy" for r in response.results)
    assert "Showing 1\u20132 of 12" in response.message


def test_show_more_pages_forward():
    db = FakeSession()
    user = _user(18, "CITIZEN")
    seen_pages = []

    def fake_search(db_, user_, terms, filters=None, page=1, limit=5):
        seen_pages.append(page)
        return {"rows": [_scheme_row()], "total": 12}

    with patch.object(service, "search_schemes_filtered", side_effect=fake_search):
        first = service.process_message(
            db, user, "Show me education schemes.", None, None
        )
        conv = first.conversation_id
        service.process_message(db, user, "Show more", conv, None)
    assert seen_pages[0] == 1
    assert seen_pages[-1] == 2


# ============================================================
# DETAIL + BENEFITS + FOLLOW-UPS
# ============================================================

def test_scheme_detail_structured():
    db = FakeSession()
    user = _user(19, "CITIZEN")
    with patch.object(
        service, "find_record_by_name",
        return_value={"best": _scheme_row(), "alternatives": [], "total": 1},
    ):
        response = service.process_message(
            db, user, "Tell me about Test Scholarship.", None, None
        )
    assert response.data["response_type"] == "DETAIL_RESPONSE"
    assert "**Test Scholarship**" in response.message
    assert any(a.type == "VIEW_SCHEME" for a in response.actions)
    assert any(a.type == "CHECK_ELIGIBILITY" for a in response.actions)


def test_benefits_followup_uses_context():
    db = FakeSession()
    user = _user(20, "CITIZEN")
    with patch.object(
        service, "find_record_by_name",
        return_value={"best": _scheme_row(), "alternatives": [], "total": 1},
    ):
        first = service.process_message(
            db, user, "Tell me about Test Scholarship.", None, None
        )
        conv = first.conversation_id
        response = service.process_message(
            db, user, "What are its benefits?", conv, None
        )
    assert response.intent == "BENEFITS_QUERY"
    assert "Tuition support" in response.message
    assert response.data["response_type"] == "BENEFITS_RESPONSE"


def test_ordinal_followup_resolves_second_record():
    db = FakeSession()
    user = _user(21, "CITIZEN")
    rows = [_scheme_row(7, "Alpha Scholarship"), _scheme_row(8, "Beta Scholarship")]

    def fake_search(db_, user_, terms, filters=None, page=1, limit=5):
        return {"rows": rows, "total": 2}

    lookups = []

    def fake_find(db_, user_, kind, name, limit=20):
        lookups.append(name)
        match = next((r for r in rows if r["title"] in name), None)
        return {"best": match, "alternatives": [], "total": 1 if match else 0}

    with patch.object(service, "search_schemes_filtered", side_effect=fake_search):
        first = service.process_message(
            db, user, "Show me education schemes.", None, None
        )
        conv = first.conversation_id
    with patch.object(service, "find_record_by_name", side_effect=fake_find):
        response = service.process_message(
            db, user, "Tell me about the second one.", conv, None
        )
    assert response.data.get("title") == "Beta Scholarship"


# ============================================================
# PROFILE-BASED RECOMMENDATIONS + SINGLE CHECK
# ============================================================

def test_recommendation_uses_rule_engine():
    db = FakeSession()
    user = _user(22, "CITIZEN")
    rows = [_scheme_row()]
    with patch.object(
        service.queries, "match_profile_schemes",
        return_value={"rows": rows, "total": 1},
    ):
        response = service.process_message(
            db, user,
            "I am 21, from West Bengal, a college student and my family income is 2 lakh. "
            "Which schemes may be relevant to me?",
            None, None,
        )
    assert response.intent == "SCHEME_RECOMMENDATION"
    assert "may match" in response.message
    assert "**21**" in response.message
    assert response.results and response.results[0].type == "scheme"
    assert response.data["profile"]["age"] == 21


def test_single_scheme_check_reports_matched_and_failed():
    db = FakeSession()
    user = _user(23, "CITIZEN")
    with patch.object(
        service, "find_record_by_name",
        return_value={"best": _scheme_row(), "alternatives": [], "total": 1},
    ), patch.object(
        service.queries, "check_scheme_for_profile",
        return_value={"eligible": True, "message": "ok",
                      "matched_rules": ["Minimum age requirement satisfied (18)"],
                      "failed_rules": ["Annual income is required"]},
    ):
        response = service.process_message(
            db, user, "I am 21. Am I eligible for Test Scholarship?", None, None
        )
    assert response.data["response_type"] == "ELIGIBILITY_RESPONSE"
    assert "indicative" in response.message
    assert "Minimum age requirement satisfied" in response.message


# ============================================================
# ROLE GATING + COMPARISON TABLE
# ============================================================

def test_citizen_cannot_access_user_stats_without_fetch():
    db = FakeSession()
    user = _user(24, "CITIZEN")
    with patch.object(
        service.queries, "get_user_stats",
        side_effect=AssertionError("must not fetch"),
    ):
        response = service.process_message(
            db, user, "How many users are registered?", None, None
        )
    assert "administrators" in response.message
    assert response.actions == []


def test_admin_user_stats():
    db = FakeSession()
    admin = _user(25, "ADMIN")
    with patch.object(
        service.queries, "get_user_stats",
        return_value={"total": 10, "active": 9, "inactive": 1,
                      "by_role": {"CITIZEN": 7, "ADMIN": 1,
                                  "GOVERNMENT_OFFICIAL": 2}, "by_state": {}},
    ):
        response = service.process_message(
            db, admin, "How many users are registered?", None, None
        )
    assert response.data["response_type"] == "STATISTIC_RESPONSE"
    assert response.data["count"] == 10
    assert "**10**" in response.message


def test_guest_public_search_allowed_but_user_stats_refused():
    db = FakeSession()
    guest = make_user(user_id=26, role="GUEST")
    service.reset_rate_limits()
    with patch.object(
        service, "retrieve_schemes",
        return_value={"rows": [_scheme_row()], "total": 1},
    ):
        response = service.process_message(
            db, guest, "Show public education schemes.", None, None
        )
    assert response.results and response.results[0].type == "scheme"
    refused = service.process_message(
        db, guest, "How many users are registered?", None, None
    )
    assert "administrators" in refused.message


def test_comparison_renders_table():
    db = FakeSession()
    user = _user(27, "CITIZEN")

    def fake_find(db_, user_, kind, name, limit=20):
        if "alpha" in name.lower():
            return {"best": _scheme_row(7, "Alpha Scholarship"),
                    "alternatives": [], "total": 1}
        return {"best": _scheme_row(8, "Beta Scholarship"),
                "alternatives": [], "total": 1}

    with patch.object(service, "find_record_by_name", side_effect=fake_find):
        response = service.process_message(
            db, user, "Compare Alpha Scholarship and Beta Scholarship.",
            None, None,
        )
    assert response.intent == "SCHEME_COMPARISON"
    assert "| Feature |" in response.message
    assert "Alpha Scholarship" in response.message
    assert response.data["response_type"] == "COMPARISON_RESPONSE"
    assert len(response.results) == 2


def test_context_profile_merges_across_turns():
    db = FakeSession()
    user = _user(28, "CITIZEN")
    with patch.object(service, "retrieve_schemes",
                      return_value={"rows": [], "total": 0}):
        first = service.process_message(db, user, "I am 21 years old.", None, None)
        conv = first.conversation_id
        service.process_message(
            db, user, "My family income is 2 lakh.", conv, None)
    profile = context.get_conversation_profile(db, conv)
    assert profile.get("age") == 21
    assert profile.get("income") == 200000.0
