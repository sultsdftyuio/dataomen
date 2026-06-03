# api/database.py

import logging
import os
from datetime import datetime
from threading import Lock
from typing import Optional

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Integer,
    String,
    create_engine,
)
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

# ------------------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------------------

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# SQLAlchemy Base
# ------------------------------------------------------------------------------

Base = declarative_base()

# ------------------------------------------------------------------------------
# Models
# ------------------------------------------------------------------------------


class AnomalyAlert(Base):
    __tablename__ = "anomaly_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)

    tenant_id = Column(String, index=True, nullable=False)
    metric_name = Column(String, index=True, nullable=False)

    date = Column(DateTime, index=True, nullable=False)

    severity = Column(Float, nullable=False)
    direction = Column(String, nullable=False)

    status = Column(String, default="active", nullable=False)
    last_seen = Column(DateTime, default=datetime.utcnow, nullable=False)


# ------------------------------------------------------------------------------
# Database URL Helpers
# ------------------------------------------------------------------------------


def _normalize_database_url(db_url: str) -> str:
    """
    SQLAlchemy requires postgresql:// instead of postgres://
    """
    if db_url.startswith("postgres://"):
        return db_url.replace("postgres://", "postgresql://", 1)

    return db_url


def _build_async_database_url(db_url: str) -> str:
    """
    Convert sync SQLAlchemy URLs into asyncpg URLs.
    """

    normalized = _normalize_database_url(db_url)

    if normalized.startswith("postgresql+asyncpg://"):
        return normalized

    if normalized.startswith("postgresql+psycopg2://"):
        return normalized.replace(
            "postgresql+psycopg2://",
            "postgresql+asyncpg://",
            1,
        )

    if normalized.startswith("postgresql+psycopg://"):
        return normalized.replace(
            "postgresql+psycopg://",
            "postgresql+asyncpg://",
            1,
        )

    if normalized.startswith("postgresql://"):
        return normalized.replace(
            "postgresql://",
            "postgresql+asyncpg://",
            1,
        )

    return normalized


def _mask_database_url(db_url: str) -> str:
    """
    Prevent credentials from leaking into logs.
    """

    if "@" not in db_url:
        return db_url

    prefix, suffix = db_url.split("@", 1)

    if "://" in prefix:
        scheme, _ = prefix.split("://", 1)
        return f"{scheme}://***@{suffix}"

    return f"***@{suffix}"


# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------

DATABASE_URL = _normalize_database_url(
    os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/dataomen",
    )
)

ASYNC_DATABASE_URL = _build_async_database_url(DATABASE_URL)

_DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "5"))
_DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "5"))
_DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))

# ------------------------------------------------------------------------------
# Sync Engine
# ------------------------------------------------------------------------------

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=_DB_POOL_SIZE,
    max_overflow=_DB_MAX_OVERFLOW,
    pool_timeout=_DB_POOL_TIMEOUT,
    pool_recycle=3600,
    connect_args={
        "options": (
            "-c statement_timeout=30000 "
            "-c application_name=arcli_api"
        )
    },
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)

# ------------------------------------------------------------------------------
# Async Engine (Lazy Loaded)
# ------------------------------------------------------------------------------

_async_engine: Optional[AsyncEngine] = None
_async_session_factory: Optional[
    async_sessionmaker[AsyncSession]
] = None

_async_factory_lock = Lock()
_async_init_error: Optional[Exception] = None


def _build_async_connect_args() -> dict:
    if ASYNC_DATABASE_URL.startswith("postgresql+asyncpg://"):
        return {
            "server_settings": {
                "statement_timeout": "30000",
                "application_name": "arcli_api",
            }
        }

    return {}


def _get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    global _async_engine
    global _async_session_factory
    global _async_init_error

    if _async_session_factory is not None:
        return _async_session_factory

    if _async_init_error is not None:
        raise RuntimeError(
            "Async DB initialization previously failed."
        ) from _async_init_error

    with _async_factory_lock:
        if _async_session_factory is not None:
            return _async_session_factory

        try:
            _async_engine = create_async_engine(
                ASYNC_DATABASE_URL,
                pool_pre_ping=True,
                pool_size=_DB_POOL_SIZE,
                max_overflow=_DB_MAX_OVERFLOW,
                pool_timeout=_DB_POOL_TIMEOUT,
                pool_recycle=3600,
                connect_args=_build_async_connect_args(),
            )

            _async_session_factory = async_sessionmaker(
                bind=_async_engine,
                class_=AsyncSession,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
            )

        except Exception as exc:
            _async_init_error = exc

            logger.exception(
                "Failed to initialize async database engine for %s",
                _mask_database_url(ASYNC_DATABASE_URL),
            )

            raise RuntimeError(
                "Async database initialization failed. "
                "Verify DATABASE_URL and asyncpg installation."
            ) from exc

    return _async_session_factory


def AsyncSessionLocal() -> AsyncSession:
    return _get_async_session_factory()()


# ------------------------------------------------------------------------------
# FastAPI Dependencies
# ------------------------------------------------------------------------------


def get_db():
    """
    Sync SQLAlchemy session dependency.
    """

    db = SessionLocal()

    try:
        yield db

    except SQLAlchemyError:
        logger.exception("Database transaction failed")
        db.rollback()
        raise

    finally:
        db.close()


async def get_async_db():
    """
    Async SQLAlchemy session dependency.
    """

    db = AsyncSessionLocal()

    try:
        yield db

    except SQLAlchemyError:
        logger.exception("Async database transaction failed")
        await db.rollback()
        raise

    finally:
        await db.close()


def get_db_pool():
    """
    FastAPI dependency.

    Returns the SQLAlchemy Engine that owns
    the connection pool.

    Used by services requiring direct engine access.
    """

    return engine


# ------------------------------------------------------------------------------
# Lifecycle Helpers
# ------------------------------------------------------------------------------


def init_db() -> None:
    """
    Database initialization hook.

    Schema creation should be handled via
    Alembic or Supabase migrations.

    This function intentionally only verifies
    connectivity.
    """

    try:
        with engine.connect():
            logger.info(
                "Database connectivity verified: %s",
                _mask_database_url(DATABASE_URL),
            )

    except Exception:
        logger.exception("Database initialization failed")
        raise


async def shutdown_database() -> None:
    """
    Dispose async SQLAlchemy resources.
    """

    global _async_engine

    if _async_engine is not None:
        await _async_engine.dispose()
        logger.info("Async database engine disposed")