"""Authenticated WebSocket endpoint for live notification delivery.

The browser ``WebSocket`` API cannot send an ``Authorization`` header, so the
access token arrives as a ``?token=`` query parameter. That is safe here
because the token is validated exactly as it is for REST: signature, expiry and
``token_version`` (so a revoked session cannot open a socket).

The handshake is the only place a socket is trusted. Once accepted, the socket
is keyed to ``user_id`` and the manager only ever sends that user their own
events, so there is no per-message authorisation to repeat.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.api.routes.auth import normalize_role
from app.core.security import decode_access_token
from app.db.database import SessionLocal
from app.models.notification import Notification
from app.models.user import User
from app.services.notification_realtime import manager

logger = logging.getLogger("uvicorn.error")

router = APIRouter(tags=["Notification WebSocket"])

#: Browsers do not surface the HTTP status of a failed handshake, so this is
#: logged for the operator rather than sent anywhere.
_WS_CLOSE_POLICY_VIOLATION = 1008


def _authenticate(token: str) -> User | None:
    """Resolve a bearer token to a live user, or ``None`` if it is
    not valid."""
    payload = decode_access_token(token)
    if not payload:
        return None

    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return None

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.user_id == user_id).first()
        if user is None:
            return None
        if not user.is_active:
            return None
        # Mirrors get_current_user: a bumped token_version revokes old
        # sessions.
        if (payload.get("ver") or 0) != (user.token_version or 0):
            return None
        return user
    finally:
        db.close()


def _unread_count(db, user: User) -> int:
    from app.services.notification_service import get_unread_count
    return get_unread_count(db, user.user_id, user.role)


@router.websocket("/ws/notifications")
async def notifications_websocket(
    websocket: WebSocket,
    token: str = Query(...,
                       description=(
                           "Access token; the browser cannot set headers"
                       )),
) -> None:
    user = _authenticate(token)
    if user is None:
        logger.warning(
            "Rejected notification WebSocket handshake from %s",
            websocket.client,
        )
        # 1008 = policy violation, and it happens before accept() so the
        # connection is refused rather than opened and immediately dropped.
        await websocket.close(code=_WS_CLOSE_POLICY_VIOLATION)
        return

    user_id = user.user_id
    role = normalize_role(user.role)

    db = SessionLocal()
    try:
        initial_unread = _unread_count(db, user)
    finally:
        db.close()

    await manager.connect(user_id, websocket)
    try:
        # The client treats 'connected' as the signal that the badge can be
        # trusted, so it is sent first and carries the authoritative count.
        await websocket.send_json(
            {
                "type": "connected",
                "data": {
                    "user_id": user_id,
                    "role": role,
                    "unread_count": initial_unread,
                },
            }
        )

        while True:
            # The only client -> server message is the heartbeat. Reading it
            # keeps the connection alive through idle proxies and is also the
            # loop that notices a disconnect promptly.
            message = await websocket.receive_text()
            if message.strip().lower() == "ping":
                await websocket.send_json({"type": "ping", "data": {}})
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # a broken socket must not surface as a 500
        logger.debug(
            "Notification WebSocket error for user=%s: %s", user_id, exc)
    finally:
        await manager.disconnect(user_id, websocket)


__all__ = ["router"]
