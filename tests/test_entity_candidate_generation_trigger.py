from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from api import main
from api.services.prospecting import candidate_dispatch, candidate_generation
from api.services.prospecting.candidate_generation import CandidateGenerationRun
from api.services.prospecting.candidate_dispatch import CandidateGenerationDispatchResult
from api.services.prospecting.official_site_generation import (
    OfficialSiteGenerationLimits,
    OfficialSiteGenerationRequest,
    plan_official_site_generation,
)


TENANT_ID = "ff2a2bd0-7379-4a0e-a47e-3f430998d079"
PROFILE_ID = "6d50d075-9f07-4e8b-b38b-297c6e8bb381"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
USER_ID = "43d50ac4-7554-4d0a-aeb3-bc1d8c1b52e1"


def _payload() -> main.EntityCandidateGenerationTriggerRequest:
    return main.EntityCandidateGenerationTriggerRequest(
        tenant_id=TENANT_ID,
        service_profile_id=PROFILE_ID,
        requested_by=USER_ID,
        source="dashboard",
    )


def _run(*, status: str = "queued") -> CandidateGenerationRun:
    plan = plan_official_site_generation(
        OfficialSiteGenerationRequest(
            tenant_id=TENANT_ID,
            service_profile_id=PROFILE_ID,
            targeting_profile_id=TARGETING_PROFILE_ID,
            profile_version="4",
            target_types=["account"],
            seed_urls=["https://acme.example/about"],
            explicit_request=True,
        ),
        limits=OfficialSiteGenerationLimits(
            seed_limit=1,
            page_limit_per_seed=1,
            candidate_limit_per_seed=1,
            candidate_limit_total=1,
        ),
    )
    return CandidateGenerationRun(
        id=RUN_ID,
        tenant_id=TENANT_ID,
        service_profile_id=PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        status=status,  # type: ignore[arg-type]
        candidate_limit=plan.planned_candidate_limit,
        plan_fingerprint=plan.input_fingerprint,
        attempt_count=0,
    )


def test_trigger_requires_uuid_scoped_identifiers() -> None:
    with pytest.raises(ValidationError):
        main.EntityCandidateGenerationTriggerRequest(
            tenant_id=TENANT_ID,
            service_profile_id="not-a-uuid",
        )


def test_trigger_is_feature_gated_before_durable_dispatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(candidate_generation, "candidate_generation_is_enabled", lambda: False)
    monkeypatch.setattr(
        candidate_dispatch,
        "enqueue_candidate_generation_run",
        lambda *_args, **_kwargs: pytest.fail("disabled generation must not dispatch"),
    )

    with pytest.raises(HTTPException) as raised:
        main.trigger_entity_candidate_generation(_payload(), None, "idempotency-1")

    assert raised.value.status_code == 404


def test_trigger_scopes_the_profile_and_uses_the_idempotency_key_as_request_nonce(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scope_calls: list[dict[str, str]] = []
    request_calls: list[candidate_generation.CandidateGenerationStartRequest] = []
    run = _run()
    monkeypatch.setattr(
        main,
        "_validate_internal_tenant_scope",
        lambda **kwargs: scope_calls.append(kwargs),
    )
    monkeypatch.setattr(candidate_generation, "candidate_generation_is_enabled", lambda: True)
    monkeypatch.setattr(
        candidate_dispatch,
        "enqueue_candidate_generation_run",
        lambda request: request_calls.append(request)
        or CandidateGenerationDispatchResult(
            state="queued",
            run=run,
            message_id="message-123",
            created=True,
        ),
    )

    response = main.trigger_entity_candidate_generation(_payload(), None, "idempotency-1")

    assert response.status == "queued"
    assert response.run_id == RUN_ID
    assert response.message_id == "message-123"
    assert response.created is True
    assert scope_calls == [{"tenant_id": TENANT_ID, "service_profile_id": PROFILE_ID}]
    assert request_calls == [
        candidate_generation.CandidateGenerationStartRequest(
            tenant_id=TENANT_ID,
            service_profile_id=PROFILE_ID,
            request_nonce="idempotency-1",
        )
    ]


def test_trigger_distinguishes_an_existing_running_run_from_a_new_target_claim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(candidate_generation, "candidate_generation_is_enabled", lambda: True)
    monkeypatch.setattr(
        candidate_dispatch,
        "enqueue_candidate_generation_run",
        lambda _request: CandidateGenerationDispatchResult(
            state="running",
            run=_run(status="running"),
            created=False,
        ),
    )

    response = main.trigger_entity_candidate_generation(_payload(), None, "idempotency-1")

    assert response.status == "running"
    assert response.message_id is None
    assert response.created is False


@pytest.mark.parametrize(
    "skip_reason, expected_status",
    [("tenant_quota_exceeded", 429), ("no_planned_candidates", 409)],
)
def test_trigger_does_not_claim_targets_when_dispatch_is_skipped(
    monkeypatch: pytest.MonkeyPatch,
    skip_reason: str,
    expected_status: int,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(candidate_generation, "candidate_generation_is_enabled", lambda: True)
    monkeypatch.setattr(
        candidate_dispatch,
        "enqueue_candidate_generation_run",
        lambda _request: CandidateGenerationDispatchResult(
            state="skipped",
            run=None,
            skip_reason=skip_reason,  # type: ignore[arg-type]
        ),
    )

    with pytest.raises(HTTPException) as raised:
        main.trigger_entity_candidate_generation(_payload(), None, "idempotency-1")

    assert raised.value.status_code == expected_status


def test_trigger_reports_an_ambiguous_queue_publish_as_retryable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "_validate_internal_tenant_scope", lambda **_: None)
    monkeypatch.setattr(candidate_generation, "candidate_generation_is_enabled", lambda: True)
    monkeypatch.setattr(
        candidate_dispatch,
        "enqueue_candidate_generation_run",
        lambda _request: (_ for _ in ()).throw(RuntimeError("redis unavailable")),
    )

    with pytest.raises(HTTPException) as raised:
        main.trigger_entity_candidate_generation(_payload(), None, "idempotency-1")

    assert raised.value.status_code == 503
    assert "same Idempotency-Key" in raised.value.detail
