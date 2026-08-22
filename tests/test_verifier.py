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
        # This is below the former 0.24 recall floor and at the current broad
        # candidate threshold. It must reach the verifier, which remains the
        # only precision gate.
        similarity_score=0.20,
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
    assert "search_terms describe the buyer's desired outcome" in prompt
    assert "weighted relevance signals, not a checklist" in prompt
    assert "tool/category search" in verifier.SYSTEM_PROMPT
    assert "Potential buyer" in verifier.SYSTEM_PROMPT
    assert "main lead must show a clear, real buyer problem" in verifier.SYSTEM_PROMPT
    assert "0.30-0.54 represents a plausible Potential buyer" in verifier.SYSTEM_PROMPT
    assert "Do not require the writer to use the vendor's product-category" in verifier.SYSTEM_PROMPT
    assert "without words such as prospect, lead" in verifier.SYSTEM_PROMPT
    assert "exact short excerpt" in verifier.SYSTEM_PROMPT
    assert "Prefer a cautious `weak_match`" in prompt


def test_verifier_keeps_only_verbatim_source_evidence() -> None:
    source_text = "Our customers are blocked in Intercom and we need a replacement before Friday."
    result = VerificationResult(
        match=True,
        decision_label="strong_match",
        confidence=0.91,
        pain_detected="Customers are blocked by the current tool.",
        why_this_matches="The writer explicitly needs a replacement.",
        pain_theme="customer workflow blocked",
        signal_type="urgent_failure",
        urgency_level="high",
        urgency_reason="need a replacement before Friday",
        evidence_excerpt="Our customers are blocked",
        purchase_stage="evaluating_options",
        competitor_mention="Intercom",
    )

    sanitized = VerifierService._sanitize_source_evidence(result, source_text)

    assert sanitized.urgency_level == "high"
    assert sanitized.urgency_reason == "need a replacement before Friday"
    assert sanitized.evidence_excerpt == "Our customers are blocked"
    assert sanitized.purchase_stage == "evaluating_options"
    assert sanitized.competitor_mention == "Intercom"


def test_verifier_omits_invented_source_evidence_without_changing_match() -> None:
    result = VerificationResult(
        match=True,
        decision_label="strong_match",
        confidence=0.91,
        pain_detected="Billing is slow.",
        why_this_matches="The writer is evaluating a solution.",
        pain_theme="billing operations",
        signal_type="urgent_failure",
        urgency_level="high",
        urgency_reason="deadline is tomorrow",
        evidence_excerpt="the team is losing revenue every hour",
        purchase_stage="ready_to_act",
        competitor_mention="Stripe",
    )

    sanitized = VerifierService._sanitize_source_evidence(
        result,
        "Our billing process is slow and we are evaluating alternatives.",
    )

    assert sanitized.match is True
    assert sanitized.decision_label == "strong_match"
    assert sanitized.urgency_level == "none"
    assert sanitized.urgency_reason == ""
    assert sanitized.evidence_excerpt == ""
    assert sanitized.purchase_stage == "ready_to_act"
    assert sanitized.competitor_mention == ""


def test_verifier_clears_positive_evidence_for_a_rejected_post() -> None:
    result = VerificationResult(
        match=False,
        decision_label="not_a_match",
        confidence=0.1,
        pain_detected="",
        why_this_matches="This is a tutorial.",
        pain_theme="invented theme",
        signal_type="buyer_pain",
        urgency_level="high",
        urgency_reason="need it today",
        evidence_excerpt="need it today",
        purchase_stage="ready_to_act",
        competitor_mention="Intercom",
    )

    sanitized = VerifierService._sanitize_source_evidence(result, "I need it today")

    assert sanitized.pain_theme == ""
    assert sanitized.signal_type is None
    assert sanitized.urgency_level == "none"
    assert sanitized.urgency_reason == ""
    assert sanitized.evidence_excerpt == ""
    assert sanitized.purchase_stage is None
    assert sanitized.competitor_mention == ""
