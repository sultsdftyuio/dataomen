"""Focused unit coverage for the globally scoped X ingestion boundary."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from api.services.integrations.x_connector import XConnector, TwitterSourcePost


class XConnectorTests(unittest.TestCase):
    def test_tweet_mapping_uses_username_permalink_and_language(self) -> None:
        post = XConnector._to_source_post(
            {
                "id": "77",
                "text": "Looking for a better support platform",
                "created_at": "2026-07-22T09:00:00Z",
                "author_id": "9",
                "lang": "en",
            },
            {"9": {"id": "9", "username": "alice"}},
            0,
        )

        self.assertIsNotNone(post)
        assert post is not None
        self.assertEqual(post.source, "twitter")
        self.assertEqual(post.author_handle, "alice")
        self.assertEqual(post.url, "https://x.com/alice/status/77")
        self.assertEqual(post.language, "en")

    def test_query_adds_safe_defaults_without_duplicating_them(self) -> None:
        self.assertEqual(
            XConnector._search_query("customer support"),
            "customer support lang:en -is:retweet",
        )
        self.assertEqual(
            XConnector._search_query("customer support lang:en -is:retweet"),
            "customer support lang:en -is:retweet",
        )


class XIngestionTests(unittest.TestCase):
    def test_service_upserts_global_twitter_payloads(self) -> None:
        import api.services.integrations.x_connector as connector_module
        import api.services.social_ingestion as ingestion_module

        class FakeConnector:
            async def fetch_recent_posts(
                self,
                query: str,
                since_timestamp: int,
                limit: int = 100,
            ) -> list[TwitterSourcePost]:
                return [
                    TwitterSourcePost(
                        source_post_id="tweet-1",
                        author_handle="alice",
                        body="Need a billing platform",
                        url="https://x.com/alice/status/tweet-1",
                        posted_at=datetime.now(timezone.utc),
                    )
                ]

        class FakeQuery:
            def __init__(self) -> None:
                self.payload: list[dict[str, object]] = []
                self.options: dict[str, str | bool] = {}

            def upsert(
                self,
                payload: list[dict[str, object]],
                **kwargs: str | bool,
            ) -> "FakeQuery":
                self.payload = payload
                self.options = kwargs
                return self

            def execute(self) -> SimpleNamespace:
                return SimpleNamespace(data=self.payload)

        class FakeClient:
            def __init__(self) -> None:
                self.query = FakeQuery()

            def table(self, table_name: str) -> FakeQuery:
                if table_name != "source_posts":
                    raise AssertionError(f"unexpected table: {table_name}")
                return self.query

        client = FakeClient()
        original_connector = connector_module.XConnector
        original_client = ingestion_module._public_source_supabase_client
        original_batch_size = os.environ.get("ARCLI_X_INSERT_BATCH_SIZE")
        connector_module.XConnector = FakeConnector
        ingestion_module._public_source_supabase_client = client
        os.environ["ARCLI_X_INSERT_BATCH_SIZE"] = "1"
        try:
            result = ingestion_module.ingest_x_posts("billing", 24)
        finally:
            connector_module.XConnector = original_connector
            ingestion_module._public_source_supabase_client = original_client
            if original_batch_size is None:
                os.environ.pop("ARCLI_X_INSERT_BATCH_SIZE", None)
            else:
                os.environ["ARCLI_X_INSERT_BATCH_SIZE"] = original_batch_size

        self.assertEqual(result.inserted_source_post_ids, ["tweet-1"])
        self.assertEqual(client.query.payload[0]["source"], "twitter")
        self.assertNotIn("tenant_id", client.query.payload[0])
        self.assertEqual(
            client.query.options,
            {
                "on_conflict": "source,source_post_id",
                "ignore_duplicates": True,
            },
        )


if __name__ == "__main__":
    unittest.main()
