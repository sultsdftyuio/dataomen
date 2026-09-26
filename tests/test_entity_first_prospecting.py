from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from api.services.prospecting.entity_first import (
    EvidenceSignal,
    ProspectEntityInput,
    ProspectEvidenceInput,
    TargetingProfileInput,
    assessment_state_for_evidence,
    normalize_public_url,
)


TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
ENTITY_ID = "3d8173cc-5ddd-426b-8d85-151a78f17798"
RESEARCH_RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
SOURCE_POST_ID = "0962fc8d-514a-4bd1-8408-974bb3182660"
NOW = datetime(2026, 9, 22, 12, tzinfo=timezone.utc)


def test_targeting_profile_keeps_a_bounded_approved_thesis_without_contact_data() -> None:
    profile = TargetingProfileInput(
        target_types=["Account", "project"],
        ideal_customer_traits=["B2B SaaS", "B2B SaaS"],
        change_triggers=["Launching paid plans"],
        strong_evidence_definitions=["Actively evaluating a relevant workflow"],
        exclusions=["Students"],
        seed_urls=["https://Acme.example/Launch#ignore-me"],
    )

    assert profile.target_types == ("account", "project")
    assert profile.ideal_customer_traits == ("B2B SaaS",)
    assert profile.seed_urls == ("https://acme.example/Launch",)

    with pytest.raises(ValueError, match="email or phone"):
        TargetingProfileInput(
            target_types=["builder"],
            ideal_customer_traits=["Email founder@example.com"],
        )


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:3000",
        "http://local",
        "https://app.local",
        "https://preview.localhost",
        "http://127.0.0.1",
        "http://10.4.2.1",
        "http://172.16.0.1",
        "http://192.168.0.10",
        "http://169.254.10.10",
        "http://[::1]",
        "http://[fe80::1]",
        "http://[::ffff:127.0.0.1]",
        "http://2130706433",
    ],
)
def test_manual_target_urls_reject_obvious_internal_network_targets(url: str) -> None:
    with pytest.raises(ValueError):
        normalize_public_url(url)


def test_builder_entity_drops_the_optional_title_but_keeps_a_public_locator() -> None:
    entity = ProspectEntityInput(
        entity_kind="builder",
        entity_provider="manual",
        entity_external_id="https://indie.example/projects/one",
        canonical_url="https://indie.example/projects/one",
        origin_kind="manual",
        title="A private person's name must not be retained",
    )

    assert entity.title is None
    assert entity.canonical_url == "https://indie.example/projects/one"


def test_public_evidence_requires_a_global_source_row_and_terminal_verification() -> None:
    with pytest.raises(ValueError, match="source_post_id"):
        ProspectEvidenceInput(
            targeting_profile_id=TARGETING_PROFILE_ID,
            prospect_entity_id=ENTITY_ID,
            research_run_id=RESEARCH_RUN_ID,
            evidence_type="problem",
            summary="Public discussion describes a workflow problem.",
            evidence_source_kind="public_source",
            source="hackernews",
            observed_at=NOW,
        )

    evidence = ProspectEvidenceInput(
        targeting_profile_id=TARGETING_PROFILE_ID,
        prospect_entity_id=ENTITY_ID,
        research_run_id=RESEARCH_RUN_ID,
        evidence_type="evaluation",
        summary="The target is evaluating a relevant category.",
        evidence_source_kind="public_source",
        source="hackernews",
        source_post_id=SOURCE_POST_ID,
        evidence_excerpt="Email person@example.com or call +1 415-555-0100.",
        evidence_strength="strong",
        evidence_status="accepted",
        verified_by="system",
        verified_at=NOW,
        observed_at=NOW,
    )

    assert evidence.evidence_excerpt is not None
    assert "person@example.com" not in evidence.evidence_excerpt
    assert "415-555-0100" not in evidence.evidence_excerpt
    assert len(evidence.evidence_key) == 64


