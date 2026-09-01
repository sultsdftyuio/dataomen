"""Shared, bounded Redis broker construction for Dramatiq processes."""

import os
import threading
from collections.abc import Iterable

import dramatiq
from dramatiq.broker import Consumer, MessageProxy
from dramatiq.brokers.redis import RedisBroker
from dramatiq.errors import ConnectionClosed
from redis import BlockingConnectionPool, Redis
from redis.exceptions import TimeoutError as RedisTimeoutError


_broker_lock = threading.Lock()

DEFAULT_REDIS_POOL_TIMEOUT_SECONDS = 5.0
DEFAULT_REDIS_CONNECT_TIMEOUT_SECONDS = 5.0
DEFAULT_REDIS_SOCKET_TIMEOUT_SECONDS = 15.0
DEFAULT_REDIS_HEALTH_CHECK_INTERVAL_SECONDS = 30


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


class _TimeoutAwareRedisConsumer(Consumer):
    """Translate Redis read timeouts into Dramatiq connection recovery.

    Dramatiq 2.2 catches ``redis.exceptions.ConnectionError`` in its Redis
    consumer, but redis-py exposes ``TimeoutError`` as a sibling exception.
    Without this adapter, a transient read timeout is logged as an unexpected
    worker exception instead of following Dramatiq's safe reconnect path.
    """

    def __init__(self, consumer: Consumer) -> None:
        self._consumer = consumer

    def __next__(self) -> MessageProxy | None:
        try:
            return next(self._consumer)
        except RedisTimeoutError as exc:
            raise ConnectionClosed(exc) from None

    def ack(self, message: MessageProxy) -> None:
        try:
            return self._consumer.ack(message)
        except RedisTimeoutError as exc:
            raise ConnectionClosed(exc) from None

    def nack(self, message: MessageProxy) -> None:
        try:
            return self._consumer.nack(message)
        except RedisTimeoutError as exc:
            raise ConnectionClosed(exc) from None

    def requeue(self, messages: Iterable[MessageProxy]) -> None:
        try:
            return self._consumer.requeue(messages)
        except RedisTimeoutError as exc:
            raise ConnectionClosed(exc) from None

    def close(self) -> None:
        self._consumer.close()


class ResilientRedisBroker(RedisBroker):
    """Redis broker that keeps timeout recovery compatible with Dramatiq."""

    def consume(self, queue_name: str, prefetch: int = 1, timeout: int = 5_000) -> Consumer:
        return _TimeoutAwareRedisConsumer(
            super().consume(queue_name, prefetch=prefetch, timeout=timeout)
        )


def build_redis_broker(redis_url: str) -> ResilientRedisBroker:
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
        timeout=_positive_float_env(
            "ARCLI_REDIS_POOL_TIMEOUT_SECONDS", DEFAULT_REDIS_POOL_TIMEOUT_SECONDS
        ),
        socket_connect_timeout=_positive_float_env(
            "ARCLI_REDIS_CONNECT_TIMEOUT_SECONDS", DEFAULT_REDIS_CONNECT_TIMEOUT_SECONDS
        ),
        # A 2-second TLS read deadline turns routine managed-Redis latency
        # spikes into simultaneous failures across every consumer. Keep reads
        # bounded, but give the broker enough time to bridge a short network
        # stall before it reconnects.
        socket_timeout=_positive_float_env(
            "ARCLI_REDIS_SOCKET_TIMEOUT_SECONDS", DEFAULT_REDIS_SOCKET_TIMEOUT_SECONDS
        ),
        health_check_interval=_non_negative_int_env(
            "ARCLI_REDIS_HEALTH_CHECK_INTERVAL_SECONDS",
            DEFAULT_REDIS_HEALTH_CHECK_INTERVAL_SECONDS,
        ),
    )
    broker = ResilientRedisBroker(client=Redis(connection_pool=pool))
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
