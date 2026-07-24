"""Shared, bounded Redis broker construction for Dramatiq processes."""

import os
import threading

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from redis import BlockingConnectionPool, Redis


_broker_lock = threading.Lock()


def _positive_int_env(name: str, default: int, *, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _non_negative_int_env(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _positive_float_env(name: str, default: float) -> float:
    try:
        return max(0.1, float(os.getenv(name, str(default))))
    except ValueError:
        return default


def build_redis_broker(redis_url: str) -> RedisBroker:
    """Create a broker with a bounded pool sized for every queue consumer."""
    pool = BlockingConnectionPool.from_url(
        redis_url,
        # The default worker declares five queues.  Dramatiq starts a consumer
        # for each queue and its delay queue (10 total), then actor threads
        # concurrently ack and publish messages.  Eight connections therefore
        # exhausts the pool while the worker is idle and makes consumers retry
        # forever with ``Too many connections``.
        max_connections=_positive_int_env("ARCLI_REDIS_MAX_CONNECTIONS", 16),
        # Retain a hard cap without turning a short burst of concurrent queue
        # operations into a permanent consumer failure.
        timeout=_positive_float_env("ARCLI_REDIS_POOL_TIMEOUT_SECONDS", 5.0),
        socket_connect_timeout=_positive_float_env(
            "ARCLI_REDIS_CONNECT_TIMEOUT_SECONDS", 2.0
        ),
        socket_timeout=_positive_float_env("ARCLI_REDIS_SOCKET_TIMEOUT_SECONDS", 2.0),
        health_check_interval=_non_negative_int_env(
            "ARCLI_REDIS_HEALTH_CHECK_INTERVAL_SECONDS", 30
        ),
    )
    broker = RedisBroker(client=Redis(connection_pool=pool))
    setattr(broker, "_arcli_redis_url", redis_url)
    return broker


def configure_redis_broker(redis_url: str) -> RedisBroker:
    """Install the configured broker exactly once in the current process."""
    with _broker_lock:
        current_broker = dramatiq.get_broker()
        if getattr(current_broker, "_arcli_redis_url", None) == redis_url:
            return current_broker  # type: ignore[return-value]

        broker = build_redis_broker(redis_url)
        dramatiq.set_broker(broker)
        return broker
