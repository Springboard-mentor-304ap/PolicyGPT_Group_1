"""PolicyGPT Assistant (chatbot) endpoints.

Additive module: no existing route, schema or permission is touched here.
Every endpoint requires a valid JWT; the role always comes from the
validated backend user, never from client input. Guests authenticate with
their guest JWT (role GUEST) and are scoped to public functionality with a
server-side message limit.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.routes.auth import normalize_role, require_roles
from app.core.config import settings
from app.db.database import get_db
from app.models.user import User
from app.schemas import chatbot as schemas
from app.services import chatbot_service

logger = logging.getLogger("uvicorn.error")

router = APIRouter(
    prefix="/chatbot",
    tags=["Chatbot"],
)

CHATBOT_ROLES = (
    "ADMIN",
    "GOVERNMENT_OFFICIAL",
    "CITIZEN",
    "RESEARCHER",
    "ORGANIZATION",
    "GUEST",
)


def _require_enabled() -> None:
    if not settings.CHATBOT_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="PolicyGPT Assistant is currently unavailable.",
        )


def _handle_chatbot_error(exc: Exception) -> HTTPException:
    if isinstance(exc, chatbot_service.MessageTooLong):
        return HTTPException(status_code=413, detail=exc.detail)
    if isinstance(exc, chatbot_service.GuestLimited):
        return HTTPException(status_code=403, detail=exc.detail)
    if isinstance(exc, chatbot_service.RateLimited):
        return HTTPException(status_code=429, detail=exc.detail)
    if isinstance(exc, chatbot_service.ConversationNotFound):
        return HTTPException(status_code=404, detail=exc.detail)
    if isinstance(exc, chatbot_service.ChatbotDisabled):
        return HTTPException(status_code=503, detail=exc.detail)
    if isinstance(exc, chatbot_service.ChatbotError):
        return HTTPException(status_code=400, detail=exc.detail)
    logger.warning("chatbot unexpected error: %s", type(exc).__name__)
    return HTTPException(
        status_code=500,
        detail="Sorry, I couldn't process your request right now.",
    )


@router.post("/message", response_model=schemas.ChatMessageResponse)
def post_message(
    payload: schemas.ChatMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*CHATBOT_ROLES)),
):
    """Send one chat message, get a grounded structured reply."""
    _require_enabled()
    logger.info(
        "chatbot message received user_id=%s", current_user.user_id
    )
    try:
        return chatbot_service.process_message(
            db,
            current_user,
            payload.message,
            conversation_id=payload.conversation_id,
            context_page=(
                payload.context.page if payload.context else None
            ),
        )
    except Exception as exc:
        raise _handle_chatbot_error(exc)


@router.get("/history", response_model=schemas.ChatHistoryResponse)
def get_history(
    conversation_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*CHATBOT_ROLES)),
):
    """Return the caller's conversation history (ownership enforced)."""
    _require_enabled()
    try:
        if conversation_id is not None:
            conversation = chatbot_service.get_conversation(
                db, conversation_id, current_user.user_id
            )
        else:
            conversation = chatbot_service.get_or_create_conversation(
                db, current_user, normalize_role(current_user.role),
            )
        cap = min(limit, settings.CHATBOT_MAX_HISTORY)
        messages = chatbot_service.load_history(
            db, conversation.conversation_id, cap
        )
        return schemas.ChatHistoryResponse(
            conversation_id=conversation.conversation_id,
            messages=[
                schemas.ChatHistoryMessage(
                    message_id=m.message_id,
                    sender=m.sender,
                    message=m.message,
                    intent=m.intent,
                    created_at=(
                        m.created_at.isoformat()
                        if getattr(m, "created_at", None) else ""
                    ),
                )
                for m in messages
            ],
        )
    except Exception as exc:
        raise _handle_chatbot_error(exc)


@router.delete("/history")
def delete_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*CHATBOT_ROLES)),
):
    """Delete the caller's conversations and messages (usage kept)."""
    _require_enabled()
    try:
        removed = chatbot_service.clear_user_history(db, current_user.user_id)
        return {"message": "Chat history cleared.", "removed": removed}
    except Exception as exc:
        raise _handle_chatbot_error(exc)


@router.get("/config", response_model=schemas.ChatConfigResponse)
def get_config(
    current_user: User = Depends(require_roles(*CHATBOT_ROLES)),
):
    """Public client configuration (limits only, no secrets)."""
    return schemas.ChatConfigResponse(
        enabled=settings.CHATBOT_ENABLED,
        guest_message_limit=settings.CHATBOT_GUEST_MESSAGE_LIMIT,
        max_message_length=settings.CHATBOT_MAX_MESSAGE_LENGTH,
        max_history=settings.CHATBOT_MAX_HISTORY,
    )


@router.get("/usage", response_model=schemas.ChatUsageResponse)
def get_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*CHATBOT_ROLES)),
):
    """Caller's message count (+ guest remainder for GUEST role)."""
    usage = chatbot_service.get_usage(db, current_user.user_id)
    count = int(usage.message_count) if usage else 0
    role = normalize_role(current_user.role)
    remaining = None
    if role == "GUEST":
        remaining = max(0, settings.CHATBOT_GUEST_MESSAGE_LIMIT - count)
    return schemas.ChatUsageResponse(
        message_count=count,
        guest_limit=(
            settings.CHATBOT_GUEST_MESSAGE_LIMIT if role == "GUEST" else None
        ),
        guest_remaining=remaining,
    )
