"""Regression coverage for Dramatiq's bounded Redis connection pool."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from redis import BlockingConnectionPool

from api.broker import build_redis_broker


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

    def test_pool_limit_can_be_configured_for_the_deployment(self) -> None:
        with patch.dict(
            os.environ,
            {
                "ARCLI_REDIS_MAX_CONNECTIONS": "20",
                "ARCLI_REDIS_POOL_TIMEOUT_SECONDS": "7.5",
            },
            clear=True,
        ):
            broker = build_redis_broker("redis://127.0.0.1:6379/0")

        pool = broker.client.connection_pool
        self.assertEqual(pool.max_connections, 20)
        self.assertEqual(pool.timeout, 7.5)


if __name__ == "__main__":
    unittest.main()
