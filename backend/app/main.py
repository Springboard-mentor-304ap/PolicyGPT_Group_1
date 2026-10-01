import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.api.routes.feedback import router as feedback_router
from app.api.routes.reports import router as reports_router
from app.api.routes.notification_preferences import (
    router as notification_preferences_router
)
from app.api.routes.search_history import router as search_history_router
from app.api.routes.saved_items import router as saved_items_router
from app.api.routes.audit_logs import router as audit_logs_router
from app.api.routes.faqs import router as faqs_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.usage import router as usage_router
from app.api.routes.notifications import (
    router as notifications_router,
    admin_router as notifications_admin_router,
    webhook_router as notifications_webhook_router,
)
from app.api.routes.notifications_ws import (
    router as notifications_ws_router,
)
from app.api.routes.support import router as support_router

from app.api.routes.auth import router as auth_router
from app.api.routes.admin_users import router as admin_users_router
from app.api.routes.policy import router as policy_router
from app.api.routes.scheme import router as scheme_router
from app.api.routes.eligibility import router as eligibility_router
from app.api.routes.role_based import router as role_based_router
from app.api.routes.chatbot import router as chatbot_router

from app.core.config import settings
from app.db.database import Base, engine
from app.services.notification_delivery_service import (
    NotificationDeliveryService,
)

# =========================================================
# CREATE DATABASE TABLES
# =========================================================

Base.metadata.create_all(bind=engine)


# =========================================================
# DATABASE CONNECTION POOL MAINTENANCE
# =========================================================

logger = logging.getLogger("uvicorn.error")


def _warm_up_pool() -> None:
    """
    Establish one valid database connection before the server
    starts accepting requests, so the first user request does
    not pay the cost of creating a cold connection.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Database warm-up connection failed")


async def _keep_pool_warm() -> None:
    """
    Periodically ping a pooled connection so idle Supabase /
    Supavisor connections do not go stale and force a user
    request to reconnect.
    """
    while True:
        await asyncio.sleep(60)
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except Exception:
            logger.exception("Database keep-alive ping failed")


# How often the scheme expiry / deadline reminder processors run. There is no
# Celery or APScheduler in this project, so these run as a lifespan task in the
# same style as the pool warmer. Both processors are idempotent, so a missed or
# duplicated run is harmless - a real scheduler calling the admin endpoints
# instead would work equally well.
REMINDER_SWEEP_SECONDS = 3600


async def _reminder_sweep_loop() -> None:
    """Hourly pass over scheme deadlines. Never crashes the app."""
    from contextlib import contextmanager

    from app.db.database import SessionLocal
    from app.services.deadline_service import DeadlineReminderService
    from app.services.scheme_expiry_service import process_scheme_expiry

    @contextmanager
    def _sweep_session():
        """One short-lived session per sweep step.

        These run off the event loop in a worker thread, so the session has to
        be closed by the same step that opened it. Leaking one per hour would
        quietly exhaust the connection pool.
        """
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    # let the app finish starting before touching the DB
    await asyncio.sleep(30)
    while True:
        try:
            with _sweep_session() as db:
                await asyncio.to_thread(
                    DeadlineReminderService
                    .check_and_trigger_deadline_reminders,
                    db,
                )
        except Exception:
            logger.exception("Deadline reminder sweep failed")
        try:
            with _sweep_session() as db:
                await asyncio.to_thread(process_scheme_expiry, db)
        except Exception:
            logger.exception("Scheme expiry sweep failed")
        try:
            with _sweep_session() as db:
                await asyncio.to_thread(
                    NotificationDeliveryService.retry_failed_deliveries, db, 50
                )
        except Exception:
            logger.exception("Delivery retry sweep failed")
        await asyncio.sleep(REMINDER_SWEEP_SECONDS)


_reminder_task: asyncio.Task | None = None


def _seed_reminder_schedule() -> None:
    global _reminder_task
    if _reminder_task is not None and not _reminder_task.done():
        return
    _reminder_task = asyncio.create_task(_reminder_sweep_loop())


@asynccontextmanager
async def lifespan(app: FastAPI):
    _warm_up_pool()
    keep_alive_task = asyncio.create_task(_keep_pool_warm())

    # Notification creation runs in sync endpoint threads while the
    # WebSocket connections live here on the event loop, so the realtime
    # manager needs a handle on this loop to publish.
    from app.services.notification_realtime import (
    manager as _notification_manager,
)

    if settings.NOTIFICATIONS_REALTIME_ENABLED:
        _notification_manager.bind_loop(asyncio.get_running_loop())

    _seed_reminder_schedule()

    try:
        yield
    finally:
        _notification_manager.unbind_loop()
        if _reminder_task is not None:
            _reminder_task.cancel()
            try:
                await _reminder_task
            except asyncio.CancelledError:
                pass
        keep_alive_task.cancel()
        try:
            await keep_alive_task
        except asyncio.CancelledError:
            pass
        engine.dispose()


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="PolicyGPT API",
    description="Government Policy & Public Scheme Intelligence Platform",
    version="1.0.0",
    lifespan=lifespan,
)


# =========================================================
# CORS
# =========================================================

def _cors_origins() -> list[str]:
    origins = [
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ]
    extra = (settings.FRONTEND_ORIGINS or "").strip()
    if extra:
        for origin in extra.split(","):
            candidate = origin.strip().rstrip("/")
            if candidate and candidate not in origins:
                origins.append(candidate)
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Report-Id"],
)


# =========================================================
# ROUTERS
# =========================================================

app.include_router(auth_router)

app.include_router(admin_users_router)

app.include_router(policy_router)

app.include_router(scheme_router)

app.include_router(eligibility_router)
app.include_router(analytics_router)
app.include_router(usage_router)
app.include_router(notifications_router)
app.include_router(notifications_admin_router)
app.include_router(notifications_webhook_router)
app.include_router(notifications_ws_router)
app.include_router(notification_preferences_router)

app.include_router(reports_router)

app.include_router(feedback_router)
app.include_router(faqs_router)
app.include_router(audit_logs_router)
app.include_router(support_router)
app.include_router(search_history_router)
app.include_router(saved_items_router)
app.include_router(role_based_router)
app.include_router(chatbot_router)
# =========================================================
# ROOT
# =========================================================


@app.get("/")
def root():
    return {
        "message": "PolicyGPT Backend is running",
        "status": "success",
    }


# =========================================================
# HEALTH CHECK
# =========================================================


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
    }
