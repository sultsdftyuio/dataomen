import logging
import threading
import time
import uuid
from typing import Any, Dict, Optional

import dramatiq
import redis
import resend
from dramatiq.brokers.redis import RedisBroker
from redis.exceptions import ConnectionError as RedisConnectionError, RedisError, TimeoutError as RedisTimeoutError
from supabase import create_client, Client, ClientOptions
from supabase.lib.client_options import ClientOptions as SupabaseClientOptions

from recovery_models import (
    CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CIRCUIT_BREAKER_HALF_OPEN_LOCK_TTL,
    CIRCUIT_BREAKER_REDIS_KEY,
    CIRCUIT_BREAKER_TIMEOUT_SECONDS,
    METRICS,
    REDIS_URL,
    RESEND_API_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_TIMEOUT_SEC,
    SUPABASE_URL,
    CircuitBreakerState,
)

logger = logging.getLogger(__name__)


# ==========================================
# BROKER SETUP
# ==========================================

redis_broker = RedisBroker(url=REDIS_URL)
dramatiq.set_broker(redis_broker)


# ==========================================
# REDIS CLIENT
# ==========================================

_redis_client: Optional[redis.Redis] = None


def get_redis_client() -> redis.Redis:
    """Return shared Redis client (lazily initialized)."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(REDIS_URL, decode_responses=False)
    return _redis_client


# ==========================================
# RESEND CONFIGURATION
# ==========================================

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
else:
    logger.warning("resend_api_key_missing")


# ==========================================
# SUPABASE CLIENT (Thread-local)
# ==========================================

_thread_local = threading.local()


def _cleanup_thread_local_supabase() -> None:
    """Remove Supabase client from thread-local storage."""
    if hasattr(_thread_local, "supabase_client"):
        try:
            del _thread_local.supabase_client
        except AttributeError:
            pass


def get_supabase_client() -> Optional[Client]:
    """
    Return a thread-local Supabase client.
    Each thread gets its own client to avoid connection sharing issues.
    """
    if hasattr(_thread_local, "supabase_client"):
        return _thread_local.supabase_client

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.critical("supabase_credentials_missing_service_role")
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY and URL are required for workers.")

    options = SupabaseClientOptions(
        postgrest_client_timeout=SUPABASE_TIMEOUT_SEC,
    )
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, options=options)
    _thread_local.supabase_client = client
    return client


def reset_supabase_client() -> None:
    """Force recreation of the Supabase client on next call (useful for testing/hot-reload)."""
    _cleanup_thread_local_supabase()


# ==========================================
# CIRCUIT BREAKER (Redis-backed, with atomic operations)
# ==========================================

# Lua script for atomic failure recording + state check.
# Prevents race where multiple workers observe failures < threshold simultaneously.
_CIRCUIT_BREAKER_LUA = """
local failures_key = KEYS[1]
local state_key = KEYS[2]
local last_failure_key = KEYS[3]
local threshold = tonumber(ARGV[1])
local now = ARGV[2]

local failures = redis.call("INCR", failures_key)
redis.call("SET", last_failure_key, now)

if failures >= threshold then
    redis.call("SET", state_key, "OPEN")
    return {failures, "OPEN"}
end

