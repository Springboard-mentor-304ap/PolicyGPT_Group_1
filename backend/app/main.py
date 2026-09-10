from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.admin_users import router as admin_users_router
from app.api.routes.policy import router as policy_router
from app.api.routes.scheme import router as scheme_router

from app.db.database import Base, engine

# =========================================================
# CREATE DATABASE TABLES
# =========================================================

Base.metadata.create_all(bind=engine)


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="PolicyGPT API",
    description="Government Policy & Public Scheme Intelligence Platform",
    version="1.0.0",
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
