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
from app.api.routes.audit_logs import router as audit_logs_router
from app.api.routes.faqs import router as faqs_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.usage import router as usage_router
from app.api.routes.notifications import router as notifications_router

from app.api.routes.auth import router as auth_router
from app.api.routes.admin_users import router as admin_users_router
from app.api.routes.policy import router as policy_router
from app.api.routes.scheme import router as scheme_router
from app.api.routes.eligibility import router as eligibility_router
from app.api.routes.role_based import router as role_based_router

from app.db.database import Base, engine

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    _warm_up_pool()
    keep_alive_task = asyncio.create_task(_keep_pool_warm())
    try:
        yield
    finally:
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
app.include_router(notification_preferences_router)

app.include_router(reports_router)

app.include_router(feedback_router)
app.include_router(faqs_router)
app.include_router(audit_logs_router)
app.include_router(search_history_router)
app.include_router(role_based_router)
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
