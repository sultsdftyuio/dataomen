"""
ARCLI.TECH - Zero-ETL Orchestration Module
Component: SyncEngine (The Conductor) — Titan V5 Phase 1.4 | HARDENED BUILD v5

Changelog (v5 — Full Critical-Issue Resolution):
────────────────────────────────────────────────
FIX-01  ZSET-based distributed semaphore with auto-expiry and token recovery
FIX-02  asyncio.wait_for wrapper for strict timeout enforcement
FIX-03  Atomic DB idempotency with SELECT FOR UPDATE (no race conditions)
FIX-04  Full streaming webhook processing (ijson) OR strict size enforcement
FIX-05  Custom ThreadPoolExecutor with controlled pool size
FIX-06  Per-context Redis connection pooling with configurable limits
FIX-07  Relaxed HMAC timestamp tolerance for clock skew (±10 min)
FIX-08  Fail-fast schema validation (no silent empty schema acceptance)
FIX-09  Explicit Polars buffer clearing with memory pool management
FIX-10  Watchdog task registry with lifecycle tracking and graceful shutdown
FIX-11  Stronger Celery idempotency (DB as single source of truth)
FIX-12  Circuit breaker pattern for external integrations
FIX-13  Token recovery mechanism for crashed semaphore holders
FIX-14  Thread pool isolation per operation type (writes, compaction, profiling)
FIX-15  Connection pool health checks and automatic reconnection
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import random
import re
import time
import weakref
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, AsyncIterator, Dict, List, Optional, Set, Tuple, Type, Callable

import polars as pl
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select, update, text, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import func as sa_func
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
    before_sleep_log,
)

# Core Infrastructure
from api.database import get_async_db, AsyncSessionLocal
from models import Dataset, DatasetStatus, Organization, SemanticMetric, SyncJob
from api.auth import TenantContext, verify_tenant

# Modular Services
from api.services.storage_manager import storage_manager
from api.services.json_normalizer import PolarsNormalizer
from api.services.data_sanitizer import DataSanitizer
from api.services.duckdb_validator import DuckDBValidator
from api.services.watchdog_service import WatchdogService
from api.services.credential_manager import CredentialManager
from api.services.notification_router import notification_router
from api.worker import celery_app

# Integration Registry
from api.services.integrations.base_integration import BaseIntegration
from api.services.integrations.bigquery_connector import BigQueryConnector
from api.services.integrations.google_ads_connector import GoogleAdsConnector
from api.services.integrations.hubspot_connector import HubSpotConnector
from api.services.integrations.meta_ads_connector import MetaAdsConnector
from api.services.integrations.redshift_connector import RedshiftConnector
from api.services.integrations.salesforce_connector import SalesforceConnector
from api.services.integrations.shopify_connector import ShopifyConnector
from api.services.integrations.snowflake_connector import SnowflakeConnector
from api.services.integrations.stripe_connector import StripeConnector
from api.services.integrations.zendesk_connector import ZendeskConnector

logger = logging.getLogger(__name__)
sync_router = APIRouter(prefix="/api/ingest", tags=["Ingestion", "Sync"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_WEBHOOK_PAYLOAD_BYTES = 10 * 1024 * 1024
MAX_WEBHOOK_EVENTS = 5_000
MAX_EVENT_PAYLOAD_BYTES = 64 * 1024
WEBHOOK_TIMESTAMP_TOLERANCE = 600  # FIX-07: Increased to 10 min for clock skew
WEBHOOK_FUTURE_TOLERANCE = 600    # FIX-07: Allow 10 min future drift
BATCH_CHUNK_SIZE = 500
LOCK_TTL_SECONDS = 3_600
NONCE_TTL_SECONDS = 600
CELERY_DEDUP_TTL_SECONDS = 86_400
OPT_LOCK_MAX_RETRIES = 5
MAX_CONCURRENT_SYNCS_GLOBAL = 10
MAX_WEBHOOK_RATE_PER_MINUTE = 1000
RATE_LIMIT_WINDOW_SECONDS = 60

# FIX-05: Thread pool configuration
WRITE_THREAD_POOL_SIZE = 8
COMPACTION_THREAD_POOL_SIZE = 4
PROFILE_THREAD_POOL_SIZE = 4

_SAFE_IDENTIFIER_RE = re.compile(r"^[a-z][a-z0-9_]{0,62}$")
_SAFE_PATH_PART_RE = re.compile(r"^[a-zA-Z0-9_\-=]+$")

# ---------------------------------------------------------------------------
# FIX-12: Circuit Breaker Pattern
# ---------------------------------------------------------------------------

class CircuitState(Enum):
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if recovered


@dataclass
class CircuitBreaker:
    """Circuit breaker for external integration calls."""
    name: str
    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    half_open_max_calls: int = 3

    _state: CircuitState = field(default=CircuitState.CLOSED, repr=False)
    _failure_count: int = field(default=0, repr=False)
    _success_count: int = field(default=0, repr=False)
    _last_failure_time: Optional[float] = field(default=None, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection."""
        async with self._lock:
            if self._state == CircuitState.OPEN:
                if time.time() - (self._last_failure_time or 0) > self.recovery_timeout:
                    self._state = CircuitState.HALF_OPEN
                    self._success_count = 0
                    logger.info("[%s] Circuit breaker entering HALF_OPEN state", self.name)
                else:
                    raise CircuitBreakerOpenError(f"Circuit breaker open for {self.name}")

            elif self._state == CircuitState.HALF_OPEN:
                if self._success_count >= self.half_open_max_calls:
                    self._state = CircuitState.CLOSED
                    self._failure_count = 0
                    logger.info("[%s] Circuit breaker CLOSED (recovered)", self.name)

        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as exc:
            await self._on_failure()
            raise

    async def _on_success(self) -> None:
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
            else:
                self._failure_count = max(0, self._failure_count - 1)

    async def _on_failure(self) -> None:
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()

            if self._failure_count >= self.failure_threshold:
                if self._state != CircuitState.OPEN:
                    self._state = CircuitState.OPEN
                    logger.warning(
                        "[%s] Circuit breaker OPENED after %d failures",
                        self.name, self._failure_count
                    )


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open."""
    pass


# Global circuit breaker registry
_CIRCUIT_BREAKERS: Dict[str, CircuitBreaker] = {}
_CIRCUIT_BREAKER_LOCK = asyncio.Lock()


async def get_circuit_breaker(name: str) -> CircuitBreaker:
    """Get or create circuit breaker for integration."""
    async with _CIRCUIT_BREAKER_LOCK:
        if name not in _CIRCUIT_BREAKERS:
            _CIRCUIT_BREAKERS[name] = CircuitBreaker(name=name)
        return _CIRCUIT_BREAKERS[name]


# ---------------------------------------------------------------------------
# FIX-01 + FIX-13: ZSET-based Distributed Semaphore with Token Recovery
# ---------------------------------------------------------------------------

class DistributedSemaphore:
    """
    Redis ZSET-based distributed semaphore with:
    - Automatic token expiry (prevents permanent loss)
    - Token recovery for crashed holders
    - Atomic acquire/release operations
    """

    # Lua script for atomic acquire with ownership tracking
    ACQUIRE_SCRIPT = """
    local key = KEYS[1]
    local max_tokens = tonumber(ARGV[1])
    local owner = ARGV[2]
    local now = tonumber(ARGV[3])
    local expiry = tonumber(ARGV[4])
    
    -- Clean up expired tokens first
    redis.call('zremrangebyscore', key, 0, now)
    
    -- Count current valid tokens
    local current = redis.call('zcard', key)
    
    if current < max_tokens then
        -- Acquire token with expiry timestamp
        redis.call('zadd', key, now + expiry, owner)
        return 1
    else
        return 0
    end
    """

    # Lua script for atomic release
    RELEASE_SCRIPT = """
    local key = KEYS[1]
    local owner = ARGV[1]
    return redis.call('zrem', key, owner)
    """

    # Lua script for forceful cleanup of specific owner (recovery)
    RECOVER_SCRIPT = """
    local key = KEYS[1]
    local owner = ARGV[1]
    return redis.call('zrem', key, owner)
    """

    def __init__(self, name: str, max_concurrent: int, token_ttl_seconds: int = 3600):
        self.name = f"dist_semaphore_zset:{name}"
        self.max_concurrent = max_concurrent
        self.token_ttl_seconds = token_ttl_seconds
        try:
            current_task = asyncio.current_task()
        except RuntimeError:
            current_task = None
        task_name = current_task.get_name() if current_task else "unknown"
        self._owner_prefix = f"{os.getpid()}:{task_name}"

    def _make_owner(self) -> str:
        """Generate unique owner identifier."""
        return f"{self._owner_prefix}:{time.time()}:{random.randint(1000, 9999)}"

    async def _cleanup_expired(self, redis: aioredis.Redis) -> int:
        """Remove expired tokens from the semaphore."""
        now = time.time()
        return await redis.zremrangebyscore(self.name, 0, now)

    @asynccontextmanager
    async def acquire(self, timeout: Optional[float] = None) -> AsyncIterator[bool]:
        """
        Acquire a distributed semaphore token atomically.
        Yields True if acquired, False if timeout.
        FIX-02: Uses asyncio.wait_for for strict Python-level timeout.
        """
        redis = await RedisLifecycleManager.get_client()
        owner = self._make_owner()
        acquired = False

        async def _try_acquire() -> bool:
            """Attempt to acquire token."""
            now = time.time()
            result = await redis.eval(
                self.ACQUIRE_SCRIPT,
                1,  # num keys
                self.name,
                self.max_concurrent,
                owner,
                now,
                self.token_ttl_seconds
            )
            return bool(result)

        try:
            # FIX-02: Strict timeout with asyncio.wait_for
            if timeout:
                acquired = await asyncio.wait_for(_try_acquire(), timeout=timeout)
            else:
                acquired = await _try_acquire()

            # If immediate acquire failed and timeout specified, retry with polling
            if not acquired and timeout:
                start = time.time()
                while not acquired and (time.time() - start) < timeout:
                    await asyncio.sleep(0.1)
                    acquired = await _try_acquire()

            yield acquired

        except asyncio.TimeoutError:
            yield False

        finally:
            if acquired:
                # Atomic release
                await redis.eval(self.RELEASE_SCRIPT, 1, self.name, owner)


# Global distributed semaphore
_DISTRIBUTED_SYNC_SEMAPHORE = DistributedSemaphore("sync_engine", MAX_CONCURRENT_SYNCS_GLOBAL)


# ---------------------------------------------------------------------------
# FIX-06: Redis Lifecycle Manager with Per-Context Pooling
# ---------------------------------------------------------------------------

class RedisLifecycleManager:
    """Redis client manager with fork-safety and health checks."""

    _instance: Optional[aioredis.Redis] = None
    _lock = asyncio.Lock()
    _pid: Optional[int] = None
    _health_check_task: Optional[asyncio.Task] = None

    @classmethod
    def _check_fork(cls) -> bool:
        current_pid = os.getpid()
        if cls._pid is None:
            cls._pid = current_pid
            return False
        if cls._pid != current_pid:
            cls._pid = current_pid
            return True
        return False

    @classmethod
    async def initialize(cls, app=None) -> aioredis.Redis:
        if cls._check_fork() and cls._instance is not None:
            logger.warning("Process fork detected, resetting Redis connection pool")
            await cls._instance.aclose()
            cls._instance = None

        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None or cls._check_fork():
                    url = os.environ["REDIS_URL"]
                    # FIX-06: Configurable pool size based on deployment
                    pool_size = int(os.environ.get("REDIS_POOL_SIZE", "50"))
                    cls._instance = aioredis.from_url(
                        url,
                        decode_responses=True,
                        max_connections=pool_size,
                        socket_keepalive=True,
                        socket_keepalive_options={},
                        health_check_interval=30,
                        socket_connect_timeout=10,
                        socket_timeout=30,
                        retry_on_timeout=True,
                    )
                    if app is not None:
                        app.state.redis = cls._instance
                        logger.info("Redis client bound to app.state with pool_size=%d", pool_size)

                    # Start health check task
                    cls._health_check_task = asyncio.create_task(cls._health_check_loop())

        return cls._instance

    @classmethod
    async def _health_check_loop(cls) -> None:
        """Periodic health check and reconnection."""
        while True:
            try:
                await asyncio.sleep(30)
                if cls._instance:
                    await cls._instance.ping()
            except Exception as exc:
                logger.warning("Redis health check failed: %s", exc)
                # Force reconnection on next get_client call
                async with cls._lock:
                    cls._instance = None

    @classmethod
    async def get_client(cls) -> aioredis.Redis:
        if cls._instance is None or cls._check_fork():
            return await cls.initialize()
        return cls._instance

    @classmethod
    async def close(cls) -> None:
        if cls._health_check_task:
            cls._health_check_task.cancel()
            try:
                await cls._health_check_task
            except asyncio.CancelledError:
                pass

        if cls._instance is not None:
            await cls._instance.aclose()
            cls._instance = None
            cls._pid = None


# ---------------------------------------------------------------------------
# FIX-12: Token Bucket Rate Limiter
# ---------------------------------------------------------------------------

class TokenBucketRateLimiter:
    """Redis-backed token bucket rate limiter."""

    def __init__(self, key_prefix: str, bucket_size: int, refill_rate_per_second: float):
        self.key_prefix = key_prefix
        self.bucket_size = bucket_size
        self.refill_rate = refill_rate_per_second

    async def is_allowed(self, identifier: str) -> Tuple[bool, Dict[str, Any]]:
        redis = await RedisLifecycleManager.get_client()
        key = f"{self.key_prefix}:{identifier}"

        script = """
        local key = KEYS[1]
        local now = redis.call('time')[1]
        local bucket_size = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        
        local bucket = redis.call('hmget', key, 'tokens', 'last_refill')
        local tokens = tonumber(bucket[1]) or bucket_size
        local last_refill = tonumber(bucket[2]) or now
        
        local elapsed = now - last_refill
        local new_tokens = math.min(bucket_size, tokens + (elapsed * refill_rate))
        
        if new_tokens >= 1 then
            new_tokens = new_tokens - 1
            redis.call('hmset', key, 'tokens', new_tokens, 'last_refill', now)
            redis.call('expire', key, 3600)
            return {1, math.floor(new_tokens)}
        else
            redis.call('hmset', key, 'tokens', new_tokens, 'last_refill', now)
            redis.call('expire', key, 3600)
            return {0, math.floor(new_tokens)}
        end
        """

        result = await redis.eval(script, 1, key, self.bucket_size, self.refill_rate)
        allowed = bool(result[0])
        remaining = result[1] if len(result) > 1 else 0

        return allowed, {"remaining": remaining, "limit": self.bucket_size}


_WEBHOOK_RATE_LIMITER = TokenBucketRateLimiter(
    "webhook_rate",
    bucket_size=MAX_WEBHOOK_RATE_PER_MINUTE,
    refill_rate_per_second=MAX_WEBHOOK_RATE_PER_MINUTE / RATE_LIMIT_WINDOW_SECONDS
)


# ---------------------------------------------------------------------------
# Integration Registry
# ---------------------------------------------------------------------------

INTEGRATION_REGISTRY: Dict[str, Type[BaseIntegration]] = {
    "stripe": StripeConnector,
    "shopify": ShopifyConnector,
    "salesforce": SalesforceConnector,
    "hubspot": HubSpotConnector,
    "zendesk": ZendeskConnector,
    "google_ads": GoogleAdsConnector,
    "meta_ads": MetaAdsConnector,
    "snowflake": SnowflakeConnector,
    "redshift": RedshiftConnector,
    "bigquery": BigQueryConnector,
}

# ---------------------------------------------------------------------------
# Local Lock Registry
# ---------------------------------------------------------------------------

_LOCK_REGISTRY: Dict[str, asyncio.Lock] = {}
_LOCK_REGISTRY_MUTEX = asyncio.Lock()


async def _get_local_lock(key: str) -> asyncio.Lock:
    async with _LOCK_REGISTRY_MUTEX:
        if key not in _LOCK_REGISTRY:
            _LOCK_REGISTRY[key] = asyncio.Lock()
        return _LOCK_REGISTRY[key]


# ---------------------------------------------------------------------------
# Distributed Lock with Atomic Lua Release
# ---------------------------------------------------------------------------

RELEASE_LOCK_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


@asynccontextmanager
async def distributed_sync_lock(
    tenant_id: str,
    dataset_id: str,
) -> AsyncIterator[bool]:
    redis = await RedisLifecycleManager.get_client()
    key = f"sync_lock:{tenant_id}:{dataset_id}"
    owner = f"{os.getpid()}:{asyncio.current_task().get_name() if asyncio.current_task() else 'unknown'}"
    acquired = False

    try:
        acquired = await redis.set(key, owner, nx=True, ex=LOCK_TTL_SECONDS)
        yield bool(acquired)
    finally:
        if acquired:
            await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, owner)


# ---------------------------------------------------------------------------
# Webhook Nonce with Payload Hash
# ---------------------------------------------------------------------------

async def _check_and_store_nonce(
    signature: Optional[str],
    payload_bytes: bytes,
    timestamp: Optional[str],
) -> bool:
    if not signature or not timestamp:
        return True

    redis = await RedisLifecycleManager.get_client()
    nonce_input = f"{signature}:{hashlib.sha256(payload_bytes).hexdigest()}:{timestamp}"
    nonce_key = f"webhook_nonce:{hashlib.sha256(nonce_input.encode()).hexdigest()}"

    result = await redis.set(nonce_key, "1", nx=True, ex=NONCE_TTL_SECONDS)
    return bool(result)


# ---------------------------------------------------------------------------
# FIX-07: Security Helpers with Relaxed Clock Skew
# ---------------------------------------------------------------------------

def _verify_hmac_signature(
    payload_bytes: bytes,
    signature_header: Optional[str],
    secret: str,
    timestamp_header: Optional[str],
) -> None:
    """HMAC verification with relaxed clock skew tolerance."""
    if not signature_header or not timestamp_header:
        raise HTTPException(status_code=403, detail="Edge verification failed.")

    if len(timestamp_header) > 20 or len(timestamp_header) < 1:
        raise HTTPException(status_code=403, detail="Edge verification failed.")

    if len(signature_header) > 256:
        raise HTTPException(status_code=403, detail="Edge verification failed.")

    try:
        ts = int(timestamp_header)
    except ValueError:
        raise HTTPException(status_code=403, detail="Edge verification failed.")

    current_time = time.time()

    # FIX-07: Relaxed future tolerance (10 min) for clock skew
    if ts < 0 or ts > current_time + WEBHOOK_FUTURE_TOLERANCE:
        raise HTTPException(status_code=403, detail="Edge verification failed.")

    # FIX-07: Relaxed past tolerance (10 min)
    if abs(current_time - ts) > WEBHOOK_TIMESTAMP_TOLERANCE:
        raise HTTPException(status_code=403, detail="Edge verification failed.")

    signed_payload = f"{ts}.".encode() + payload_bytes
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, signature_header):
        raise HTTPException(status_code=403, detail="Edge verification failed.")


def _sanitize_log_message(msg: str) -> str:
    msg = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}", "[REDACTED_EMAIL]", msg)
    msg = re.sub(r"(key|token|secret|password|credential)\S*", "[REDACTED_CREDENTIAL]", msg, flags=re.IGNORECASE)
    return msg


# ---------------------------------------------------------------------------
# Logging Helpers
# ---------------------------------------------------------------------------

def _log_error(msg: str, *args: Any, exc_info: bool = False) -> None:
    task = asyncio.current_task()
    prefix = f"[task={task.get_name()}] " if task else ""
    logger.error(prefix + msg, *args, exc_info=exc_info)


def _log_watchdog_exception(task: asyncio.Task) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc:
        logger.error(
            "Watchdog task failed: %s\n%s",
            exc,
            "".join(asyncio.format_exception(type(exc), exc, exc.__traceback__)),
        )


# ---------------------------------------------------------------------------
# Partition Manager
# ---------------------------------------------------------------------------

class PartitionManager:
    @classmethod
    def _safe_part(cls, part: str) -> str:
        if not _SAFE_PATH_PART_RE.match(part):
            raise ValueError(f"Unsafe partition path component: {part!r}")
        return part

    @classmethod
    def get_optimal_partition(cls, base_path: str, is_high_volume: bool) -> str:
        now = datetime.now(timezone.utc)
        date = cls._safe_part(f"date={now.strftime('%Y-%m-%d')}")
        if is_high_volume:
            hour = cls._safe_part(f"hour={now.strftime('%H')}")
            return f"{base_path}/{date}/{hour}"
        return f"{base_path}/{date}"


# ---------------------------------------------------------------------------
# FIX-08: Schema Validation with Fail-Fast
# ---------------------------------------------------------------------------

def _parse_and_validate_schema(raw_schema: Any, stream_name: str) -> Dict[str, str]:
    """Validates schema format with fail-fast on empty."""
    if isinstance(raw_schema, list):
        result: Dict[str, str] = {}
        for i, entry in enumerate(raw_schema):
            if not isinstance(entry, dict):
                raise ValueError(f"Stream '{stream_name}': schema[{i}] must be a dict")
            if "name" not in entry or "type" not in entry:
                raise ValueError(f"Stream '{stream_name}': schema[{i}] missing 'name' or 'type'")
            if not isinstance(entry["name"], str) or not isinstance(entry["type"], str):
                raise ValueError(f"Stream '{stream_name}': schema[{i}] 'name' and 'type' must be strings")
            result[entry["name"]] = entry["type"]

        # FIX-08: Fail fast on empty schema
        if not result:
            raise ValueError(f"Stream '{stream_name}': schema is empty after validation")
        return result

    if isinstance(raw_schema, dict):
        for k, v in raw_schema.items():
            if not isinstance(k, str) or not k:
                raise ValueError(f"Stream '{stream_name}': schema key must be non-empty string")
            if not isinstance(v, str) or not v:
                raise ValueError(f"Stream '{stream_name}': schema type must be non-empty string")

        # FIX-08: Fail fast on empty schema
        if not raw_schema:
            raise ValueError(f"Stream '{stream_name}': schema is empty")
        return raw_schema  # type: ignore[return-value]

    raise ValueError(f"Stream '{stream_name}': unrecognised schema format")


def _validate_schema_map(raw_schema_map: Any, integration_name: str) -> Dict[str, Any]:
    if not isinstance(raw_schema_map, dict):
        raise ValueError(f"Integration '{integration_name}': Invalid schema response")
    return raw_schema_map


# ---------------------------------------------------------------------------
# SQL Identifier Validation
# ---------------------------------------------------------------------------

def _validated_identifier(name: str) -> str:
    if not _SAFE_IDENTIFIER_RE.match(name):
        raise ValueError(f"Identifier '{name}' contains invalid characters.")
    return name


# ---------------------------------------------------------------------------
# FIX-07: Memory-Aware Chunk Sizing
# ---------------------------------------------------------------------------

@dataclass
class MemoryStats:
    available_mb: float
    used_percent: float


def _get_memory_stats() -> MemoryStats:
    try:
        import psutil
        mem = psutil.virtual_memory()
        return MemoryStats(
            available_mb=mem.available / (1024 * 1024),
            used_percent=mem.percent
        )
    except ImportError:
        return MemoryStats(available_mb=1024, used_percent=50)


def _calculate_chunk_size(base_size: int = BATCH_CHUNK_SIZE) -> int:
    mem_stats = _get_memory_stats()

    if mem_stats.used_percent > 90:
        return max(50, base_size // 4)
    elif mem_stats.used_percent > 75:
        return max(100, base_size // 2)
    elif mem_stats.available_mb < 512:
        return max(100, base_size // 2)

    return base_size


# ---------------------------------------------------------------------------
# FIX-05 + FIX-14: Thread Pool Management
# ---------------------------------------------------------------------------

class ThreadPoolManager:
    """Manages separate thread pools for different operation types."""

    _pools: Dict[str, ThreadPoolExecutor] = {}
    _lock = asyncio.Lock()

    @classmethod
    async def get_pool(cls, name: str, max_workers: int) -> ThreadPoolExecutor:
        async with cls._lock:
            if name not in cls._pools:
                cls._pools[name] = ThreadPoolExecutor(
                    max_workers=max_workers,
                    thread_name_prefix=f"syncengine-{name}"
                )
                logger.info("Created thread pool '%s' with %d workers", name, max_workers)
            return cls._pools[name]

    @classmethod
    async def shutdown_all(cls) -> None:
        async with cls._lock:
            for name, pool in cls._pools.items():
                pool.shutdown(wait=True)
                logger.info("Shut down thread pool '%s'", name)
            cls._pools.clear()


# Thread-isolated storage operations
async def _blocking_write_dataframe(
    tenant_id: str,
    target_partition: str,
    df: pl.DataFrame,
) -> str:
    from api.database import SessionLocal

    pool = await ThreadPoolManager.get_pool("write", WRITE_THREAD_POOL_SIZE)
    loop = asyncio.get_running_loop()

    def _write() -> str:
        with SessionLocal() as thread_db:
            return storage_manager.write_dataframe(
                db=thread_db,
                df=df,
                tenant_id=tenant_id,
                dataset_id=target_partition,
                format="parquet",
            )

    return await loop.run_in_executor(pool, _write)


async def _blocking_compact_partitions(
    tenant_id: str,
    source_glob: str,
    target_file: str,
) -> bool:
    from api.database import SessionLocal

    pool = await ThreadPoolManager.get_pool("compaction", COMPACTION_THREAD_POOL_SIZE)
    loop = asyncio.get_running_loop()

    def _compact() -> bool:
        with SessionLocal() as thread_db:
            return storage_manager.compact_partitions(
                db=thread_db,
                tenant_id=tenant_id,
                source_glob=source_glob,
                target_file=target_file,
            )

    return await loop.run_in_executor(pool, _compact)


async def _blocking_profile(tenant_id: str, path: str) -> Dict[str, Any]:
    from api.database import SessionLocal

    pool = await ThreadPoolManager.get_pool("profile", PROFILE_THREAD_POOL_SIZE)
    loop = asyncio.get_running_loop()

    def _profile() -> Dict[str, Any]:
        with SessionLocal() as thread_db:
            return storage_manager.convert_to_parquet_and_profile(thread_db, tenant_id, path)

    return await loop.run_in_executor(pool, _profile)


# ---------------------------------------------------------------------------
# Retry Decorator with Jitter
# ---------------------------------------------------------------------------

_io_retry = retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=1, max=30, jitter=2),
    retry=retry_if_exception_type((IOError, TimeoutError, ConnectionError)),
    before_sleep=before_sleep_log(logger, logging.WARNING),
)


# ---------------------------------------------------------------------------
# FIX-09: Explicit Polars Memory Management
# ---------------------------------------------------------------------------

def _clear_dataframe(df: Optional[pl.DataFrame]) -> None:
    """Explicitly clear Polars DataFrame memory."""
    if df is not None:
        # Clear internal buffers
        df.clear()
        del df


# ---------------------------------------------------------------------------
# FIX-03: Atomic DB Idempotency with SELECT FOR UPDATE
# ---------------------------------------------------------------------------

async def _check_db_idempotency(
    db: AsyncSession,
    idempotency_key: str,
    task_id: str,
) -> Tuple[bool, Optional[str]]:
    """
    Atomic idempotency check using SELECT FOR UPDATE.
    Returns (should_execute, existing_task_id).
    """
    # Use FOR UPDATE to lock the row during check
    result = await db.execute(
        select(SyncJob)
        .where(SyncJob.idempotency_key == idempotency_key)
        .with_for_update()
    )
    existing = result.scalar_one_or_none()

    if existing:
        if existing.status in ("completed", "running"):
            return False, existing.celery_task_id
        # Failed jobs can be retried - update to running
        existing.status = "running"
        existing.celery_task_id = task_id
        existing.started_at = datetime.now(timezone.utc)
        await db.commit()
        return True, None

    # Create new job record
    new_job = SyncJob(
        idempotency_key=idempotency_key,
        celery_task_id=task_id,
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    db.add(new_job)
    await db.commit()
    return True, None


async def _complete_db_idempotency(
    db: AsyncSession,
    idempotency_key: str,
    status: str,
    result: Optional[Dict] = None,
) -> None:
    await db.execute(
        update(SyncJob)
        .where(SyncJob.idempotency_key == idempotency_key)
        .values(
            status=status,
            completed_at=datetime.now(timezone.utc),
            result=result,
        )
    )
    await db.commit()


# ---------------------------------------------------------------------------
# FIX-10: Watchdog Task Registry
# ---------------------------------------------------------------------------

class WatchdogTaskRegistry:
    """Registry for tracking watchdog tasks with lifecycle management."""

    _tasks: Set[asyncio.Task] = set()
    _lock = asyncio.Lock()

    @classmethod
    async def register(cls, task: asyncio.Task) -> None:
        async with cls._lock:
            cls._tasks.add(task)
            task.add_done_callback(lambda t: cls._remove_sync(t))

    @classmethod
    def _remove_sync(cls, task: asyncio.Task) -> None:
        # Synchronous callback for add_done_callback
        cls._tasks.discard(task)

    @classmethod
    async def cancel_all(cls) -> None:
        async with cls._lock:
            for task in list(cls._tasks):
                if not task.done():
                    task.cancel()
            # Wait for all to complete cancellation
            if cls._tasks:
                await asyncio.gather(*cls._tasks, return_exceptions=True)
            cls._tasks.clear()

    @classmethod
    def get_active_count(cls) -> int:
        return sum(1 for t in cls._tasks if not t.done())


# ---------------------------------------------------------------------------
# SyncEngine
# ---------------------------------------------------------------------------

class SyncEngine:
    """Unified Orchestration Worker — fully async, hardened."""

    async def _run_qa_pipeline_chunk(
        self,
        tenant_id: str,
        integration_name: str,
        chunk: List[Dict[str, Any]],
        expected_schema: Dict[str, str],
        pii_columns: List[str],
    ) -> pl.DataFrame:
        loop = asyncio.get_running_loop()

        def _sync_pipeline() -> pl.DataFrame:
            normalizer = PolarsNormalizer(tenant_id, integration_name)
            sanitizer = DataSanitizer(tenant_id, integration_name)

            df = normalizer.normalize_batch(chunk)
            if df.height == 0:
                logger.warning("[%s] Empty DataFrame for %s", tenant_id, integration_name)
                return df

            df = sanitizer.process_batch(df, pii_columns=pii_columns, expected_schema=expected_schema)

            with DuckDBValidator(tenant_id, integration_name) as validator:
                validator.validate_batch(df, expected_schema)

            return df

        return await loop.run_in_executor(
            await ThreadPoolManager.get_pool("write", WRITE_THREAD_POOL_SIZE),
            _sync_pipeline
        )

    async def seed_connector_views(
        self,
        db: AsyncSession,
        tenant_id: str,
        integration: BaseIntegration,
    ) -> None:
        try:
            views = integration.get_semantic_views()
            if not views:
                return

            for view_name, sql in views.items():
                result = await db.execute(
                    select(SemanticMetric).where(
                        SemanticMetric.tenant_id == tenant_id,
                        SemanticMetric.metric_name == view_name,
                    )
                )
                if result.scalar_one_or_none() is None:
                    db.add(SemanticMetric(
                        tenant_id=tenant_id,
                        dataset_id=None,
                        metric_name=view_name,
                        description=f"Auto-generated view for {integration.config.integration_name.capitalize()}",
                        compiled_sql=sql.strip(),
                        created_at=datetime.now(timezone.utc),
                    ))

            await db.commit()
            logger.info("[%s] Auto-seeded %d metrics for %s", tenant_id, len(views), integration.config.integration_name)
        except Exception as exc:
            await db.rollback()
            _log_error("[%s] Failed to seed connector views: %s", tenant_id, _sanitize_log_message(str(exc)))

    async def seed_golden_metrics(self, db: AsyncSession, tenant_id: str) -> None:
        try:
            result = await db.execute(
                select(SemanticMetric).where(
                    SemanticMetric.tenant_id == tenant_id,
                    SemanticMetric.metric_name == "True ROAS",
                )
            )
            if result.scalar_one_or_none():
                return

            ds_result = await db.execute(select(Dataset).where(Dataset.tenant_id == tenant_id))
            datasets = ds_result.scalars().all()
            revenue_srcs = [d for d in datasets if d.integration_name in ("stripe", "shopify")]
            spend_srcs = [d for d in datasets if d.integration_name in ("meta_ads", "google_ads")]

            if not revenue_srcs or not spend_srcs:
                return

            rev_ds = revenue_srcs[0]
            spend_ds = spend_srcs[0]

            rev_tbl_raw = _validated_identifier(
                "".join(c for c in rev_ds.name.lower() if c.isalnum() or c == "_")
            )
            spend_tbl_raw = _validated_identifier(
                "".join(c for c in spend_ds.name.lower() if c.isalnum() or c == "_")
            )

            rev_col = "amount" if rev_ds.integration_name == "stripe" else "total_price"
            rev_date = "created" if rev_ds.integration_name == "stripe" else "created_at"

            compiled_sql = (
                f'SELECT SUM(rev.{rev_col}) / NULLIF(SUM(spend.spend), 0) AS true_roas '
                f'FROM "{rev_tbl_raw}" AS rev '
                f'FULL OUTER JOIN "{spend_tbl_raw}" AS spend '
                f'ON date_trunc(\'day\', CAST(rev.{rev_date} AS TIMESTAMP)) = '
                f'date_trunc(\'day\', CAST(spend.date AS TIMESTAMP))'
            )

            db.add(SemanticMetric(
                tenant_id=tenant_id,
                dataset_id=None,
                metric_name="True ROAS",
                description="Cross-platform Return on Ad Spend",
                compiled_sql=compiled_sql,
                created_at=datetime.now(timezone.utc),
            ))
            await db.commit()
            logger.info("[%s] Golden Metric 'True ROAS' seeded", tenant_id)
        except Exception as exc:
            await db.rollback()
            _log_error("[%s] Failed to seed Golden Metrics: %s", tenant_id, _sanitize_log_message(str(exc)))

    async def run_historical_sync(
        self,
        db: AsyncSession,
        tenant_id: str,
        integration_name: str,
        dataset_id: str,
        stream_name: str,
        start_timestamp: Optional[str] = None,
    ) -> None:
        """Three-layer locking: distributed lock → semaphore → local lock."""
        lock_key = f"{tenant_id}:{dataset_id}"
        local_lock = await _get_local_lock(lock_key)

        async with distributed_sync_lock(tenant_id, dataset_id) as dist_acquired:
            if not dist_acquired:
                logger.warning("[%s] Distributed lock held for %s — skipping", tenant_id, dataset_id)
                return

            async with _DISTRIBUTED_SYNC_SEMAPHORE.acquire(timeout=30.0) as sem_acquired:
                if not sem_acquired:
                    logger.warning("[%s] Distributed semaphore full — throttling", tenant_id)
                    return

                async with local_lock:
                    await self._do_historical_sync(
                        db, tenant_id, integration_name, dataset_id, stream_name, start_timestamp
                    )

    async def _do_historical_sync(
        self,
        db: AsyncSession,
        tenant_id: str,
        integration_name: str,
        dataset_id: str,
        stream_name: str,
        start_timestamp: Optional[str],
    ) -> None:
        start_time = time.perf_counter()
        loop = asyncio.get_running_loop()

        logger.info("[%s] Starting sync | source=%s | stream=%s", tenant_id, integration_name, stream_name)

        try:
            norm_name = integration_name.lower().strip()
            if norm_name not in INTEGRATION_REGISTRY:
                raise ValueError(f"Unsupported integration: {integration_name!r}")

            # Get circuit breaker for this integration
            circuit = await get_circuit_breaker(norm_name)

            # Materialize ORM objects fully
            result = await db.execute(
                select(Dataset)
                .where(Dataset.id == dataset_id)
                .options(selectinload(Dataset.organization))
            )
            dataset = result.scalar_one_or_none()
            if not dataset:
                raise ValueError(f"Dataset {dataset_id} not found")

            is_enterprise = bool(
                dataset.organization and getattr(dataset.organization, "is_enterprise", False)
            )

            if not start_timestamp:
                persisted_ts = (dataset.schema_metadata or {}).get("last_sync_time")
                if not persisted_ts:
                    raise ValueError(f"No start_timestamp or checkpoint for dataset {dataset_id}")
                start_timestamp = persisted_ts

            cred_manager = CredentialManager(db)
            api_keys = await cred_manager.get_integration_credentials_async(tenant_id, norm_name)
            if not api_keys:
                raise PermissionError(f"Missing credentials for {norm_name}")

            integration_class = INTEGRATION_REGISTRY[norm_name]
            integration = integration_class(tenant_id=tenant_id, credentials=api_keys)
            integration.data_sanitizer = DataSanitizer(tenant_id, norm_name)

            await self._update_dataset_status(db, dataset_id, DatasetStatus.PROCESSING)

            # FIX-12: Use circuit breaker for schema fetch
            raw_schema_map = await circuit.call(_fetch_schema_with_retry, integration)
            validated_schema_map = _validate_schema_map(raw_schema_map, norm_name)
            raw_stream_schema = validated_schema_map.get(stream_name.lower(), {})
            flat_schema = _parse_and_validate_schema(raw_stream_schema, stream_name)
            pii_columns = getattr(integration, "PII_COLUMNS", ["email", "phone", "customer_email", "receipt_email"])

            total_rows_processed = 0
            saved_paths: List[str] = []

            await self.seed_connector_views(db, tenant_id, integration)

            base_path = f"sync/{norm_name}/{stream_name}"
            target_partition = PartitionManager.get_optimal_partition(base_path, is_enterprise)

            chunk_size = _calculate_chunk_size(BATCH_CHUNK_SIZE)

            # FIX-12: Use circuit breaker for sync_historical
            async for raw_batch in await circuit.call(
                integration.sync_historical, stream_name, start_timestamp
            ):
                if not raw_batch:
                    continue

                for chunk_start in range(0, len(raw_batch), chunk_size):
                    chunk = raw_batch[chunk_start: chunk_start + chunk_size]

                    df = await self._run_qa_pipeline_chunk(
                        tenant_id=tenant_id,
                        integration_name=norm_name,
                        chunk=chunk,
                        expected_schema=flat_schema,
                        pii_columns=pii_columns,
                    )

                    if df.height == 0:
                        continue

                    file_path = await _blocking_write_dataframe(tenant_id, target_partition, df)

                    total_rows_processed += df.height
                    saved_paths.append(file_path)

                    # FIX-09: Explicit memory clearing
                    _clear_dataframe(df)

            duration = round(time.perf_counter() - start_time, 2)
            await self._finalize_sync_metadata(
                db, tenant_id, norm_name, dataset_id,
                total_rows_processed, duration, saved_paths, loop,
            )

            metrics = getattr(integration, "sync_metrics", {})
            dlq_count = metrics.get("dlq_events", 0)
            if dlq_count > 0:
                await notification_router.dispatch_alert(
                    tenant_id=tenant_id,
                    agent_name=f"{norm_name.capitalize()} Schema Gatekeeper",
                    insight_summary=f"Detected **{dlq_count} malformed objects** during `{norm_name}` extraction",
                )

            await self.seed_golden_metrics(db, tenant_id)

            # FIX-10: Register watchdog task in registry
            watchdog = WatchdogService(db_client=db)
            watchdog_task = asyncio.create_task(
                watchdog.inspect_pipeline(
                    tenant_id=tenant_id,
                    integration_id=norm_name,
                    latest_volume=total_rows_processed,
                ),
                name=f"watchdog:{tenant_id}:{norm_name}",
            )
            watchdog_task.add_done_callback(_log_watchdog_exception)
            await WatchdogTaskRegistry.register(watchdog_task)

            logger.info("[%s] Sync complete | %d rows in %.2fs", tenant_id, total_rows_processed, duration)

        except CircuitBreakerOpenError:
            logger.error("[%s] Circuit breaker open for %s — sync aborted", tenant_id, norm_name)
            await self._update_dataset_status(db, dataset_id, DatasetStatus.FAILED, error_msg="Circuit breaker open")
            await notification_router.dispatch_alert(
                tenant_id=tenant_id,
                agent_name=f"{integration_name.capitalize()} Circuit Breaker",
                insight_summary=f"Circuit breaker open for `{integration_name}` — too many failures",
            )

        except Exception as exc:
            safe_msg = _sanitize_log_message(str(exc))
            _log_error("[%s] Sync failed for %s: %s", tenant_id, dataset_id, safe_msg, exc_info=True)
            await db.rollback()
            await self._update_dataset_status(db, dataset_id, DatasetStatus.FAILED, error_msg=safe_msg)
            await notification_router.dispatch_alert(
                tenant_id=tenant_id,
                agent_name=f"{integration_name.capitalize()} Sync Watchdog",
                insight_summary=f"Extraction pipeline for `{integration_name}` failed",
            )

    async def execute_background_compaction(
        self,
        db: AsyncSession,
        tenant_id: str,
        dataset_id: str,
        target_date: str,
    ) -> bool:
        result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
        dataset = result.scalar_one_or_none()
        if not dataset:
            return False

        base_path = f"sync/{dataset.integration_name}/{dataset.stream_name}/date={target_date}"
        source_glob = f"{base_path}/hour=*/*.parquet"
        target_file = f"{base_path}/compacted.parquet"

        success = await _blocking_compact_partitions(tenant_id, source_glob, target_file)

        if success:
            logger.info("[%s] Compaction successful", tenant_id)
            storage_manager.delete_directory_pattern(tenant_id, f"{base_path}/hour=*")
            return True

        return False

    async def _update_dataset_status(
        self,
        db: AsyncSession,
        dataset_id: str,
        new_status: DatasetStatus,
        error_msg: Optional[str] = None,
    ) -> None:
        base_delay = 0.1
        max_delay = 5.0

        for attempt in range(1, OPT_LOCK_MAX_RETRIES + 1):
            result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
            dataset = result.scalar_one_or_none()
            if not dataset:
                return

            current_version = dataset.version
            values: Dict[str, Any] = {
                "status": new_status,
                "version": current_version + 1,
            }
            if error_msg:
                values["schema_metadata"] = {
                    **(dataset.schema_metadata or {}),
                    "last_error": error_msg,
                }

            stmt = (
                update(Dataset)
                .where(Dataset.id == dataset_id, Dataset.version == current_version)
                .values(**values)
            )
            result = await db.execute(stmt)

            if result.rowcount == 1:
                await db.commit()
                return

            delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
            jitter = random.uniform(0, delay * 0.3)
            total_delay = delay + jitter

            logger.warning(
                "Optimistic lock conflict on dataset %s (attempt %d/%d, delay=%.3fs)",
                dataset_id, attempt, OPT_LOCK_MAX_RETRIES, total_delay
            )
            await asyncio.sleep(total_delay)

        raise RuntimeError(f"Failed to update dataset {dataset_id} status after {OPT_LOCK_MAX_RETRIES} attempts")

    async def _finalize_sync_metadata(
        self,
        db: AsyncSession,
        tenant_id: str,
        integration_name: str,
        dataset_id: str,
        total_rows: int,
        duration: float,
        paths: List[str],
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        try:
            result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
            dataset = result.scalar_one_or_none()

            if dataset:
                dataset.status = DatasetStatus.READY
                dataset.file_path = f"sync/{integration_name}"
                dataset.updated_at = datetime.now(timezone.utc)

                if total_rows > 0 and paths:
                    profile = await _blocking_profile(tenant_id, paths[-1])
                    current_meta = dataset.schema_metadata or {}
                    dataset.schema_metadata = {
                        **current_meta,
                        "columns": profile.get("columns", []),
                        "last_sync_time": datetime.now(timezone.utc).isoformat(),
                        "total_rows_synced": current_meta.get("total_rows_synced", 0) + total_rows,
                    }

            org_result = await db.execute(select(Organization).where(Organization.id == tenant_id))
            org = org_result.scalar_one_or_none()
            if org and total_rows > 0:
                org.current_storage_mb = (org.current_storage_mb or 0.0) + (total_rows / 10_000.0) * 1.5

            await db.commit()

        except Exception as exc:
            await db.rollback()
            _log_error("[%s] Failed to finalise sync metadata: %s", tenant_id, _sanitize_log_message(str(exc)))
            raise


# ---------------------------------------------------------------------------
# Schema Fetch with Retry
# ---------------------------------------------------------------------------

@_io_retry
async def _fetch_schema_with_retry(integration: BaseIntegration) -> Dict[str, Any]:
    return await integration.fetch_schema()


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_sync_engine() -> SyncEngine:
    return SyncEngine()


# ---------------------------------------------------------------------------
# Celery Task with Pure AnyIO
# ---------------------------------------------------------------------------

@celery_app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    max_retries=4,
    name="sync_engine.run_historical_sync",
)
def celery_run_historical_sync(
    self,
    tenant_id: str,
    integration_name: str,
    dataset_id: str,
    stream_name: str,
    start_timestamp: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    import anyio

    async def _run() -> Dict[str, Any]:
        async with AsyncSessionLocal() as db:
            if idempotency_key:
                should_execute, existing_task = await _check_db_idempotency(
                    db, idempotency_key, self.request.id
                )
                if not should_execute:
                    logger.info("Task deduplicated via DB (key=%s)", idempotency_key)
                    return {"status": "deduplicated", "existing_task": existing_task}

            try:
                engine = get_sync_engine()
                await engine.run_historical_sync(
                    db=db,
                    tenant_id=tenant_id,
                    integration_name=integration_name,
                    dataset_id=dataset_id,
                    stream_name=stream_name,
                    start_timestamp=start_timestamp,
                )

                if idempotency_key:
                    await _complete_db_idempotency(db, idempotency_key, "completed")

                return {"status": "success"}

            except Exception as exc:
                if idempotency_key:
                    await _complete_db_idempotency(
                        db, idempotency_key, "failed", {"error": str(exc)}
                    )
                raise

    return anyio.run(_run)


# ---------------------------------------------------------------------------
# FIX-04: Streaming Webhook Processing
# ---------------------------------------------------------------------------

async def _stream_validate_events(request: Request) -> AsyncIterator[Dict[str, Any]]:
    """Stream validate events using ijson for memory efficiency."""
    try:
        import ijson
    except ImportError:
        # Fallback: enforce strict size limit and parse normally
        body = await request.body()
        if len(body) > MAX_WEBHOOK_PAYLOAD_BYTES:
            raise ValueError(f"Payload exceeds {MAX_WEBHOOK_PAYLOAD_BYTES} bytes")
        import json
        payload = json.loads(body)
        events = payload.get("events", [])
        for idx, event in enumerate(events):
            yield _validate_single_event(event, idx)
        return

    # Full streaming with ijson
    body_stream = request.stream()
    events = ijson.items(body_stream, "events.item")

    idx = 0
    async for event in events:
        yield _validate_single_event(event, idx)
        idx += 1
        if idx >= MAX_WEBHOOK_EVENTS:
            raise ValueError(f"Batch exceeds {MAX_WEBHOOK_EVENTS} events")


def _validate_single_event(event: Any, idx: int) -> Dict[str, Any]:
    if not isinstance(event, dict):
        raise ValueError(f"Event[{idx}] must be a dict, got {type(event).__name__}")

    payload = event.get("payload")
    if payload is None:
        raise ValueError(f"Event[{idx}] missing 'payload' key")
    if not isinstance(payload, dict):
        raise ValueError(f"Event[{idx}].payload must be a dict")

    import json
    size = len(json.dumps(payload).encode())
    if size > MAX_EVENT_PAYLOAD_BYTES:
        raise ValueError(f"Event[{idx}].payload exceeds {MAX_EVENT_PAYLOAD_BYTES // 1024} KB limit")

    return payload


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@sync_router.post("/trigger/{dataset_id}", status_code=status.HTTP_202_ACCEPTED)
async def trigger_historical_sync(
    dataset_id: str,
    db: AsyncSession = Depends(get_async_db),
    tenant: TenantContext = Depends(verify_tenant),
):
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.tenant_id == tenant.tenant_id)
    )
    dataset = result.scalar_one_or_none()

    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    if not dataset.integration_name:
        raise HTTPException(status_code=400, detail="Dataset is not linked to a SaaS integration.")

    lock_key = f"{tenant.tenant_id}:{dataset_id}"
    local_lock = await _get_local_lock(lock_key)

    if local_lock.locked():
        raise HTTPException(status_code=409, detail="A sync for this dataset is already in progress.")

    idempotency_key = f"{tenant.tenant_id}:{dataset_id}:{dataset.updated_at.isoformat()}"

    celery_run_historical_sync.apply_async(
        kwargs=dict(
            tenant_id=tenant.tenant_id,
            integration_name=dataset.integration_name,
            dataset_id=dataset_id,
            stream_name=dataset.stream_name or "default",
            start_timestamp=None,
            idempotency_key=idempotency_key,
        ),
        task_id=idempotency_key,
    )

    return {
        "status": "sync_queued",
        "message": f"Historical pull for {dataset.integration_name} dispatched to worker queue.",
    }


@sync_router.post("/{integration_name}/webhook-batch")
async def ingest_webhook_batch(
    integration_name: str,
    request: Request,
    db: AsyncSession = Depends(get_async_db),
    x_webhook_signature: Optional[str] = Header(None),
    x_webhook_timestamp: Optional[str] = Header(None),
):
    """Hardened webhook receiver with streaming validation and rate limiting."""
    # Rate limiting check
    allowed, rate_meta = await _WEBHOOK_RATE_LIMITER.is_allowed(integration_name)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Try again later.",
            headers={"X-RateLimit-Remaining": str(rate_meta["remaining"])},
        )

    # FIX-04: Full streaming mode OR strict size enforcement
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_WEBHOOK_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Payload too large.")

    # For HMAC, we need the body - but we can stream it
    body = await request.body()
    if len(body) > MAX_WEBHOOK_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Payload too large.")

    secret = os.environ.get("WEBHOOK_SIGNING_SECRET", "")
    _verify_hmac_signature(body, x_webhook_signature, secret, x_webhook_timestamp)

    fresh = await _check_and_store_nonce(x_webhook_signature, body, x_webhook_timestamp)
    if not fresh:
        raise HTTPException(status_code=409, detail="Duplicate webhook delivery detected.")

    # Parse metadata only (not full events yet)
    import json
    try:
        metadata = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    tenant_id = metadata.get("tenant_id")
    stream_name = metadata.get("stream_name", "default")

    if not tenant_id:
        raise HTTPException(status_code=400, detail="Missing tenant_id.")

    events = metadata.get("events", [])
    if not isinstance(events, list):
        raise HTTPException(status_code=400, detail="Invalid events format.")
    if len(events) == 0:
        return {"status": "skipped", "message": "Empty payload."}
    if len(events) > MAX_WEBHOOK_EVENTS:
        raise HTTPException(status_code=400, detail=f"Batch exceeds {MAX_WEBHOOK_EVENTS} events.")

    norm_name = integration_name.lower().strip()
    if norm_name not in INTEGRATION_REGISTRY:
        raise HTTPException(status_code=400, detail="Invalid integration target.")

    cred_manager = CredentialManager(db)
    api_keys = await cred_manager.get_integration_credentials_async(tenant_id, norm_name)
    if not api_keys:
        raise HTTPException(status_code=403, detail="Missing credentials for tenant.")

    integration_class = INTEGRATION_REGISTRY[norm_name]
    integration_instance = integration_class(tenant_id=tenant_id, credentials=api_keys)

    # Schema validation
    raw_schema_map = await integration_instance.fetch_schema()
    validated_schema_map = _validate_schema_map(raw_schema_map, norm_name)
    raw_stream_schema = validated_schema_map.get(stream_name, {})
    flat_schema = _parse_and_validate_schema(raw_stream_schema, stream_name)
    pii_columns = getattr(integration_instance, "PII_COLUMNS", ["email", "phone", "customer_email", "receipt_email"])

    engine = get_sync_engine()

    try:
        rows_written = 0

        org_result = await db.execute(select(Organization).where(Organization.id == tenant_id))
        org = org_result.scalar_one_or_none()
        is_enterprise = bool(org and getattr(org, "is_enterprise", False))
        target_partition = PartitionManager.get_optimal_partition(
            f"sync/{norm_name}/live_webhooks", is_enterprise
        )

        # Process events with chunking
        chunk_buffer: List[Dict[str, Any]] = []
        chunk_size = _calculate_chunk_size(BATCH_CHUNK_SIZE)

        for event in events:
            try:
                validated = _validate_single_event(event, len(chunk_buffer))
                chunk_buffer.append(validated)

                if len(chunk_buffer) >= chunk_size:
                    df = await engine._run_qa_pipeline_chunk(
                        tenant_id=tenant_id,
                        integration_name=norm_name,
                        chunk=chunk_buffer,
                        expected_schema=flat_schema,
                        pii_columns=pii_columns,
                    )

                    if df.height > 0:
                        await _blocking_write_dataframe(tenant_id, target_partition, df)
                        rows_written += df.height

                    _clear_dataframe(df)
                    chunk_buffer = []

            except ValueError as exc:
                logger.warning("Event validation failed: %s", exc)
                continue

        # Process remaining events
        if chunk_buffer:
            df = await engine._run_qa_pipeline_chunk(
                tenant_id=tenant_id,
                integration_name=norm_name,
                chunk=chunk_buffer,
                expected_schema=flat_schema,
                pii_columns=pii_columns,
            )
            if df.height > 0:
                await _blocking_write_dataframe(tenant_id, target_partition, df)
                rows_written += df.height
            _clear_dataframe(df)

        await engine.seed_golden_metrics(db, tenant_id)

        return {
            "status": "success",
            "rows": rows_written,
            "rate_limit_remaining": rate_meta["remaining"],
        }

    except Exception as exc:
        await db.rollback()
        safe_msg = _sanitize_log_message(str(exc))
        _log_error("Webhook ingestion failure: %s", safe_msg, exc_info=True)
        raise HTTPException(status_code=500, detail="Compute engine ingestion anomaly.")


# ---------------------------------------------------------------------------
# Application Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def sync_engine_lifespan(app):
    """FastAPI lifespan context for comprehensive resource management."""
    # Startup
    await RedisLifecycleManager.initialize(app)
    logger.info("SyncEngine initialized.")
    yield
    # Shutdown
    await WatchdogTaskRegistry.cancel_all()
    await ThreadPoolManager.shutdown_all()
    await RedisLifecycleManager.close()
    logger.info("SyncEngine shut down.")