"""
ARCLI database layer — connection management, pooling, and lifecycle.

This module keeps all operational concerns separate from the ORM schema
(models.py).  It provides:

  * Sync and async engine configuration with pooling, pre-ping, and
    PostgreSQL-specific statement timeouts / application_name.
  * Lazy async initialization (engine created on first use, not import).
  * FastAPI dependency injectors: get_db() and get_async_db().
  * Startup connectivity check: init_db().
  * Graceful shutdown: shutdown_database().
  * Credential-safe logging helpers.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import threading
from typing import AsyncGenerator, Generator, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Session, sessionmaker
from supabase import Client, ClientOptions, create_client

logger = logging.getLogger(__name__)

__all__ = [
    "engine",
    "SessionLocal",
    "get_db",
    "get_async_db",
    "get_supabase",
    "get_db_pool",
    "init_db",
    "shutdown_database",
    "_normalize_database_url",
    "_build_async_database_url",
    "_mask_database_url",
]

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/arcli")
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "5"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "10"))
DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))
DB_STATEMENT_TIMEOUT_MS = int(os.getenv("DB_STATEMENT_TIMEOUT_MS", "30000"))
DB_APPLICATION_NAME = os.getenv("DB_APPLICATION_NAME", "arcli_api")

_supabase_client: Optional[Client] = None
_supabase_thread_local = threading.local()

# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def _normalize_database_url(db_url: str) -> str:
    """Convert legacy ``postgres://`` to ``postgresql://`` for SQLAlchemy."""
    if db_url.startswith("postgres://"):
        return db_url.replace("postgres://", "postgresql://", 1)
    return db_url


def _build_async_database_url(db_url: str) -> str:
    """Convert a sync PostgreSQL URL into an asyncpg-compatible URL."""
    normalized = _normalize_database_url(db_url)
    if normalized.startswith("postgresql+asyncpg://"):
        return normalized
    if normalized.startswith("postgresql://"):
        return normalized.replace("postgresql://", "postgresql+asyncpg://", 1)
    return normalized


def _mask_database_url(db_url: str) -> str:
    """Mask password in a database URL so it is safe for logs."""
    return re.sub(r"://[^:]+:[^@]+@", "://***:***@", db_url)


# ---------------------------------------------------------------------------
# Sync engine & session factory
# ---------------------------------------------------------------------------

_normalized_sync_url = _normalize_database_url(DATABASE_URL)
_masked_sync_url = _mask_database_url(_normalized_sync_url)

logger.info("Configuring sync database engine: %s", _masked_sync_url)

_sync_connect_args = {
    "connect_timeout": 10,
    "options": f"-c statement_timeout={DB_STATEMENT_TIMEOUT_MS}",
    "application_name": DB_APPLICATION_NAME,
}

engine = create_engine(
    _normalized_sync_url,
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
    pool_timeout=DB_POOL_TIMEOUT,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args=_sync_connect_args,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# ---------------------------------------------------------------------------
# Async engine & session factory (lazy, thread-safe)
# ---------------------------------------------------------------------------

_async_engine: Optional[AsyncEngine] = None
_async_session_factory: Optional[async_sessionmaker[AsyncSession]] = None
_async_factory_lock = asyncio.Lock()
_async_init_error: Optional[Exception] = None


async def _get_async_engine() -> AsyncEngine:
    """Lazy-initialize and return the async engine."""
    global _async_engine, _async_init_error

    if _async_engine is not None:
        return _async_engine

    if _async_init_error is not None:
        raise _async_init_error

    async with _async_factory_lock:
        # Double-checked locking pattern
        if _async_engine is not None:
            return _async_engine

        try:
            async_url = _build_async_database_url(DATABASE_URL)
            masked_async = _mask_database_url(async_url)
            logger.info("Configuring async database engine: %s", masked_async)

            # asyncpg accepts runtime settings via server_settings
            _async_connect_args = {
                "server_settings": {
                    "statement_timeout": str(DB_STATEMENT_TIMEOUT_MS),
                    "application_name": DB_APPLICATION_NAME,
                },
                "timeout": 10,
            }

            _async_engine = create_async_engine(
                async_url,
                pool_size=DB_POOL_SIZE,
                max_overflow=DB_MAX_OVERFLOW,
                pool_timeout=DB_POOL_TIMEOUT,
                pool_pre_ping=True,
                pool_recycle=3600,
                connect_args=_async_connect_args,
            )
            return _async_engine
        except Exception as exc:
            _async_init_error = exc
            logger.exception("Failed to initialize async database engine")
            raise


async def _get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    """Lazy-initialize and return the async session factory."""
    global _async_session_factory

    if _async_session_factory is not None:
        return _async_session_factory

    async with _async_factory_lock:
        if _async_session_factory is not None:
            return _async_session_factory

        async_engine = await _get_async_engine()
        _async_session_factory = async_sessionmaker(
            async_engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
        return _async_session_factory


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def get_db() -> Generator[Session, None, None]:
    """Yield a sync database session for FastAPI dependency injection."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_supabase() -> Client:
    """FastAPI dependency to inject a Supabase service role client."""
    cached = getattr(_supabase_thread_local, "supabase_client", None)
    if cached is not None:
        return cached

    global _supabase_client
    if _supabase_client is not None:
        _supabase_thread_local.supabase_client = _supabase_client
        return _supabase_client

    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Supabase credentials are not set.")

    options = ClientOptions(postgrest_client_timeout=float(os.getenv("SUPABASE_TIMEOUT_SEC", "15.0")))
    client = create_client(url, key, options=options)
    _supabase_client = client
    _supabase_thread_local.supabase_client = client
    return client


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session for FastAPI dependency injection."""
    factory = await _get_async_session_factory()
    session = factory()
    try:
        yield session
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def get_db_pool() -> AsyncGenerator[AsyncEngine, None]:
    """Yield the raw async engine for operations that bypass the ORM session."""
    engine = await _get_async_engine()
    yield engine


# ---------------------------------------------------------------------------
# Lifecycle helpers
# ---------------------------------------------------------------------------

def init_db() -> None:
    """Verify sync database connectivity at application startup."""
    logger.info("Verifying database connectivity...")
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connectivity verified.")
    except Exception:
        logger.exception("Database connectivity check failed")
        raise


async def shutdown_database() -> None:
    """Gracefully dispose of async and sync engines on shutdown."""
    global _async_engine, _async_session_factory, _async_init_error

    logger.info("Shutting down database engines...")

    # Async engine
    if _async_engine is not None:
        try:
            await _async_engine.dispose()
            logger.info("Async engine disposed.")
        except Exception:
            logger.exception("Error disposing async engine")
        finally:
            _async_engine = None
            _async_session_factory = None
            _async_init_error = None

    # Sync engine
    try:
        engine.dispose()
        logger.info("Sync engine disposed.")
    except Exception:
        logger.exception("Error disposing sync engine")