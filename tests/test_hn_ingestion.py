"""Focused unit coverage for the globally scoped HN ingestion boundary."""

from __future__ import annotations

import os
import unittest
import unittest.mock
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
    def test_buyer_evidence_guard_rejects_editorial_overlap_but_keeps_a_real_request(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social.models import SocialPost

        editorial = SimpleNamespace(
            title="Customer growth guide",
            body="A content strategy for growing a customer base.",
        )
        buyer_request = SimpleNamespace(
            title="Ask HN: Getting our first customers",
            body="We need a better way to get customers after signups dropped.",
        )
        publisher_copy = SimpleNamespace(
            title="Guide: need a better way to get customers",
            body="A positioning and content strategy write-up.",
        )

        self.assertFalse(
            ingestion_module._source_post_is_plausible_for_discovery_query(
                editorial,
                "tools to grow our customer base",
                query_type="category_tool_search",
            )
        )
        self.assertTrue(
            ingestion_module._source_post_is_plausible_for_discovery_query(
                buyer_request,
                "need a better way to get customers",
                query_type="recommendation_request",
            )
        )
        self.assertFalse(
            ingestion_module._source_post_is_plausible_for_discovery_query(
                publisher_copy,
                "need a better way to get customers",
                query_type="recommendation_request",
            )
        )
        cached_social_post = SocialPost(
            source="hackernews",
            external_id="cached-1",
            title="Ask HN: Getting our first customers",
            text="We need a better way to get customers after signups dropped.",
        )
        self.assertTrue(
            ingestion_module._source_post_is_plausible_for_discovery_query(
                cached_social_post,
                "need a better way to get customers",
                query_type="recommendation_request",
            )
        )

    def test_legacy_demand_fallback_is_upgraded_only_for_search(self) -> None:
        import api.services.social_ingestion as ingestion_module

        phrases = [
            "customer growth has stalled",
            "new customer signups are dropping",
            "how can I get more customers",
            "spending too much time on outreach",
            "tools to grow our customer base",
            "our growth strategy stopped working",
        ]
        queries = ingestion_module._profile_discovery_queries(
            {
                "profile_json": {
                    "discovery_queries": [
                        {"query_type": query_type, "phrase": phrase}
                        for query_type, phrase in zip(
                            ingestion_module.DISCOVERY_QUERY_TYPES,
                            phrases,
                            strict=True,
                        )
                    ]
                }
            }
        )

        self.assertEqual(
            [query.phrase for query in queries],
            [
                "not enough people signing up",
                "new signups dropped this week",
                "need a better way to get customers",
                "we are doing outreach by hand",
                "tools to grow our customer base",
                "our current growth plan is failing",
            ],
        )

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

        self.assertEqual(result.inserted_source_post_ids, ["first"])
        self.assertEqual(result.matchable_source_post_ids, ["first"])
        self.assertEqual(result.plausible_hits, 1)
        self.assertEqual(len(client.calls), 1)
        first_payload, first_options = client.calls[0]
        self.assertNotIn("tenant_id", first_payload[0])
        self.assertEqual(
            first_options,
            {
                "on_conflict": "source,source_post_id",
                "ignore_duplicates": True,
            },
        )

    def test_hn_actor_queues_one_strict_x_fallback_when_hn_has_no_plausible_evidence(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors

        empty_result = HnIngestionResult(
            query="pricing",
            since_timestamp=1,
            hits_found=0,
            inserted_count=0,
            inserted_source_post_ids=[],
        )
        with (
            unittest.mock.patch.object(
                ingestion_module,
                "ingest_hn_posts",
                return_value=empty_result,
            ),
            unittest.mock.patch.object(ingestion_module, "trigger_embedding_jobs", return_value=0),
            unittest.mock.patch.object(actors.ingest_x_job, "send") as x_send,
            unittest.mock.patch.object(actors, "_x_source_is_configured", return_value=True),
            unittest.mock.patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            unittest.mock.patch.object(actors, "_claim_tenant_x_fallback_budget", return_value=True),
            unittest.mock.patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_job.fn(
                "pricing",
                168,
                25,
                fallback_to_x=True,
                x_fallback_group_id="activation-1",
            )

        x_send.assert_called_once_with("pricing", 168, 25, strict_single_page=True)

    def test_one_irrelevant_hn_hit_does_not_suppress_x_fallback(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors

        irrelevant_result = HnIngestionResult(
            query="billing",
            since_timestamp=1,
            hits_found=1,
            inserted_count=0,
            inserted_source_post_ids=[],
            plausible_hits=0,
        )
        with (
            unittest.mock.patch.object(
                ingestion_module,
                "ingest_hn_posts",
                return_value=irrelevant_result,
            ),
            unittest.mock.patch.object(ingestion_module, "trigger_embedding_jobs", return_value=0),
            unittest.mock.patch.object(actors.ingest_x_job, "send") as x_send,
            unittest.mock.patch.object(actors, "_x_source_is_configured", return_value=True),
            unittest.mock.patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            unittest.mock.patch.object(actors, "_claim_tenant_x_fallback_budget", return_value=True),
            unittest.mock.patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_job.fn(
                "billing",
                168,
                25,
                fallback_to_x=True,
                x_fallback_group_id="activation-1",
                tenant_id="tenant-1",
            )

        x_send.assert_called_once_with(
            "billing",
            168,
            25,
            strict_single_page=True,
            tenant_id="tenant-1",
        )

    def test_one_plausible_hn_hit_still_allows_the_single_x_fallback(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors

        one_plausible_result = HnIngestionResult(
            query="billing",
            since_timestamp=1,
            hits_found=1,
            inserted_count=0,
            inserted_source_post_ids=[],
            plausible_hits=1,
        )
        with (
            unittest.mock.patch.object(
                ingestion_module,
                "ingest_hn_posts",
                return_value=one_plausible_result,
            ),
            unittest.mock.patch.object(ingestion_module, "trigger_embedding_jobs", return_value=0),
            unittest.mock.patch.object(actors.ingest_x_job, "send") as x_send,
            unittest.mock.patch.object(actors, "_x_source_is_configured", return_value=True),
            unittest.mock.patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            unittest.mock.patch.object(actors, "_claim_tenant_x_fallback_budget", return_value=True),
            unittest.mock.patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_job.fn(
                "billing",
                168,
                25,
                fallback_to_x=True,
                x_fallback_group_id="activation-1",
                tenant_id="tenant-1",
            )

        x_send.assert_called_once_with(
            "billing",
            168,
            25,
            strict_single_page=True,
            tenant_id="tenant-1",
        )

    def test_hn_actor_does_not_queue_x_when_batch_fallback_is_claimed(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors

        empty_result = HnIngestionResult(
            query="pricing",
            since_timestamp=1,
            hits_found=0,
            inserted_count=0,
            inserted_source_post_ids=[],
        )
        with (
            unittest.mock.patch.object(
                ingestion_module,
                "ingest_hn_posts",
                return_value=empty_result,
            ),
            unittest.mock.patch.object(ingestion_module, "trigger_embedding_jobs", return_value=0),
            unittest.mock.patch.object(actors.ingest_x_job, "send") as x_send,
            unittest.mock.patch.object(actors, "_x_source_is_configured", return_value=True),
            unittest.mock.patch.object(actors, "_claim_initial_x_fallback", return_value=False),
            unittest.mock.patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_job.fn(
                "pricing",
                168,
                25,
                fallback_to_x=True,
                x_fallback_group_id="activation-1",
            )

        x_send.assert_not_called()

    def test_hn_batch_suppresses_x_only_after_two_plausible_hn_signals(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors

        results = [
            HnIngestionResult("first", 1, 0, 0, []),
            HnIngestionResult(
                "second",
                1,
                2,
                0,
                [],
                ["existing-1"],
                2,
            ),
        ]
        with (
            unittest.mock.patch.object(
                ingestion_module,
                "ingest_hn_posts",
                side_effect=results,
            ),
            unittest.mock.patch.object(ingestion_module, "trigger_embedding_jobs", return_value=0),
            unittest.mock.patch.object(actors.ingest_x_job, "send") as x_send,
            unittest.mock.patch.object(actors, "_x_source_is_configured", return_value=True),
            unittest.mock.patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            unittest.mock.patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_batch_job.fn(
                ["first", "second"],
                168,
                25,
                fallback_to_x=True,
                x_fallback_group_id="activation-1",
                x_fallback_query="(first) OR (second)",
            )

        x_send.assert_not_called()

    def test_typed_hn_batch_keeps_x_fallback_for_many_hits_from_one_query_type(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors

        one_broad_typed_result = HnIngestionResult(
            "how do I get more customers",
            1,
            8,
            0,
            [],
            plausible_hits=8,
        )
        typed_query = {
            "query_type": "buyer_pain",
            "phrase": "how do I get more customers",
        }
        with (
            unittest.mock.patch.object(
                ingestion_module,
                "ingest_hn_posts",
                return_value=one_broad_typed_result,
            ),
            unittest.mock.patch.object(ingestion_module, "trigger_embedding_jobs", return_value=0),
            unittest.mock.patch.object(actors.ingest_x_job, "send") as x_send,
            unittest.mock.patch.object(actors, "_x_source_is_configured", return_value=True),
            unittest.mock.patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            unittest.mock.patch.object(actors, "_claim_tenant_x_fallback_budget", return_value=True),
            unittest.mock.patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_batch_job.fn(
                [typed_query],
                168,
                25,
                fallback_to_x=True,
                x_fallback_group_id="activation-1",
                x_fallback_query='"how do I get more customers"',
                tenant_id="tenant-1",
            )

        x_send.assert_called_once_with(
            '"how do I get more customers"',
            168,
            25,
            strict_single_page=True,
            tenant_id="tenant-1",
        )

    def test_hn_batch_queues_each_duplicate_global_post_once(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors

        results = [
            HnIngestionResult(
                "first",
                1,
                1,
                0,
                [],
                ["existing-1"],
                1,
            ),
            HnIngestionResult(
                "second",
                1,
                2,
                0,
                [],
                ["existing-1", "existing-2"],
                1,
            ),
        ]
        with (
            unittest.mock.patch.object(
                ingestion_module,
                "ingest_hn_posts",
                side_effect=results,
            ),
            unittest.mock.patch.object(
                ingestion_module,
                "trigger_embedding_jobs",
                return_value=2,
            ) as trigger,
            unittest.mock.patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_batch_job.fn(["first", "second"], 168, 25)

        from api.services.social_ingestion import PublicSourcePostRef

        trigger.assert_called_once_with(
            [
                PublicSourcePostRef("hackernews", "existing-1"),
                PublicSourcePostRef("hackernews", "existing-2"),
            ]
        )

    def test_hn_batch_queues_one_combined_x_fallback_when_all_hn_queries_empty(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors

        empty_result = HnIngestionResult("pricing", 1, 0, 0, [])
        with (
            unittest.mock.patch.object(
                ingestion_module,
                "ingest_hn_posts",
                return_value=empty_result,
            ),
            unittest.mock.patch.object(ingestion_module, "trigger_embedding_jobs", return_value=0),
            unittest.mock.patch.object(actors.ingest_x_job, "send") as x_send,
            unittest.mock.patch.object(actors, "_x_source_is_configured", return_value=True),
            unittest.mock.patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            unittest.mock.patch.object(actors, "_claim_tenant_x_fallback_budget", return_value=True),
            unittest.mock.patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_batch_job.fn(
                ["pricing", "billing"],
                168,
                25,
                fallback_to_x=True,
                x_fallback_group_id="activation-1",
                x_fallback_query="(pricing) OR (billing)",
            )

        x_send.assert_called_once_with(
            "(pricing) OR (billing)",
            168,
            25,
            strict_single_page=True,
        )

    def test_hn_fallback_respects_tenant_x_budget(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors

        with (
            unittest.mock.patch.object(
                ingestion_module,
                "ingest_hn_posts",
                return_value=HnIngestionResult("pricing", 1, 0, 0, []),
            ),
            unittest.mock.patch.object(ingestion_module, "trigger_embedding_jobs", return_value=0),
            unittest.mock.patch.object(actors.ingest_x_job, "send") as x_send,
            unittest.mock.patch.object(actors, "_x_source_is_configured", return_value=True),
            unittest.mock.patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            unittest.mock.patch.object(actors, "_claim_tenant_x_fallback_budget", return_value=False),
            unittest.mock.patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_job.fn(
                "pricing",
                168,
                25,
                fallback_to_x=True,
                x_fallback_group_id="activation-1",
                tenant_id="tenant-1",
            )

        x_send.assert_not_called()

    def test_hn_actor_rematches_existing_global_posts_for_new_profiles(self) -> None:
        import api.services.social_ingestion as ingestion_module
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors

        existing_result = HnIngestionResult(
            query="pricing",
            since_timestamp=1,
            hits_found=2,
            inserted_count=0,
            inserted_source_post_ids=[],
            matchable_source_post_ids=["existing-1", "existing-2"],
        )
        with (
            unittest.mock.patch.object(
                ingestion_module,
                "ingest_hn_posts",
                return_value=existing_result,
            ),
            unittest.mock.patch.object(
                ingestion_module,
                "trigger_embedding_jobs",
                return_value=2,
            ) as trigger,
            unittest.mock.patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_job.fn("pricing", 168, 25)

        from api.services.social_ingestion import PublicSourcePostRef

        trigger.assert_called_once_with(
            [
                PublicSourcePostRef("hackernews", "existing-1"),
                PublicSourcePostRef("hackernews", "existing-2"),
            ]
        )


if __name__ == "__main__":
    unittest.main()
