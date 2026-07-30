"""Coverage for the HN-first four-source public discovery expansion."""

from __future__ import annotations

import os
import sys
import types
import unittest
from contextlib import nullcontext
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import call, patch

from api.services.integrations.public_source import PublicSourcePost
from api.services.social_ingestion import (
    AdditionalPublicSourceIngestionResult,
    PublicSourcePostRef,
    claim_additional_public_source_query,
    ingest_additional_public_source_posts,
)


CANONICAL_QUERIES = [
    {"query_type": "buyer_pain", "phrase": "manual customer onboarding"},
    {"query_type": "urgent_failure", "phrase": "customers leave before setup"},
]


def _result(
    source: str,
    *,
    external_id: str = "42",
    plausible_hits: int = 0,
) -> AdditionalPublicSourceIngestionResult:
    return AdditionalPublicSourceIngestionResult(
        source=source,
        query="manual customer onboarding",
        since_timestamp=1,
        hits_found=1,
        inserted_count=0,
        inserted_source_post_ids=[],
        matchable_source_post_refs=[PublicSourcePostRef(source, external_id)],
        plausible_hits=plausible_hits,
    )


class AdditionalPublicSourceServiceTests(unittest.TestCase):
    def test_technical_sources_skip_plain_business_outcome_queries(self) -> None:
        from api.services.social_ingestion import (
            additional_public_source_supports_discovery_query,
        )

        self.assertFalse(
            additional_public_source_supports_discovery_query(
                "github",
                "not enough people signing up",
            )
        )
        self.assertFalse(
            additional_public_source_supports_discovery_query(
                "stackexchange",
                "we are doing outreach by hand",
            )
        )
        self.assertTrue(
            additional_public_source_supports_discovery_query(
                "github",
                "our API deployment keeps failing",
            )
        )
        self.assertTrue(
            additional_public_source_supports_discovery_query(
                "bluesky",
                "not enough people signing up",
            )
        )

    def test_service_persists_source_qualified_global_post_and_returns_ref(self) -> None:
        import api.services.social_ingestion as ingestion

        class FakeConnector:
            async def fetch_recent_posts(self, *_args, **_kwargs):
                return [
                    PublicSourcePost(
                        source="bluesky",
                        source_post_id="at://did:plc:alice/app.bsky.feed.post/abc",
                        author_handle="alice.bsky.social",
                        body="Our onboarding still requires manual follow-up.",
                        url="https://bsky.app/profile/alice.bsky.social/post/abc",
                        posted_at=datetime.now(timezone.utc),
                    )
                ]

        class FakeQuery:
            payload: list[dict[str, object]] = []
            options: dict[str, object] = {}

            def upsert(self, payload, **kwargs):
                self.payload = payload
                self.options = kwargs
                return self

            def execute(self):
                return SimpleNamespace(data=self.payload)

        class FakeClient:
            def __init__(self) -> None:
                self.query = FakeQuery()

            def table(self, name: str):
                self.assertEqual(name, "source_posts")
                return self.query

            def assertEqual(self, actual, expected):
                if actual != expected:
                    raise AssertionError(f"{actual!r} != {expected!r}")

        client = FakeClient()
        with (
            patch.object(ingestion, "_additional_public_source_connector", return_value=FakeConnector()),
            patch.object(ingestion, "_public_source_supabase_client", client),
        ):
            result = ingest_additional_public_source_posts(
                "bluesky",
                "manual customer onboarding",
                24,
            )

        self.assertEqual(result.source, "bluesky")
        self.assertEqual(result.inserted_source_post_ids, ["at://did:plc:alice/app.bsky.feed.post/abc"])
        self.assertEqual(
            result.matchable_source_post_refs,
            [PublicSourcePostRef("bluesky", "at://did:plc:alice/app.bsky.feed.post/abc")],
        )
        self.assertEqual(client.query.payload[0]["source"], "bluesky")
        self.assertEqual(
            client.query.options,
            {"on_conflict": "source,source_post_id", "ignore_duplicates": True},
        )

    def test_query_cache_is_global_but_scoped_by_source_and_window(self) -> None:
        class FakeClient:
            def __init__(self) -> None:
                self.calls: list[tuple[str, str, bool, int]] = []

            def set(self, key, value, *, nx, ex):
                self.calls.append((key, value, nx, ex))
                return False

            def close(self):
                return None

            connection_pool = SimpleNamespace(disconnect=lambda: None)

        client = FakeClient()

        class FakeRedis:
            @staticmethod
            def from_url(*_args, **_kwargs):
                return client

        with (
            patch.dict(
                os.environ,
                {
                    "REDIS_URL": "redis://cache.test/0",
                    "ARCLI_ADDITIONAL_PUBLIC_SOURCE_QUERY_CACHE_TTL_SECONDS": "600",
                },
                clear=True,
            ),
            patch.dict(sys.modules, {"redis": types.SimpleNamespace(Redis=FakeRedis)}),
        ):
            claimed = claim_additional_public_source_query(
                source="bluesky",
                query="manual customer onboarding",
                since_hours_ago=24,
                scope="public.api.bsky.app",
            )

        self.assertFalse(claimed)
        self.assertEqual(len(client.calls), 1)
        self.assertTrue(client.calls[0][0].startswith("arcli:public-source-query:"))
        self.assertEqual(client.calls[0][3], 600)


