from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from api import main
from api.services.prospecting import evidence_collection, evidence_dispatch
from api.services.prospecting.evidence_collection import (
    ApprovedEvidenceTargetingProfileSnapshot,
    EvidenceCollectionRun,
    EvidenceCollectionTargetSnapshot,
    plan_evidence_collection,
)
from api.services.prospecting.evidence_dispatch import EvidenceCollectionDispatchResult


TENANT_ID = "ff2a2bd0-7379-4a0e-a47e-3f430998d079"
PROFILE_ID = "6d50d075-9f07-4e8b-b38b-297c6e8bb381"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
ENTITY_ID = "50e98719-4e36-4d9f-8a76-5f4b9e32d9c2"


def _payload() -> main.EvidenceCollectionTriggerRequest:
    return main.EvidenceCollectionTriggerRequest(
        tenant_id=TENANT_ID,
        service_profile_id=PROFILE_ID,
        prospect_entity_ids=[ENTITY_ID],
    )


def _run(*, status: str = "queued") -> EvidenceCollectionRun:
    plan = plan_evidence_collection(
        ApprovedEvidenceTargetingProfileSnapshot(
            id=TARGETING_PROFILE_ID,
            tenant_id=TENANT_ID,
            service_profile_id=PROFILE_ID,
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
    assert plan is not None
    return EvidenceCollectionRun(
        id=RUN_ID,
        tenant_id=TENANT_ID,
        service_profile_id=PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        status=status,  # type: ignore[arg-type]
        entity_limit=plan.planned_entity_count,
        evidence_limit_per_entity=max(item.plan.evidence_limit for item in plan.target_plans),
        plan_fingerprint=plan.input_fingerprint,
        attempt_count=0,
    )


def test_request_rejects_invalid_duplicate_and_over_cap_target_ids() -> None:
    with pytest.raises(ValidationError):
        main.EvidenceCollectionTriggerRequest(
            tenant_id=TENANT_ID,
            service_profile_id=PROFILE_ID,
            prospect_entity_ids=["not-a-uuid"],
        )
    with pytest.raises(ValidationError):
        main.EvidenceCollectionTriggerRequest(
            tenant_id=TENANT_ID,
            service_profile_id=PROFILE_ID,
            prospect_entity_ids=[ENTITY_ID, ENTITY_ID],
        )
    with pytest.raises(ValidationError):
        main.EvidenceCollectionTriggerRequest(
            tenant_id=TENANT_ID,
            service_profile_id=PROFILE_ID,
            prospect_entity_ids=[str(uuid4()) for _ in range(26)],
        )
    with pytest.raises(ValidationError):
        main.EvidenceCollectionTriggerRequest(
            tenant_id=TENANT_ID,
            service_profile_id=PROFILE_ID,
            prospect_entity_ids=[ENTITY_ID],
            source="unbounded caller text",
        )


def test_trigger_is_feature_gated_before_durable_dispatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(evidence_collection, "retained_public_evidence_research_is_enabled", lambda: False)
    monkeypatch.setattr(
        evidence_dispatch,
        "enqueue_evidence_collection_run",
        lambda *_args, **_kwargs: pytest.fail("disabled evidence collection must not dispatch"),
    )

    with pytest.raises(HTTPException) as raised:
        main.trigger_retained_public_evidence_collection(_payload(), None, "idempotency-1")

    assert raised.value.status_code == 404


def test_trigger_scopes_selection_and_uses_idempotency_key_as_nonce(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scope_calls: list[dict[str, str]] = []
    requests: list[evidence_collection.EvidenceCollectionStartRequest] = []
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **kwargs: scope_calls.append(kwargs))
    monkeypatch.setattr(evidence_collection, "retained_public_evidence_research_is_enabled", lambda: True)
    monkeypatch.setattr(
        evidence_dispatch,
        "enqueue_evidence_collection_run",
        lambda request: requests.append(request)
        or EvidenceCollectionDispatchResult(
            state="queued",
            run=_run(),
            message_id="message-123",
            created=True,
        ),
    )

    response = main.trigger_retained_public_evidence_collection(_payload(), None, "idempotency-1")

    assert response.status == "queued"
    assert response.run_id == RUN_ID
    assert response.message_id == "message-123"
    assert response.created is True
    assert scope_calls == [{"tenant_id": TENANT_ID, "service_profile_id": PROFILE_ID}]
    assert requests == [
        evidence_collection.EvidenceCollectionStartRequest(
            tenant_id=TENANT_ID,
            service_profile_id=PROFILE_ID,
            prospect_entity_ids=(ENTITY_ID,),
            request_nonce="idempotency-1",
        )
    ]


def test_trigger_returns_running_without_republishing_claim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(evidence_collection, "retained_public_evidence_research_is_enabled", lambda: True)
    monkeypatch.setattr(
        evidence_dispatch,
        "enqueue_evidence_collection_run",
        lambda _request: EvidenceCollectionDispatchResult(
            state="running",
            run=_run(status="running"),
            created=False,
        ),
    )

    response = main.trigger_retained_public_evidence_collection(_payload(), None, "idempotency-1")

    assert response.status == "running"
    assert response.message_id is None
    assert response.created is False


@pytest.mark.parametrize(
    "skip_reason, expected_status",
    [
        ("tenant_quota_exceeded", 429),
        ("target_not_available", 409),
        ("targeting_profile_changed", 409),
        ("feature_disabled", 404),
    ],
)
def test_trigger_does_not_claim_evidence_when_dispatch_is_skipped(
    monkeypatch: pytest.MonkeyPatch,
    skip_reason: str,
    expected_status: int,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(evidence_collection, "retained_public_evidence_research_is_enabled", lambda: True)
    monkeypatch.setattr(
        evidence_dispatch,
        "enqueue_evidence_collection_run",
        lambda _request: EvidenceCollectionDispatchResult(
            state="skipped",
            run=None,
            skip_reason=skip_reason,  # type: ignore[arg-type]
        ),
    )

    with pytest.raises(HTTPException) as raised:
        main.trigger_retained_public_evidence_collection(_payload(), None, "idempotency-1")

    assert raised.value.status_code == expected_status


def test_trigger_reports_ambiguous_queue_publish_as_retryable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(evidence_collection, "retained_public_evidence_research_is_enabled", lambda: True)
    monkeypatch.setattr(
        evidence_dispatch,
        "enqueue_evidence_collection_run",
        lambda _request: (_ for _ in ()).throw(RuntimeError("redis unavailable")),
    )

    with pytest.raises(HTTPException) as raised:
        main.trigger_retained_public_evidence_collection(_payload(), None, "idempotency-1")

    assert raised.value.status_code == 503
    assert "same Idempotency-Key" in raised.value.detail