def test_assessment_state_never_turns_weak_relevance_into_a_buyer_claim() -> None:
    fresh_evaluation = EvidenceSignal(
        evidence_type="evaluation",
        evidence_strength="strong",
        evidence_status="accepted",
        observed_at=NOW - timedelta(days=2),
    )
    old_evaluation = EvidenceSignal(
        evidence_type="evaluation",
        evidence_strength="strong",
        evidence_status="accepted",
        observed_at=NOW - timedelta(days=181),
    )
    problem = EvidenceSignal(
        evidence_type="problem",
        evidence_strength="moderate",
        evidence_status="accepted",
        observed_at=NOW,
    )
    trigger = EvidenceSignal(
        evidence_type="trigger",
        evidence_strength="moderate",
        evidence_status="accepted",
        observed_at=NOW,
    )

    assert assessment_state_for_evidence(
        fit_score=0.8,
        evidence=[fresh_evaluation],
        now=NOW,
    ) == "strong_buyer_signal"
    assert assessment_state_for_evidence(
        fit_score=0.8,
        evidence=[old_evaluation],
        now=NOW,
    ) == "signal_backed"
    assert assessment_state_for_evidence(
        fit_score=0.9,
        evidence=[problem],
        now=NOW,
    ) == "signal_backed"
    assert assessment_state_for_evidence(
        fit_score=0.9,
        evidence=[trigger],
        now=NOW,
    ) == "triggered"
    assert assessment_state_for_evidence(
        fit_score=0.9,
        evidence=[
            EvidenceSignal(
                evidence_type="evaluation",
                evidence_strength="strong",
                evidence_status="rejected",
                observed_at=NOW,
            )
        ],
        now=NOW,
    ) == "high_fit"


def test_sql_contract_uses_rpcs_and_cascades_public_source_evidence() -> None:
    contract = Path("scripts/entity_first_prospecting_contract.sql").read_text(
        encoding="utf-8"
    )

    assert "CREATE TABLE IF NOT EXISTS public.targeting_profiles" in contract
    assert "CREATE TABLE IF NOT EXISTS public.prospect_entities" in contract
    assert "CREATE TABLE IF NOT EXISTS public.prospect_entity_links" in contract
    assert "CREATE TABLE IF NOT EXISTS public.prospect_research_runs" in contract
    assert "CREATE TABLE IF NOT EXISTS public.prospect_evidence" in contract
    assert "CREATE TABLE IF NOT EXISTS public.prospect_assessments" in contract
    assert "CREATE TABLE IF NOT EXISTS public.prospect_feedback" in contract
    assert "source_post_id UUID REFERENCES public.source_posts(id) ON DELETE CASCADE" in contract
    assert "strong buyer signal requires fit and fresh accepted direct evaluation evidence" in contract
    assert "CREATE OR REPLACE FUNCTION public.upsert_targeting_profile(" in contract
    assert "CREATE OR REPLACE FUNCTION public.create_manual_prospect_entity(" in contract
    assert "manual_target_confirmed_fit" in contract
    assert "fit_score = GREATEST(COALESCE(assessment.fit_score, 0), 0.5)" in contract
    assert "CREATE OR REPLACE FUNCTION public.list_prospect_evidence_for_profile(" in contract
    assert "CREATE OR REPLACE FUNCTION public.review_prospect_evidence(" in contract
    assert "CREATE OR REPLACE FUNCTION public.submit_prospect_feedback(" in contract
    assert "CREATE OR REPLACE FUNCTION public.list_prospect_feedback_summary_for_profile(" in contract
    assert "count(DISTINCT feedback.prospect_assessment_id)::BIGINT AS target_count" in contract
    assert "GRANT EXECUTE ON FUNCTION public.list_prospect_feedback_summary_for_profile(UUID) TO authenticated" in contract
    assert "REVOKE INSERT, UPDATE, DELETE ON TABLE public.prospect_entities FROM authenticated" in contract
    assert "GRANT EXECUTE ON FUNCTION public.create_manual_prospect_entity" in contract
    assert "localhost|local" in contract
    assert "169[.]254" in contract
    assert "::ffff:" in contract
