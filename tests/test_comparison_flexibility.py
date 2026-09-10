"""Regression coverage for flexible, batch-safe social post evaluation."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from api.services.matching import PostEmbedding, cosine_similarity, find_candidate_matches
from api.services.social.activation import _source_post_is_plausible_for_discovery_query
from api.services.social.comparison import truncate_comparison_text
from api.services.social.lead_signals import lead_signal_score
from api.services.verifier import (
    CandidatePost,
    ServiceProfile,
    VerifierService,
    verify_candidate_safely,
)


def _profile() -> ServiceProfile:
    return ServiceProfile(
        company_name="Ops Co",
        one_liner="Automates revenue operations for SaaS teams.",
        target_audience=["SaaS operations teams"],
        core_problem_solved="Manual operational work slows growth.",
        key_value_propositions=["Automated workflows"],
        ideal_customer_pain_points=["Slow, manual revenue operations"],
    )


def test_discovery_guard_accepts_optional_fields_and_finance_paraphrases() -> None:
    post = SimpleNamespace(
        title=None,
        body="Our month-end close is still manual. What architecture should we use?",
        author=None,
        metadata=None,
    )

    assert _source_post_is_plausible_for_discovery_query(
        post,
        "automated financial reconciliation software",
        query_type="category_tool_search",
    )


def test_discovery_guard_keeps_indirect_tool_friction_without_literal_overlap() -> None:
    post = SimpleNamespace(
        title="",
        body="The current platform is unreliable. How should we design a more resilient system?",
        metadata={"thread_title": None},
    )

    assert _source_post_is_plausible_for_discovery_query(
        post,
        "subscription entitlement management",
        query_type="recommendation_request",
    )


def test_indirect_intent_and_tool_friction_raise_priority_without_hard_filtering() -> None:
    score = lead_signal_score(
        SimpleNamespace(
            title="Which architecture should we use?",
            body="Our current platform is unreliable and full of workarounds.",
        )
    )

    assert "indirect_problem_investigation" in score.reasons
    assert "existing_tool_or_manual_workflow_friction" in score.reasons


def test_short_buyer_post_reaches_semantic_matching() -> None:
    candidates = find_candidate_matches(
        [1.0, 0.0],
        [
            PostEmbedding(
                post_id="short-post",
                source="x",
                text="Need CRM help",
                embedding=[1.0, 0.0],
            )
        ],
    )

    assert [candidate.post_id for candidate in candidates] == ["short-post"]


def test_malformed_embedding_isolated_and_sparse_scores_remain_finite() -> None:
    candidates = find_candidate_matches(
        [1.0],
        [
            PostEmbedding(
                post_id="valid",
                source="x",
                text="We need help with our manual workflow.",
                embedding=[1.0],
            ),
            PostEmbedding(
                post_id="wrong-dimension",
                source="x",
                text="We need help with our manual workflow.",
                embedding=[1.0, 0.0],
            ),
        ],
    )

    assert [candidate.post_id for candidate in candidates] == ["valid"]
    assert cosine_similarity([1e308], [1e308]) == 1.0


def test_profile_vocabulary_ranks_an_existing_semantic_candidate_with_reasons() -> None:
    candidates = find_candidate_matches(
        [1.0, 0.0],
        [
            PostEmbedding(
                post_id="generic",
                source="x",
                text="How should a team choose a new platform?",
                embedding=[0.8, 0.6],
            ),
            PostEmbedding(
                post_id="profile-language",
                source="x",
                text="Our revenue operations are manual and slowing growth.",
                embedding=[0.8, 0.6],
            ),
        ],
        profile=_profile(),
    )

    assert [candidate.post_id for candidate in candidates] == [
        "profile-language",
        "generic",
    ]
    assert candidates[0].score == candidates[1].score == 0.8
    assert candidates[0].metadata["profile_vocabulary_score"] > 0
    assert "profile_" in candidates[0].metadata["profile_vocabulary_signals"]


def test_profile_aware_diversity_caps_repeat_authors_without_dropping_other_authors() -> None:
    candidates = find_candidate_matches(
        [1.0, 0.0],
        [
            PostEmbedding(
                post_id="alice-1",
                source="x",
                text="Manual operations are slowing our growth.",
                embedding=[0.95, (1 - 0.95**2) ** 0.5],
                metadata={"author": "alice"},
            ),
            PostEmbedding(
                post_id="alice-2",
                source="x",
                text="Manual operations still slow our growth.",
                embedding=[0.90, (1 - 0.90**2) ** 0.5],
                metadata={"author": "alice"},
            ),
            PostEmbedding(
                post_id="alice-3",
                source="x",
                text="Manual operations need a better workflow.",
                embedding=[0.85, (1 - 0.85**2) ** 0.5],
                metadata={"author": "alice"},
            ),
            PostEmbedding(
                post_id="bob-1",
                source="x",
                text="Our manual workflow is slowing revenue operations.",
                embedding=[0.80, (1 - 0.80**2) ** 0.5],
                metadata={"author": "bob"},
            ),
        ],
        profile=_profile(),
        max_candidates=3,
    )

    assert len(candidates) == 3
    assert sum(candidate.metadata.get("author") == "alice" for candidate in candidates) == 2
    assert any(candidate.metadata.get("author") == "bob" for candidate in candidates)


def test_safe_verifier_returns_a_rejection_when_one_evaluation_fails() -> None:
    candidate = CandidatePost(
        post_id="malformed-provider-post",
        source="x",
        text="Our old tool is broken and the work is manual.",
        similarity_score=0.7,
    )
    verifier = VerifierService(client=object())

    with patch.object(verifier, "verify", side_effect=RuntimeError("bad payload")):
        result = verify_candidate_safely(verifier, candidate, _profile())

    assert result.match is False
    assert result.rejection_reason == "verifier_evaluation_failed"
    assert result.verifier_executed is False


def test_verifier_prompt_bounds_long_source_and_profile_values() -> None:
    long_value = "manual workflow " * 200
    profile = _profile().model_copy(
        update={"ideal_customer_pain_points": [long_value] * 20}
    )
    candidate = CandidatePost(
        post_id="long-post",
        source="x",
        text="customer issue " * 200,
        similarity_score=0.7,
    )
    verifier = VerifierService(client=object())

    with patch.dict(
        "os.environ",
        {
            "ARCLI_VERIFIER_MAX_POST_CHARS": "100",
            "ARCLI_VERIFIER_MAX_PROFILE_FIELD_CHARS": "80",
            "ARCLI_VERIFIER_MAX_PROFILE_LIST_ITEMS": "2",
        },
        clear=False,
    ):
        prompt = verifier._build_user_prompt(candidate, profile)

    assert "[truncated]" in prompt
    assert candidate.text not in prompt
    assert long_value not in prompt


def test_comparison_truncation_honors_tiny_positive_limits() -> None:
    assert truncate_comparison_text("manual workflow", 1) == "m"
    assert len(truncate_comparison_text("manual workflow", 3)) == 3
