import socket
from urllib.parse import urlparse
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
# from app.models.notification import Notification
from app.core.config import settings


def _get_connect_args(url: str) -> dict:
    connect_args = {"connect_timeout": 10}
    try:
        parsed = urlparse(url)
        if parsed.hostname:
            # Force IPv4 resolution to prevent macOS dual-stack hanging on
            # unreachable synthesized IPv6 (NAT64)
            addr_info = socket.getaddrinfo(
                parsed.hostname, None, socket.AF_INET, socket.SOCK_STREAM
            )
            if addr_info and addr_info[0][4]:
                connect_args["hostaddr"] = addr_info[0][4][0]
    except Exception:
        pass
    return connect_args


# =========================================================
# DATABASE ENGINE
# =========================================================

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_get_connect_args(settings.DATABASE_URL),
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=1800,
    pool_timeout=30,
)


# =========================================================
# DATABASE SESSION
# =========================================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# =========================================================
# SQLALCHEMY BASE
# =========================================================

Base = declarative_base()


# =========================================================
# DATABASE DEPENDENCY
# =========================================================


def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()
