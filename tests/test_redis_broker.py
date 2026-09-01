"""Regression coverage for Dramatiq's bounded Redis connection pool."""

from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from dramatiq.errors import ConnectionClosed
from redis import BlockingConnectionPool
from redis.exceptions import TimeoutError as RedisTimeoutError

from api.broker import ResilientRedisBroker, build_redis_broker


class RedisBrokerTests(unittest.TestCase):
    def test_default_pool_covers_all_queue_consumers_with_headroom(self) -> None:
        # The default actor registry declares five queues, which Dramatiq
        # consumes alongside their five delay queues.  Sixteen allows those
        # ten consumers and concurrent actor ack/publish operations.
        with patch.dict(os.environ, {}, clear=True):
            broker = build_redis_broker("redis://127.0.0.1:6379/0")

        pool = broker.client.connection_pool
        self.assertIsInstance(pool, BlockingConnectionPool)
        self.assertEqual(pool.max_connections, 16)
        self.assertEqual(pool.timeout, 5.0)
        self.assertEqual(pool.connection_kwargs["socket_connect_timeout"], 5.0)
        self.assertEqual(pool.connection_kwargs["socket_timeout"], 15.0)

    def test_pool_limit_can_be_configured_for_the_deployment(self) -> None:
        with patch.dict(
            os.environ,
            {
                "ARCLI_REDIS_MAX_CONNECTIONS": "20",
                "ARCLI_REDIS_POOL_TIMEOUT_SECONDS": "7.5",
                "ARCLI_REDIS_CONNECT_TIMEOUT_SECONDS": "3.5",
                "ARCLI_REDIS_SOCKET_TIMEOUT_SECONDS": "12.5",
            },
            clear=True,
        ):
            broker = build_redis_broker("redis://127.0.0.1:6379/0")

        pool = broker.client.connection_pool
        self.assertEqual(pool.max_connections, 20)
        self.assertEqual(pool.timeout, 7.5)
        self.assertEqual(pool.connection_kwargs["socket_connect_timeout"], 3.5)
        self.assertEqual(pool.connection_kwargs["socket_timeout"], 12.5)

    def test_socket_timeout_uses_dramatiq_connection_recovery(self) -> None:
        broker = build_redis_broker("redis://127.0.0.1:6379/0")
        self.assertIsInstance(broker, ResilientRedisBroker)
        consumer = broker.consume("system")

        with patch.object(broker, "do_fetch", side_effect=RedisTimeoutError("timed out")):
            with self.assertRaises(ConnectionClosed):
                next(consumer)

        message = SimpleNamespace(
            message_id="message-id",
            options={"redis_message_id": "redis-message-id"},
        )
        with patch.object(broker, "do_ack", side_effect=RedisTimeoutError("timed out")):
            with self.assertRaises(ConnectionClosed):
                consumer.ack(message)


if __name__ == "__main__":
    unittest.main()
