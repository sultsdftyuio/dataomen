from __future__ import annotations

import pytest

from api.services.prospecting import evidence_dispatch
from api.services.prospecting.evidence_collection import (
    ApprovedEvidenceTargetingProfileSnapshot,
    EvidenceCollectionRun,
    EvidenceCollectionRunCreation,
    EvidenceCollectionStartRequest,
    EvidenceCollectionTargetSnapshot,
    plan_evidence_collection,
)


TENANT_ID = "tenant-demo"
SERVICE_PROFILE_ID = "b11f5e31-3c2c-457f-adbe-d14a8f1ec4ec"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
ENTITY_ID = "50e98719-4e36-4d9f-8a76-5f4b9e32d9c2"


def _request() -> EvidenceCollectionStartRequest:
    return EvidenceCollectionStartRequest(
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        prospect_entity_ids=(ENTITY_ID,),
        request_nonce="internal-request-1",
    )


def _plan():
    return plan_evidence_collection(
        ApprovedEvidenceTargetingProfileSnapshot(
            id=TARGETING_PROFILE_ID,
            tenant_id=TENANT_ID,
            service_profile_id=SERVICE_PROFILE_ID,
            profile_version=4,
        ),
        [
            EvidenceCollectionTargetSnapshot(
                entity_id=ENTITY_ID,
                entity_kind="builder",
                origin_kind="manual",
                assessment_state="high_fit",
                canonical_url="https://github.com/indie-builder",
            )
        ],
    )


def _run(plan, *, status: str = "queued") -> EvidenceCollectionRun:
    assert plan is not None
    return EvidenceCollectionRun(
        id=RUN_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        status=status,  # type: ignore[arg-type]
        entity_limit=plan.planned_entity_count,
        evidence_limit_per_entity=max(item.plan.evidence_limit for item in plan.target_plans),
        plan_fingerprint=plan.input_fingerprint,
        attempt_count=1 if status == "running" else 0,
    )


def test_queued_idempotent_run_is_republished_with_only_durable_identifiers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    run = _run(plan)
    monkeypatch.setattr(
        evidence_dispatch,
        "create_evidence_collection_run",
        lambda *_args, **_kwargs: EvidenceCollectionRunCreation(run=run, plan=plan, created=False),
    )
    published: list[EvidenceCollectionRun] = []
    monkeypatch.setattr(
        evidence_dispatch,
        "_publish_evidence_collection_run",
        lambda persisted_run: published.append(persisted_run) or "message-42",
    )

    result = evidence_dispatch.enqueue_evidence_collection_run(_request())

    assert result.state == "queued"
    assert result.message_id == "message-42"
    assert result.created is False
    assert published == [run]


@pytest.mark.parametrize("run_status, expected_state", [("running", "running"), ("completed", "terminal")])
def test_nonqueued_runs_are_not_republished(
    monkeypatch: pytest.MonkeyPatch,
    run_status: str,
    expected_state: str,
) -> None:
    plan = _plan()
    monkeypatch.setattr(
        evidence_dispatch,
        "create_evidence_collection_run",
        lambda *_args, **_kwargs: EvidenceCollectionRunCreation(
            run=_run(plan, status=run_status),
            plan=plan,
            created=False,
        ),
    )
    monkeypatch.setattr(
        evidence_dispatch,
        "_publish_evidence_collection_run",
        lambda _run: pytest.fail("nonqueued runs must not publish"),
    )

    result = evidence_dispatch.enqueue_evidence_collection_run(_request())

    assert result.state == expected_state
    assert result.message_id is None


def test_skip_never_attempts_broker_dispatch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        evidence_dispatch,
        "create_evidence_collection_run",
        lambda *_args, **_kwargs: EvidenceCollectionRunCreation(
            run=None,
            plan=None,
            created=False,
            skip_reason="feature_disabled",
        ),
    )
    monkeypatch.setattr(
        evidence_dispatch,
        "_publish_evidence_collection_run",
        lambda _run: pytest.fail("a skipped run must not publish"),
    )

    result = evidence_dispatch.enqueue_evidence_collection_run(_request())

    assert result.state == "skipped"
    assert result.skip_reason == "feature_disabled"


def test_ambiguous_broker_failure_keeps_run_available_for_same_nonce_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    monkeypatch.setattr(
        evidence_dispatch,
        "create_evidence_collection_run",
        lambda *_args, **_kwargs: EvidenceCollectionRunCreation(run=_run(plan), plan=plan, created=True),
    )
    monkeypatch.setattr(
        evidence_dispatch,
        "_publish_evidence_collection_run",
        lambda _run: (_ for _ in ()).throw(RuntimeError("redis unavailable")),
    )

    with pytest.raises(RuntimeError, match="queue is unavailable"):
        evidence_dispatch.enqueue_evidence_collection_run(_request())
