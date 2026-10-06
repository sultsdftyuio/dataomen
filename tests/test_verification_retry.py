"""Recovery of candidates the verifier could not evaluate."""

from __future__ import annotations

import os
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from api.services.cost_controls import TenantQuotaGuard
from api.services.social import verification_retry
from api.services.social.verification_retry import (
    TRANSIENT_VERIFIER_SKIP_REASON,
    VERIFICATION_DEADLINE_REASON,
    is_transient_verifier_skip,
    retry_delay_seconds,
    schedule_verification_retries,
    schedule_verification_retry,
)
from api.services.verifier import VerificationResult


@pytest.fixture(autouse=True)
def _isolated_retry_counters(monkeypatch):
    # The guard's process-local fallback is shared class state.
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setattr(TenantQuotaGuard, "_memory_counts", {})
    for name in (
        "ARCLI_VERIFICATION_RETRY_ENABLED",
        "ARCLI_VERIFICATION_RETRY_MAX_ATTEMPTS",
        "ARCLI_VERIFICATION_RETRY_WINDOW_SECONDS",
        "ARCLI_VERIFICATION_RETRY_BASE_DELAY_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)


def _skipped(reason: str) -> VerificationResult:
    return VerificationResult(
        match=False,
        decision_label="not_a_match",
        confidence=0.0,
        pain_detected="",
        why_this_matches="",
        rejection_reason=reason,
        verifier_executed=False,
    )


def test_only_a_provider_failure_is_treated_as_transient() -> None:
    assert is_transient_verifier_skip(_skipped(TRANSIENT_VERIFIER_SKIP_REASON))
    # Budget and quota windows last hours or days; a short retry cannot help.
    assert not is_transient_verifier_skip(_skipped("monthly_cost_budget_reached"))
    assert not is_transient_verifier_skip(_skipped("tenant_quota_exceeded"))
    assert not is_transient_verifier_skip(_skipped("insufficient_similarity"))
    executed = VerificationResult(
        match=False,
        decision_label="not_a_match",
        confidence=0.1,
        pain_detected="",
        why_this_matches="",
        rejection_reason=TRANSIENT_VERIFIER_SKIP_REASON,
    )
    assert not is_transient_verifier_skip(executed)


def test_retries_back_off_and_stop_after_the_attempt_allowance() -> None:
    enqueued: list[tuple[str, str, int]] = []

    def enqueue(tenant_id: str, service_profile_id: str, *, delay_ms: int) -> str:
        enqueued.append((tenant_id, service_profile_id, delay_ms))
        return "message-id"

    outcomes = [
        schedule_verification_retry(
            "tenant-a",
            "profile-1",
            reason=TRANSIENT_VERIFIER_SKIP_REASON,
            enqueue=enqueue,
        )
        for _ in range(5)
    ]

    assert outcomes == [True, True, True, False, False]
    assert [delay_ms for _, _, delay_ms in enqueued] == [300_000, 900_000, 2_700_000]
    assert retry_delay_seconds(1) == 300


def test_each_profile_has_its_own_attempt_allowance() -> None:
    enqueued: list[tuple[str, str]] = []

    def enqueue(tenant_id: str, service_profile_id: str, *, delay_ms: int) -> None:
        enqueued.append((tenant_id, service_profile_id))

    for profile_id in ("profile-1", "profile-2"):
        for _ in range(4):
            schedule_verification_retry(
                "tenant-a",
                profile_id,
                reason=TRANSIENT_VERIFIER_SKIP_REASON,
                enqueue=enqueue,
            )

    assert enqueued.count(("tenant-a", "profile-1")) == 3
    assert enqueued.count(("tenant-a", "profile-2")) == 3


def test_scheduling_never_fails_the_matching_job() -> None:
    def broken_enqueue(*_args, **_kwargs):
        raise RuntimeError("REDIS_URL is required to enqueue public source rematches.")

    assert (
        schedule_verification_retry(
            "tenant-a",
            "profile-1",
            reason=TRANSIENT_VERIFIER_SKIP_REASON,
            enqueue=broken_enqueue,
        )
        is False
    )
    assert schedule_verification_retry("", "profile-1", reason="x") is False
    assert schedule_verification_retry("tenant-a", None, reason="x") is False


def test_retries_can_be_disabled_by_deployment(monkeypatch) -> None:
    monkeypatch.setenv("ARCLI_VERIFICATION_RETRY_ENABLED", "false")
    enqueued: list[str] = []

    assert (
        schedule_verification_retry(
            "tenant-a",
            "profile-1",
            reason=TRANSIENT_VERIFIER_SKIP_REASON,
            enqueue=lambda *_args, **_kwargs: enqueued.append("sent"),
        )
        is False
    )
    assert enqueued == []


def test_duplicate_profiles_schedule_one_retry_each() -> None:
    with patch.object(
        verification_retry,
        "schedule_verification_retry",
        return_value=True,
    ) as schedule:
        scheduled = schedule_verification_retries(
            [("tenant-a", "profile-1"), ("tenant-a", "profile-1"), ("tenant-b", "profile-2")],
            reason=TRANSIENT_VERIFIER_SKIP_REASON,
        )

    assert scheduled == 2
    assert schedule.call_count == 2


def _run_rematch(verifier_cls, *, monotonic_values=None):
    """Drive the cached-corpus rematch with one plausible candidate."""

    import api.services.social.public_matching as public_matching
    import api.services.social_ingestion as ingestion
    from api.services.matching import CandidateMatch

    source_row = {
        "id": "00000000-0000-0000-0000-000000000041",
        "source": "hackernews",
        "source_post_id": "hn-41",
        "body": "We need a recurring billing platform.",
        "url": "https://news.ycombinator.com/item?id=41",
        "metadata": {},
    }
    profile_row = {
        "id": "profile-1",
        "tenant_id": "tenant-a",
        "company_name": "Billing Co",
        "one_liner": "Recurring billing software",
        "target_audience": ["SaaS founders"],
        "core_problem_solved": "Recurring billing",
        "key_value_propositions": ["Automated billing"],
        "ideal_customer_pain_points": ["Manual invoices"],
        "profile_embedding": [1.0, 0.0],
        "website_url": "https://billing.example/",
        "profile_json": {
            "service_profile_identity_version": "website-scoped-v2",
            "website_url": "https://billing.example/",
        },
    }
    candidate = CandidateMatch(
        post_id=source_row["id"],
        source="hackernews",
        text=source_row["body"],
        score=0.9,
    )
    persisted: list[dict[str, object]] = []

    class FakeEngine:
        def begin(self):
            return nullcontext(object())

    class FakeEmbeddingService:
        model = "test-embedding-model"

        def close(self) -> None:
            return None

    patches = [
        patch.dict(
            os.environ,
            {"ARCLI_PUBLIC_SOURCE_REMATCH_VERIFICATION_BUDGET_SECONDS": "1"},
            clear=False,
        ),
        patch.object(ingestion, "_database_engine", return_value=FakeEngine()),
        patch.object(ingestion, "_service_profile_columns", return_value={}),
        patch.object(ingestion, "_load_service_profile", return_value=profile_row),
        patch.object(
            ingestion,
            "_active_tenant_website_url",
            return_value="https://billing.example/",
        ),
        patch.object(
            ingestion,
            "_load_recent_embedded_public_source_post_rows",
            return_value=[source_row],
        ),
        patch.object(ingestion, "_table_columns", return_value={}),
        patch.object(
            ingestion,
            "_cached_public_source_post_embedding",
            return_value=[1.0, 0.0],
        ),
        patch.object(ingestion, "find_candidate_matches", return_value=[candidate]),
        patch.object(ingestion, "_cached_lead_verification", return_value=None),
        patch.object(
            ingestion,
            "_persist_lead_match",
            side_effect=lambda *_args, **kwargs: persisted.append(kwargs),
        ),
        patch.object(ingestion, "_advance_public_candidate_pool"),
        patch.object(ingestion, "EmbeddingService", FakeEmbeddingService),
        patch.object(ingestion, "VerifierService", verifier_cls),
    ]
    if monotonic_values is not None:
        patches.append(
            patch.object(public_matching, "_monotonic", side_effect=monotonic_values)
        )

    with patch.object(
        public_matching,
        "schedule_verification_retry",
        return_value=True,
    ) as schedule:
        for active_patch in patches:
            active_patch.start()
        try:
            ingestion.rematch_existing_public_source_posts_for_profile(
                "tenant-a",
                "profile-1",
            )
        finally:
            for active_patch in reversed(patches):
                active_patch.stop()

    return SimpleNamespace(schedule=schedule, persisted=persisted)


def test_a_provider_outage_during_rematch_schedules_a_retry() -> None:
    class FailingVerifier:
        model = "test-verifier-model"

        def verify(self, *_args, **_kwargs):
            raise TimeoutError("provider unavailable")

        def close(self) -> None:
            return None

    outcome = _run_rematch(FailingVerifier)

    # An outage is not a verdict: nothing is stored, and the work is retried.
    assert outcome.persisted == []
    outcome.schedule.assert_called_once_with(
        "tenant-a",
        "profile-1",
        reason=TRANSIENT_VERIFIER_SKIP_REASON,
    )


def test_a_rematch_that_runs_out_of_time_schedules_the_remainder() -> None:
    class UnusedVerifier:
        model = "test-verifier-model"

        def verify(self, *_args, **_kwargs):
            raise AssertionError("the deadline is reached before verification")

        def close(self) -> None:
            return None

    outcome = _run_rematch(UnusedVerifier, monotonic_values=[10.0, 11.5])

    assert outcome.persisted == []
    outcome.schedule.assert_called_once_with(
        "tenant-a",
        "profile-1",
        reason=VERIFICATION_DEADLINE_REASON,
    )


def test_a_completed_rematch_does_not_schedule_a_retry() -> None:
    class WorkingVerifier:
        model = "test-verifier-model"

        def verify(self, *_args, **_kwargs):
            return VerificationResult(
                match=True,
                decision_label="strong_match",
                confidence=0.8,
                pain_detected="Manual billing work",
                why_this_matches="The post asks for recurring billing help.",
            )

        def close(self) -> None:
            return None

    outcome = _run_rematch(WorkingVerifier)

    assert len(outcome.persisted) == 1
    outcome.schedule.assert_not_called()
