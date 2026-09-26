from __future__ import annotations

from api.services.prospecting.entity_first import TargetingProfileInput
from api.services.prospecting.target_fit import (
    TargetFitCandidate,
    assess_target_fit,
    strong_evidence_definition_matches,
)


def test_strong_evidence_definition_requires_every_meaningful_term() -> None:
    assert not strong_evidence_definition_matches(
        ('evaluating outbound automation tools',),
        'We are evaluating onboarding tools for the team.',
    )


def test_targeting_brief_scores_fit_and_priority_without_claiming_intent() -> None:
    profile = TargetingProfileInput(
        target_types=["account"],
        ideal_customer_traits=["indie developer"],
        change_triggers=["launching paid plans"],
    )
    candidate = TargetFitCandidate(
        entity_kind="account",
        canonical_url="https://example.com/indie-developer",
        title="Indie developer launching paid plans",
    )

    assessment = assess_target_fit(profile, candidate)

    assert assessment.excluded is False
    assert assessment.fit_score == 0.85
    assert assessment.trigger_score == 1.0
    assert assessment.priority_score == 87.25
    assert assessment.reason_codes == (
        "brief_target_type_match",
        "brief_trait_match",
        "brief_trigger_match",
    )
    assert all("buyer" not in reason for reason in assessment.reason_codes)


def test_generated_exclusion_wins_but_manual_selection_only_confirms_fit() -> None:
    profile = TargetingProfileInput(
        target_types=["builder"],
        exclusions=["student project"],
    )
    generated = TargetFitCandidate(
        entity_kind="builder",
        canonical_url="https://example.com/student-project",
        title="Student project",
    )
    manual = TargetFitCandidate(
        entity_kind="builder",
        canonical_url="https://example.com/student-project",
        title="Student project",
        manual_fit_confirmed=True,
    )

    assert assess_target_fit(profile, generated).excluded is True

    manual_assessment = assess_target_fit(profile, manual)
    assert manual_assessment.excluded is False
    assert manual_assessment.fit_score == 0.5
    assert "manual_target_confirmed_fit" in manual_assessment.reason_codes
    assert "brief_exclusion_manual_override" in manual_assessment.reason_codes
    assert manual_assessment.trigger_score == 0.0


def test_configured_strong_evidence_definition_tightens_the_evidence_label() -> None:
    definitions = ("currently comparing automation tools",)

    assert strong_evidence_definition_matches(
        definitions,
        "We are currently comparing automation tools for this workflow.",
    )
    assert not strong_evidence_definition_matches(
        definitions,
        "We use a tool for this workflow.",
    )
