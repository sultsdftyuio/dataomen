# api/database.py

import os
import logging
from threading import Lock
from typing import Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

# Configure logging for backend observability
logger = logging.getLogger(__name__)


def _normalize_database_url(db_url: str) -> str:
    if db_url.startswith("postgres://"):
        return db_url.replace("postgres://", "postgresql://", 1)
    return db_url


def _build_async_database_url(db_url: str) -> str:
    normalized = _normalize_database_url(db_url)
    if normalized.startswith("postgresql+asyncpg://"):
        return normalized
    if normalized.startswith("postgresql+psycopg2://"):
        return normalized.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    if normalized.startswith("postgresql+psycopg://"):
        return normalized.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)
    if normalized.startswith("postgresql://"):
        return normalized.replace("postgresql://", "postgresql+asyncpg://", 1)
    return normalized


def _mask_database_url(db_url: str) -> str:
    if "@" not in db_url:
        return db_url
    prefix, suffix = db_url.split("@", 1)
    if "://" in prefix:
        scheme, _ = prefix.split("://", 1)
        return f"{scheme}://***@{suffix}"
    return f"***@{suffix}"

# 1. Fetch the Database URL from environment variables.
# For SaaS on Vercel/Render, ensure this points to a Connection Pooler (like Supabase Transaction Pooler)
# rather than the direct database URL to prevent connection exhaustion.
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:postgres@localhost:5432/dataomen"
)
DATABASE_URL = _normalize_database_url(DATABASE_URL)

ASYNC_DATABASE_URL = _build_async_database_url(DATABASE_URL)

_DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", 10))
_DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", 20))

# 2. SaaS-Optimized SQLAlchemy Engine
engine = create_engine(
    DATABASE_URL,
    # Verifies the connection is still alive before executing (Crucial for PaaS/Serverless)
    pool_pre_ping=True, 
    # Dynamically scale pool based on environment variables for flexible deployments
    pool_size=_DB_POOL_SIZE,
    max_overflow=_DB_MAX_OVERFLOW,
    # Recycle connections after 1 hour to prevent stale connections from firewalls/load balancers
    pool_recycle=3600, 
    connect_args={
        # SaaS Protection: 
        # - statement_timeout=30000 (30 seconds): Prevents 'noisy neighbors' from locking up the DB.
        # - application_name: Helps trace queries in Supabase/PgBouncer dashboards.
        "options": "-c statement_timeout=30000 -c application_name=dataomen_api"
    }
)

_async_engine: Optional[AsyncEngine] = None
_async_session_factory: Optional[async_sessionmaker[AsyncSession]] = None
_async_factory_lock = Lock()
_async_init_error: Optional[Exception] = None


def _build_async_connect_args() -> dict:
    if ASYNC_DATABASE_URL.startswith("postgresql+asyncpg://"):
        return {
            "server_settings": {
                "statement_timeout": "30000",
                "application_name": "dataomen_api",
            }
        }
    return {}


def _get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    global _async_engine, _async_session_factory, _async_init_error

    if _async_session_factory is not None:
        return _async_session_factory
    if _async_init_error is not None:
        raise RuntimeError(
            "Async DB session factory is unavailable due to a prior initialization error."
        ) from _async_init_error

    with _async_factory_lock:
        if _async_session_factory is not None:
            return _async_session_factory
        if _async_init_error is not None:
            raise RuntimeError(
                "Async DB session factory is unavailable due to a prior initialization error."
            ) from _async_init_error

        try:
            _async_engine = create_async_engine(
                ASYNC_DATABASE_URL,
                pool_pre_ping=True,
                pool_size=_DB_POOL_SIZE,
                max_overflow=_DB_MAX_OVERFLOW,
                pool_recycle=3600,
                connect_args=_build_async_connect_args(),
            )
            _async_session_factory = async_sessionmaker(
                bind=_async_engine,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
                class_=AsyncSession,
            )
        except Exception as exc:
            _async_init_error = exc
            logger.error(
                "Failed to initialize async DB engine for %s: %s",
                _mask_database_url(ASYNC_DATABASE_URL),
                exc,
            )
            raise RuntimeError(
                "Async DB session factory initialization failed. "
                "Install 'asyncpg' and verify DATABASE_URL."
            ) from exc

    return _async_session_factory


def AsyncSessionLocal() -> AsyncSession:
    """Lazy async session factory to prevent import-time failures."""
    return _get_async_session_factory()()

# 3. Create the strictly-typed session factory
SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine
)

def get_db():
    """
    Dependency Injection for FastAPI.
    Yields a pure database session, ensures transaction rollback on application errors,
    and guarantees the connection is returned to the pool to prevent leaks.
    """
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        logger.error(f"Database transaction error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


async def get_async_db():
    """
    Async FastAPI dependency for endpoints/services that require AsyncSession.
    Session factory is resolved lazily to keep startup resilient.
    """
    db = AsyncSessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        logger.error(f"Async database transaction error: {e}")
        await db.rollback()
        raise
    finally:
        await db.close()

def init_db():
    """
    Orchestrator method to initialize the database natively.
    Called during app startup (e.g., in FastAPI lifecycle events).
    """
    # Important: Import models here to avoid circular dependencies
    from models import Base
    
    try:
        with engine.connect() as conn:
            # Crucial: Enable the pgvector extension for Postgres natively
            # This allows cosine similarity math directly in SQL for AI workloads
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
            logger.info("Successfully ensured pgvector extension is active.")
        
        # Safely create all tables that do not exist yet
        Base.metadata.create_all(bind=engine)
        logger.info("Successfully synchronized database schema.")
        
    except Exception as e:
        logger.critical(f"Failed to initialize database schema: {e}")
        raise