class AdditionalPublicSourceActivationTests(unittest.TestCase):
    def test_cache_scopes_follow_the_live_connector_defaults(self) -> None:
        from api.services.social_ingestion import additional_public_source_cache_scope

        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                additional_public_source_cache_scope("bluesky"),
                "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts",
            )
            self.assertEqual(
                additional_public_source_cache_scope("lemmy"),
                "https://lemmy.world/api/v3/search",
            )

    def _profile_row(self) -> dict[str, object]:
        return {
            "id": "profile-1",
            "tenant_id": "tenant-1",
            "profile_json": {
                "company_name": "Onboard Co",
                "one_liner": "Customer onboarding automation",
                "target_audience": ["SaaS teams"],
                "core_problem_solved": "Manual onboarding loses users.",
                "key_value_propositions": ["Faster setup"],
                "ideal_customer_pain_points": ["Manual follow-up"],
                "discovery_queries": CANONICAL_QUERIES,
            },
        }

    def test_free_source_threshold_takes_precedence_over_legacy_hn_setting(self) -> None:
        from api.workers import actors

        with patch.dict(
            os.environ,
            {
                "ARCLI_INITIAL_PUBLIC_FREE_MIN_PLAUSIBLE_HITS_FOR_X_SUPPRESSION": "1",
                "ARCLI_INITIAL_PUBLIC_HN_MIN_PLAUSIBLE_HITS_FOR_X_SUPPRESSION": "9",
            },
            clear=True,
        ):
            self.assertEqual(actors._minimum_plausible_free_hits_for_x_suppression(), 1)

    def test_activation_queues_hn_first_then_the_four_free_sources(self) -> None:
        import api.services.social_ingestion as ingestion
        from api.workers import actors

        class FakeEngine:
            def begin(self):
                return nullcontext(object())

        with (
            patch.dict(os.environ, {"X_BEARER_TOKEN": "test-token"}, clear=True),
            patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
            patch.object(ingestion, "_service_profile_columns", return_value={}),
            patch.object(ingestion, "_load_service_profile", return_value=self._profile_row()),
            patch.object(actors.ingest_hn_batch_job, "send") as hn_send,
            patch.object(actors.ingest_additional_public_sources_batch_job, "send") as additional_send,
            patch.object(actors.ingest_x_job, "send") as x_send,
        ):
            plan = ingestion.enqueue_initial_public_source_ingestion("tenant-1", "profile-1")

        self.assertEqual(plan.hn_jobs, 1)
        self.assertEqual(plan.additional_source_jobs, 1)
        self.assertEqual(plan.x_jobs, 1)
        self.assertEqual(
            hn_send.call_args.kwargs["additional_sources"],
            ["bluesky", "stackexchange", "github", "lemmy"],
        )
        self.assertTrue(hn_send.call_args.kwargs["continue_to_additional_sources"])
        additional_send.assert_not_called()
        x_send.assert_not_called()

    def test_hn_batch_defers_paid_fallback_until_additional_free_sources_finish(self) -> None:
        from api.services.social_ingestion import HnIngestionResult
        from api.workers import actors
        import api.services.social_ingestion as ingestion

        with (
            patch.object(
                ingestion,
                "ingest_hn_posts",
                return_value=HnIngestionResult("onboarding", 1, 1, 0, [], plausible_hits=0),
            ),
            patch.object(ingestion, "trigger_embedding_jobs", return_value=0),
            patch.object(actors.ingest_additional_public_sources_batch_job, "send") as additional_send,
            patch.object(actors.ingest_x_job, "send") as x_send,
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_hn_batch_job.fn(
                CANONICAL_QUERIES,
                168,
                25,
                fallback_to_x=True,
                continue_to_additional_sources=True,
                additional_sources=["bluesky", "stackexchange", "github", "lemmy"],
                x_fallback_group_id="activation-1",
                x_fallback_query='"manual customer onboarding"',
                tenant_id="tenant-1",
            )

        additional_send.assert_called_once()
        self.assertEqual(additional_send.call_args.kwargs["initial_plausible_hits"], 0)
        self.assertEqual(
            additional_send.call_args.kwargs["enabled_sources"],
            ["bluesky", "stackexchange", "github", "lemmy"],
        )
        x_send.assert_not_called()

    def test_free_source_batch_runs_all_four_and_only_then_queues_one_x_fallback(self) -> None:
        from api.workers import actors
        import api.services.social_ingestion as ingestion

        results = [_result(source, external_id="42") for source in (
            "bluesky", "stackexchange", "github", "lemmy"
        )]
        with (
            patch.object(ingestion, "claim_additional_public_source_query", return_value=True),
            patch.object(
                ingestion,
                "ingest_additional_public_source_posts",
                side_effect=results,
            ) as ingest,
            patch.object(ingestion, "trigger_embedding_jobs", return_value=4) as trigger,
            patch.object(actors, "_x_source_is_configured", return_value=True),
            patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            patch.object(actors, "_claim_tenant_x_fallback_budget", return_value=True),
            patch.object(actors.ingest_x_job, "send") as x_send,
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_additional_public_sources_batch_job.fn(
                [{"query_type": "manual_workflow_frustration", "phrase": "manually deploying our API"}],
                168,
                25,
                initial_plausible_hits=0,
                fallback_to_x=True,
                enabled_sources=["bluesky", "stackexchange", "github", "lemmy"],
                x_fallback_group_id="activation-1",
                x_fallback_query='"manually deploying our API"',
                tenant_id="tenant-1",
            )

        self.assertEqual([item.kwargs["source"] for item in ingest.call_args_list], [
            "bluesky", "stackexchange", "github", "lemmy"
        ])
        trigger.assert_called_once_with(
            [
                PublicSourcePostRef("bluesky", "42"),
                PublicSourcePostRef("stackexchange", "42"),
                PublicSourcePostRef("github", "42"),
                PublicSourcePostRef("lemmy", "42"),
            ]
        )
        x_send.assert_called_once_with(
            '"manually deploying our API"',
            168,
            25,
            strict_single_page=True,
            tenant_id="tenant-1",
        )

    def test_business_outcome_query_skips_technical_sources_and_keeps_x_fallback(self) -> None:
        from api.workers import actors
        import api.services.social_ingestion as ingestion

        with (
            patch.object(ingestion, "claim_additional_public_source_query", return_value=True),
            patch.object(
                ingestion,
                "ingest_additional_public_source_posts",
                side_effect=[_result("bluesky"), _result("lemmy")],
            ) as ingest,
            patch.object(ingestion, "trigger_embedding_jobs", return_value=2),
            patch.object(actors, "_x_source_is_configured", return_value=True),
            patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            patch.object(actors, "_claim_tenant_x_fallback_budget", return_value=True),
            patch.object(actors.ingest_x_job, "send") as x_send,
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_additional_public_sources_batch_job.fn(
                [CANONICAL_QUERIES[0]],
                168,
                25,
                fallback_to_x=True,
                enabled_sources=["bluesky", "stackexchange", "github", "lemmy"],
                x_fallback_group_id="activation-1",
                x_fallback_query='"manual customer onboarding"',
                tenant_id="tenant-1",
            )

        self.assertEqual(
            [item.kwargs["source"] for item in ingest.call_args_list],
            ["bluesky", "lemmy"],
        )
        x_send.assert_called_once_with(
            '"manual customer onboarding"',
            168,
            25,
            strict_single_page=True,
            tenant_id="tenant-1",
        )

    def test_distinct_plausible_query_types_suppress_x_but_keep_review_handoff(self) -> None:
        from api.workers import actors
        import api.services.social_ingestion as ingestion

        results = [
            _result("bluesky", plausible_hits=1),
            _result("bluesky", plausible_hits=1),
        ]
        with (
            patch.object(ingestion, "claim_additional_public_source_query", return_value=True),
            patch.object(ingestion, "ingest_additional_public_source_posts", side_effect=results),
            patch.object(ingestion, "trigger_embedding_jobs", return_value=2),
            patch.object(actors.ingest_x_job, "send") as x_send,
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_additional_public_sources_batch_job.fn(
                [CANONICAL_QUERIES[0], CANONICAL_QUERIES[1]],
                168,
                25,
                fallback_to_x=True,
                enabled_sources=["bluesky"],
                x_fallback_group_id="activation-1",
                tenant_id="tenant-1",
            )

        x_send.assert_not_called()

    def test_many_plausible_hits_for_one_query_type_do_not_suppress_x(self) -> None:
        from api.workers import actors
        import api.services.social_ingestion as ingestion

        with (
            patch.object(ingestion, "claim_additional_public_source_query", return_value=True),
            patch.object(
                ingestion,
                "ingest_additional_public_source_posts",
                return_value=_result("bluesky", plausible_hits=8),
            ),
            patch.object(ingestion, "trigger_embedding_jobs", return_value=1),
            patch.object(actors, "_x_source_is_configured", return_value=True),
            patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            patch.object(actors, "_claim_tenant_x_fallback_budget", return_value=True),
            patch.object(actors.ingest_x_job, "send") as x_send,
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_additional_public_sources_batch_job.fn(
                [CANONICAL_QUERIES[0]],
                168,
                25,
                fallback_to_x=True,
                enabled_sources=["bluesky"],
                x_fallback_group_id="activation-1",
                x_fallback_query='"manual customer onboarding"',
                tenant_id="tenant-1",
            )

        x_send.assert_called_once_with(
            '"manual customer onboarding"',
            168,
            25,
            strict_single_page=True,
            tenant_id="tenant-1",
        )

    def test_one_failed_source_does_not_stop_the_remaining_sources_or_fallback(self) -> None:
        from api.workers import actors
        import api.services.social_ingestion as ingestion

        with (
            patch.object(ingestion, "claim_additional_public_source_query", return_value=True),
            patch.object(
                ingestion,
                "ingest_additional_public_source_posts",
                side_effect=[RuntimeError("temporary bluesky failure"), _result("github")],
            ) as ingest,
            patch.object(ingestion, "release_additional_public_source_query") as release,
            patch.object(ingestion, "trigger_embedding_jobs", return_value=1),
            patch.object(actors, "_x_source_is_configured", return_value=True),
            patch.object(actors, "_claim_initial_x_fallback", return_value=True),
            patch.object(actors, "_claim_tenant_x_fallback_budget", return_value=True),
            patch.object(actors.ingest_x_job, "send") as x_send,
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_additional_public_sources_batch_job.fn(
                [{"query_type": "manual_workflow_frustration", "phrase": "manually deploying our API"}],
                168,
                25,
                fallback_to_x=True,
                enabled_sources=["bluesky", "github"],
                x_fallback_group_id="activation-1",
                tenant_id="tenant-1",
            )

        self.assertEqual([item.kwargs["source"] for item in ingest.call_args_list], ["bluesky", "github"])
        release.assert_called_once_with(
            source="bluesky",
            query="manually deploying our API",
            since_hours_ago=168,
            scope="https://api.bsky.app/xrpc/app.bsky.feed.searchPosts",
        )
        x_send.assert_called_once()


class PublicSourceReferenceTests(unittest.TestCase):
    def test_embedding_handoffs_keep_equal_external_ids_separate_by_source(self) -> None:
        from api.workers import actors

        refs = [
            PublicSourcePostRef("hackernews", "42"),
            PublicSourcePostRef("twitter", "42"),
        ]
        with (
            patch.object(actors, "_require_redis_broker"),
            patch.object(actors.enqueue_source_post_embedding_job, "send") as send,
        ):
            sent = actors.enqueue_source_post_embedding_jobs(refs)

        self.assertEqual(sent, 2)
        self.assertEqual(
            send.call_args_list,
            [
                call("42", source="hackernews"),
                call("42", source="twitter"),
            ],
        )

    def test_embedding_actor_passes_the_source_to_the_matching_service(self) -> None:
        from api.workers import actors
        import api.services.social_ingestion as ingestion

        with (
            patch.object(
                ingestion,
                "process_public_source_post_embedding",
                return_value={
                    "posts": 1,
                    "embedded": 1,
                    "candidates": 0,
                    "ready_for_review": 0,
                },
            ) as process,
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.enqueue_source_post_embedding_job.fn("42", source="twitter")

        process.assert_called_once_with("42", source="twitter")


if __name__ == "__main__":
    unittest.main()
