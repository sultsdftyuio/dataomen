"""Coverage for activation-driven Hacker News and X discovery."""

from __future__ import annotations

import os
import unittest
from contextlib import nullcontext
from unittest.mock import call, patch

from api.services.social_ingestion import (
    enqueue_initial_public_source_ingestion,
    public_source_query_terms,
)
from api.services.verifier import ServiceProfile


class InitialPublicSourceIngestionTests(unittest.TestCase):
    def test_explicit_discovery_phrases_are_clean_and_bounded(self) -> None:
        profile = ServiceProfile(
            company_name="Arcli",
            one_liner="Buyer-intent prospecting",
            target_audience=["B2B SaaS founders"],
            core_problem_solved="Manual prospect research is slow.",
            key_value_propositions=["Verified buyer-intent matches"],
            ideal_customer_pain_points=["Manual prospect research"],
            search_terms=[
                '"manual prospect research"',
                "finding qualified B2B leads",
                "social listening for buyer intent",
                "this fourth phrase must not be queued",
            ],
        )

        with patch.dict(os.environ, {}, clear=True):
            terms = public_source_query_terms(profile)

        self.assertEqual(
            terms,
            [
                "manual prospect research",
                "finding qualified B2B leads",
                "social listening for buyer intent",
            ],
        )

    def test_activation_queues_hn_and_x_for_each_discovery_phrase(self) -> None:
        import api.services.social_ingestion as ingestion
        from api.workers import actors

        profile_row = {
            "id": "profile-1",
            "tenant_id": "tenant-1",
            "profile_json": {
                "company_name": "Arcli",
                "one_liner": "Buyer-intent prospecting",
                "target_audience": ["B2B SaaS founders"],
                "core_problem_solved": "Manual prospect research is slow.",
                "key_value_propositions": ["Verified buyer-intent matches"],
                "ideal_customer_pain_points": ["Manual prospect research"],
                "search_terms": [
                    "manual prospect research",
                    "finding qualified B2B leads",
                    "social listening for buyer intent",
                ],
            },
        }

        class FakeEngine:
            def begin(self):
                return nullcontext(object())

        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
            patch.object(ingestion, "_service_profile_columns", return_value={}),
            patch.object(ingestion, "_load_service_profile", return_value=profile_row),
            patch.object(actors.ingest_hn_job, "send") as hn_send,
            patch.object(actors.ingest_x_job, "send") as x_send,
        ):
            plan = enqueue_initial_public_source_ingestion("tenant-1", "profile-1")

        self.assertEqual(plan.query_terms, profile_row["profile_json"]["search_terms"])
        self.assertEqual(plan.hn_jobs, 3)
        self.assertEqual(plan.x_jobs, 3)
        expected_calls = [
            call("manual prospect research", 168, 25, fallback_to_x=True),
            call("finding qualified B2B leads", 168, 25, fallback_to_x=True),
            call("social listening for buyer intent", 168, 25, fallback_to_x=True),
        ]
        self.assertEqual(hn_send.call_args_list, expected_calls)
        x_send.assert_not_called()

    def test_legacy_profile_prefers_compact_value_propositions_over_pain_prose(self) -> None:
        profile = ServiceProfile(
            company_name="Arcli",
            one_liner="Find buyer intent in public conversations",
            target_audience=["B2B SaaS founders"],
            core_problem_solved="Teams spend too long finding qualified leads in public posts.",
            key_value_propositions=["Verified buyer intent", "Qualified B2B leads"],
            ideal_customer_pain_points=[
                "Spending hours searching Reddit HN and X for leads while getting irrelevant results."
            ],
        )

        with patch.dict(os.environ, {}, clear=True):
            terms = public_source_query_terms(profile)

        self.assertEqual(
            terms,
            [
                "Verified buyer intent",
                "Qualified B2B leads",
                "Find buyer intent in public conversations",
            ],
        )

    def test_disabled_source_is_not_queued(self) -> None:
        import api.services.social_ingestion as ingestion
        from api.workers import actors

        profile_row = {
            "profile_json": {
                "company_name": "Arcli",
                "one_liner": "Buyer-intent prospecting",
                "target_audience": ["B2B SaaS founders"],
                "core_problem_solved": "Manual prospect research is slow.",
                "key_value_propositions": ["Verified buyer-intent matches"],
                "ideal_customer_pain_points": ["Manual prospect research"],
                "search_terms": ["manual prospect research"],
            },
        }

        class FakeEngine:
            def begin(self):
                return nullcontext(object())

        with (
            patch.dict(os.environ, {"ARCLI_X_INGESTION_ENABLED": "false"}, clear=True),
            patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
            patch.object(ingestion, "_service_profile_columns", return_value={}),
            patch.object(ingestion, "_load_service_profile", return_value=profile_row),
            patch.object(actors.ingest_hn_job, "send") as hn_send,
            patch.object(actors.ingest_x_job, "send") as x_send,
        ):
            plan = enqueue_initial_public_source_ingestion("tenant-1", "profile-1")

        self.assertEqual(plan.hn_jobs, 1)
        self.assertEqual(plan.x_jobs, 0)
        hn_send.assert_called_once_with(
            "manual prospect research",
            168,
            25,
            fallback_to_x=False,
        )
        x_send.assert_not_called()


if __name__ == "__main__":
    unittest.main()
