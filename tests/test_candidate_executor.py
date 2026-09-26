from __future__ import annotations

from contextlib import AbstractContextManager
from datetime import datetime, timezone
from typing import Any

import pytest

from api.services.prospecting import candidate_executor
from api.services.prospecting.candidate_generation import CandidateGenerationRun
from api.services.prospecting.candidate_persistence import (
    CandidatePersistenceClaimLostError,
    CandidatePersistenceResult,
)
from api.services.prospecting.official_site_fetch import (
    OfficialSiteFetchResult,
    OfficialSitePageDocument,
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
ENTITY_ID = "50e98719-4e36-4d9f-8a76-5f4b9e32d9c2"


class _Transaction(AbstractContextManager[object]):
    def __enter__(self) -> object:
        return object()

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> bool:
        return False


class _Engine:
    def begin(self) -> _Transaction:
        return _Transaction()


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
            page_limit_per_seed=2,
            candidate_limit_per_seed=1,
            candidate_limit_total=1,
        ),
    )


def _run(plan: Any) -> CandidateGenerationRun:
    return CandidateGenerationRun(
        id=RUN_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        status="running",
        candidate_limit=plan.planned_candidate_limit,
        plan_fingerprint=plan.input_fingerprint,
        attempt_count=1,
        claim_token=CLAIM_TOKEN,
    )


def _document(*, source_url: str, canonical_url: str) -> OfficialSitePageDocument:
    return OfficialSitePageDocument(
        source_url=source_url,
        page_category="about",
        status_code=200,
        content_type="text/html",
        title="Acme",
        json_ld=(
            {
                "@type": "Organization",
                "url": canonical_url,
                "name": "Acme",
            },
        ),
        open_graph=None,
        discovered_page_urls=(),
        body_bytes=200,
        fetched_at=datetime.now(timezone.utc),
    )


def _wire_lifecycle(
    monkeypatch: pytest.MonkeyPatch,
    *,
    run: CandidateGenerationRun,
    plan: Any | None,
    heartbeat: bool = True,
) -> list[dict[str, Any]]:
    completions: list[dict[str, Any]] = []
    monkeypatch.setattr(candidate_executor, "candidate_generation_is_enabled", lambda: True)
    monkeypatch.setattr(
        candidate_executor,
        "claim_candidate_generation_run",
        lambda _conn, **_kwargs: run,
    )
    monkeypatch.setattr(
        candidate_executor,
        "current_candidate_generation_plan_for_claim",
        lambda _conn, _run: plan,
    )
    monkeypatch.setattr(
        candidate_executor,
        "heartbeat_candidate_generation_run",
        lambda _conn, **_kwargs: heartbeat,
    )

    def complete(_conn: object, **kwargs: Any) -> bool:
        completions.append(kwargs)
        return True

    monkeypatch.setattr(candidate_executor, "complete_candidate_generation_run", complete)
    return completions


def test_executor_bounds_one_seed_across_multiple_pages_and_persists_only_classified_targets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    run = _run(plan)
    completions = _wire_lifecycle(monkeypatch, run=run, plan=plan)
    persisted: list[object] = []
    monkeypatch.setattr(
        candidate_executor,
        "persist_phase2_candidate",
        lambda _conn, **kwargs: (
            persisted.append(kwargs["proposal"])
            or CandidatePersistenceResult(
                entity_id=ENTITY_ID,
                entity_created=True,
                assessment_created=True,
                fit_evidence_created=True,
                origin="official_site",
            )
        ),
    )
    seed = plan.seed_plans[0]
    fetch_result = OfficialSiteFetchResult(
        seed_url=seed.seed_url,
        outcome="completed",
        documents=(
            _document(source_url="https://acme.example/about", canonical_url="https://acme.example/"),
            _document(
                source_url="https://acme.example/company",
                canonical_url="https://acme.example/company",
            ),
        ),
        skipped=(),
        pages_requested=2,
        total_body_bytes=400,
    )

    result = candidate_executor.run_candidate_generation(
        TENANT_ID,
        RUN_ID,
        engine=_Engine(),  # type: ignore[arg-type]
        fetch_seed=lambda _seed: fetch_result,
    )

    assert result.status == "completed"
    assert result.terminalized is True
    assert len(persisted) == 1
    assert result.summary["candidate_proposals"] == 1
    assert result.summary["entities_created"] == 1
    assert result.summary["fit_evidence_created"] == 1
    assert result.summary["skipped_by_reason"] == {"candidate_limit_reached": 1}
    assert completions[0]["status"] == "completed"
    assert "acme.example" not in repr(completions[0]["summary"])


