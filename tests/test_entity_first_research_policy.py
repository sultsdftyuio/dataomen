from __future__ import annotations

import pytest

from api.services.prospecting.research_policy import (
    DEFAULT_PUBLIC_EVIDENCE_SOURCES,
    MAX_EVIDENCE_PER_RUN,
    MAX_THREAD_CONTEXT_ITEMS,
    EntityEvidenceResearchRequest,
    EvidenceResearchLimits,
    permitted_assessment_transitions,
    plan_entity_evidence_research,
    plan_evidence_research_run,
    query_intents_for_assessment_state,
)


ENTITY_IDS = (
    "3d8173cc-5ddd-426b-8d85-151a78f17798",
    "a2d79920-0e70-4e5e-b567-a4218bb0ef24",
    "09d69129-c429-4dc1-8ac9-ebd34c9ced5e",
    "e632d4d4-3d92-437c-9dc1-f17432878123",
)


def _request(
    entity_id: str,
    *,
    origin_kind: str = "manual",
    assessment_state: str = "high_fit",
    explicit_request: bool = True,
    public_sources: list[str] | None = None,
) -> EntityEvidenceResearchRequest:
    return EntityEvidenceResearchRequest(
        entity_id=entity_id,
        entity_kind="project",
        origin_kind=origin_kind,  # type: ignore[arg-type]
        assessment_state=assessment_state,  # type: ignore[arg-type]
        explicit_request=explicit_request,
        public_sources=public_sources,
    )


def test_manual_targets_are_not_auto_crawled_or_researched() -> None:
    plan = plan_entity_evidence_research(
        _request(ENTITY_IDS[0], explicit_request=False)
    )

    assert plan.decision == "skipped"
    assert plan.skip_reason == "manual_target_requires_explicit_research_request"
    assert plan.query_intents == ()
    assert plan.public_sources == ()
    assert plan.evidence_limit == 0
    assert plan.requires_explicit_request is True
    assert plan.same_public_thread_only is True
    assert plan.allow_target_url_crawl is False
    assert plan.allow_retained_public_author_locator_search is False
    assert plan.allow_author_history is False
    assert plan.allow_private_sources is False


def test_explicit_research_is_public_source_and_thread_context_bounded() -> None:
    limits = EvidenceResearchLimits(
        entity_limit=4,
        evidence_limit_per_entity=3,
        evidence_limit_total=12,
        source_result_limit_per_entity=5,
        thread_context_item_limit=2,
        thread_context_char_limit=1_200,
    )
    plan = plan_entity_evidence_research(
        _request(
            ENTITY_IDS[0],
            public_sources=["GitHub", "hackernews", "github"],
        ),
        limits=limits,
    )

    assert plan.decision == "planned"
    assert plan.query_intents == ("fit_validation", "change_trigger")
    assert plan.public_sources == ("hackernews", "github")
    assert plan.evidence_limit == 3
    assert plan.source_result_limit_per_entity == 5
    assert plan.thread_context_item_limit == 2
    assert plan.thread_context_char_limit == 1_200
    assert plan.allow_retained_public_author_locator_search is True
    assert plan.allow_author_history is False


def test_run_caps_entities_and_fairly_allocates_total_evidence_budget() -> None:
    limits = EvidenceResearchLimits(
        entity_limit=3,
        evidence_limit_per_entity=4,
        evidence_limit_total=10,
    )
    plan = plan_evidence_research_run(
        [_request(entity_id) for entity_id in ENTITY_IDS],
        limits=limits,
    )

    assert plan.planned_entity_count == 3
    assert plan.planned_evidence_limit == 10
    assert [item.evidence_limit for item in plan.entity_plans[:3]] == [4, 3, 3]
    assert plan.entity_plans[3].decision == "skipped"
    assert plan.entity_plans[3].skip_reason == "entity_limit_reached"


def test_state_drives_query_intent_and_rejected_targets_are_terminal() -> None:
    assert query_intents_for_assessment_state("high_fit") == (
        "fit_validation",
        "change_trigger",
    )
    assert query_intents_for_assessment_state("triggered") == (
        "problem_validation",
        "evaluation_validation",
    )
    assert query_intents_for_assessment_state("signal_backed") == (
        "evaluation_validation",
    )
    assert query_intents_for_assessment_state("strong_buyer_signal") == (
        "evidence_refresh",
    )
    assert query_intents_for_assessment_state("rejected") == ()

    assert permitted_assessment_transitions("rejected") == ("rejected",)
    assert permitted_assessment_transitions("signal_backed") == (
        "high_fit",
        "triggered",
        "signal_backed",
        "strong_buyer_signal",
        "rejected",
    )
    rejected = plan_entity_evidence_research(
        _request(ENTITY_IDS[0], assessment_state="rejected")
    )
    assert rejected.decision == "skipped"
    assert rejected.skip_reason == "rejected_target"


def test_planner_rejects_unsupported_sources_duplicate_entities_and_unbounded_limits() -> None:
    with pytest.raises(ValueError, match="unsupported public evidence source"):
        _request(ENTITY_IDS[0], public_sources=["twitter"])
    with pytest.raises(ValueError, match="public_sources must be a list"):
        _request(ENTITY_IDS[0], public_sources="github")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="thread_context_item_limit"):
        EvidenceResearchLimits(thread_context_item_limit=MAX_THREAD_CONTEXT_ITEMS + 1)
    with pytest.raises(ValueError, match="evidence_limit_total"):
        EvidenceResearchLimits(evidence_limit_total=MAX_EVIDENCE_PER_RUN + 1)

    run = plan_evidence_research_run(
        [_request(ENTITY_IDS[0]), _request(ENTITY_IDS[0])]
    )
    assert run.planned_entity_count == 1
    assert run.entity_plans[1].skip_reason == "duplicate_entity"
    assert DEFAULT_PUBLIC_EVIDENCE_SOURCES == (
        "hackernews",
        "bluesky",
        "stackexchange",
        "github",
        "lemmy",
    )
