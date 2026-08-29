"""Fast-check fan-out/fan-in coverage."""

from __future__ import annotations

import os
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from api.services.social.fast_check import (
    FastCheckQueryOutcome,
    FastCheckSourceResult,
    run_fast_public_source_check,
)


class FastPublicSourceCheckTests(unittest.TestCase):
    def test_faster_source_is_reported_before_a_slow_source_finishes(self) -> None:
        import api.services.social_ingestion as ingestion

        hn_started = threading.Event()
        release_hn = threading.Event()
        completed_sources: list[str] = []

        def slow_hn(**_kwargs: object):
            hn_started.set()
            self.assertTrue(release_hn.wait(timeout=2))
            return SimpleNamespace(
                hits_found=1,
                plausible_hits=1,
                inserted_count=1,
                matchable_source_post_refs=[],
                matchable_source_post_ids=[],
            )

        def fast_bluesky(**_kwargs: object):
            self.assertTrue(hn_started.wait(timeout=2))
            return SimpleNamespace(
                hits_found=2,
                plausible_hits=1,
                inserted_count=1,
                matchable_source_post_refs=[],
            )

        queries = [{"query_type": "buyer_pain", "phrase": "need more leads"}]
        with (
            patch.object(ingestion, "ingest_hn_posts", side_effect=slow_hn),
            patch.object(
                ingestion,
                "additional_public_source_supports_discovery_query",
                return_value=True,
            ),
            patch.object(ingestion, "additional_public_source_cache_scope", return_value=""),
            patch.object(ingestion, "claim_additional_public_source_query", return_value=True),
            patch.object(
                ingestion,
                "ingest_additional_public_source_posts",
                side_effect=fast_bluesky,
            ),
            patch.object(ingestion, "_result_source_post_refs", return_value=[]),
        ):
            # Release the slow task only after the fast callback has arrived.
            def on_complete(result: FastCheckSourceResult) -> None:
                completed_sources.append(result.source)
                if result.source == "bluesky":
                    release_hn.set()

            results = run_fast_public_source_check(
                queries,
                sources=["hackernews", "bluesky"],
                since_hours_ago=24,
                posts_per_query=10,
                max_concurrency=2,
                on_source_completed=on_complete,
            )

        self.assertEqual(completed_sources, ["bluesky", "hackernews"])
        self.assertEqual({result.source for result in results}, {"bluesky", "hackernews"})

    def test_empty_additional_source_response_releases_the_query_claim(self) -> None:
        """An empty search must not hide a newly indexed post until cache expiry."""
        import api.services.social_ingestion as ingestion

        empty_result = SimpleNamespace(
            hits_found=0,
            plausible_hits=0,
            inserted_count=0,
            matchable_source_post_refs=[],
        )
        with (
            patch.object(
                ingestion,
                "additional_public_source_supports_discovery_query",
                return_value=True,
            ),
            patch.object(
                ingestion,
                "additional_public_source_cache_scope",
                return_value="scope",
            ),
            patch.object(
                ingestion,
                "claim_additional_public_source_query",
                return_value=True,
            ),
            patch.object(
                ingestion,
                "ingest_additional_public_source_posts",
                return_value=empty_result,
            ),
            patch.object(ingestion, "release_additional_public_source_query") as release,
        ):
            results = run_fast_public_source_check(
                [{"query_type": "buyer_pain", "phrase": "need more leads"}],
                sources=["bluesky"],
                since_hours_ago=24,
                posts_per_query=10,
                max_concurrency=1,
            )

        release.assert_called_once_with(
            source="bluesky",
            query="need more leads",
            since_hours_ago=24,
            scope="scope",
        )
        self.assertEqual(results[0].query_outcomes[0].outcome, "completed")

    def test_query_outcome_keeps_post_provenance_for_candidate_pooling(self) -> None:
        import api.services.social_ingestion as ingestion

        source_ref = SimpleNamespace(source="bluesky", source_post_id="post-1")
        result = SimpleNamespace(
            hits_found=1,
            plausible_hits=1,
            inserted_count=1,
            matchable_source_post_refs=[source_ref],
        )
        with (
            patch.object(
                ingestion,
                "additional_public_source_supports_discovery_query",
                return_value=True,
            ),
            patch.object(
                ingestion,
                "additional_public_source_cache_scope",
                return_value="scope",
            ),
            patch.object(
                ingestion,
                "claim_additional_public_source_query",
                return_value=True,
            ),
            patch.object(
                ingestion,
                "ingest_additional_public_source_posts",
                return_value=result,
            ),
        ):
            results = run_fast_public_source_check(
                [{"query_type": "buyer_pain", "phrase": "need more leads"}],
                sources=["bluesky"],
                since_hours_ago=24,
                posts_per_query=10,
                max_concurrency=1,
            )

        query_outcome = results[0].query_outcomes[0]
        self.assertEqual(query_outcome.source_post_refs, (source_ref,))
        self.assertEqual(results[0].source_post_refs, (source_ref,))

    def test_parent_actor_completes_only_after_every_source_callback(self) -> None:
        from api.workers import actors

        first = FastCheckSourceResult(
            source="hackernews",
            query_outcomes=(
                FastCheckQueryOutcome(
                    source="hackernews",
                    query_type="buyer_pain",
                    query="need more leads",
                    outcome="completed",
                    hits_found=1,
                    plausible_hits=1,
                ),
            ),
        )
        second = FastCheckSourceResult(
            source="bluesky",
            query_outcomes=(
                FastCheckQueryOutcome(
                    source="bluesky",
                    query_type="buyer_pain",
                    query="need more leads",
                    outcome="completed",
                    hits_found=2,
                    plausible_hits=1,
                ),
            ),
        )
        complete_run = MagicMock()

        def run_sources(*_args: object, **kwargs: object) -> list[FastCheckSourceResult]:
            callback = kwargs["on_source_completed"]
            callback(first)
            self.assertEqual(complete_run.call_count, 0)
            callback(second)
            self.assertEqual(complete_run.call_count, 0)
            return [first, second]

        with (
            patch(
                "api.services.social.fast_check.run_fast_public_source_check",
                side_effect=run_sources,
            ),
            patch("api.services.social_ingestion.trigger_embedding_jobs", return_value=0),
            patch(
                "api.services.social_ingestion.enqueue_existing_public_source_rematch",
                return_value="rematch-message",
            ) as rematch_enqueue,
            patch.object(actors, "_complete_discovery_run", complete_run),
            patch.object(actors, "_record_discovery_event"),
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_initial_public_sources_fast_job.fn(
                [{"query_type": "buyer_pain", "phrase": "need more leads"}],
                enabled_sources=["hackernews", "bluesky"],
                tenant_id="tenant-1",
                service_profile_id="profile-1",
                discovery_run_id="run-1",
            )

        complete_run.assert_called_once()
        self.assertEqual(complete_run.call_args.kwargs["status"], "completed")
        self.assertEqual(
            complete_run.call_args.kwargs["summary"]["sources"],
            {"hackernews": 1, "bluesky": 2},
        )
        self.assertTrue(
            complete_run.call_args.kwargs["summary"]["source_completion"]
            ["all_sources_finished"]
        )
        rematch_enqueue.assert_called_once_with(
            "tenant-1",
            "profile-1",
            delay_ms=300_000,
        )

    def test_parent_actor_caps_embedding_handoffs_and_reports_excluded_posts(self) -> None:
        from api.workers import actors

        first = FastCheckSourceResult(
            source="hackernews",
            query_outcomes=(
                FastCheckQueryOutcome(
                    source="hackernews",
                    query_type="buyer_pain",
                    query="need more leads",
                    outcome="completed",
                    hits_found=2,
                    plausible_hits=2,
                ),
            ),
            source_post_refs=("hn-1", "hn-2"),
        )
        second = FastCheckSourceResult(
            source="bluesky",
            query_outcomes=(
                FastCheckQueryOutcome(
                    source="bluesky",
                    query_type="buyer_pain",
                    query="need more leads",
                    outcome="completed",
                    hits_found=2,
                    plausible_hits=2,
                ),
            ),
            source_post_refs=("bs-1", "bs-2"),
        )
        complete_run = MagicMock()

        def run_sources(*_args: object, **kwargs: object) -> list[FastCheckSourceResult]:
            callback = kwargs["on_source_completed"]
            callback(first)
            callback(second)
            return [first, second]

        with (
            patch.dict(
                os.environ,
                {
                    "ARCLI_INITIAL_PUBLIC_EMBEDDING_POST_LIMIT": "3",
                    "ARCLI_INITIAL_PUBLIC_EMBEDDING_POSTS_PER_SOURCE_LIMIT": "1",
                    "ARCLI_INITIAL_PUBLIC_REMATCH_ENABLED": "false",
                },
                clear=False,
            ),
            patch(
                "api.services.social.fast_check.run_fast_public_source_check",
                side_effect=run_sources,
            ),
            patch("api.services.social_ingestion.trigger_embedding_jobs", return_value=1) as enqueue,
            patch.object(actors, "_complete_discovery_run", complete_run),
            patch.object(actors, "_record_discovery_event"),
            patch.object(actors, "_close_actor_openai_clients"),
        ):
            actors.ingest_initial_public_sources_fast_job.fn(
                [{"query_type": "buyer_pain", "phrase": "need more leads"}],
                enabled_sources=["hackernews", "bluesky"],
                tenant_id="tenant-1",
                service_profile_id="profile-1",
                discovery_run_id="run-1",
            )

        assert [call.args[0] for call in enqueue.call_args_list] == [["hn-1"], ["bs-1"]]
        budget = complete_run.call_args.kwargs["summary"]["embedding_post_budget"]
        assert budget == {
            "post_limit": 3,
            "per_source_limit": 1,
            "selected": 2,
            "selected_by_source": {"hackernews": 1, "bluesky": 1},
            "selected_identified_authors": 0,
            "excluded": 2,
            "average_signal_score": 0,
            "selected_signal_reasons": {},
        }


if __name__ == "__main__":
    unittest.main()
