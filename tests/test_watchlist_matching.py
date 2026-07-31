"""Regression coverage for customer-defined buyer Watchlists."""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch

from api.services.matching import PostEmbedding, find_candidate_matches
from api.services.verifier import ServiceProfile
from api.services.watchlist_matching import (
    DEFAULT_WATCHLIST_SOURCES,
    build_watchlist_discovery_queries,
    build_watchlist_profile,
    normalize_watchlist_sources,
    watchlist_embedding_text,
)


def _base_profile() -> ServiceProfile:
    return ServiceProfile(
        company_name="Arcli",
        one_liner="Helps small B2B software teams find public conversations worth a thoughtful reply.",
        target_audience=["B2B software teams"],
        core_problem_solved="Finding real buyer conversations takes too much manual research.",
        key_value_propositions=["Evidence-backed public conversations"],
        ideal_customer_pain_points=["New customer signups are unpredictable"],
        buying_triggers=["The current growth plan stopped working"],
        urgency_signals=["A launch target is at risk"],
    )


def test_watchlist_queries_cover_all_buyer_intents_in_plain_language() -> None:
    queries = build_watchlist_discovery_queries(
        "small SaaS founders",
        "getting enough trial users without doing outreach by hand",
        include_terms=["find buyers with less keyword noise on Reddit"],
    )

    assert [query.query_type for query in queries] == [
        "buyer_pain",
        "urgent_failure",
        "recommendation_request",
        "manual_workflow_frustration",
        "category_tool_search",
        "switching_trigger",
    ]
    phrases = " ".join(query.phrase.lower() for query in queries)
    for forbidden_operator_term in (
        "find buyers",
        "buyer intent",
        "keyword noise",
        "qualified leads",
        "reddit",
    ):
        assert forbidden_operator_term not in phrases
    assert all(len(query.phrase.split()) <= 14 for query in queries)


def test_watchlist_profile_keeps_website_offer_and_focuses_the_selected_group() -> None:
    profile = build_watchlist_profile(
        _base_profile(),
        {
            "target_buyer": "bootstrapped SaaS founders",
            "problem_to_solve": "not getting enough trial users",
            "include_terms": ["trial signups dropped this week"],
            "exclude_terms": ["consumer coupon codes"],
        },
    )

    assert profile.one_liner == _base_profile().one_liner
    assert profile.target_audience == ["bootstrapped SaaS founders"]
    assert profile.core_problem_solved == "not getting enough trial users"
    assert "consumer coupon codes" in profile.negative_keywords
    assert "Target buyer group: bootstrapped SaaS founders" in watchlist_embedding_text(profile)


def test_watchlist_source_selection_is_x_opt_in() -> None:
    assert "x" not in DEFAULT_WATCHLIST_SOURCES
    assert "x" not in normalize_watchlist_sources([])
    assert normalize_watchlist_sources(["hn", "twitter"]) == frozenset(
        {"hackernews", "x"}
    )


def test_recall_prefilter_admits_a_plausible_paraphrase_below_the_old_floor() -> None:
    # Cosine similarity is 0.25: below the former 0.32 default but above the
    # new recall threshold. It is only a verifier candidate, never a lead.
    with patch.dict(os.environ, {}, clear=True):
        candidates = find_candidate_matches(
            [1.0, 0.0],
            [
                PostEmbedding(
                    post_id="post-1",
                    source="hackernews",
                    text="We are trying to solve a real customer problem and need help this week.",
                    embedding=[0.25, (0.9375) ** 0.5],
                )
            ],
            tenant_id="tenant-a",
            service_profile_id="profile-a",
        )

    assert len(candidates) == 1
    assert candidates[0].score == 0.25


def test_watchlist_contract_keeps_browser_writes_away_from_derived_match_state() -> None:
    contract = (
        Path(__file__).resolve().parents[1] / "scripts" / "watchlists_contract.sql"
    ).read_text(encoding="utf-8")

    assert "FOREIGN KEY (tenant_id, watchlist_id)" in contract
    assert "REFERENCES public.watchlists (tenant_id, id)" in contract
    assert "REVOKE UPDATE ON TABLE public.watchlists FROM authenticated" in contract
    assert "GRANT UPDATE (is_active) ON TABLE public.watchlists TO authenticated" in contract
    assert "REVOKE INSERT, UPDATE, DELETE ON TABLE public.watchlist_matches FROM authenticated" in contract
