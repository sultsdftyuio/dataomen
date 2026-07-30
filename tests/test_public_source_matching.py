"""Coverage for the global-source to tenant-scoped matching boundary."""

from __future__ import annotations

import os
import unittest
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID

from api.services.verifier import VERIFIER_POLICY_VERSION, VerificationResult


class PublicSourceMatchingTests(unittest.TestCase):
    def test_source_qualified_embedding_load_never_blends_equal_external_ids(self) -> None:
        import api.services.social_ingestion as ingestion

        rows = [
            {"id": "hn-row", "source": "hackernews", "source_post_id": "42"},
            {"id": "x-row", "source": "twitter", "source_post_id": "42"},
        ]

        class FakeResult:
            def __init__(self, result_rows):
                self.result_rows = result_rows

            def mappings(self):
                return self.result_rows

        class FakeConnection:
            def __init__(self, result_rows) -> None:
                self.result_rows = result_rows
                self.sql = ""
                self.params: dict[str, object] = {}

            def execute(self, statement, params):
                self.sql = str(statement)
                self.params = params
                return FakeResult(self.result_rows)

        connection = FakeConnection(rows)
        with patch.object(
            ingestion,
            "_table_columns",
            return_value={"id", "source", "source_post_id", "tenant_id"},
        ):
            # A delayed pre-source queue message must skip an ambiguous ID.
            self.assertEqual(ingestion._load_public_source_post_rows(connection, "42"), [])

        self.assertIn("LIMIT 2", connection.sql)

        twitter_connection = FakeConnection([rows[1]])
        with patch.object(
            ingestion,
            "_table_columns",
            return_value={"id", "source", "source_post_id", "tenant_id"},
        ):
            selected = ingestion._load_public_source_post_rows(
                twitter_connection,
                "42",
                source="twitter",
            )

        self.assertEqual(selected, [rows[1]])
        self.assertIn("source = :source", twitter_connection.sql)
        self.assertEqual(twitter_connection.params["source"], "twitter")

    def test_global_post_creates_a_tenant_scoped_verified_match(self) -> None:
        import api.services.social_ingestion as ingestion

        source_row = {
            "id": "00000000-0000-0000-0000-000000000001",
            "source": "twitter",
            "source_post_id": "tweet-1",
            "title": "Need a billing tool",
            "body": "I need a better recurring billing platform.",
            "author_handle": "alice",
            "url": "https://x.com/alice/status/tweet-1",
            "metadata": {},
        }
        profile_row = {
            "id": UUID("00000000-0000-0000-0000-000000000002"),
            "tenant_id": "tenant-a",
            "company_name": "Billing Co",
            "one_liner": "Recurring billing software",
            "target_audience": ["SaaS founders"],
            "core_problem_solved": "Recurring billing",
            "key_value_propositions": ["Automated billing"],
            "ideal_customer_pain_points": ["Manual invoices"],
            "profile_embedding": [1.0, 0.0],
        }
        persisted: list[dict[str, object]] = []

        class FakeEngine:
            def begin(self):
                return nullcontext(object())

        class FakeEmbeddingService:
            model = "test-embedding-model"

            def embed_text(self, *args, **kwargs):
                return SimpleNamespace(embedding=[1.0, 0.0], model=self.model)

            def close(self) -> None:
                return None

        class FakeVerifier:
            model = "test-verifier-model"

            def verify(self, *args, **kwargs):
                return VerificationResult(
                    match=True,
                    decision_label="strong_match",
                    confidence=0.95,
                    pain_detected="Manual billing work",
                    why_this_matches="The post asks for recurring billing software.",
                    suggested_reply="I can help automate recurring billing.",
                )

            def close(self) -> None:
                return None

        def record_lead_match(*_args, **kwargs):
            persisted.append(kwargs)

        with (
            patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
            patch.object(
                ingestion,
                "_load_public_source_post_rows",
                return_value=[source_row],
            ),
            patch.object(
                ingestion,
                "_public_matching_profile_rows",
                return_value=[profile_row],
            ),
            patch.object(ingestion, "_table_columns", return_value={}),
            patch.object(
                ingestion,
                "_cached_public_source_post_embedding",
                return_value=None,
            ),
            patch.object(ingestion, "_persist_public_source_post_embedding_cache"),
            patch.object(ingestion, "_cached_lead_verification", return_value=None),
            patch.object(ingestion, "_persist_lead_match", side_effect=record_lead_match),
            patch.object(ingestion, "EmbeddingService", FakeEmbeddingService),
            patch.object(ingestion, "VerifierService", FakeVerifier),
        ):
            result = ingestion.process_public_source_post_embedding("tweet-1")

        self.assertEqual(result["posts"], 1)
        self.assertEqual(result["embedded"], 1)
        self.assertEqual(result["candidates"], 1)
        self.assertEqual(result["ready_for_review"], 1)
        self.assertEqual(len(persisted), 1)
        self.assertEqual(persisted[0]["tenant_id"], "tenant-a")
        self.assertEqual(
            persisted[0]["service_profile_id"],
            "00000000-0000-0000-0000-000000000002",
        )
        self.assertEqual(persisted[0]["source_post_id"], source_row["id"])
        self.assertEqual(
            persisted[0]["verifier_policy_version"],
            VERIFIER_POLICY_VERSION,
        )

    def test_activation_rematches_only_the_new_profile_against_cached_global_posts(self) -> None:
        import api.services.social_ingestion as ingestion

        source_row = {
            "id": "00000000-0000-0000-0000-000000000011",
            "source": "hackernews",
            "source_post_id": "hn-1",
            "title": "Billing help",
            "body": "What recurring billing platform should we switch to?",
            "author_handle": "alice",
            "url": "https://news.ycombinator.com/item?id=hn-1",
            "metadata": {},
            "embedding_status": "completed",
        }
        profile_row = {
            "id": UUID("00000000-0000-0000-0000-000000000012"),
            "tenant_id": "tenant-new",
            "company_name": "Billing Co",
            "one_liner": "Recurring billing software",
            "target_audience": ["SaaS founders"],
            "core_problem_solved": "Recurring billing",
            "key_value_propositions": ["Automated billing"],
            "ideal_customer_pain_points": ["Manual invoices"],
            "profile_embedding": [1.0, 0.0],
        }
        persisted: list[dict[str, object]] = []

        class FakeEngine:
            def begin(self):
                return nullcontext(object())

        class FakeEmbeddingService:
            model = "test-embedding-model"

            def close(self) -> None:
                return None

        class FakeVerifier:
            model = "test-verifier-model"

            def verify(self, *_args, **_kwargs):
                return VerificationResult(
                    match=True,
                    decision_label="weak_match",
                    confidence=0.6,
                    pain_detected="Manual billing work",
                    why_this_matches="The post asks for a billing platform.",
                    suggested_reply="Here is how we handle recurring billing.",
                )

            def close(self) -> None:
                return None

        def record_lead_match(*_args, **kwargs):
            persisted.append(kwargs)

        with (
            patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
            patch.object(ingestion, "_service_profile_columns", return_value={}),
            patch.object(ingestion, "_load_service_profile", return_value=profile_row) as load_profile,
            patch.object(
                ingestion,
                "_load_recent_embedded_public_source_post_rows",
                return_value=[source_row],
            ),
            patch.object(ingestion, "_public_matching_profile_rows") as all_profiles,
            patch.object(ingestion, "_table_columns", return_value={}),
            patch.object(
                ingestion,
                "_cached_public_source_post_embedding",
                return_value=[1.0, 0.0],
            ),
            patch.object(ingestion, "_cached_lead_verification", return_value=None),
            patch.object(ingestion, "_persist_lead_match", side_effect=record_lead_match),
            patch.object(ingestion, "EmbeddingService", FakeEmbeddingService),
            patch.object(ingestion, "VerifierService", FakeVerifier),
        ):
            result = ingestion.rematch_existing_public_source_posts_for_profile(
                "tenant-new",
                "00000000-0000-0000-0000-000000000012",
            )

        load_profile.assert_called_once()
        all_profiles.assert_not_called()
        self.assertEqual(result["posts"], 1)
        self.assertEqual(result["embedded"], 1)
        self.assertEqual(result["cache_misses"], 0)
        self.assertEqual(result["candidates"], 1)
        self.assertEqual(result["ready_for_review"], 0)
        self.assertEqual(result["discovery_candidates"], 1)
        self.assertEqual(len(persisted), 1)
        self.assertEqual(persisted[0]["tenant_id"], "tenant-new")
        self.assertEqual(
            persisted[0]["service_profile_id"],
            "00000000-0000-0000-0000-000000000012",
        )
        self.assertEqual(
            persisted[0]["verifier_policy_version"],
            VERIFIER_POLICY_VERSION,
        )

    def test_cached_verdict_requires_the_current_verifier_policy_version(self) -> None:
        from api.services.social.legacy_storage import _cached_lead_verification

        verdict = VerificationResult(
            match=False,
            decision_label="not_a_match",
            confidence=0.1,
            pain_detected="",
            why_this_matches="No matching buyer evidence.",
            rejection_reason="llm_not_a_match",
        ).model_dump()

        class FakeMappings:
            def __init__(self, row: dict[str, object]) -> None:
                self.row = row

            def first(self) -> dict[str, object]:
                return self.row

        class FakeResult:
            def __init__(self, row: dict[str, object]) -> None:
                self.row = row

            def mappings(self) -> FakeMappings:
                return FakeMappings(self.row)

        class FakeConnection:
            def __init__(self, row: dict[str, object]) -> None:
                self.row = row

            def execute(self, *_args: object, **_kwargs: object) -> FakeResult:
                return FakeResult(self.row)

        def cached_result(policy_version: str | None) -> VerificationResult | None:
            metadata = {
                "profile_embedding_sha256": "profile-hash",
                "verifier_model": "test-model",
            }
            if policy_version is not None:
                metadata["verifier_policy_version"] = policy_version
            return _cached_lead_verification(
                FakeConnection({"metadata": metadata, "verification": verdict}),
                tenant_id="tenant-a",
                service_profile_id=None,
                source_post_id=None,
                external_key="hackernews:123",
                profile_embedding_sha256="profile-hash",
                verifier_model="test-model",
                verifier_policy_version=VERIFIER_POLICY_VERSION,
                columns={"tenant_id": {}, "metadata": {}, "verification": {}},
            )

        self.assertIsNone(cached_result(None))
        self.assertIsNone(cached_result("buyer_outcome_v1"))
        self.assertIsNotNone(cached_result(VERIFIER_POLICY_VERSION))

    def test_rematch_candidate_limit_is_bounded_before_verification(self) -> None:
        import api.services.social_ingestion as ingestion

        source_rows = [
            {
                "id": f"00000000-0000-0000-0000-0000000000{index:02d}",
                "source": "hackernews",
                "source_post_id": f"hn-{index}",
                "body": f"Need billing platform {index}",
                "url": f"https://news.ycombinator.com/item?id={index}",
                "metadata": {},
            }
            for index in (21, 22)
        ]
        profile_row = {
            "id": "profile-1",
            "tenant_id": "tenant-a",
            "company_name": "Billing Co",
            "one_liner": "Recurring billing software",
            "target_audience": ["SaaS founders"],
            "core_problem_solved": "Recurring billing",
            "key_value_propositions": ["Automated billing"],
            "ideal_customer_pain_points": ["Manual invoices"],
            "profile_embedding": [1.0, 0.0],
        }

        class FakeEngine:
            def begin(self):
                return nullcontext(object())

        class FakeEmbeddingService:
            model = "test-embedding-model"

            def close(self) -> None:
                return None

        with (
            patch.dict(
                os.environ,
                {"ARCLI_INITIAL_PUBLIC_GLOBAL_REMATCH_MAX_CANDIDATES": "1"},
                clear=True,
            ),
            patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
            patch.object(ingestion, "_service_profile_columns", return_value={}),
            patch.object(ingestion, "_load_service_profile", return_value=profile_row),
            patch.object(
                ingestion,
                "_load_recent_embedded_public_source_post_rows",
                return_value=source_rows,
            ),
            patch.object(ingestion, "_table_columns", return_value={}),
            patch.object(
                ingestion,
                "_cached_public_source_post_embedding",
                return_value=[1.0, 0.0],
            ),
            patch.object(ingestion, "find_candidate_matches", return_value=[]) as matcher,
            patch.object(ingestion, "EmbeddingService", FakeEmbeddingService),
        ):
            result = ingestion.rematch_existing_public_source_posts_for_profile(
                "tenant-a",
                "profile-1",
            )

        self.assertEqual(result["embedded"], 2)
        self.assertEqual(result["candidates"], 0)
        self.assertEqual(matcher.call_args.kwargs["max_candidates"], 1)

    def test_discovery_candidate_requires_a_real_conservative_verifier_match(self) -> None:
        import api.services.social_ingestion as ingestion

        weak_verified = VerificationResult(
            match=True,
            decision_label="weak_match",
            confidence=0.6,
            pain_detected="Manual billing work",
            why_this_matches="Plausible recurring billing need.",
            suggested_reply="Here is a useful resource.",
        )
        self.assertEqual(ingestion._lead_match_status(weak_verified), "discovery_candidate")

        low_confidence = weak_verified.model_copy(update={"confidence": 0.49})
        self.assertEqual(ingestion._lead_match_status(low_confidence), "rejected")

        skipped = weak_verified.model_copy(update={"verifier_executed": False})
        self.assertEqual(ingestion._lead_match_status(skipped), "rejected")

        non_match_label = weak_verified.model_copy(update={"decision_label": "not_a_match"})
        self.assertEqual(ingestion._lead_match_status(non_match_label), "rejected")

    def test_profile_activation_enqueues_historical_corpus_rematch(self) -> None:
        import api.services.embeddings as embeddings
        import api.services.social_ingestion as ingestion
        import api.services.ingestion_service as ingestion_service

        with (
            patch.object(
                ingestion_service,
                "enqueue_initial_public_ingestion_job",
                return_value="initial-message",
            ) as initial_enqueue,
            patch.object(
                ingestion,
                "enqueue_existing_public_source_rematch",
                return_value="rematch-message",
            ) as rematch_enqueue,
        ):
            embeddings._enqueue_public_ingestion_after_embedding("tenant-a", "profile-1")

        initial_enqueue.assert_called_once_with("tenant-a", "profile-1")
        rematch_enqueue.assert_called_once_with("tenant-a", "profile-1")

    def test_profile_embedding_text_includes_urgency_and_canonical_discovery_phrases(self) -> None:
        from api.services.embeddings import _service_profile_embedding_text

        text_value = _service_profile_embedding_text(
            {
                "profile_json": {
                    "company_name": "Billing Co",
                    "one_liner": "Recurring billing automation",
                    "urgency_signals": ["Renewal failures are escalating"],
                    "discovery_queries": [
                        {"query_type": "buyer_pain", "phrase": "manual payment reconciliation"},
                        {"query_type": "urgent_failure", "phrase": "failed renewal payments"},
                    ],
                    "search_terms": ["legacy phrase"],
                }
            }
        )

        self.assertIn("Urgency signals: Renewal failures are escalating", text_value)
        self.assertIn(
            "Buyer discovery phrases: manual payment reconciliation, failed renewal payments",
            text_value,
        )


if __name__ == "__main__":
    unittest.main()
