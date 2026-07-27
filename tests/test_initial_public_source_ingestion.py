"""Coverage for activation-driven typed Hacker News and X discovery."""

from __future__ import annotations

import os
import unittest
from contextlib import nullcontext
from unittest.mock import patch

from api.services.social_ingestion import (
    DISCOVERY_QUERY_TYPES,
    DiscoveryQuery,
    _profile_discovery_queries,
    _x_fallback_query,
    enqueue_initial_public_source_ingestion,
    public_source_queries,
    public_source_query_terms,
)
from api.services.verifier import ServiceProfile


CANONICAL_DISCOVERY_QUERIES = [
    {"query_type": "buyer_pain", "phrase": "payments reconciliation backlog"},
    {"query_type": "urgent_failure", "phrase": "failed renewal payments"},
    {"query_type": "recommendation_request", "phrase": "recommendation for billing software"},
    {
        "query_type": "manual_workflow_frustration",
        "phrase": "manually chasing overdue invoices",
    },
    {"query_type": "category_tool_search", "phrase": "subscription billing platform"},
    {"query_type": "switching_trigger", "phrase": "switching from legacy billing"},
]


def _profile_row() -> dict[str, object]:
    return {
        "id": "profile-1",
        "tenant_id": "tenant-1",
        "profile_json": {
            "company_name": "Billing Co",
            "one_liner": "Recurring billing automation for SaaS teams",
            "target_audience": ["SaaS finance teams"],
            "core_problem_solved": "Recurring billing work is manual and error prone.",
            "key_value_propositions": ["Automated recurring billing"],
            "ideal_customer_pain_points": ["Manual payment reconciliation"],
            "urgency_signals": ["Renewals are failing this week"],
            "discovery_queries": CANONICAL_DISCOVERY_QUERIES,
            # Deliberately retain a legacy appendage: canonical typed phrases
            # must remain the activation plan's source of truth.
            "search_terms": [
                *[query["phrase"] for query in CANONICAL_DISCOVERY_QUERIES],
                "legacy phrase that must not replace typed coverage",
            ],
        },
    }


