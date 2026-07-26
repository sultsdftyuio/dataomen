"""Regression coverage for verifier similarity gating."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from api.services.verifier import (
    CandidatePost,
    ServiceProfile,
    VerificationResult,
    VerifierService,
)


def test_verifier_uses_the_matching_threshold_when_no_override_is_configured() -> None:
    class AllowedQuotaGuard:
        def check_and_increment(self, **_kwargs: object) -> SimpleNamespace:
            return SimpleNamespace(allowed=True, tenant_id="tenant-a")

    profile = ServiceProfile(
        company_name="Arcli",
        one_liner="Find buyer intent in public conversations.",
        target_audience=["B2B SaaS founders"],
        core_problem_solved="Manual prospect research is slow.",
        key_value_propositions=["Verified buyer-intent matches"],
        ideal_customer_pain_points=["Missing qualified demand signals"],
    )
    candidate = CandidatePost(
        post_id="post-1",
        source="twitter",
        text="How do I find better SaaS leads?",
        similarity_score=0.35,
    )
    verifier = VerifierService(client=object(), quota_guard=AllowedQuotaGuard())
    expected = VerificationResult(
        match=False,
        decision_label="not_a_match",
        confidence=0.9,
        pain_detected="",
        why_this_matches="Not sufficiently specific.",
        rejection_reason="llm_not_a_match",
    )

    with (
        patch.dict("os.environ", {}, clear=True),
        patch.object(verifier, "_verify_with_openai", return_value=expected) as verify,
    ):
        result = verifier.verify(candidate, profile, tenant_id="tenant-a")

    assert result.verifier_executed is True
    verify.assert_called_once()


def test_verifier_prompt_includes_urgency_context_and_requires_buyer_evidence() -> None:
    profile = ServiceProfile(
        company_name="Billing Co",
        one_liner="Automated recurring billing for SaaS teams.",
        target_audience=["SaaS finance teams"],
        core_problem_solved="Failed payments and manual invoice follow-up.",
        key_value_propositions=["Automated dunning workflows"],
        ideal_customer_pain_points=["Chasing overdue invoices"],
        urgency_signals=["Revenue is at risk after a payment failure"],
    )
    candidate = CandidatePost(
        post_id="post-1",
        source="hackernews",
        text="Our payments keep failing and invoices are piling up.",
        similarity_score=0.8,
    )
    verifier = VerifierService(client=object())

    prompt = verifier._build_user_prompt(candidate, profile)

    assert "Revenue is at risk after a payment failure" in prompt
    assert "similarity score is only a cheap prefilter" in prompt.lower()
    assert "tool/category search" in verifier.SYSTEM_PROMPT
