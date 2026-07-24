"""Coverage for the global-source to tenant-scoped matching boundary."""

from __future__ import annotations

import unittest
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch

from api.services.verifier import VerificationResult


class PublicSourceMatchingTests(unittest.TestCase):
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
            "id": "00000000-0000-0000-0000-000000000002",
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
        self.assertEqual(persisted[0]["source_post_id"], source_row["id"])


if __name__ == "__main__":
    unittest.main()
