from __future__ import annotations

from contextlib import AbstractContextManager
from datetime import datetime, timezone
from typing import Any

import pytest

from api.services.prospecting import evidence_executor
from api.services.prospecting.evidence_collection import (
    ApprovedEvidenceTargetingProfileSnapshot,
    EvidenceCollectionRun,
    EvidenceCollectionTargetSnapshot,
    plan_evidence_collection,
)
from api.services.prospecting.evidence_persistence import (
    EvidencePersistenceClaimLostError,
    RetainedEvidencePersistenceResult,
)
from api.services.prospecting.retained_public_evidence import RetainedPublicSourceRecord


TENANT_ID = "tenant-demo"
SERVICE_PROFILE_ID = "b11f5e31-3c2c-457f-adbe-d14a8f1ec4ec"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
ENTITY_ID = "50e98719-4e36-4d9f-8a76-5f4b9e32d9c2"
POST_ID = "4197c931-ecdd-4102-af3f-a36c1ad6bae1"
CLAIM_TOKEN = "0962fc8d-514a-4bd1-8408-974bb3182660"
NOW = datetime(2026, 9, 25, 10, tzinfo=timezone.utc)


class _Transaction(AbstractContextManager[object]):
    def __enter__(self) -> object:
        return object()

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> bool:
        return False


class _Engine:
    def begin(self) -> _Transaction:
        return _Transaction()


def _plan(*, canonical_url: str = "https://github.com/indie-builder"):
    snapshot = ApprovedEvidenceTargetingProfileSnapshot(
        id=TARGETING_PROFILE_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        profile_version=4,
    )
    return plan_evidence_collection(
        snapshot,
        [
            EvidenceCollectionTargetSnapshot(
                entity_id=ENTITY_ID,
                entity_kind="builder",
                origin_kind="manual",
                assessment_state="high_fit",
                canonical_url=canonical_url,
            )
        ],
    )


def _run(plan: Any) -> EvidenceCollectionRun:
    assert plan is not None
    return EvidenceCollectionRun(
        id=RUN_ID,
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        status="running",
        entity_limit=plan.planned_entity_count,
        evidence_limit_per_entity=max(item.plan.evidence_limit for item in plan.target_plans),
        plan_fingerprint=plan.input_fingerprint,
        attempt_count=1,
        claim_token=CLAIM_TOKEN,
    )


def _record() -> RetainedPublicSourceRecord:
    return RetainedPublicSourceRecord(
        source_post_id=POST_ID,
        source="github",
        author_locator="indie-builder",
        body="We are evaluating outbound automation tools versus manual prospect lists.",
        observed_at=NOW,
    )


def _wire_lifecycle(
    monkeypatch: pytest.MonkeyPatch,
    *,
    run: EvidenceCollectionRun,
    plan: Any | None,
    heartbeat: bool = True,
) -> list[dict[str, Any]]:
    completions: list[dict[str, Any]] = []
    monkeypatch.setattr(evidence_executor, "retained_public_evidence_research_is_enabled", lambda: True)
    monkeypatch.setattr(
        evidence_executor,
        "claim_evidence_collection_run",
        lambda _conn, **_kwargs: run,
    )
    monkeypatch.setattr(
        evidence_executor,
        "current_evidence_collection_plan_for_claim",
        lambda _conn, _run: plan,
    )
    monkeypatch.setattr(
        evidence_executor,
        "heartbeat_evidence_collection_run",
        lambda _conn, **_kwargs: heartbeat,
    )

    def complete(_conn: object, **kwargs: Any) -> bool:
        completions.append(kwargs)
        return True

    monkeypatch.setattr(evidence_executor, "complete_evidence_collection_run", complete)
    return completions


