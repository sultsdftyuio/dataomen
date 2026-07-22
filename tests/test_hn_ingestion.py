"""Focused unit coverage for the globally scoped HN ingestion boundary."""

from __future__ import annotations

import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from api.services.integrations.hn_connector import HackerNewsConnector, SourcePost


class HackerNewsConnectorTests(unittest.TestCase):
    def test_comment_mapping_sanitizes_html_and_uses_item_permalink(self) -> None:
        post = HackerNewsConnector._to_source_post(
            {
                "objectID": "42",
                "_tags": ["comment"],
                "author": "alice",
                "comment_text": "<p>Need <b>better</b> billing tooling.</p>",
                "story_title": "Billing tools",
                "created_at": "2026-07-22T09:00:00Z",
            },
            0,
        )

        self.assertIsNotNone(post)
        assert post is not None
        self.assertEqual(post.source, "hackernews")
        self.assertEqual(post.body, "Need better billing tooling.")
        self.assertEqual(post.url, "https://news.ycombinator.com/item?id=42")

    def test_deleted_and_empty_hits_are_discarded(self) -> None:
        self.assertIsNone(
            HackerNewsConnector._to_source_post(
                {
                    "objectID": "deleted",
                    "_tags": ["comment", "deleted"],
                    "comment_text": "not usable",
                    "created_at_i": 1,
                },
                0,
            )
        )
        self.assertIsNone(
            HackerNewsConnector._to_source_post(
                {
                    "objectID": "empty",
                    "_tags": ["comment"],
                    "comment_text": "<p></p>",
                    "created_at_i": 1,
                },
                0,
            )
        )


class HackerNewsIngestionTests(unittest.TestCase):
    def test_service_batches_global_payloads_and_returns_new_ids(self) -> None:
        import api.services.integrations.hn_connector as connector_module
        import api.services.social_ingestion as ingestion_module

        class FakeConnector:
            async def fetch_recent_posts(
                self,
                query: str,
                since_timestamp: int,
                limit: int = 100,
            ) -> list[SourcePost]:
                return [
                    SourcePost(
                        source_post_id="first",
                        author_handle="alice",
                        body="Need pricing software",
                        url="https://news.ycombinator.com/item?id=first",
                        posted_at=datetime.now(timezone.utc),
                    ),
                    SourcePost(
                        source_post_id="second",
                        author_handle="bob",
                        body="Need a better support tool",
                        url="https://news.ycombinator.com/item?id=second",
                        posted_at=datetime.now(timezone.utc),
                    ),
                ]

        class FakeQuery:
            def __init__(self, calls: list[tuple[list[dict[str, object]], dict[str, str | bool]]]):
                self.calls = calls
                self.payload: list[dict[str, object]] = []

            def upsert(
                self,
                payload: list[dict[str, object]],
                **kwargs: str | bool,
            ) -> "FakeQuery":
                self.calls.append((payload, kwargs))
                self.payload = payload
                return self

            def execute(self) -> SimpleNamespace:
                return SimpleNamespace(data=self.payload)

        class FakeClient:
            def __init__(self) -> None:
                self.calls: list[tuple[list[dict[str, object]], dict[str, str | bool]]] = []

            def table(self, table_name: str) -> FakeQuery:
                if table_name != "source_posts":
                    raise AssertionError(f"unexpected table: {table_name}")
                return FakeQuery(self.calls)

        client = FakeClient()
        original_connector = connector_module.HackerNewsConnector
        original_client = ingestion_module._public_source_supabase_client
        original_batch_size = os.environ.get("ARCLI_HN_INSERT_BATCH_SIZE")
        connector_module.HackerNewsConnector = FakeConnector
        ingestion_module._public_source_supabase_client = client
        os.environ["ARCLI_HN_INSERT_BATCH_SIZE"] = "1"
        try:
            result = ingestion_module.ingest_hn_posts("pricing", 24)
        finally:
            connector_module.HackerNewsConnector = original_connector
            ingestion_module._public_source_supabase_client = original_client
            if original_batch_size is None:
                os.environ.pop("ARCLI_HN_INSERT_BATCH_SIZE", None)
            else:
                os.environ["ARCLI_HN_INSERT_BATCH_SIZE"] = original_batch_size

        self.assertEqual(result.inserted_source_post_ids, ["first", "second"])
        self.assertEqual(len(client.calls), 2)
        first_payload, first_options = client.calls[0]
        self.assertNotIn("tenant_id", first_payload[0])
        self.assertEqual(
            first_options,
            {
                "on_conflict": "source,source_post_id",
                "ignore_duplicates": True,
            },
        )


if __name__ == "__main__":
    unittest.main()
