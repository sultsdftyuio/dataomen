from __future__ import annotations

import json
from typing import Any

import pytest

from api.services.prospecting import candidate_generation
from api.services.prospecting.candidate_generation import (
    CandidateGenerationStartRequest,
    candidate_generation_idempotency_key,
    claim_candidate_generation_run,
    complete_candidate_generation_run,
    create_candidate_generation_run,
    current_candidate_generation_plan_for_claim,
    current_targeting_profile_for_claim,
    release_candidate_generation_run_for_retry,
    sanitize_candidate_generation_summary,
)


TENANT_ID = "tenant-demo"
SERVICE_PROFILE_ID = "b11f5e31-3c2c-457f-adbe-d14a8f1ec4ec"
TARGETING_PROFILE_ID = "ce4e7939-7bba-49cf-a3cf-8edbd8142cb4"
RUN_ID = "270db59f-86e6-43f7-97ce-e5c71b2a26ca"
CLAIM_TOKEN = "0962fc8d-514a-4bd1-8408-974bb3182660"
PLAN_FINGERPRINT = "a" * 64


def _request(nonce: str = "dashboard-click-1") -> CandidateGenerationStartRequest:
    return CandidateGenerationStartRequest(
        tenant_id=TENANT_ID,
        service_profile_id=SERVICE_PROFILE_ID,
        request_nonce=nonce,
    )


def _profile_row(*, profile_version: int = 4, seed_urls: list[str] | None = None) -> dict[str, Any]:
    return {
        "id": TARGETING_PROFILE_ID,
        "tenant_id": TENANT_ID,
        "service_profile_id": SERVICE_PROFILE_ID,
        "profile_version": profile_version,
        "target_types": ["account", "project"],
        "seed_urls": seed_urls if seed_urls is not None else ["https://acme.example/pricing"],
    }


def _run_row(
    *,
    status: str = "queued",
    profile_version: int = 4,
    claim_token: str | None = None,
    attempt_count: int = 0,
) -> dict[str, Any]:
    return {
        "id": RUN_ID,
        "tenant_id": TENANT_ID,
        "service_profile_id": SERVICE_PROFILE_ID,
        "targeting_profile_id": TARGETING_PROFILE_ID,
        "targeting_profile_version": profile_version,
        "status": status,
        "candidate_limit": 8,
        "plan_fingerprint": PLAN_FINGERPRINT,
        "attempt_count": attempt_count,
        "claim_token": claim_token,
    }


class _Result:
    def __init__(self, *, mapping: dict[str, Any] | None = None, scalar: Any = None) -> None:
        self.mapping = mapping
        self.scalar = scalar

    def mappings(self) -> _Result:
        return self

    def one_or_none(self) -> dict[str, Any] | None:
        return self.mapping

    def scalar_one_or_none(self) -> Any:
        return self.scalar


class _Connection:
    def __init__(self, results: list[_Result]) -> None:
        self.results = results
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def execute(self, statement: Any, params: dict[str, Any]) -> _Result:
        self.calls.append((str(statement), params))
        return self.results.pop(0)


def test_idempotency_key_is_stable_for_retries_and_changes_for_a_new_requested_run() -> None:
    request = _request()
    first = candidate_generation_idempotency_key(
        request,
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        plan_fingerprint=PLAN_FINGERPRINT,
    )
    retry = candidate_generation_idempotency_key(
        request,
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        plan_fingerprint=PLAN_FINGERPRINT,
    )
    fresh_request = candidate_generation_idempotency_key(
        _request("dashboard-click-2"),
        targeting_profile_id=TARGETING_PROFILE_ID,
        targeting_profile_version=4,
        plan_fingerprint=PLAN_FINGERPRINT,
    )

    assert first == retry
    assert first != fresh_request
    assert len(first) == 64


def test_run_creation_requires_an_approved_versioned_profile_and_stores_only_safe_summary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection(
        [
            _Result(mapping=_profile_row()),
            _Result(mapping=None),
            _Result(mapping=_run_row()),
        ]
    )
    monkeypatch.setattr(candidate_generation, "_claim_generation_quota", lambda _: True)

    creation = candidate_generation._create_candidate_generation_run_with_connection(
        connection,  # type: ignore[arg-type]
        _request(),
    )

    assert creation.created is True
    assert creation.run is not None
    assert creation.run.status == "queued"
    assert creation.plan is not None
    assert creation.plan.planned_candidate_limit == 8

    insert_sql, insert_params = connection.calls[-1]
    assert "profile.approval_status = 'approved'" in insert_sql
    assert "profile.profile_version = :targeting_profile_version" in insert_sql
    assert "ON CONFLICT (tenant_id, idempotency_key) DO NOTHING" in insert_sql
    assert insert_params["candidate_limit"] == 8
    stored_summary = json.loads(insert_params["result_summary"])
    assert stored_summary["profile_version"] == 4
    assert stored_summary["planned_seed_count"] == 1
    assert "https://acme.example" not in insert_params["result_summary"]
    assert "seed_urls" not in insert_params["result_summary"]


def test_existing_idempotent_run_does_not_consume_another_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection(
        [
            _Result(mapping=_profile_row()),
            _Result(mapping=_run_row()),
        ]
    )
    monkeypatch.setattr(
        candidate_generation,
        "_claim_generation_quota",
        lambda _: pytest.fail("a retry must not consume another quota unit"),
    )

    creation = candidate_generation._create_candidate_generation_run_with_connection(
        connection,  # type: ignore[arg-type]
        _request(),
    )

    assert creation.created is False
    assert creation.run is not None
    assert len(connection.calls) == 2


