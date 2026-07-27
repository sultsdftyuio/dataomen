"""Focused unit coverage for the globally scoped X ingestion boundary."""

from __future__ import annotations

import asyncio
import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

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

    def test_query_preserves_grouped_exact_phrases_before_safe_filters(self) -> None:
        self.assertEqual(
            XConnector._search_query(
                '("sales and marketing handoffs fail" OR '
                '"which tool works for revenue or operations")'
            ),
            '("sales and marketing handoffs fail" OR '
            '"which tool works for revenue or operations") lang:en -is:retweet',
        )

    def test_recent_search_start_is_clamped_inside_xs_seven_day_window(self) -> None:
        now = 1_800_000_000
        seven_days_ago = now - (7 * 24 * 60 * 60)

        self.assertEqual(
            XConnector._recent_search_since_timestamp(seven_days_ago, now=now),
            seven_days_ago + 120,
        )
        self.assertEqual(
            XConnector._search_query("customer support lang:en -is:retweet"),
            "customer support lang:en -is:retweet",
        )

    def test_strict_max_pages_stops_after_one_paid_search_request(self) -> None:
        connector = XConnector(bearer_token="test-token", request_interval_seconds=0)
        posted_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        first_page = {
            "data": [
                {
                    "id": "77",
                    "text": "Need a better billing platform",
                    "created_at": posted_at,
                    "author_id": "9",
                    "lang": "en",
                }
            ],
            "includes": {"users": [{"id": "9", "username": "alice"}]},
            "meta": {"next_token": "second-page"},
        }

        with patch.object(
            connector,
            "_fetch_page",
            AsyncMock(return_value=first_page),
        ) as fetch_page:
            posts = asyncio.run(
                connector.fetch_recent_posts(
                    "billing platform",
                    since_timestamp=0,
                    limit=25,
                    max_pages=1,
                )
            )

        self.assertEqual(len(posts), 1)
        self.assertEqual(fetch_page.await_count, 1)


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
        self.assertEqual(result.matchable_source_post_ids, ["tweet-1"])
        self.assertEqual(client.query.payload[0]["source"], "twitter")
        self.assertNotIn("tenant_id", client.query.payload[0])
        self.assertEqual(
            client.query.options,
            {
                "on_conflict": "source,source_post_id",
                "ignore_duplicates": True,
            },
        )

    def test_service_retries_without_optional_author_handle_on_legacy_schema(self) -> None:
        import api.services.social_ingestion as ingestion_module

        class MissingAuthorHandleError(Exception):
            code = "PGRST204"
            message = "Could not find the 'author_handle' column of 'source_posts'"

        class FakeQuery:
            def __init__(self) -> None:
                self.attempts: list[list[dict[str, object]]] = []
                self.payload: list[dict[str, object]] = []

            def upsert(
                self,
                payload: list[dict[str, object]],
                **_kwargs: str | bool,
            ) -> "FakeQuery":
                self.payload = payload
                self.attempts.append(payload)
                return self

            def execute(self) -> SimpleNamespace:
                if len(self.attempts) == 1:
                    raise MissingAuthorHandleError()
                return SimpleNamespace(data=self.payload)

        class FakeClient:
            def __init__(self) -> None:
                self.query = FakeQuery()

            def table(self, table_name: str) -> FakeQuery:
                if table_name != "source_posts":
                    raise AssertionError(f"unexpected table: {table_name}")
                return self.query

        client = FakeClient()
        original_client = ingestion_module._public_source_supabase_client
        ingestion_module._public_source_supabase_client = client
        try:
            inserted_ids = ingestion_module._persist_new_public_source_posts(
                [
                    TwitterSourcePost(
                        source_post_id="tweet-1",
                        author_handle="alice",
                        body="Need a billing platform",
                        url="https://x.com/alice/status/tweet-1",
                        posted_at=datetime.now(timezone.utc),
                    )
                ],
                batch_size=1,
            )
        finally:
            ingestion_module._public_source_supabase_client = original_client

        self.assertEqual(inserted_ids, ["tweet-1"])
        self.assertEqual(client.query.attempts[0][0]["author_handle"], "alice")
        self.assertNotIn("author_handle", client.query.attempts[1][0])


class XIngestionActorTests(unittest.TestCase):
    def test_strict_fallback_job_passes_one_page_limit_to_ingestion(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import XIngestionResult
        from api.workers import actors

        result = XIngestionResult("billing", 1, 0, 0, [])
        with (
            patch.object(ingestion_module, "ingest_x_posts", return_value=result) as ingest,
            patch.object(ingestion_module, "trigger_embedding_jobs", return_value=0),
            patch.object(actors, "_x_source_is_configured", return_value=True),
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_x_job.fn("billing", 168, 25, strict_single_page=True)

        ingest.assert_called_once_with(
            query="billing",
            since_hours_ago=168,
            posts_per_query=25,
            max_pages=1,
        )

    def test_missing_x_credential_skips_without_calling_ingestion(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.workers import actors

        with (
            patch.object(ingestion_module, "ingest_x_posts") as ingest,
            patch.object(actors, "_x_source_is_configured", return_value=False),
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_x_job.fn("billing", 168, 25, strict_single_page=True)

        ingest.assert_not_called()


if __name__ == "__main__":
    unittest.main()