return {failures, "CLOSED"}
"""


class CircuitBreaker:
    """
    Redis-backed circuit breaker for the email provider.

    States:
        CLOSED    - Normal operation.
        OPEN      - Failure threshold reached; fail fast.
        HALF_OPEN - After timeout, ONE probe request is allowed (enforced via SET NX lock).

    Improvements:
        - Atomic failure recording via Lua script (eliminates race on threshold check).
        - Single-probe enforcement in HALF_OPEN (SET NX lock prevents thundering herd).
        - Richer metrics (probe_success, probe_failure, closed transitions).
    """

    def __init__(
        self,
        key: str,
        failure_threshold: int,
        timeout_seconds: int,
        half_open_lock_ttl_seconds: int = 30,
    ):
        self._redis = get_redis_client()
        self._state_key = f"{key}:state"
        self._failures_key = f"{key}:failures"
        self._last_failure_key = f"{key}:last_failure"
        self._half_open_lock_key = f"{key}:half_open_lock"
        self._failure_threshold = failure_threshold
        self._timeout_seconds = timeout_seconds
        self._half_open_lock_ttl = half_open_lock_ttl_seconds
        self._lua_sha: Optional[str] = None

    def _get_lua_sha(self) -> str:
        """Load Lua script into Redis and cache its SHA."""
        if self._lua_sha is None:
            self._lua_sha = self._redis.script_load(_CIRCUIT_BREAKER_LUA)
        return self._lua_sha

    def is_open(self) -> bool:
        """
        Check if circuit breaker is OPEN (fail-fast).
        If OPEN has timed out, transition to HALF_OPEN and compete for probe lock.
        Only the lock winner is allowed through; others continue failing fast.
        """
        try:
            state_bytes = self._redis.get(self._state_key)
            state = state_bytes.decode() if isinstance(state_bytes, bytes) else (state_bytes or CircuitBreakerState.CLOSED)

            if state == CircuitBreakerState.OPEN:
                last_failure_bytes = self._redis.get(self._last_failure_key)
                if last_failure_bytes:
                    last_failure_time = float(
                        last_failure_bytes.decode() if isinstance(last_failure_bytes, bytes) else last_failure_bytes
                    )
                    if time.time() - last_failure_time >= self._timeout_seconds:
                        # Timeout elapsed — try to become the single probe.
                        return not self._acquire_probe_lock()
                return True

            if state == CircuitBreakerState.HALF_OPEN:
                # In half-open, only the lock holder proceeds.
                return not self._acquire_probe_lock()

            return False

        except (RedisConnectionError, RedisTimeoutError) as exc:
            logger.warning("circuit_breaker_check_redis_error error=%s", exc)
            # Fail-safe: if Redis is unreachable, allow the request through.
            return False
        except RedisError as exc:
            logger.warning("circuit_breaker_check_failed error=%s", exc)
            return False

    def _acquire_probe_lock(self) -> bool:
        """
        Try to acquire the exclusive half-open probe lock.
        Returns True if this worker should be the probe.
        """
        try:
            worker_id = f"{uuid.uuid4()}:{threading.current_thread().ident}"
            acquired = self._redis.set(
                self._half_open_lock_key,
                worker_id,
                nx=True,  # Only set if not exists
                ex=self._half_open_lock_ttl,
            )
            if acquired:
                self._redis.set(self._state_key, CircuitBreakerState.HALF_OPEN)
                METRICS.increment("recovery.circuit_breaker.half_open")
                logger.info("circuit_breaker_probe_acquired key=%s worker=%s", self._state_key, worker_id)
            return bool(acquired)
        except (RedisConnectionError, RedisTimeoutError, RedisError) as exc:
            logger.warning("circuit_breaker_probe_lock_failed error=%s", exc)
            # If we can't acquire the lock, assume someone else did.
            return False

    def record_success(self) -> None:
        """Record a successful call — resets circuit to CLOSED."""
        try:
            state_bytes = self._redis.get(self._state_key)
            state = state_bytes.decode() if isinstance(state_bytes, bytes) else (state_bytes or "")

            pipe = self._redis.pipeline()
            pipe.set(self._state_key, CircuitBreakerState.CLOSED)
            pipe.delete(self._failures_key)
            pipe.delete(self._last_failure_key)
            pipe.delete(self._half_open_lock_key)
            pipe.execute()

            if state == CircuitBreakerState.HALF_OPEN:
                METRICS.increment("recovery.circuit_breaker.probe_success")

            METRICS.increment("recovery.circuit_breaker.closed")
            logger.info("circuit_breaker_closed key=%s", self._state_key)
        except (RedisConnectionError, RedisTimeoutError, RedisError) as exc:
            logger.warning("circuit_breaker_success_record_failed error=%s", exc)

    def record_failure(self) -> None:
        """
        Record a failed call using atomic Lua script.
        Returns immediately; the Lua script handles threshold checking and state transition.
        """
        try:
            sha = self._get_lua_sha()
            now = str(time.time())
            result = self._redis.evalsha(
                sha,
                3,  # numkeys
                self._failures_key,
                self._state_key,
                self._last_failure_key,
                self._failure_threshold,
                now,
            )
            failures, new_state = result
            failures = int(failures)
            new_state = new_state.decode() if isinstance(new_state, bytes) else new_state

            if new_state == CircuitBreakerState.OPEN:
                # Also clear the probe lock so next half-open attempt can compete.
                self._redis.delete(self._half_open_lock_key)
                logger.warning("circuit_breaker_opened key=%s failures=%s", self._state_key, failures)
                METRICS.increment("recovery.circuit_breaker.opened")
            else:
                logger.debug("circuit_breaker_failure_recorded key=%s failures=%s", self._state_key, failures)

            # If we were in HALF_OPEN and failed, count probe_failure.
            state_bytes = self._redis.get(self._state_key)
            current_state = state_bytes.decode() if isinstance(state_bytes, bytes) else (state_bytes or "")
            if current_state == CircuitBreakerState.OPEN:
                # Check if we just transitioned from HALF_OPEN (probe failed).
                # We use the half_open_lock existence as a signal.
                lock_exists = self._redis.exists(self._half_open_lock_key)
                if lock_exists:
                    METRICS.increment("recovery.circuit_breaker.probe_failure")

        except redis.NoScriptError:
            # Lua script not cached; reload and retry once.
            self._lua_sha = None
            try:
                self.record_failure()
            except Exception as exc:
                logger.warning("circuit_breaker_failure_record_retry_failed error=%s", exc)
        except (RedisConnectionError, RedisTimeoutError, RedisError) as exc:
            logger.warning("circuit_breaker_failure_record_failed error=%s", exc)

    def force_reset(self) -> None:
        """Force circuit breaker to CLOSED (manual recovery)."""
        try:
            pipe = self._redis.pipeline()
            pipe.set(self._state_key, CircuitBreakerState.CLOSED)
            pipe.delete(self._failures_key)
            pipe.delete(self._last_failure_key)
            pipe.delete(self._half_open_lock_key)
            pipe.execute()
            logger.info("circuit_breaker_force_reset key=%s", self._state_key)
            METRICS.increment("recovery.circuit_breaker.force_reset")
        except (RedisConnectionError, RedisTimeoutError, RedisError) as exc:
            logger.warning("circuit_breaker_force_reset_failed error=%s", exc)


# Module-level singleton
_CIRCUIT_BREAKER: Optional[CircuitBreaker] = None


def get_circuit_breaker() -> CircuitBreaker:
    """Return the module-level circuit breaker singleton."""
    global _CIRCUIT_BREAKER
    if _CIRCUIT_BREAKER is None:
        _CIRCUIT_BREAKER = CircuitBreaker(
            key=CIRCUIT_BREAKER_REDIS_KEY,
            failure_threshold=CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            timeout_seconds=CIRCUIT_BREAKER_TIMEOUT_SECONDS,
            half_open_lock_ttl_seconds=CIRCUIT_BREAKER_HALF_OPEN_LOCK_TTL,
        )
    return _CIRCUIT_BREAKER


# ==========================================
# EMAIL PROVIDER (Singleton)
# ==========================================

import resend
from recovery_models import (
    APP_BASE_URL,
    FROM_EMAIL,
    SendResult,
    ProviderSendStatus,
    _extract_message_id,
    _extract_status_code,
    _is_retryable_status,
)


class ResendEmailProvider:
    """
    Resend email provider with specific exception handling.
    Catches Resend-specific exceptions separately from network/Redis errors.
    """

    def send(
        self,
        to_email: str,
        subject: str,
        html: str,
        dispatch_token: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> SendResult:
        if not resend.api_key:
            return SendResult(
                status=ProviderSendStatus.FAILED_PERMANENT,
                retryable=False,
                error="resend_api_key_missing",
            )

        try:
            payload: Dict[str, Any] = {
                "from": FROM_EMAIL,
                "to": [to_email],
                "subject": subject,
                "html": html,
            }
            headers: Dict[str, str] = {}
            if dispatch_token:
                headers["X-Dispatch-Token"] = dispatch_token
                headers["X-Idempotency-Key"] = dispatch_token
                unsubscribe_url = f"{APP_BASE_URL.rstrip('/')}/api/recovery/unsubscribe?token={dispatch_token}"
                headers["List-Unsubscribe"] = f"<{unsubscribe_url}>"
                headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            if tenant_id:
                headers["X-Tenant-Id"] = tenant_id
            if headers:
                payload["headers"] = headers

            response = resend.Emails.send(payload)
        except resend.errors.AuthenticationError as exc:
            # API key invalid — permanent failure, don't retry.
            return SendResult(
                status=ProviderSendStatus.FAILED_PERMANENT,
                retryable=False,
                error=f"resend_auth_failed: {exc}",
            )
        except resend.errors.RateLimitError as exc:
            # Rate limited — transient, retry with backoff.
            return SendResult(
                status=ProviderSendStatus.FAILED_TRANSIENT,
                retryable=True,
                error=f"resend_rate_limited: {exc}",
            )
        except resend.errors.ResendError as exc:
            # Known Resend error — classify by status code if available.
            status_code = _extract_status_code(exc)
            retryable = _is_retryable_status(status_code)
            return SendResult(
                status=ProviderSendStatus.FAILED_TRANSIENT if retryable else ProviderSendStatus.FAILED_PERMANENT,
                retryable=retryable,
                error=f"resend_error: {exc}",
            )
        except Exception as exc:
            # Unknown error — default to transient retry.
            status_code = _extract_status_code(exc)
            retryable = _is_retryable_status(status_code)
            return SendResult(
                status=ProviderSendStatus.FAILED_TRANSIENT if retryable else ProviderSendStatus.FAILED_PERMANENT,
                retryable=retryable,
                error=f"unexpected_error: {exc}",
            )

        message_id = _extract_message_id(response)
        return SendResult(
            status=ProviderSendStatus.ACCEPTED,
            provider_message_id=message_id,
            retryable=False,
        )


# Module-level singleton
_RESEND_PROVIDER: Optional[ResendEmailProvider] = None


def get_email_provider() -> ResendEmailProvider:
    """Return the module-level email provider singleton."""
    global _RESEND_PROVIDER
    if _RESEND_PROVIDER is None:
        _RESEND_PROVIDER = ResendEmailProvider()
    return _RESEND_PROVIDER