def test_empty_seed_list_skips_without_a_quota_or_durable_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _Connection([_Result(mapping=_profile_row(seed_urls=[]))])
    monkeypatch.setattr(
        candidate_generation,
        "_claim_generation_quota",
        lambda _: pytest.fail("an empty plan must not consume quota"),
    )

    creation = candidate_generation._create_candidate_generation_run_with_connection(
        connection,  # type: ignore[arg-type]
        _request(),
    )

    assert creation.run is None
    assert creation.skip_reason == "no_planned_candidates"
    assert len(connection.calls) == 1


def test_disabled_feature_does_not_open_a_database_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(candidate_generation, "candidate_generation_is_enabled", lambda: False)

    result = create_candidate_generation_run(_request())

    assert result.run is None
    assert result.skip_reason == "feature_disabled"


def test_summary_is_counter_and_reason_code_only() -> None:
    summary = sanitize_candidate_generation_summary(
        {
            "pages_fetched": 3,
            "entities_created": 2,
            "skipped_by_reason": {"not_html": 1},
            "url": "https://not-stored.example/secret-path",
            "title": "Not a storage channel",
        }
    )

    assert summary == {
        "pages_fetched": 3,
        "entities_created": 2,
        "skipped_by_reason": {"not_html": 1},
    }
    with pytest.raises(ValueError, match="reason_code"):
        sanitize_candidate_generation_summary({"skip_reason": "contains a space"})


def test_claim_and_terminal_updates_are_scoped_by_the_lease_token() -> None:
    claimed_connection = _Connection(
        [
            _Result(
                mapping=_run_row(
                    status="running",
                    claim_token=CLAIM_TOKEN,
                    attempt_count=1,
                )
            )
        ]
    )
    claimed = claim_candidate_generation_run(
        claimed_connection,  # type: ignore[arg-type]
        tenant_id=TENANT_ID,
        run_id=RUN_ID,
        claim_token=CLAIM_TOKEN,
        lease_seconds=90,
    )

    assert claimed is not None
    assert claimed.status == "running"
    claim_sql, claim_params = claimed_connection.calls[0]
    assert "run.status = 'queued'" in claim_sql
    assert "run.lease_expires_at < NOW()" in claim_sql
    assert claim_params["claim_token"] == CLAIM_TOKEN

    completed_connection = _Connection([_Result(scalar=RUN_ID)])
    completed = complete_candidate_generation_run(
        completed_connection,  # type: ignore[arg-type]
        tenant_id=TENANT_ID,
        run_id=RUN_ID,
        claim_token=CLAIM_TOKEN,
        status="partial",
        summary={"pages_fetched": 1, "skipped_by_reason": {"not_html": 1}},
    )

    assert completed is True
    complete_sql, complete_params = completed_connection.calls[0]
    assert "run.claim_token = CAST(:claim_token AS uuid)" in complete_sql
    assert "run.lease_expires_at >= NOW()" in complete_sql
    assert "claim_token = NULL" in complete_sql
    assert complete_params["status"] == "partial"


def test_retry_release_clears_only_the_current_workers_live_claim() -> None:
    connection = _Connection([_Result(scalar=RUN_ID)])

    released = release_candidate_generation_run_for_retry(
        connection,  # type: ignore[arg-type]
        tenant_id=TENANT_ID,
        run_id=RUN_ID,
        claim_token=CLAIM_TOKEN,
    )

    assert released is True
    sql, params = connection.calls[0]
    assert "SET status = 'queued'" in sql
    assert "claim_token = NULL" in sql
    assert "lease_expires_at = NULL" in sql
    assert "run.lease_expires_at >= NOW()" in sql
    assert params["claim_token"] == CLAIM_TOKEN
    assert params["error_code"] == "candidate_generation_retryable_failure"


def test_changed_targeting_profile_cannot_be_used_by_a_claimed_run() -> None:
    connection = _Connection([_Result(mapping=_profile_row(profile_version=5))])
    run = candidate_generation.CandidateGenerationRun(**_run_row(profile_version=4))

    snapshot = current_targeting_profile_for_claim(connection, run)  # type: ignore[arg-type]

    assert snapshot is None


def test_claimed_run_recomputes_the_exact_pinned_plan() -> None:
    profile_row = _profile_row()
    snapshot = candidate_generation._snapshot_from_row(profile_row)
    plan = candidate_generation._plan_for_snapshot(_request(), snapshot)
    run_payload = _run_row(profile_version=4)
    run_payload["candidate_limit"] = plan.planned_candidate_limit
    run_payload["plan_fingerprint"] = plan.input_fingerprint
    run = candidate_generation.CandidateGenerationRun(**run_payload)
    connection = _Connection([_Result(mapping=profile_row)])

    current_plan = current_candidate_generation_plan_for_claim(
        connection,  # type: ignore[arg-type]
        run,
    )

    assert current_plan is not None
    assert current_plan.input_fingerprint == run.plan_fingerprint


def test_oversize_request_nonce_is_rejected_instead_of_being_truncated() -> None:
    with pytest.raises(ValueError, match="request_nonce exceeds"):
        _request("x" * 129)
