from __future__ import annotations

import pytest

from api.services.prospecting import candidate_dispatch
from api.services.prospecting.candidate_generation import (
    CandidateGenerationRun,
    CandidateGenerationRunCreation,
    CandidateGenerationStartRequest,
)
from api.services.prospecting.official_site_generation import (
    OfficialSiteGenerationLimits,
    OfficialSiteGenerationRequest,
    plan_official_site_generation,
)


TENANT_ID = "tenant-demo"
SERVICE_PROFILE_ID = "b11f5e31-3c2c-457f-adbe-d14a8f1ec4ec"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
CLAIM_TOKEN = "0962fc8d-514a-4bd1-8408-974bb3182660"


def _request() -> CandidateGenerationStartRequest:
    return CandidateGenerationStartRequest(
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        request_nonce="internal-request-1",
    )


def _plan():
    return plan_official_site_generation(
        OfficialSiteGenerationRequest(
            tenant_id=TENANT_ID,
            service_profile_id=SERVICE_PROFILE_ID,
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


def _run(plan, *, status: str = "queued") -> CandidateGenerationRun:
    return CandidateGenerationRun(
        id=RUN_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        status=status,  # type: ignore[arg-type]
        candidate_limit=plan.planned_candidate_limit,
        plan_fingerprint=plan.input_fingerprint,
        attempt_count=1 if status == "running" else 0,
        claim_token=CLAIM_TOKEN if status == "running" else None,
    )


def test_queued_idempotent_run_is_republished_with_only_its_durable_identifiers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    run = _run(plan)
    monkeypatch.setattr(
        candidate_dispatch,
        "create_candidate_generation_run",
        lambda *_args, **_kwargs: CandidateGenerationRunCreation(
            run=run,
            plan=plan,
            created=False,
        ),
    )
    published: list[CandidateGenerationRun] = []
    monkeypatch.setattr(
        candidate_dispatch,
        "_publish_candidate_generation_run",
        lambda persisted_run: published.append(persisted_run) or "message-42",
    )

    result = candidate_dispatch.enqueue_candidate_generation_run(_request())

    assert result.state == "queued"
    assert result.message_id == "message-42"
    assert result.created is False
    assert published == [run]


@pytest.mark.parametrize("run_status, expected_state", [("running", "running"), ("completed", "terminal")])
def test_nonqueued_durable_runs_are_not_republished(
    monkeypatch: pytest.MonkeyPatch,
    run_status: str,
    expected_state: str,
) -> None:
    plan = _plan()
    run = _run(plan, status=run_status)
    monkeypatch.setattr(
        candidate_dispatch,
        "create_candidate_generation_run",
        lambda *_args, **_kwargs: CandidateGenerationRunCreation(
            run=run,
            plan=plan,
            created=False,
        ),
    )
    monkeypatch.setattr(
        candidate_dispatch,
        "_publish_candidate_generation_run",
        lambda _run: pytest.fail("nonqueued runs must not publish"),
    )

    result = candidate_dispatch.enqueue_candidate_generation_run(_request())

    assert result.state == expected_state
    assert result.message_id is None


def test_a_creation_skip_never_attempts_broker_dispatch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        candidate_dispatch,
        "create_candidate_generation_run",
        lambda *_args, **_kwargs: CandidateGenerationRunCreation(
            run=None,
            plan=None,
            created=False,
            skip_reason="feature_disabled",
        ),
    )
    monkeypatch.setattr(
        candidate_dispatch,
        "_publish_candidate_generation_run",
        lambda _run: pytest.fail("a skipped run must not publish"),
    )

    result = candidate_dispatch.enqueue_candidate_generation_run(_request())

    assert result.state == "skipped"
    assert result.skip_reason == "feature_disabled"


def test_ambiguous_broker_failure_leaves_the_durable_run_available_for_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    run = _run(plan)
    monkeypatch.setattr(
        candidate_dispatch,
        "create_candidate_generation_run",
        lambda *_args, **_kwargs: CandidateGenerationRunCreation(
            run=run,
            plan=plan,
            created=True,
        ),
    )
    monkeypatch.setattr(
        candidate_dispatch,
        "_publish_candidate_generation_run",
        lambda _run: (_ for _ in ()).throw(RuntimeError("redis unavailable")),
    )

    with pytest.raises(RuntimeError, match="queue is unavailable"):
        candidate_dispatch.enqueue_candidate_generation_run(_request())
