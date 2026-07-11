import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger(__name__)


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
            current_count = self._increment(key, safe_window_seconds)
        except Exception as exc:
            logger.warning(
                "tenant_quota_counter_failed tenant_id=%s counter_name=%s backend=%s error_type=%s error=%s",
                safe_tenant_id,
                safe_counter_name,
                "redis" if self.redis_client else "memory",
                exc.__class__.__name__,
                exc,
            )
            current_count = self._increment_memory(key, safe_window_seconds)

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

    def _increment(self, key: str, window_seconds: int) -> int:
        client = self.redis_client or _redis_client_from_env()
        if client is None:
            return self._increment_memory(key, window_seconds)

        current_count = int(client.incr(key))
        if current_count == 1:
            client.expire(key, window_seconds)
        return current_count

    @classmethod
    def _increment_memory(cls, key: str, window_seconds: int) -> int:
        now = time.time()
        expires_at = now + window_seconds
        with cls._memory_lock:
            current_count, current_expires_at = cls._memory_counts.get(key, (0, expires_at))
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


_redis_client: RedisLike | None = None


def _redis_client_from_env() -> RedisLike | None:
    global _redis_client

    if _redis_client is not None:
        return _redis_client

    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None

    try:
        import redis

        _redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
    except Exception as exc:
        logger.warning(
            "tenant_quota_redis_unavailable redis_url_configured=%s error_type=%s error=%s",
            True,
            exc.__class__.__name__,
            exc,
        )
        return None

    return _redis_client


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
