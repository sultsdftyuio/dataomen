from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from api.services.prospecting import evidence_collection
from api.services.prospecting.evidence_collection import (
    ApprovedEvidenceTargetingProfileSnapshot,
    EvidenceCollectionStartRequest,
    EvidenceCollectionTargetSnapshot,
    evidence_collection_idempotency_key,
    plan_evidence_collection,
    sanitize_evidence_collection_summary,
)
from api.services.prospecting.evidence_run_lifecycle import create_evidence_collection_run
from api.services.prospecting.research_policy import EvidenceResearchLimits


TENANT_ID = "tenant-demo"
SERVICE_PROFILE_ID = "b11f5e31-3c2c-457f-adbe-d14a8f1ec4ec"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
ENTITY_IDS = (
    "09d69129-c429-4dc1-8ac9-ebd34c9ced5e",
    "3d8173cc-5ddd-426b-8d85-151a78f17798",
    "a2d79920-0e70-4e5e-b567-a4218bb0ef24",
)


def _snapshot() -> ApprovedEvidenceTargetingProfileSnapshot:
    return ApprovedEvidenceTargetingProfileSnapshot(
        id=TARGETING_PROFILE_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        profile_version=4,
    )


def _target(entity_id: str, *, state: str = "high_fit") -> EvidenceCollectionTargetSnapshot:
    return EvidenceCollectionTargetSnapshot(
        entity_id=entity_id,
        entity_kind="builder",
        origin_kind="manual",
        assessment_state=state,  # type: ignore[arg-type]
        canonical_url=f"https://github.com/indie-builder-{entity_id[:4]}",
    )


def _request() -> EvidenceCollectionStartRequest:
    return EvidenceCollectionStartRequest(
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        prospect_entity_ids=(ENTITY_IDS[2], ENTITY_IDS[0], ENTITY_IDS[1]),
        request_nonce="review-request-1",
    )


def test_explicit_selection_has_a_stable_fair_and_content_free_plan() -> None:
    limits = EvidenceResearchLimits(
        entity_limit=3,
        evidence_limit_per_entity=4,
        evidence_limit_total=10,
        source_result_limit_per_entity=3,
        thread_context_item_limit=2,
        thread_context_char_limit=1200,
    )
    plan = plan_evidence_collection(
        _snapshot(),
        [_target(ENTITY_IDS[2]), _target(ENTITY_IDS[0]), _target(ENTITY_IDS[1])],
        limits=limits,
    )

    assert plan is not None
    assert plan.planned_entity_count == 3
    assert plan.planned_evidence_limit == 10
    assert [item.target.entity_id for item in plan.target_plans] == sorted(ENTITY_IDS)
    assert [item.plan.evidence_limit for item in plan.target_plans] == [4, 3, 3]
    assert [item.plan.thread_context_item_limit for item in plan.target_plans] == [2, 2, 2]
    assert len(plan.input_fingerprint) == 64
    assert "github.com" not in plan.input_fingerprint


def test_strong_evidence_definitions_are_pinned_in_the_evidence_policy_digest() -> None:
    first = ApprovedEvidenceTargetingProfileSnapshot(
        id=TARGETING_PROFILE_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        profile_version=4,
        strong_evidence_definitions=["actively comparing outbound tools"],
    )
    second = ApprovedEvidenceTargetingProfileSnapshot(
        id=TARGETING_PROFILE_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        profile_version=4,
        strong_evidence_definitions=["migrating from a competitor"],
    )

    first_plan = plan_evidence_collection(first, [_target(ENTITY_IDS[0])])
    second_plan = plan_evidence_collection(second, [_target(ENTITY_IDS[0])])

    assert first_plan is not None
    assert second_plan is not None
    assert first_plan.strong_evidence_definitions == ("actively comparing outbound tools",)
    assert first_plan.input_fingerprint != second_plan.input_fingerprint


def test_rejected_selection_creates_no_research_run_plan() -> None:
    assert plan_evidence_collection(_snapshot(), [_target(ENTITY_IDS[0], state="rejected")]) is None


