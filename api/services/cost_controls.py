import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger(__name__)

LOCAL_QUOTA_MAX_KEYS = max(1, int(os.getenv("ARCLI_LOCAL_QUOTA_MAX_KEYS", "10000")))
REDIS_MAX_CONNECTIONS = max(1, int(os.getenv("ARCLI_QUOTA_REDIS_MAX_CONNECTIONS", "4")))


class RedisLike(Protocol):
    def incr(self, name: str) -> int: ...
    def expire(self, name: str, time: int) -> bool: ...


@dataclass(frozen=True)
class UsageDecision:
    allowed: bool
    tenant_id: str
    counter_name: str
    current_count: int
    limit: int
    window_seconds: int
    rejection_reason: str | None = None


class TenantQuotaGuard:
    """
    Lightweight tenant usage limiter for expensive or burst-sensitive paths.

    Uses Redis when REDIS_URL is configured and falls back to a process-local
    counter for development/test contexts. This intentionally avoids any
    telemetry framework while keeping cost spikes visible and enforceable.
    """

    _memory_lock = threading.Lock()
    _memory_counts: dict[str, tuple[int, float]] = {}

    def __init__(self, redis_client: RedisLike | None = None) -> None:
        self.redis_client = redis_client

    def check_and_increment(
        self,
        *,
        tenant_id: str | None,
        counter_name: str,
        limit: int,
        window_seconds: int,
    ) -> UsageDecision:
        safe_tenant_id = self._safe_tenant_id(tenant_id)
        safe_counter_name = self._safe_counter_name(counter_name)
        safe_limit = max(1, int(limit))
        safe_window_seconds = max(1, int(window_seconds))
        key = f"arcli:quota:{safe_tenant_id}:{safe_counter_name}:{int(time.time() // safe_window_seconds)}"

        try:
            current_count = self._increment(
                key,
                safe_window_seconds,
                reject_count=safe_limit + 1,
            )
        except Exception as exc:
            logger.warning(
                "tenant_quota_counter_failed tenant_id=%s counter_name=%s backend=%s error_type=%s error=%s",
                safe_tenant_id,
                safe_counter_name,
                "redis" if self.redis_client else "memory",
                exc.__class__.__name__,
                exc,
            )
            current_count = self._increment_memory(
                key,
                safe_window_seconds,
                reject_count=safe_limit + 1,
            )

        allowed = current_count <= safe_limit
        decision = UsageDecision(
            allowed=allowed,
            tenant_id=safe_tenant_id,
            counter_name=safe_counter_name,
            current_count=current_count,
            limit=safe_limit,
            window_seconds=safe_window_seconds,
            rejection_reason=None if allowed else "tenant_quota_exceeded",
        )

        if not allowed:
            logger.warning(
                "tenant_quota_exceeded tenant_id=%s counter_name=%s current_count=%s limit=%s window_seconds=%s rejection_reason=%s",
                decision.tenant_id,
                decision.counter_name,
                decision.current_count,
                decision.limit,
                decision.window_seconds,
                decision.rejection_reason,
            )

        return decision

    def _increment(
        self,
        key: str,
        window_seconds: int,
        *,
        reject_count: int,
    ) -> int:
        client = self.redis_client
        owns_client = client is None
        if client is None:
            client = _redis_client_from_env()
        if client is None:
            return self._increment_memory(
                key,
                window_seconds,
                reject_count=reject_count,
            )

        try:
            current_count = int(client.incr(key))
            if current_count == 1:
                client.expire(key, window_seconds)
            return current_count
        finally:
            if owns_client:
                _close_redis_client(client)

    @classmethod
    def _increment_memory(
        cls,
        key: str,
        window_seconds: int,
        *,
        reject_count: int,
    ) -> int:
        now = time.monotonic()
        expires_at = now + window_seconds
        with cls._memory_lock:
            expired_keys = [
                old_key
                for old_key, (_, old_expires_at) in cls._memory_counts.items()
                if old_expires_at <= now
            ]
            for old_key in expired_keys:
                del cls._memory_counts[old_key]

            existing = cls._memory_counts.get(key)
            if existing is None and len(cls._memory_counts) >= LOCAL_QUOTA_MAX_KEYS:
                logger.error(
                    "tenant_quota_memory_capacity_reached max_keys=%s",
                    LOCAL_QUOTA_MAX_KEYS,
                )
                return reject_count

            current_count, current_expires_at = existing or (0, expires_at)
            if current_expires_at <= now:
                current_count = 0
                current_expires_at = expires_at

            current_count += 1
            cls._memory_counts[key] = (current_count, current_expires_at)
            return current_count

    @staticmethod
    def _safe_tenant_id(tenant_id: str | None) -> str:
        candidate = (tenant_id or "unknown").strip()
        return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in candidate)[:128]

    @staticmethod
    def _safe_counter_name(counter_name: str) -> str:
        candidate = counter_name.strip() or "unknown"
        return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in candidate)[:96]


def _redis_client_from_env() -> RedisLike | None:
    """Create a bounded quota client for one counter operation.

    A quota check is small and infrequent relative to an LLM request.  Closing
    this short-lived client prevents idle workers from retaining an additional
    Redis pool between jobs.
    """
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None

    try:
        import redis

        return redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            max_connections=REDIS_MAX_CONNECTIONS,
            socket_connect_timeout=2,
            socket_timeout=2,
            health_check_interval=30,
        )
    except Exception as exc:
        logger.warning(
            "tenant_quota_redis_unavailable redis_url_configured=%s error_type=%s error=%s",
            True,
            exc.__class__.__name__,
            exc,
        )
        return None

def _close_redis_client(client: RedisLike) -> None:
    close = getattr(client, "close", None)
    try:
        if callable(close):
            close()
    finally:
        connection_pool = getattr(client, "connection_pool", None)
        disconnect = getattr(connection_pool, "disconnect", None)
        if callable(disconnect):
            disconnect()


def env_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        parsed = int(raw_value)
    except ValueError:
        logger.warning(
            "invalid_integer_env name=%s value=%s default=%s",
            name,
            raw_value,
            default,
        )
        return default

    return parsed if parsed > 0 else default


def env_float(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        parsed = float(raw_value)
    except ValueError:
        logger.warning(
            "invalid_float_env name=%s value=%s default=%s",
            name,
            raw_value,
            default,
        )
        return default

    return parsed if parsed >= 0 else default
