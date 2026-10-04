"""Conversation isolation, ownership and payload-persistence tests.

Covers the New Chat / history-restoration workflow at the service layer:
unique conversation creation (never reuse), per-conversation message
scoping, ownership enforcement (no cross-user access), structured
payload persistence for card restoration, and conversation summaries.

Uses staged MagicMock sessions (same pattern as test_submit_workflow.py);
no live database required.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from app.models.chatbot import (
    ChatbotConversation,
    ChatbotMessage,
    ChatbotUsage,
)
from app.models.user import User
from app.services import chatbot_service
from app.services.chatbot_service import ConversationNotFound


def _user(user_id=7, role="CITIZEN"):
    return User(
        user_id=user_id,
        full_name="Chat User",
        email=f"chat{user_id}@example.com",
        role=role,
        is_active=True,
    )


def _chain(result):
    """A mock query chain: filter/order_by/limit return self; all/first
    resolve to the staged result."""
    chain = MagicMock()
    chain.filter.return_value = chain
    chain.order_by.return_value = chain
    chain.limit.return_value = chain
    if isinstance(result, list):
        chain.all.return_value = result
        chain.first.return_value = result[0] if result else None
    else:
        chain.first.return_value = result
        chain.all.return_value = [] if result is None else [result]
    chain.delete.return_value = 0
    return chain


def _conv(conversation_id, user_id, updated="2026-10-04T10:00:00"):
    return ChatbotConversation(
        conversation_id=conversation_id,
        user_id=user_id,
        session_id=None,
        role="CITIZEN",
        created_at=datetime(2026, 10, 4, 9, 0, 0),
        updated_at=datetime.fromisoformat(updated),
    )


def _msg(message_id, conversation_id, sender, text):
    return ChatbotMessage(
        message_id=message_id,
        conversation_id=conversation_id,
        sender=sender,
        message=text,
        intent="SCHEME_SEARCH" if sender == "user" else "SCHEME_SEARCH",
        created_at=datetime(2026, 10, 4, 9, 0, message_id),
    )


# --------------------------------------------------
# Creation: New Chat must mint a fresh conversation
# --------------------------------------------------

def test_create_conversation_mints_new_without_reuse():
    db = MagicMock()
    conv = chatbot_service.create_conversation(db, _user(), "CITIZEN")
    assert db.add.call_count == 1
    created = db.add.call_args[0][0]
    assert isinstance(created, ChatbotConversation)
    assert created.user_id == 7
    assert created.role == "CITIZEN"
    db.commit.assert_called()
    assert conv is created


def test_get_or_create_returns_existing_without_insert():
    db = MagicMock()
    existing = _conv(11, 7)
    db.query.return_value = _chain([existing])
    conv = chatbot_service.get_or_create_conversation(db, _user(), "CITIZEN")
    assert conv is existing
    db.add.assert_not_called()


def test_get_or_create_creates_when_none_exists():
    db = MagicMock()
    db.query.return_value = _chain([])
    conv = chatbot_service.get_or_create_conversation(db, _user(), "CITIZEN")
    assert db.add.call_count == 1
    assert conv.user_id == 7


# --------------------------------------------------
# Ownership: never trust a frontend conversation id
# --------------------------------------------------

def test_get_conversation_wrong_owner_raises():
    db = MagicMock()
    db.query.return_value = _chain(_conv(11, 99))
    with pytest.raises(ConversationNotFound):
        chatbot_service.get_conversation(db, 11, 7)


def test_get_conversation_missing_raises():
    db = MagicMock()
    db.query.return_value = _chain(None)
    with pytest.raises(ConversationNotFound):
        chatbot_service.get_conversation(db, 4242, 7)


def test_get_conversation_owner_allowed():
    db = MagicMock()
    owned = _conv(11, 7)
    db.query.return_value = _chain(owned)
    assert chatbot_service.get_conversation(db, 11, 7) is owned


# --------------------------------------------------
# Payload persistence for card restoration
# --------------------------------------------------

def test_save_message_persists_structured_payload():
    db = MagicMock()
    payload = {
        "actions": [{"label": "View", "type": "VIEW_SCHEME",
                     "route": "/dashboard/citizen/schemes/5",
                     "entity_type": "SCHEME", "entity_id": 5}],
        "results": [{"type": "scheme", "id": 5, "title": "Scheme A"}],
        "data": {"response_type": "DETAIL_RESPONSE"},
        "sources": [],
    }
    chatbot_service.save_message(db, 11, "assistant", "Here it is.",
                                 "SCHEME_EXPLANATION", payload=payload)
    saved = db.add.call_args[0][0]
    assert isinstance(saved, ChatbotMessage)
    assert saved.conversation_id == 11
    assert saved.payload == payload


def test_save_message_user_turn_has_no_payload():
    db = MagicMock()
    chatbot_service.save_message(db, 11, "user", "hello", "GREETING")
    saved = db.add.call_args[0][0]
    assert saved.payload is None


def test_process_message_saves_assistant_payload():
    from app.schemas import chatbot as schemas

    db = MagicMock()
    db.query.return_value = _chain(None)  # no usage row yet
    user = _user()
    # Fresh conversation minted for this message (New Chat path).
    with patch.object(
        chatbot_service, "get_or_create_conversation",
        return_value=_conv(77, 7),
    ), patch.object(
        chatbot_service, "_handle_intent",
        return_value=(
            "Reply text.",
            [schemas.ChatAction(label="View", type="VIEW_SCHEME",
                                route="/dashboard/citizen/schemes/5",
                                entity_type="SCHEME", entity_id=5)],
            [],
            {"response_type": "DETAIL_RESPONSE"},
            [schemas.ChatResultItem(type="scheme", id=5, title="Scheme A",
                                    route="/dashboard/citizen/schemes/5")],
        ),
    ):
        response = chatbot_service.process_message(db, user, "tell me", None)

    assert response.conversation_id == 77
    saved = [
        call.args[0] for call in db.add.call_args_list
        if isinstance(call.args[0], ChatbotMessage)
    ]
    assert len(saved) == 2
    assistant = next(m for m in saved if m.sender == "assistant")
    assert assistant.payload["results"][0]["id"] == 5
    assert assistant.payload["actions"][0]["entity_id"] == 5
    assert assistant.payload["data"]["response_type"] == "DETAIL_RESPONSE"
    assert assistant.conversation_id == 77


def test_process_message_single_commit_and_usage_reuse():
    """Both turns + counters persist in one commit; usage looked up once."""
    from app.schemas import chatbot as schemas

    db = MagicMock()
    db.query.return_value = _chain(None)  # no usage row yet
    user = _user()
    with patch.object(
        chatbot_service, "get_or_create_conversation",
        return_value=_conv(77, 7),
    ), patch.object(
        chatbot_service, "_handle_intent",
        return_value=("Reply text.", [], [], None, []),
    ):
        response = chatbot_service.process_message(db, user, "tell me", None)

    assert response.conversation_id == 77
    assert db.commit.call_count == 1
    usage_lookups = [
        call for call in db.query.call_args_list
        if call.args and call.args[0] is ChatbotUsage
    ]
    assert len(usage_lookups) == 1
    saved = [
        call.args[0] for call in db.add.call_args_list
        if isinstance(call.args[0], ChatbotMessage)
    ]
    assert {m.sender for m in saved} == {"user", "assistant"}


# --------------------------------------------------
# Listing: scoped summaries, no cross-user leakage
# --------------------------------------------------

def test_list_conversations_groups_real_messages_only():
    convs = [_conv(11, 7, "2026-10-04T10:00:00"),
             _conv(12, 7, "2026-10-03T10:00:00")]
    messages = [
        _msg(1, 11, "user", "Find education schemes for me please"),
        _msg(2, 11, "assistant", "Here are two schemes."),
        _msg(3, 12, "user", "What is PM Kisan?"),
    ]
    db = MagicMock()
    db.query.side_effect = [_chain(convs), _chain(messages)]
    summaries = chatbot_service.list_conversations(db, 7)
    assert len(summaries) == 2
    assert summaries[0]["conversation_id"] == 11
    assert summaries[0]["message_count"] == 2
    assert summaries[0]["title"] == "Find education schemes for me please"
    assert summaries[0]["preview"] == "Here are two schemes."
    assert summaries[1]["title"] == "What is PM Kisan?"
    assert summaries[1]["message_count"] == 1


def test_list_conversations_empty_user_returns_empty():
    db = MagicMock()
    db.query.return_value = _chain([])
    assert chatbot_service.list_conversations(db, 12345) == []


def test_list_conversations_empty_thread_has_null_title():
    convs = [_conv(13, 7)]
    db = MagicMock()
    db.query.side_effect = [_chain(convs), _chain([])]
    summaries = chatbot_service.list_conversations(db, 7)
    assert summaries[0]["title"] is None
    assert summaries[0]["preview"] is None
    assert summaries[0]["message_count"] == 0


# --------------------------------------------------
# Deletion: single conversation, ownership enforced
# --------------------------------------------------

def test_delete_conversation_removes_owned_thread():
    db = MagicMock()
    owned = _conv(11, 7)
    msg_chain = _chain(None)
    msg_chain.delete.return_value = 2
    conv_chain = _chain(None)
    conv_chain.delete.return_value = 1
    db.query.side_effect = [_chain(owned), msg_chain, conv_chain]
    removed = chatbot_service.delete_conversation(db, 11, 7)
    assert removed == 2
    db.commit.assert_called()


def test_delete_conversation_other_owner_raises():
    db = MagicMock()
    db.query.return_value = _chain(_conv(11, 99))
    with pytest.raises(ConversationNotFound):
        chatbot_service.delete_conversation(db, 11, 7)
    db.commit.assert_not_called()


def test_usage_model_untouched():
    assert ChatbotUsage.__tablename__ == "chatbot_usage"
