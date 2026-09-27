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
from api.services.social.legacy_storage import _lead_match_status


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


def test_successful_llm_verification_cannot_be_marked_unexecuted_by_its_payload() -> None:
    class AllowedQuotaGuard:
        def check_and_increment(self, **_kwargs: object) -> SimpleNamespace:
            return SimpleNamespace(allowed=True, tenant_id="tenant-a")

    profile = ServiceProfile(
        company_name="Workflow Co",
        one_liner="Reduce manual operations work.",
        target_audience=["Operations teams"],
        core_problem_solved="Repeated manual work.",
        key_value_propositions=["Automated workflows"],
        ideal_customer_pain_points=["Slow handoffs"],
    )
    candidate = CandidatePost(
        post_id="post-2",
        source="hackernews",
        text="We still copy this data between three systems every day.",
        similarity_score=0.5,
    )
    verifier = VerifierService(client=object(), quota_guard=AllowedQuotaGuard())
    llm_result = VerificationResult(
        match=True,
        decision_label="weak_match",
        intent_tier="exploratory",
        confidence=0.28,
        pain_detected="Repeated manual work.",
        why_this_matches="The workflow is plausibly relevant.",
        verifier_executed=False,
    )

    with patch.object(verifier, "_verify_with_openai", return_value=llm_result):
        result = verifier.verify(candidate, profile, tenant_id="tenant-a")

    assert result.verifier_executed is True
    assert result.intent_tier == "exploratory"
    assert result.match is True
    assert _lead_match_status(result) == "discovery_candidate"


def test_verifier_prompt_uses_the_discovery_oriented_tiered_intent_standard() -> None:
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
    assert "discovery-oriented tiered-intent standard" in prompt
    assert "as `high`" in prompt
    assert "as `warm`" in prompt
    assert "as `exploratory`" in prompt
    assert "do not require explicit purchase intent" in prompt
    assert "job/hiring and freelance" in prompt
    assert "similarity score is only a cheap prefilter" in prompt.lower()
    assert "search_terms describe the buyer's desired outcome" in prompt
    assert "weighted relevance signals, not a checklist" in prompt
    assert "public-conversation discovery product, not a procurement gatekeeper" in verifier.SYSTEM_PROMPT
    assert "A question about a method can be high intent" in verifier.SYSTEM_PROMPT
    assert "Retain vague but plausibly relevant posts as exploratory" in verifier.SYSTEM_PROMPT
    assert "pure technical debugging with no meaningful connection" in verifier.SYSTEM_PROMPT
    assert "not a prediction that the author will buy" in verifier.SYSTEM_PROMPT
    assert "Do not require the writer to use the vendor's product category" in verifier.SYSTEM_PROMPT
    assert "without words such as prospect, lead" in verifier.SYSTEM_PROMPT
    assert "exact short excerpt" in verifier.SYSTEM_PROMPT
    assert "Prefer a cautious `weak_match`" in prompt


def test_tiered_verdict_normalization_keeps_the_declared_discovery_tier() -> None:
    contradictory_warm_result = VerificationResult(
        match=False,
        decision_label="not_a_match",
        intent_tier="warm",
        confidence=0.42,
        pain_detected="Manual invoice follow-up is consuming the team.",
        why_this_matches="The tier identifies relevant workflow frustration.",
    )

    normalized = VerifierService._normalize_tiered_decision(contradictory_warm_result)

    assert normalized.match is True
    assert normalized.decision_label == "weak_match"
    assert normalized.intent_tier == "warm"


def test_tiered_rejection_normalization_preserves_the_legacy_spam_label() -> None:
    spam_result = VerificationResult(
        match=True,
        decision_label="spam",
        intent_tier="not_a_match",
        confidence=0.03,
        pain_detected="",
        why_this_matches="Promotional spam is not a customer conversation.",
    )

    normalized = VerifierService._normalize_tiered_decision(spam_result)

    assert normalized.match is False
    assert normalized.decision_label == "spam"
    assert normalized.intent_tier == "not_a_match"


def test_legacy_verifier_payloads_without_an_intent_tier_still_parse() -> None:
    legacy_ready = VerificationResult.model_validate(
        {
            "match": True,
            "decision_label": "strong_match",
            "confidence": 0.60,
            "pain_detected": "A concrete workflow problem.",
            "why_this_matches": "Legacy strong match.",
        }
    )
    assert legacy_ready.intent_tier is None


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