def test_executor_skips_a_run_when_its_pinned_targeting_profile_changed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    completions = _wire_lifecycle(monkeypatch, run=_run(plan), plan=None)
    monkeypatch.setattr(
        candidate_executor,
        "persist_phase2_candidate",
        lambda *_args, **_kwargs: pytest.fail("a stale profile must not persist a target"),
    )

    result = candidate_executor.run_candidate_generation(
        TENANT_ID,
        RUN_ID,
        engine=_Engine(),  # type: ignore[arg-type]
        fetch_seed=lambda _seed: pytest.fail("a stale profile must not fetch"),
    )

    assert result.status == "skipped"
    assert result.terminalized is True
    assert completions[0]["status"] == "skipped"
    assert completions[0]["summary"]["skip_reason"] == "targeting_profile_changed"


def test_executor_does_not_terminalize_after_persistence_loses_its_claim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    run = _run(plan)
    completions = _wire_lifecycle(monkeypatch, run=run, plan=plan, heartbeat=False)
    # The first pre-fetch heartbeat also needs to succeed; only the check made
    # after the persistence boundary reports that another worker owns the run.
    heartbeat_calls = 0

    def heartbeat(_conn: object, **_kwargs: Any) -> bool:
        nonlocal heartbeat_calls
        heartbeat_calls += 1
        return heartbeat_calls < 3

    monkeypatch.setattr(candidate_executor, "heartbeat_candidate_generation_run", heartbeat)
    monkeypatch.setattr(
        candidate_executor,
        "persist_phase2_candidate",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(CandidatePersistenceClaimLostError()),
    )
    seed = plan.seed_plans[0]
    fetch_result = OfficialSiteFetchResult(
        seed_url=seed.seed_url,
        outcome="completed",
        documents=(
            _document(source_url="https://acme.example/about", canonical_url="https://acme.example/"),
        ),
        skipped=(),
        pages_requested=1,
        total_body_bytes=200,
    )

    result = candidate_executor.run_candidate_generation(
        TENANT_ID,
        RUN_ID,
        engine=_Engine(),  # type: ignore[arg-type]
        fetch_seed=lambda _seed: fetch_result,
    )

    assert result.status == "claim_lost"
    assert result.terminalized is False
    assert completions == []


def test_executor_releases_an_unexpected_failure_for_a_real_queue_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    run = _run(plan)
    _wire_lifecycle(monkeypatch, run=run, plan=plan)
    releases: list[dict[str, Any]] = []

    def release(_conn: object, **kwargs: Any) -> bool:
        releases.append(kwargs)
        return True

    monkeypatch.setattr(candidate_executor, "release_candidate_generation_run_for_retry", release)

    with pytest.raises(RuntimeError, match="transport failed"):
        candidate_executor.run_candidate_generation(
            TENANT_ID,
            RUN_ID,
            engine=_Engine(),  # type: ignore[arg-type]
            fetch_seed=lambda _seed: (_ for _ in ()).throw(RuntimeError("transport failed")),
        )

    assert releases == [
        {
            "tenant_id": TENANT_ID,
            "run_id": RUN_ID,
            "claim_token": CLAIM_TOKEN,
        }
    ]


def test_exhausted_retry_handler_claims_before_marking_the_run_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    run = _run(plan)
    completions = _wire_lifecycle(monkeypatch, run=run, plan=plan)

    result = candidate_executor.mark_candidate_generation_dead_lettered(
        TENANT_ID,
        RUN_ID,
        engine=_Engine(),  # type: ignore[arg-type]
    )

    assert result.status == "failed"
    assert result.terminalized is True
    assert completions[0]["status"] == "failed"
    assert completions[0]["error_code"] == "candidate_generation_retry_exhausted"
    assert completions[0]["summary"] == {
        "pages_fetched": 0,
        "pages_skipped": 0,
        "candidate_proposals": 0,
        "entities_created": 0,
        "entities_seen": 0,
        "assessments_created": 0,
        "fit_evidence_created": 0,
        "failure_reason": "candidate_generation_retry_exhausted",
    }
