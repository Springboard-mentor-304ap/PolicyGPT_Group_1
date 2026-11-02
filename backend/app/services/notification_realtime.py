"""In-process WebSocket fan-out for notifications.

Design notes
------------
*Notification creation happens inside synchronous FastAPI endpoints*, which
run in a threadpool, while the WebSocket connections live on the event loop.
Publishing therefore cannot simply ``await``; the manager captures the running
loop at startup and hops back onto it with
``asyncio.run_coroutine_threadsafe``.

There is no Redis/broker in this project, so the fan-out is per-process. That
is correct for the single-worker ``uvicorn`` deployment this app uses. If it is
ever scaled to multiple workers, the only change needed is to swap
``publish`` for a broker round-trip - the rest of the notification pipeline
already calls through this one function.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("uvicorn.error")


class NotificationConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = asyncio.Lock()

    # -- lifecycle ---------------------------------------------------------
    def bind_loop(self, loop: asyncio.AbstractEventLoop | None = None) -> None:
        """Called from the FastAPI lifespan so sync threads can reach
        the loop."""
        self._loop = loop or asyncio.get_running_loop()

    def unbind_loop(self) -> None:
        self._loop = None

    @property
    def connected_user_ids(self) -> set[int]:
        return {uid for uid, sockets in self._connections.items() if sockets}

    def connection_count(self, user_id: int) -> int:
        return len(self._connections.get(user_id, ()))

    # -- connection handling (event-loop only) -----------------------------
    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(websocket)
        logger.info(
            "Notification WebSocket connected: user=%s (total for user=%s)",
            user_id,
            self.connection_count(user_id),
        )

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(user_id)
            if sockets:
                sockets.discard(websocket)
                if not sockets:
                    self._connections.pop(user_id, None)
        logger.info(
            "Notification WebSocket disconnected: user=%s (total for user=%s)",
            user_id,
            self.connection_count(user_id),
        )

    async def send_to_user(
        self, user_id: int, payload: dict[str, Any]
    ) -> None:
        sockets = list(self._connections.get(user_id, ()))
        if not sockets:
            return
        stale: list[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception as exc:  # client vanished mid-send
                logger.debug(
                    "Dropping notification socket for user=%s: %s",
                    user_id,
                    exc)
                stale.append(socket)
        for socket in stale:
            await self.disconnect(user_id, socket)

    async def send_unread_count(self, user_id: int, unread_count: int) -> None:
        await self.send_to_user(
            user_id,
            {"type": "unread_count", "data": {"unread_count": unread_count}},
        )

    # -- publishing (may be called from any thread) ------------------------
    def publish(self, user_id: int, payload: dict[str, Any]) -> None:
        """Fan a payload out to one user. Safe to call from a worker thread.

        Never raises: a real-time failure must not roll back a notification
        that is already committed to the database.
        """
        if not user_id:
            return
        if not self._connections.get(user_id):
            # Nothing listening in this process; skip the loop round-trip.
            return
        loop = self._loop
        if loop is None or loop.is_closed():
            logger.debug(
                "No event loop bound; skipping realtime publish "
                "for user=%s",
                user_id,
            )
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self.send_to_user(user_id, payload), loop)
        except Exception as exc:
            logger.warning(
                "Realtime publish failed for user=%s: %s", user_id, exc)

    def publish_many(
        self, user_ids: list[int], payload: dict[str, Any]
    ) -> None:
        for user_id in user_ids:
            self.publish(user_id, payload)


#: Process-wide singleton, imported by the notification pipeline.
manager = NotificationConnectionManager()