def test_retry_identity_is_stable_when_the_targeting_plan_changes() -> None:
    request = _request()

    assert evidence_collection_idempotency_key(request) == evidence_collection_idempotency_key(
        EvidenceCollectionStartRequest(
            tenant_id=TENANT_ID,
            service_profile_id=SERVICE_PROFILE_ID,
            prospect_entity_ids=(ENTITY_IDS[0],),
            request_nonce="review-request-1",
        )
    )
    assert evidence_collection_idempotency_key(request) != evidence_collection_idempotency_key(
        EvidenceCollectionStartRequest(
            tenant_id=TENANT_ID,
            service_profile_id=SERVICE_PROFILE_ID,
            prospect_entity_ids=(ENTITY_IDS[0],),
            request_nonce="review-request-2",
        )
    )


def test_summary_rejects_raw_content_and_allows_only_safe_operational_values() -> None:
    summary = sanitize_evidence_collection_summary(
        {
            "profile_version": 4,
            "plan_fingerprint": "a" * 64,
            "planned_entity_count": 2,
            "pending_evidence_proposals": 1,
            "skipped_by_reason": {"no_supported_author_locator": 1},
            "source_url": "https://github.com/private-target",
            "body": "private source body",
        }
    )

    assert summary == {
        "profile_version": 4,
        "plan_fingerprint": "a" * 64,
        "planned_entity_count": 2,
        "pending_evidence_proposals": 1,
        "skipped_by_reason": {"no_supported_author_locator": 1},
    }


def test_disabled_feature_does_not_open_a_database_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(evidence_collection.RETAINED_PUBLIC_EVIDENCE_RESEARCH_FLAG, raising=False)
    from api.services.prospecting import evidence_run_lifecycle

    monkeypatch.setattr(
        evidence_run_lifecycle,
        "_database_engine",
        lambda: pytest.fail("disabled research must not initialize the database"),
    )

    result = create_evidence_collection_run(_request())

    assert result.run is None
    assert result.created is False
    assert result.skip_reason == "feature_disabled"


def test_monitoring_quota_is_isolated_from_explicit_research(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []

    class Guard:
        def check_and_increment(self, **kwargs: object) -> SimpleNamespace:
            calls.append(kwargs)
            return SimpleNamespace(allowed=True)

    monkeypatch.setattr(evidence_collection, "TenantQuotaGuard", Guard)
    monkeypatch.setenv("ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_TENANT_LIMIT", "11")
    monkeypatch.setenv("ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_TENANT_LIMIT", "4")

    assert evidence_collection._claim_research_quota(TENANT_ID, "explicit")
    assert evidence_collection._claim_research_quota(TENANT_ID, "monitoring")

    assert calls == [
        {
            "tenant_id": TENANT_ID,
            "counter_name": "retained_public_evidence_research",
            "limit": 11,
            "window_seconds": 86_400,
        },
        {
            "tenant_id": TENANT_ID,
            "counter_name": "retained_public_evidence_monitoring",
            "limit": 4,
            "window_seconds": 86_400,
        },
    ]


def test_contract_persists_only_bounded_selection_and_enforces_service_only_access() -> None:
    contract = Path("scripts/entity_first_prospecting_contract.sql").read_text(encoding="utf-8")

    assert "CREATE TABLE IF NOT EXISTS public.prospect_research_run_entities" in contract
    assert "thread_context_item_limit INTEGER NOT NULL" in contract
    assert "thread_context_char_limit INTEGER NOT NULL" in contract
    assert "run_kind NOT IN ('candidate_generation', 'evidence_collection')" in contract
    assert "ALTER TABLE public.prospect_research_run_entities ENABLE ROW LEVEL SECURITY" in contract
    assert "REVOKE ALL ON TABLE public.prospect_research_run_entities FROM authenticated" in contract
    assert "prospecting_public_evidence_sources_are_valid" in contract
    assert "guard_prospect_research_run_entity_tenant_scope" in contract