class InitialPublicSourceIngestionTests(unittest.TestCase):
    def test_typed_discovery_queries_are_preserved_and_default_to_six(self) -> None:
        row = _profile_row()
        typed_queries = _profile_discovery_queries(row)
        profile = ServiceProfile(
            company_name="Billing Co",
            one_liner="Recurring billing automation",
            target_audience=["SaaS finance teams"],
            core_problem_solved="Manual recurring billing",
            key_value_propositions=["Automated recurring billing"],
            ideal_customer_pain_points=["Manual reconciliation"],
            search_terms=[query.phrase for query in typed_queries],
        )

        with patch.dict(os.environ, {}, clear=True):
            queries = public_source_queries(profile, discovery_queries=typed_queries)

        self.assertEqual([query.query_type for query in queries], list(DISCOVERY_QUERY_TYPES))
        self.assertEqual(
            [query.phrase for query in queries],
            [query["phrase"] for query in CANONICAL_DISCOVERY_QUERIES],
        )

    def test_legacy_flat_queries_stay_compatible_and_can_be_bounded(self) -> None:
        profile = ServiceProfile(
            company_name="Billing Co",
            one_liner="Recurring billing automation",
            target_audience=["SaaS finance teams"],
            core_problem_solved="Manual recurring billing",
            key_value_propositions=["Automated recurring billing"],
            ideal_customer_pain_points=["Manual reconciliation"],
            search_terms=[
                '"manual payment reconciliation"',
                "failed renewal payments",
                "recommendation for billing software",
                "manually chasing overdue invoices",
            ],
        )

        with patch.dict(
            os.environ,
            {"ARCLI_INITIAL_PUBLIC_INGESTION_QUERY_LIMIT": "3"},
            clear=True,
        ):
            terms = public_source_query_terms(profile)

        self.assertEqual(
            terms,
            [
                "manual payment reconciliation",
                "failed renewal payments",
                "recommendation for billing software",
            ],
        )

    def test_activation_queues_typed_hn_plan_and_one_x_fallback(self) -> None:
        import api.services.social_ingestion as ingestion
        from api.workers import actors

        class FakeEngine:
            def begin(self):
                return nullcontext(object())

        with (
            patch.dict(os.environ, {"X_BEARER_TOKEN": "test-token"}, clear=True),
            patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
            patch.object(ingestion, "_service_profile_columns", return_value={}),
            patch.object(ingestion, "_load_service_profile", return_value=_profile_row()),
            patch.object(actors.ingest_hn_batch_job, "send") as hn_send,
            patch.object(actors.ingest_x_job, "send") as x_send,
        ):
            plan = enqueue_initial_public_source_ingestion("tenant-1", "profile-1")

        self.assertEqual(
            plan.query_terms,
            [query["phrase"] for query in CANONICAL_DISCOVERY_QUERIES],
        )
        self.assertEqual(
            [query.to_payload() for query in plan.queries],
            CANONICAL_DISCOVERY_QUERIES,
        )
        self.assertEqual(plan.hn_jobs, 1)
        self.assertEqual(plan.x_jobs, 1)
        self.assertIsNone(plan.x_skip_reason)
        hn_send.assert_called_once()
        queued_call = hn_send.call_args
        self.assertEqual(queued_call.args[0], CANONICAL_DISCOVERY_QUERIES)
        self.assertEqual(queued_call.args[1:], (168, 25))
        self.assertEqual(queued_call.kwargs["tenant_id"], "tenant-1")
        self.assertEqual(queued_call.kwargs["service_profile_id"], "profile-1")
        self.assertTrue(queued_call.kwargs["fallback_to_x"])
        self.assertTrue(queued_call.kwargs["x_fallback_group_id"])
        self.assertEqual(
            queued_call.kwargs["x_fallback_query"],
            _x_fallback_query(CANONICAL_DISCOVERY_QUERIES),
        )
        x_send.assert_not_called()

    def test_x_fallback_query_combines_all_typed_discovery_terms_once(self) -> None:
        self.assertEqual(
            _x_fallback_query(CANONICAL_DISCOVERY_QUERIES[:2]),
            '("payments reconciliation backlog" OR "failed renewal payments")',
        )

    def test_x_fallback_query_quotes_boolean_words_as_buyer_language(self) -> None:
        expression = _x_fallback_query(
            [
                {"query_type": "buyer_pain", "phrase": "sales and marketing handoffs fail"},
                {
                    "query_type": "recommendation_request",
                    "phrase": "which tool works for revenue or operations",
                },
            ]
        )

        self.assertEqual(
            expression,
            '("sales and marketing handoffs fail" OR '
            '"which tool works for revenue or operations")',
        )

    def test_public_source_query_preserves_a_complete_matching_brief_phrase(self) -> None:
        phrase = "I waste hours checking conversations and still miss teams ready to buy"
        profile = ServiceProfile(
            company_name="Billing Co",
            one_liner="Recurring billing automation",
            target_audience=["SaaS finance teams"],
            core_problem_solved="Manual recurring billing",
            key_value_propositions=["Automated recurring billing"],
            ideal_customer_pain_points=["Manual reconciliation"],
            search_terms=[phrase],
        )

        queries = public_source_queries(
            profile,
            discovery_queries=[DiscoveryQuery("buyer_pain", phrase)],
        )

        self.assertEqual([query.phrase for query in queries], [phrase])

    def test_x_fallback_query_never_truncates_a_clause(self) -> None:
        long_terms = [
            {"query_type": query_type, "phrase": f"phrase{index} " + "x" * 72}
            for index, query_type in enumerate(DISCOVERY_QUERY_TYPES)
        ]

        expression = _x_fallback_query(long_terms)

        self.assertLessEqual(len(expression), 400)
        self.assertTrue(expression.endswith('")'))
        self.assertEqual(expression.count("("), expression.count(")"))
        self.assertIn(f'"{long_terms[0]["phrase"]}"', expression)

    def test_legacy_profile_prioritizes_buyer_pain_and_triggers(self) -> None:
        profile = ServiceProfile(
            company_name="Billing Co",
            one_liner="Recurring billing automation",
            target_audience=["SaaS finance teams"],
            core_problem_solved="Manual recurring billing",
            key_value_propositions=["Automated recurring billing"],
            ideal_customer_pain_points=["Manual payment reconciliation"],
            buying_triggers=["Renewal payments are failing"],
            urgency_signals=["Month-end close is delayed"],
        )

        with patch.dict(os.environ, {}, clear=True):
            terms = public_source_query_terms(profile)

        self.assertEqual(
            terms[:3],
            [
                "Renewal payments are failing",
                "Month-end close is delayed",
                "Manual payment reconciliation",
            ],
        )

    def test_missing_x_credential_leaves_hn_enabled_and_skips_paid_fallback(self) -> None:
        import api.services.social_ingestion as ingestion
        from api.workers import actors

        class FakeEngine:
            def begin(self):
                return nullcontext(object())

        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
            patch.object(ingestion, "_service_profile_columns", return_value={}),
            patch.object(ingestion, "_load_service_profile", return_value=_profile_row()),
            patch.object(actors.ingest_hn_batch_job, "send") as hn_send,
            patch.object(actors.ingest_x_job, "send") as x_send,
        ):
            plan = enqueue_initial_public_source_ingestion("tenant-1", "profile-1")

        self.assertEqual(plan.hn_jobs, 1)
        self.assertEqual(plan.x_jobs, 0)
        self.assertEqual(plan.x_skip_reason, "x_bearer_token_not_configured")
        self.assertFalse(hn_send.call_args.kwargs["fallback_to_x"])
        x_send.assert_not_called()

    def test_disabled_x_source_is_not_queued(self) -> None:
        import api.services.social_ingestion as ingestion
        from api.workers import actors

        class FakeEngine:
            def begin(self):
                return nullcontext(object())

        with (
            patch.dict(
                os.environ,
                {"ARCLI_X_INGESTION_ENABLED": "false", "X_BEARER_TOKEN": "test"},
                clear=True,
            ),
            patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
            patch.object(ingestion, "_service_profile_columns", return_value={}),
            patch.object(ingestion, "_load_service_profile", return_value=_profile_row()),
            patch.object(actors.ingest_hn_batch_job, "send") as hn_send,
            patch.object(actors.ingest_x_job, "send") as x_send,
        ):
            plan = enqueue_initial_public_source_ingestion("tenant-1", "profile-1")

        self.assertEqual(plan.hn_jobs, 1)
        self.assertEqual(plan.x_jobs, 0)
        self.assertEqual(plan.x_skip_reason, "x_ingestion_disabled")
        hn_send.assert_called_once()
        self.assertFalse(hn_send.call_args.kwargs["fallback_to_x"])
        self.assertEqual(hn_send.call_args.args[0], CANONICAL_DISCOVERY_QUERIES)
        x_send.assert_not_called()


if __name__ == "__main__":
    unittest.main()