def test_executor_reads_only_retained_exact_author_rows_and_persists_pending_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    run = _run(plan)
    completions = _wire_lifecycle(monkeypatch, run=run, plan=plan)
    loads: list[tuple[str, str, int]] = []
    monkeypatch.setattr(
        evidence_executor,
        "persist_retained_public_evidence",
        lambda _conn, **_kwargs: RetainedEvidencePersistenceResult(evidence_created=True),
    )

    def load_records(_conn: object, locator: object, limit: int):
        source = getattr(locator, "source")
        author_locator = getattr(locator, "author_locator")
        loads.append((source, author_locator, limit))
        return (_record(),)

    result = evidence_executor.run_evidence_collection(
        TENANT_ID,
        RUN_ID,
        engine=_Engine(),  # type: ignore[arg-type]
        load_records=load_records,  # type: ignore[arg-type]
    )

    assert result.status == "completed"
    assert result.terminalized is True
    assert loads == [("github", "indie-builder", 10)]
    assert result.summary["retained_records_scanned"] == 1
    assert result.summary["pending_evidence_proposals"] == 1
    assert result.summary["evidence_created"] == 1
    assert "manual prospect lists" not in repr(result.summary)
    assert completions[0]["status"] == "completed"


def test_executor_honestly_completes_when_a_target_has_no_supported_exact_locator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan(canonical_url="https://indie.example/profile")
    run = _run(plan)
    completions = _wire_lifecycle(monkeypatch, run=run, plan=plan)

    result = evidence_executor.run_evidence_collection(
        TENANT_ID,
        RUN_ID,
        engine=_Engine(),  # type: ignore[arg-type]
        load_records=lambda *_args: pytest.fail("unsupported locator must not query retained rows"),
    )

    assert result.status == "completed"
    assert result.summary["entities_without_supported_locator"] == 1
    assert result.summary["skipped_by_reason"] == {"no_supported_author_locator": 1}
    assert completions[0]["status"] == "completed"


def test_executor_skips_when_the_pinned_targeting_profile_changed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    completions = _wire_lifecycle(monkeypatch, run=_run(plan), plan=None)

    result = evidence_executor.run_evidence_collection(
        TENANT_ID,
        RUN_ID,
        engine=_Engine(),  # type: ignore[arg-type]
    )

    assert result.status == "skipped"
    assert result.terminalized is True
    assert completions[0]["summary"]["skip_reason"] == "targeting_profile_changed"


def test_executor_does_not_terminalize_after_persistence_loses_its_claim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    run = _run(plan)
    completions = _wire_lifecycle(monkeypatch, run=run, plan=plan)
    heartbeat_calls = 0

    def heartbeat(_conn: object, **_kwargs: Any) -> bool:
        nonlocal heartbeat_calls
        heartbeat_calls += 1
        return heartbeat_calls < 3

    monkeypatch.setattr(evidence_executor, "heartbeat_evidence_collection_run", heartbeat)
    monkeypatch.setattr(
        evidence_executor,
        "persist_retained_public_evidence",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(EvidencePersistenceClaimLostError()),
    )

    result = evidence_executor.run_evidence_collection(
        TENANT_ID,
        RUN_ID,
        engine=_Engine(),  # type: ignore[arg-type]
        load_records=lambda *_args: (_record(),),
    )

    assert result.status == "claim_lost"
    assert result.terminalized is False
    assert completions == []


def test_executor_releases_unexpected_retained_reader_failure_for_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    run = _run(plan)
    _wire_lifecycle(monkeypatch, run=run, plan=plan)
    releases: list[dict[str, Any]] = []

    def release(_conn: object, **kwargs: Any) -> bool:
        releases.append(kwargs)
        return True

    monkeypatch.setattr(evidence_executor, "release_evidence_collection_run_for_retry", release)

    with pytest.raises(RuntimeError, match="retained storage unavailable"):
        evidence_executor.run_evidence_collection(
            TENANT_ID,
            RUN_ID,
            engine=_Engine(),  # type: ignore[arg-type]
            load_records=lambda *_args: (_ for _ in ()).throw(RuntimeError("retained storage unavailable")),
        )

    assert releases == [
        {"tenant_id": TENANT_ID, "run_id": RUN_ID, "claim_token": CLAIM_TOKEN}
    ]


def test_retry_exhaustion_claims_before_terminalizing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plan = _plan()
    completions = _wire_lifecycle(monkeypatch, run=_run(plan), plan=plan)

    result = evidence_executor.mark_evidence_collection_dead_lettered(
        TENANT_ID,
        RUN_ID,
        engine=_Engine(),  # type: ignore[arg-type]
    )

    assert result.status == "failed"
    assert result.terminalized is True
    assert completions[0]["error_code"] == "retained_public_evidence_retry_exhausted"
